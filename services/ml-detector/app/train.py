"""Entraînement HORS-LIGNE du détecteur d'anomalies.

Collecte N échantillons du trafic COURANT depuis Prometheus, entraîne un Isolation Forest,
et sauvegarde le modèle (format rechargé au démarrage par main.py). Lancez `make traffic`
en parallèle pour que l'apprentissage porte sur un profil nominal représentatif.

À exécuter dans le conteneur :  python -m app.train --samples 40
Via le Makefile :               make train   (entraîne puis recharge le détecteur)
"""
import argparse, os, pickle, time
import numpy as np
import httpx
from sklearn.ensemble import IsolationForest

PROM = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
POLL = int(os.getenv("POLL_INTERVAL_SECONDS", "10"))
MODEL_PATH = os.getenv("MODEL_PATH", "/model/model.pkl")

FEATURES = ["request_rate", "error_ratio", "p95_latency"]
QUERIES = {
    "request_rate": 'sum(rate(http_requests_total{job="payment-api"}[1m]))',
    "error_ratio": '(sum(rate(http_requests_total{job="payment-api",status=~"5.."}[1m])) '
                   '/ clamp_min(sum(rate(http_requests_total{job="payment-api"}[1m])), 0.001))',
    "p95_latency": 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="payment-api"}[1m])) by (le))',
}


def q(expr):
    try:
        r = httpx.get(f"{PROM}/api/v1/query", params={"query": expr}, timeout=4.0)
        d = r.json()["data"]["result"]
        if not d:
            return 0.0
        v = float(d[0]["value"][1])
        return 0.0 if (np.isnan(v) or np.isinf(v)) else v
    except Exception:
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int, default=40)
    args = ap.parse_args()

    print(f"[train] collecte de {args.samples} échantillons (toutes les {POLL}s) depuis Prometheus…")
    rows = []
    while len(rows) < args.samples:
        rows.append([q(QUERIES[f]) for f in FEATURES])
        print(f"    {len(rows)}/{args.samples}", end="\r", flush=True)
        time.sleep(POLL)

    X = np.array(rows)
    mean, std = X.mean(axis=0), X.std(axis=0)
    std_safe = np.where(std < 1e-6, 1.0, std)
    clf = IsolationForest(n_estimators=100, contamination=0.1, random_state=42).fit((X - mean) / std_safe)
    baseline = {f: round(float(m), 4) for f, m in zip(FEATURES, mean)}

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as fh:
        pickle.dump({"clf": clf, "mean": mean, "std": std, "baseline": baseline}, fh)

    print(f"\n[train] modèle entraîné et sauvegardé dans {MODEL_PATH}")
    print(f"[train] profil normal appris : {baseline}")
    print("[train] redémarrez le détecteur pour le charger (make train le fait automatiquement).")


if __name__ == "__main__":
    main()
