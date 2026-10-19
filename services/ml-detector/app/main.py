"""Détecteur d'anomalies — Isolation Forest sur 3 métriques de payment-api.

Pourquoi ce choix (défendable au jury) :
  - Isolation Forest = non supervisé (pas besoin d'incidents étiquetés), léger, rapide.
  - 3 features seulement => EXPLICABLE : à chaque alerte on dit laquelle a dérivé et de combien.
  - Apprentissage de la "normalité" sur une fenêtre de warmup (trafic nominal), puis scoring.
  - Anti faux-positif : il faut N cycles consécutifs anormaux avant de déclencher la reprise.

Chaîne : Prometheus --(query)--> ce service --(si anomalie persistante)--> remediation-engine.
"""
import os
import threading
import time
import logging, json, sys

import httpx
import numpy as np
from fastapi import FastAPI
from prometheus_client import Gauge, generate_latest, CONTENT_TYPE_LATEST
from sklearn.ensemble import IsolationForest
from starlette.responses import Response

SERVICE = "ml-detector"
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

PROM = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
REMEDIATION_URL = os.getenv("REMEDIATION_URL", "http://remediation-engine:8000")
REMEDIATION_TOKEN = os.environ["REMEDIATION_TOKEN"]
POLL = int(os.getenv("POLL_INTERVAL_SECONDS", "10"))
PERSIST = int(os.getenv("ANOMALY_PERSIST_CYCLES", "2"))
WARMUP_SAMPLES = int(os.getenv("WARMUP_SAMPLES", "20"))
TARGET_CONTAINER = os.getenv("TARGET_CONTAINER", "rsa-payment-api")
COOLDOWN = int(os.getenv("COOLDOWN_SECONDS", "90"))  # pas de ré-action juste après une reprise
MODEL_PATH = os.getenv("MODEL_PATH", "/model/model.pkl")
ERR_DEGRADE = float(os.getenv("ERROR_DEGRADE", "0.1"))            # taux de 5xx -> dégradation
LAT_DEGRADE = float(os.getenv("LATENCY_DEGRADE_SECONDS", "0.5"))  # latence p95 -> dégradation

FEATURES = ["request_rate", "error_ratio", "p95_latency"]
QUERIES = {
    "request_rate": 'sum(rate(http_requests_total{job="payment-api"}[1m]))',
    "error_ratio": '(sum(rate(http_requests_total{job="payment-api",status=~"5.."}[1m])) '
                   '/ clamp_min(sum(rate(http_requests_total{job="payment-api"}[1m])), 0.001))',
    "p95_latency": 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="payment-api"}[1m])) by (le))',
}

# Métriques exposées (le dashboard et Grafana les lisent)
G_SCORE = Gauge("ml_anomaly_score", "Score d'anomalie (plus bas = plus anormal)")
G_FLAG = Gauge("ml_anomaly_flag", "1 si anomalie détectée ce cycle")
G_FEATURE = Gauge("ml_feature_value", "Valeur courante des features", ["feature"])

app = FastAPI(title="RSA ML Detector")

state = {"status": "warmup", "samples": 0, "score": None, "flag": 0,
         "features": {}, "explanation": "", "last_action": None, "consecutive": 0,
         "warmup_target": WARMUP_SAMPLES, "persist_target": PERSIST,
         "poll_interval": POLL, "baseline": None, "score_history": [],
         "degraded": False, "raw_flag": 0}
model = {"clf": None, "mean": None, "std": None}
_last_action_ts = 0.0


def query_prom(expr: str):
    try:
        r = httpx.get(f"{PROM}/api/v1/query", params={"query": expr}, timeout=4.0)
        data = r.json()["data"]["result"]
        if not data:
            return 0.0
        v = float(data[0]["value"][1])
        return 0.0 if (np.isnan(v) or np.isinf(v)) else v
    except Exception as e:
        log.warning("requête Prometheus échouée", extra={"extra_fields": {"err": str(e)}})
        return 0.0


def collect_vector():
    vals = {f: query_prom(QUERIES[f]) for f in FEATURES}
    for f, v in vals.items():
        G_FEATURE.labels(f).set(v)
    return vals


def explain(vec):
    """Feature la plus déviante vs normalité (z-score) -> explication lisible."""
    x = np.array([vec[f] for f in FEATURES])
    z = np.abs((x - model["mean"]) / np.where(model["std"] < 1e-9, 1e-9, model["std"]))
    i = int(np.argmax(z))
    f = FEATURES[i]
    return f"{f} = {vec[f]:.3g} (≈ x{(vec[f]/max(model['mean'][i],1e-6)):.1f} vs normale, z={z[i]:.1f})"


def trigger_remediation(reason: str):
    global _last_action_ts
    if time.time() - _last_action_ts < COOLDOWN:
        log.info("remédiation en cooldown, on n'agit pas")
        return
    try:
        r = httpx.post(
            f"{REMEDIATION_URL}/remediate",
            headers={"x-remediation-token": REMEDIATION_TOKEN},
            json={"target": TARGET_CONTAINER, "action": "auto", "reason": reason, "source": SERVICE},
            timeout=75.0,
        )
        _last_action_ts = time.time()
        state["last_action"] = {"ts": time.strftime("%H:%M:%S"), "reason": reason,
                                "result": r.json().get("result", r.status_code)}
        log.info("remédiation déclenchée", extra={"extra_fields": {"reason": reason, "http": r.status_code}})
    except Exception as e:
        log.error("échec appel remédiation", extra={"extra_fields": {"err": str(e)}})


def _save_model():
    import pickle
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as fh:
        pickle.dump({"clf": model["clf"], "mean": model["mean"],
                     "std": model["std"], "baseline": state["baseline"]}, fh)
    log.info("modèle sauvegardé", extra={"extra_fields": {"path": MODEL_PATH}})


def _load_model():
    import pickle
    with open(MODEL_PATH, "rb") as fh:
        d = pickle.load(fh)
    model["clf"] = d["clf"]
    model["mean"] = np.array(d["mean"]); model["std"] = np.array(d["std"])
    state["baseline"] = d["baseline"]


def detection_loop():
    # Si un modèle a déjà été entraîné (persisté sur disque), on le recharge : plus besoin
    # de réapprendre à chaque redémarrage (répond à "je ne veux pas juste lancer et attendre").
    if os.path.exists(MODEL_PATH):
        try:
            _load_model()
            state["status"] = "monitoring"
            log.info("modèle chargé depuis le disque, apprentissage ignoré")
        except Exception as e:
            log.warning(f"échec du chargement du modèle ({e}), on réapprend")

    # Sinon : apprentissage de la normalité sur le trafic courant.
    if model["clf"] is None:
        train = []
        while len(train) < WARMUP_SAMPLES:
            vec = collect_vector()
            train.append([vec[f] for f in FEATURES])
            state.update(samples=len(train), features=vec)
            time.sleep(POLL)
        X = np.array(train)
        model["mean"], model["std"] = X.mean(axis=0), X.std(axis=0)
        model["clf"] = IsolationForest(n_estimators=100, contamination=0.1, random_state=42).fit(X)
        state["baseline"] = {f: round(float(m), 4) for f, m in zip(FEATURES, model["mean"])}
        state["status"] = "monitoring"
        _save_model()
        log.info("apprentissage terminé, passage en surveillance")

    # --- Surveillance continue ---
    clf = model["clf"]
    while True:
        vec = collect_vector()
        x = np.array([[vec[f] for f in FEATURES]])
        score = float(clf.decision_function(x)[0])   # <0 => anormal
        is_anom = int(clf.predict(x)[0] == -1)
        # Une anomalie statistique n'est un INCIDENT que si le service est réellement dégradé
        # (erreurs ou latence). Un simple creux de trafic ne déclenche donc rien.
        degraded = (vec["error_ratio"] > ERR_DEGRADE) or (vec["p95_latency"] > LAT_DEGRADE)
        effective = is_anom and degraded
        G_SCORE.set(score); G_FLAG.set(effective)
        hist = state["score_history"]; hist.append(round(score, 4))
        del hist[:-40]  # ne garde que les 40 derniers points
        state.update(features=vec, score=round(score, 4), flag=effective,
                     raw_flag=is_anom, degraded=degraded)

        if effective:
            state["consecutive"] += 1
            state["explanation"] = explain(vec)
            log.info("incident (anomalie + dégradation)", extra={"extra_fields": {
                "consecutive": state["consecutive"], "score": score, "why": state["explanation"]}})
            if state["consecutive"] >= PERSIST:
                trigger_remediation(state["explanation"])
                state["consecutive"] = 0
        else:
            state["consecutive"] = 0
        time.sleep(POLL)


@app.on_event("startup")
def _start():
    threading.Thread(target=detection_loop, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok", "phase": state["status"]}


@app.get("/state")
def get_state():
    """Consommé par le dashboard de supervision."""
    return state


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
