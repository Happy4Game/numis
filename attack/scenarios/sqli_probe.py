#!/usr/bin/env python3
"""Scénario Red Team #2 — tentative d'injection SQL (doit être BLOQUÉE par le WAF).

Montre qu'on distingue *restauration de disponibilité* (scénario DoS) et *gestion d'une
compromission* : ici l'attaque est arrêtée en amont par le WAF (ModSecurity/CRS) et laisse
une trace dans le SOC (Loki/Grafana). Aucune remédiation de disponibilité n'est déclenchée.

À LANCER DEPUIS LE PC ATTAQUANT UNIQUEMENT.

Usage :
    python sqli_probe.py --target http://192.168.137.1:8080
"""
import argparse
import httpx

PAYLOADS = [
    "' OR '1'='1",
    "admin'--",
    "'; DROP TABLE users;--",
    "' UNION SELECT NULL,password_hash,NULL FROM users--",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True)
    args = ap.parse_args()

    print(f"[*] Tentatives d'injection SQL sur {args.target}")
    blocked = passed = 0
    with httpx.Client(timeout=5.0) as c:
        for p in PAYLOADS:
            # Vecteur 1 : champ username du login
            r1 = c.post(f"{args.target}/login", json={"username": p, "password": "x"})
            # Vecteur 2 : paramètre de requête
            r2 = c.get(f"{args.target}/transactions", params={"limit": p})
            for label, r in (("login", r1), ("transactions", r2)):
                verdict = "BLOQUÉ (WAF)" if r.status_code == 403 else f"passé -> {r.status_code}"
                if r.status_code == 403:
                    blocked += 1
                else:
                    passed += 1
                print(f"    [{label}] {p[:30]:<30} => {verdict}")

    print(f"\n[résultat] bloqués par le WAF : {blocked} | passés : {passed}")
    print("[*] Les tentatives bloquées sont consultables dans Grafana (logs job=modsec).")
    if passed:
        print("    NB : les requêtes 'passées' restent sans effet — les requêtes SQL de l'API")
        print("    sont paramétrées (défense en profondeur). Le WAF est la 1re barrière.")


if __name__ == "__main__":
    main()
