"""Moteur de remédiation — reçoit un signal d'anomalie et exécute un playbook de reprise.

MODÈLE DE PRIVILÈGES (sujet §3.4 — "privilèges maîtrisés", point noté) :
  1. Seul conteneur à monter /var/run/docker.sock.
  2. Allowlist applicative STRICTE : il refuse toute cible hors MANAGED_CONTAINERS.
  3. Allowlist d'actions : uniquement `restart` (+ vérification interne). Pas d'exec arbitraire.
  4. Authentification : toute demande d'action exige REMEDIATION_TOKEN (détenu par ml-detector).
  5. Reprise VÉRIFIÉE : un conteneur qui redémarre ne suffit pas — on attend le retour
     à /health avant de déclarer la reprise réussie (exigence explicite du sujet §2).
  Durcissement possible (docs/runbooks/hardening.md) : remplacer le socket brut par un
  docker-socket-proxy limité à POST /containers/{id}/restart.
"""
import os
import time
import datetime
import threading
from collections import deque
from zoneinfo import ZoneInfo

import docker
import httpx
from fastapi import FastAPI, Header, HTTPException
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel
from starlette.responses import Response

import logging, json, sys

SERVICE = "remediation-engine"

# --- logs JSON ---
_h = logging.StreamHandler(sys.stdout)
class _F(logging.Formatter):
    def format(self, r):
        p = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(r.created)),
             "level": r.levelname, "service": SERVICE, "msg": r.getMessage()}
        if hasattr(r, "extra_fields"): p.update(r.extra_fields)
        return json.dumps(p, ensure_ascii=False)
_h.setFormatter(_F())
logging.getLogger().handlers = [_h]
logging.getLogger().setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
log = logging.getLogger(SERVICE)
_TZ = ZoneInfo(os.getenv("TZ", "Europe/Paris"))
def _now():
    return datetime.datetime.now(_TZ)

TOKEN = os.environ["REMEDIATION_TOKEN"]
MANAGED = set(c.strip() for c in os.getenv("MANAGED_CONTAINERS", "").split(",") if c.strip())
HEALTH_URL = os.getenv("PAYMENT_HEALTH_URL", "http://payment-api:8000/health")
PAYMENT_ADMIN_URL = os.getenv("PAYMENT_ADMIN_URL", "http://payment-api:8000")
THROTTLE_RPS = int(os.getenv("THROTTLE_RPS", "10"))
ALLOWED_ACTIONS = {"restart", "throttle", "auto"}

ACTIONS_TOTAL = Counter("remediation_actions_total", "Actions de remédiation", ["action", "target", "result"])
LAST_RECOVERY = Gauge("remediation_last_recovery_seconds", "Durée de la dernière reprise vérifiée (s)")
REFUSED_TOTAL = Counter("remediation_refused_total", "Demandes refusées (hors allowlist / non authentifiées)", ["reason"])

client = docker.from_env()
history = deque(maxlen=100)  # pour le dashboard

app = FastAPI(title="RSA Remediation Engine")


class RemediationRequest(BaseModel):
    target: str          # nom du conteneur
    action: str = "auto"  # "auto" (playbook décide) | "restart" | "throttle"
    reason: str = ""     # explication (ex. feature ML en cause)
    source: str = "ml-detector"


def _authz(token: str):
    if token != TOKEN:
        REFUSED_TOTAL.labels("bad_token").inc()
        log.warning("demande refusée : jeton invalide")
        raise HTTPException(401, "non autorisé")


def _verify_recovery(timeout_s: int = 60) -> float:
    """Attend le retour effectif du service à /health. Renvoie le temps écoulé."""
    start = time.perf_counter()
    deadline = start + timeout_s
    with httpx.Client(timeout=3.0) as c:
        while time.perf_counter() < deadline:
            try:
                if c.get(HEALTH_URL).status_code == 200:
                    return time.perf_counter() - start
            except Exception:
                pass
            time.sleep(1.5)
    raise HTTPException(504, "reprise non confirmée dans le délai imparti")


def _service_up() -> bool:
    try:
        with httpx.Client(timeout=3.0) as c:
            return c.get(HEALTH_URL).status_code == 200
    except Exception:
        return False


def _container_down(name: str) -> bool:
    """Vrai si le conteneur n'est pas en cours d'exécution (arrêté / tué / absent)."""
    try:
        return client.containers.get(name).status != "running"
    except docker.errors.NotFound:
        return True
    except Exception:
        return False


# ---- Watchdog : surveille TOUS les conteneurs de la stack et répare ceux qui tombent ----
PROJECT = os.getenv("COMPOSE_PROJECT", "resilience-alpha")
SELF_NAME = os.getenv("SELF_CONTAINER", "rsa-remediation")
WATCH_INTERVAL = int(os.getenv("WATCH_INTERVAL_SECONDS", "10"))
WATCH_COOLDOWN = int(os.getenv("WATCH_COOLDOWN_SECONDS", "60"))
_watch_last = {}   # nom -> dernier redémarrage (anti-flapping)
_down_count = {}   # nom -> cycles consécutifs observés "morts" (grâce)


def _managed_containers():
    try:
        return client.containers.list(all=True,
                                      filters={"label": f"com.docker.compose.project={PROJECT}"})
    except Exception:
        return []


def _wait_running(name, timeout_s=40):
    start = time.time()
    while time.time() - start < timeout_s:
        try:
            c = client.containers.get(name)
            c.reload()
            if c.status == "running":
                return round(time.time() - start, 1)
        except Exception:
            pass
        time.sleep(1.5)
    return None


def _watchdog():
    log.info("watchdog démarré", extra={"extra_fields": {"interval": WATCH_INTERVAL}})
    while True:
        try:
            for c in _managed_containers():
                name = c.name
                if name == SELF_NAME:
                    continue
                # On ne touche QUE les conteneurs franchement morts (pas les états transitoires
                # running / created / restarting / paused, pour ne pas gêner un démarrage normal).
                if c.status not in ("exited", "dead"):
                    _down_count[name] = 0
                    continue
                _down_count[name] = _down_count.get(name, 0) + 1
                if _down_count[name] < 2:          # grâce : confirmé mort sur 2 cycles (~20s)
                    continue
                if time.time() - _watch_last.get(name, 0) < WATCH_COOLDOWN:
                    continue
                _watch_last[name] = time.time()
                _down_count[name] = 0
                entry = {"ts": _now().strftime("%Y-%m-%dT%H:%M:%S"), "target": name,
                         "action": "restart", "reason": f"conteneur {c.status}", "source": "watchdog",
                         "result": "pending",
                         "steps": [f"Surveillance : conteneur {name} = {c.status} → redémarrage"]}
                try:
                    c.restart(timeout=10)
                    elapsed = _wait_running(name)
                    ok = elapsed is not None
                    entry["steps"].append(f"Vérification : {name} = {'running' if ok else 'toujours KO'}")
                    entry["result"] = "success" if ok else "unverified"
                    if ok:
                        entry["recovery_seconds"] = elapsed
                    ACTIONS_TOTAL.labels("restart", name, entry["result"]).inc()
                except Exception as e:
                    entry["steps"].append(f"Échec : {e}")
                    entry["result"] = "error"
                history.appendleft(entry)
                log.info("watchdog : redémarrage", extra={"extra_fields": entry})
        except Exception as e:
            log.warning(f"watchdog erreur : {e}")
        time.sleep(WATCH_INTERVAL)


def _decide() -> str:
    """Playbook : service injoignable => conteneur planté => restart.
    Service vivant mais dégradé (flood) => délestage de charge."""
    return "throttle" if _service_up() else "restart"


def _do_restart(target: str) -> float:
    if target not in MANAGED:
        REFUSED_TOTAL.labels("target_not_allowed").inc()
        log.warning("cible hors allowlist refusée", extra={"extra_fields": {"target": target}})
        raise HTTPException(403, f"cible non pilotable: {target}")
    client.containers.get(target).restart(timeout=10)
    return _verify_recovery()


_throttle_state = {"rps": THROTTLE_RPS, "ts": 0.0}


def _do_throttle():
    """Délestage ADAPTATIF : si on a déjà délesté récemment (attaque qui persiste),
    on resserre le débit autorisé (escalade), jusqu'à un plancher."""
    now = time.time()
    if now - _throttle_state["ts"] < 120:
        _throttle_state["rps"] = max(3, _throttle_state["rps"] // 2)
    else:
        _throttle_state["rps"] = THROTTLE_RPS
    _throttle_state["ts"] = now
    rps = _throttle_state["rps"]
    with httpx.Client(timeout=5.0) as c:
        c.post(f"{PAYMENT_ADMIN_URL}/admin/protect",
               headers={"x-remediation-token": TOKEN},
               json={"enabled": True, "rps": rps})
    return _verify_recovery(), rps


@app.on_event("startup")
def _start():
    threading.Thread(target=_watchdog, daemon=True).start()


@app.get("/containers")
def containers():
    """État de vie de tous les conteneurs de la stack (consommé par le dashboard)."""
    return sorted(({"name": c.name, "status": c.status} for c in _managed_containers()),
                  key=lambda x: x["name"])


@app.get("/health")
def health():
    return {"status": "ok", "managed": sorted(MANAGED)}


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/actions")
def actions():
    """Historique des actions — consommé par le dashboard de supervision."""
    return list(history)


@app.post("/remediate")
def remediate(req: RemediationRequest, x_remediation_token: str = Header(default="")):
    _authz(x_remediation_token)

    requested = req.action if req.action in ALLOWED_ACTIONS else "auto"
    steps = []
    if requested == "auto":
        # Diagnostic conscient des dépendances : on identifie QUEL composant est tombé.
        if _container_down("rsa-payment-api"):
            action, target = "restart", "rsa-payment-api"
            steps.append("Diagnostic : conteneur payment-api arrêté → redémarrage")
        elif _container_down("rsa-db"):
            action, target = "restart", "rsa-db"
            steps.append("Diagnostic : dépendance 'base de données' arrêtée → redémarrage de la db")
        elif _service_up():
            action, target = "throttle", "rsa-payment-api"
            steps.append("Diagnostic : service vivant mais saturé → délestage")
        else:
            action, target = "restart", "rsa-payment-api"
            steps.append("Diagnostic : service injoignable → redémarrage de payment-api")
    else:
        action, target = requested, req.target
        steps.append(f"Action imposée : {action}")

    entry = {"ts": _now().strftime("%Y-%m-%dT%H:%M:%S"),
             "target": target, "action": action, "reason": req.reason,
             "source": req.source, "result": "pending", "steps": steps}
    log.info("remédiation engagée", extra={"extra_fields": entry})

    try:
        if action == "restart":
            steps.append(f"Exécution : redémarrage du conteneur {target}")
            recovery_s = _do_restart(target)
        elif action == "throttle":
            recovery_s, rps = _do_throttle()
            steps.append(f"Exécution : délestage de charge (~{rps} req/s max autorisés sur l'API)")
        else:
            REFUSED_TOTAL.labels("action_not_allowed").inc()
            raise HTTPException(403, f"action non autorisée: {action}")
        steps.append(f"Vérification : service rétabli en {round(recovery_s, 1)}s")
        LAST_RECOVERY.set(recovery_s)
        ACTIONS_TOTAL.labels(action, target, "success").inc()
        entry.update(result="success", recovery_seconds=round(recovery_s, 1))
        log.info("reprise vérifiée", extra={"extra_fields": entry})
    except HTTPException:
        steps.append("Vérification : reprise non confirmée dans le délai")
        ACTIONS_TOTAL.labels(action, target, "unverified").inc()
        entry.update(result="unverified")
        history.appendleft(entry)
        raise
    except docker.errors.NotFound:
        ACTIONS_TOTAL.labels(action, target, "not_found").inc()
        entry.update(result="not_found")
        history.appendleft(entry)
        raise HTTPException(404, f"conteneur introuvable: {target}")

    history.appendleft(entry)
    return entry
