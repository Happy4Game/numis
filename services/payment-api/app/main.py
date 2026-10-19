"""API métier — exécute des transactions fictives entre comptes.

Valide les JWT localement (secret partagé avec le service auth). Instrumentée Prometheus :
c'est elle qui est attaquée et dont la dégradation est détectée puis réparée.
"""
import os
import time

import jwt
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, condecimal
from psycopg_pool import ConnectionPool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .obs import MetricsMiddleware, metrics_response, setup_logging

SERVICE = "payment-api"
log = setup_logging(SERVICE, os.getenv("LOG_LEVEL", "INFO"))

JWT_SECRET = os.environ["JWT_SECRET"]
DB_DSN = os.environ["DB_DSN"]

# Pool volontairement borné : sous une charge d'attaque, la saturation du pool
# produit une latence et des erreurs OBSERVABLES — c'est le signal que le ML détecte.
pool = ConnectionPool(DB_DSN, min_size=2, max_size=10, open=False, timeout=2.0)

# --- Mode protection (délestage de charge) activé par le moteur de remédiation -------------
# En cas de DoS, le moteur appelle POST /admin/protect : on rejette l'excédent (429) pour
# soulager le pool DB. Le trafic légitime (faible volume) continue de passer. Auto-expire.
REMEDIATION_TOKEN = os.getenv("REMEDIATION_TOKEN", "")
PROTECT_TTL = int(os.getenv("PROTECT_TTL", "120"))
PROTECT = {"enabled": False, "rps": 20, "until": 0.0}
_rl_window = {}  # {seconde: nombre de requêtes}


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        p = request.url.path
        active = PROTECT["enabled"] and time.time() < PROTECT["until"]
        if active and p not in ("/health", "/metrics") and not p.startswith("/admin"):
            sec = int(time.time())
            for k in list(_rl_window):
                if k != sec:
                    _rl_window.pop(k, None)
            _rl_window[sec] = _rl_window.get(sec, 0) + 1
            if _rl_window[sec] > PROTECT["rps"]:
                return JSONResponse({"detail": "service protégé (délestage de charge)"}, status_code=429)
        return await call_next(request)


app = FastAPI(title="RSA Payment API")
app.add_middleware(RateLimitMiddleware)   # interne : applique le délestage si activé
app.add_middleware(MetricsMiddleware)     # externe : compte toutes les requêtes (dont 429)


class TransferIn(BaseModel):
    from_account: int
    to_account: int
    amount: condecimal(gt=0, max_digits=14, decimal_places=2)


def current_user(authorization: str = Header(default="")) -> int:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "jeton manquant")
    try:
        claims = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
        return int(claims["sub"])
    except jwt.PyJWTError:
        raise HTTPException(401, "jeton invalide")


@app.on_event("startup")
def _startup():
    pool.open()


@app.get("/health")
def health():
    try:
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(503, f"db indisponible: {e}")


@app.get("/metrics")
def metrics():
    return metrics_response()


@app.get("/accounts")
def accounts(uid: int = Depends(current_user)):
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT id, label, balance FROM accounts WHERE owner_id=%s ORDER BY id", (uid,)
        ).fetchall()
    return [{"id": r[0], "label": r[1], "balance": float(r[2])} for r in rows]


@app.post("/transactions")
def transfer(body: TransferIn, uid: int = Depends(current_user)):
    with pool.connection() as conn:
        with conn.transaction():
            src = conn.execute(
                "SELECT balance FROM accounts WHERE id=%s AND owner_id=%s FOR UPDATE",
                (body.from_account, uid),
            ).fetchone()
            if not src:
                raise HTTPException(404, "compte source introuvable")
            if src[0] < body.amount:
                conn.execute(
                    "INSERT INTO transactions (from_account,to_account,amount,status) VALUES (%s,%s,%s,'failed')",
                    (body.from_account, body.to_account, body.amount),
                )
                raise HTTPException(400, "solde insuffisant")
            conn.execute("UPDATE accounts SET balance=balance-%s WHERE id=%s", (body.amount, body.from_account))
            conn.execute("UPDATE accounts SET balance=balance+%s WHERE id=%s", (body.amount, body.to_account))
            tx = conn.execute(
                "INSERT INTO transactions (from_account,to_account,amount,status) VALUES (%s,%s,%s,'completed') RETURNING id",
                (body.from_account, body.to_account, body.amount),
            ).fetchone()
    log.info("transaction ok", extra={"extra_fields": {"tx": tx[0], "amount": float(body.amount)}})
    return {"transaction_id": tx[0], "status": "completed"}


@app.get("/transactions")
def list_transactions(limit: int = 10, uid: int = Depends(current_user)):
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT id, from_account, to_account, amount, status, created_at "
            "FROM transactions ORDER BY id DESC LIMIT %s", (min(limit, 100),)
        ).fetchall()
    return [
        {"id": r[0], "from": r[1], "to": r[2], "amount": float(r[3]), "status": r[4], "at": r[5].isoformat()}
        for r in rows
    ]


class ProtectIn(BaseModel):
    enabled: bool
    rps: int | None = None


@app.post("/admin/protect")
def admin_protect(body: ProtectIn, x_remediation_token: str = Header(default="")):
    """Active/désactive le délestage. Réservé au moteur de remédiation (jeton partagé)."""
    if not REMEDIATION_TOKEN or x_remediation_token != REMEDIATION_TOKEN:
        raise HTTPException(401, "non autorisé")
    PROTECT["enabled"] = body.enabled
    if body.rps:
        PROTECT["rps"] = body.rps
    PROTECT["until"] = time.time() + PROTECT_TTL if body.enabled else 0.0
    log.info("mode protection", extra={"extra_fields": {"enabled": body.enabled, "rps": PROTECT["rps"]}})
    return {"enabled": PROTECT["enabled"], "rps": PROTECT["rps"], "ttl_seconds": PROTECT_TTL}


@app.get("/admin/protect")
def admin_protect_status():
    return {"active": PROTECT["enabled"] and time.time() < PROTECT["until"], "rps": PROTECT["rps"]}
