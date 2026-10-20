"""Service d'authentification — émet des JWT et gère les utilisateurs fictifs.

Responsabilité unique : identité. La validation des jetons est faite localement par
payment-api (secret partagé) pour ne pas ajouter un appel réseau par requête — choix
assumé, documenté dans docs/architecture.md.
"""
import os
import time
import json
import urllib.request
import urllib.error

import jwt
import psycopg
from fastapi import FastAPI, HTTPException, Header, Depends
from passlib.hash import pbkdf2_sha256
from pydantic import BaseModel
from psycopg_pool import ConnectionPool

from .obs import MetricsMiddleware, metrics_response, setup_logging

SERVICE = "auth"
log = setup_logging(SERVICE, os.getenv("LOG_LEVEL", "INFO"))

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_TTL = int(os.getenv("JWT_TTL_SECONDS", "3600"))
DB_DSN = os.environ["DB_DSN"]
# Défense anti-brute-force : verrouillage temporaire par identifiant
MAX_FAILS = int(os.getenv("AUTH_MAX_FAILS", "5"))
FAIL_WINDOW = int(os.getenv("AUTH_FAIL_WINDOW", "60"))
LOCK_SECONDS = int(os.getenv("AUTH_LOCK_SECONDS", "120"))
_fails = {}   # username -> [timestamps des échecs récents]
_locked = {}  # username -> instant de fin de verrouillage

pool = ConnectionPool(DB_DSN, min_size=1, max_size=5, open=False)

app = FastAPI(title="RSA Auth Service")
app.add_middleware(MetricsMiddleware)


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


@app.on_event("startup")
def _startup():
    pool.open()
    _seed_demo()


def _seed_demo():
    """Garantit qu'il existe un utilisateur 'demo' (mdp demo1234) et un compte."""
    pw_hash = pbkdf2_sha256.hash("demo1234")
    with pool.connection() as conn:
        conn.execute(
            "UPDATE users SET password_hash=%s WHERE username='demo' AND password_hash='SEED_AT_RUNTIME'",
            (pw_hash,),
        )
        row = conn.execute("SELECT id FROM users WHERE username='demo'").fetchone()
        if row:
            uid = row[0]
            has_acct = conn.execute("SELECT 1 FROM accounts WHERE owner_id=%s", (uid,)).fetchone()
            if not has_acct:
                conn.execute("INSERT INTO accounts (owner_id,label,balance) VALUES (%s,'Compte A',1000),(%s,'Compte B',1000)", (uid, uid))
    log.info("seed demo terminé")


@app.get("/health")
def health():
    try:
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok"}
    except Exception as e:  # pragma: no cover
        raise HTTPException(503, f"db indisponible: {e}")


@app.get("/metrics")
def metrics():
    return metrics_response()


@app.post("/login", response_model=TokenOut)
def login(body: LoginIn):
    now_f = time.time()
    u = body.username
    # 1) Compte verrouillé ? (brute-force détectée précédemment)
    if _locked.get(u, 0) > now_f:
        log.warning("login verrouillé (anti-brute-force)", extra={"extra_fields": {"user": u}})
        raise HTTPException(429, "trop de tentatives, réessayez plus tard")

    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username=%s", (u,)
        ).fetchone()
    if not row or not pbkdf2_sha256.verify(body.password, row[1]):
        # 2) Enregistre l'échec ; verrouille si trop d'échecs dans la fenêtre
        recent = [t for t in _fails.get(u, []) if t > now_f - FAIL_WINDOW]
        recent.append(now_f)
        _fails[u] = recent
        if len(recent) >= MAX_FAILS:
            _locked[u] = now_f + LOCK_SECONDS
            log.warning("compte verrouillé (brute-force)", extra={"extra_fields": {"user": u, "lock_s": LOCK_SECONDS}})
        log.info("login refusé", extra={"extra_fields": {"user": u}})
        raise HTTPException(401, "identifiants invalides")

    # 3) Succès : on réinitialise les compteurs
    _fails.pop(u, None); _locked.pop(u, None)
    now = int(time.time())
    token = jwt.encode(
        {"sub": str(row[0]), "username": u, "iat": now, "exp": now + JWT_TTL},
        JWT_SECRET, algorithm="HS256",
    )
    log.info("login ok", extra={"extra_fields": {"user": body.username}})
    return TokenOut(access_token=token)


# ================= MFA back-office (consigne additionnelle 1) =================
# Étape 1 : identifiant confirmé par le VISAGE (caméra USB du PC Hôte, via le navigateur).
# Étape 2 : mot de passe. L'état est signalé par la LED bicolore de l'ESP8266.
FACE_AUTH_URL = os.getenv("FACE_AUTH_URL", "http://face-auth:8000")
ESP_URL = os.getenv("ESP_URL", "")                               # ex: http://192.168.137.50 ; vide = pas de LED
FACE_TOKEN_TTL = int(os.getenv("FACE_TOKEN_TTL", "60"))
IDENT_MAX_FAILS = int(os.getenv("IDENT_MAX_FAILS", "2"))         # 1 réessai puis blocage
IDENT_LOCK_SECONDS = int(os.getenv("IDENT_LOCK_SECONDS", "300")) # 5 minutes
_ident_fails = {}
_ident_locked = {}


def _led(state: str):
    """Signale l'état d'authentification au module ESP8266 (best-effort, non bloquant).
    États : off | green_blink | green_solid | red_blink | red_solid (timings gérés par l'ESP)."""
    if not ESP_URL:
        return
    try:
        req = urllib.request.Request(ESP_URL.rstrip("/") + "/led",
                                     data=json.dumps({"state": state}).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req, timeout=1).read()
    except Exception as e:  # l'absence de l'objet connecté ne doit jamais bloquer l'auth
        log.warning("LED (ESP8266) injoignable", extra={"extra_fields": {"state": state, "err": str(e)}})


def _face(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(FACE_AUTH_URL.rstrip("/") + path, data=data,
                                 headers={"Content-Type": "application/json"} if data else {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")
    except Exception as e:
        raise HTTPException(503, f"service de reconnaissance faciale indisponible : {e}")


class IdentifyIn(BaseModel):
    username: str
    image: str

class BackofficeLoginIn(BaseModel):
    username: str
    password: str
    face_token: str

class EnrollIn(BaseModel):
    username: str
    images: list[str]


def _issue(sub, username, scope, ttl):
    now = int(time.time())
    return jwt.encode({"sub": str(sub), "username": username, "scope": scope, "iat": now, "exp": now + ttl},
                      JWT_SECRET, algorithm="HS256")


@app.post("/identify")
def identify(body: IdentifyIn):
    """Étape 1 : le visage confirme l'identifiant. Reconnu -> jeton court + LED vert clignotant.
    Non reconnu -> LED rouge fixe, identifiant à remettre à vide ; 1 réessai puis blocage 5 min."""
    now = time.time(); u = body.username.strip()
    if _ident_locked.get(u, 0) > now:
        raise HTTPException(429, f"identification verrouillée — réessayez dans {int(_ident_locked[u] - now)} s")
    _, res = _face("POST", "/verify", {"username": u, "image": body.image})
    if res.get("recognized"):
        _ident_fails.pop(u, None); _ident_locked.pop(u, None)
        _led("green_blink")
        log.info("identification visage OK", extra={"extra_fields": {"user": u}})
        return {"recognized": True, "face_token": _issue(u, u, "face", FACE_TOKEN_TTL)}
    n = _ident_fails.get(u, 0) + 1; _ident_fails[u] = n
    _led("red_solid")
    if n >= IDENT_MAX_FAILS:
        _ident_locked[u] = now + IDENT_LOCK_SECONDS; _ident_fails.pop(u, None)
        log.warning("identification verrouillée", extra={"extra_fields": {"user": u, "lock_s": IDENT_LOCK_SECONDS}})
        raise HTTPException(429, f"visage non reconnu — verrouillé {IDENT_LOCK_SECONDS // 60} min")
    raise HTTPException(401, "visage non reconnu — réessai possible")


@app.post("/backoffice/login", response_model=TokenOut)
def backoffice_login(body: BackofficeLoginIn):
    """Étape 2 : mot de passe, APRÈS confirmation du visage (face_token). Bon -> LED vert fixe 30s ;
    faux -> LED rouge clignote 10x puis reprise complète de l'identification."""
    u = body.username.strip()
    try:
        claims = jwt.decode(body.face_token, JWT_SECRET, algorithms=["HS256"])
        assert claims.get("scope") == "face" and claims.get("username") == u
    except Exception:
        _led("off")
        raise HTTPException(401, "étape visage manquante ou expirée — recommencez l'identification")
    with pool.connection() as conn:
        row = conn.execute("SELECT id, password_hash FROM users WHERE username=%s", (u,)).fetchone()
    if not row or not pbkdf2_sha256.verify(body.password, row[1]):
        _led("red_blink")
        log.info("back-office : mot de passe refusé", extra={"extra_fields": {"user": u}})
        raise HTTPException(401, "mot de passe invalide — reprise de l'identification")
    _led("green_solid")
    log.info("back-office : accès accordé", extra={"extra_fields": {"user": u}})
    return TokenOut(access_token=_issue(row[0], u, "backoffice", JWT_TTL))


def _require_backoffice(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "jeton back-office requis")
    try:
        claims = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "jeton invalide")
    if claims.get("scope") != "backoffice":
        raise HTTPException(403, "réservé au back-office")
    return claims.get("username")


@app.get("/habilitations")
def habilitations_list(_u: str = Depends(_require_backoffice)):
    _, res = _face("GET", "/users")
    return res


@app.post("/habilitations/enroll")
def habilitations_enroll(body: EnrollIn, authorization: str = Header(default="")):
    # Bootstrap : si AUCUNE identité n'existe, le 1er enrôlement est permis sans session
    # (sinon poule/œuf). Dès qu'une habilitation existe, une session back-office est requise.
    _, current = _face("GET", "/users")
    if current:
        _require_backoffice(authorization)
    code, res = _face("POST", "/enroll", {"username": body.username, "images": body.images})
    if code >= 400:
        raise HTTPException(code, res.get("detail", "enrôlement échoué"))
    return res


@app.delete("/habilitations/{username}")
def habilitations_delete(username: str, _u: str = Depends(_require_backoffice)):
    code, res = _face("DELETE", f"/users/{username}")
    if code >= 400:
        raise HTTPException(code, res.get("detail", "suppression échouée"))
    return res


@app.post("/led/{state}")
def led_force(state: str, _u: str = Depends(_require_backoffice)):
    """Le back-office peut forcer un état LED (ex: extinction à la fermeture)."""
    _led(state)
    return {"state": state}
