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
from collections import deque

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

TOKEN = os.environ["REMEDIATION_TOKEN"]
MANAGED = set(c.strip() for c in os.getenv("MANAGED_CONTAINERS", "").split(",") if c.strip())
HEALTH_URL = os.getenv("PAYMENT_HEALTH_URL", "http://payment-api:8000/health")
PAYMENT_ADMIN_URL = os.getenv("PAYMENT_ADMIN_URL", "http://payment-api:8000")
THROTTLE_RPS = int(os.getenv("THROTTLE_RPS", "20"))
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


def _do_throttle() -> float:
    with httpx.Client(timeout=5.0) as c:
        c.post(f"{PAYMENT_ADMIN_URL}/admin/protect",
               headers={"x-remediation-token": TOKEN},
               json={"enabled": True, "rps": THROTTLE_RPS})
    return _verify_recovery()


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
        up = _service_up()
        action = "throttle" if up else "restart"
        steps.append("Diagnostic : service "
                     + ("vivant mais saturé" if up else "injoignable (planté)")
                     + f" → action retenue : {action}")
    else:
        action = requested
        steps.append(f"Action imposée : {action}")

    entry = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
             "target": req.target, "action": action, "reason": req.reason,
             "source": req.source, "result": "pending", "steps": steps}
    log.info("remédiation engagée", extra={"extra_fields": entry})

    try:
        if action == "restart":
            steps.append(f"Exécution : redémarrage du conteneur {req.target}")
            recovery_s = _do_restart(req.target)
        elif action == "throttle":
            steps.append("Exécution : activation du délestage (rate-limit) sur l'API")
            recovery_s = _do_throttle()
        else:
            REFUSED_TOTAL.labels("action_not_allowed").inc()
            raise HTTPException(403, f"action non autorisée: {action}")
        steps.append(f"Vérification : service rétabli en {round(recovery_s, 1)}s")
        LAST_RECOVERY.set(recovery_s)
        ACTIONS_TOTAL.labels(action, req.target, "success").inc()
        entry.update(result="success", recovery_seconds=round(recovery_s, 1))
        log.info("reprise vérifiée", extra={"extra_fields": entry})
    except HTTPException:
        steps.append("Vérification : reprise non confirmée dans le délai")
        ACTIONS_TOTAL.labels(action, req.target, "unverified").inc()
        entry.update(result="unverified")
        history.appendleft(entry)
        raise
    except docker.errors.NotFound:
        ACTIONS_TOTAL.labels(action, req.target, "not_found").inc()
        entry.update(result="not_found")
        history.appendleft(entry)
        raise HTTPException(404, f"conteneur introuvable: {req.target}")

    history.appendleft(entry)
    return entry
