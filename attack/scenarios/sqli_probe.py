#!/usr/bin/env python3
"""Scénario Red Team #2 — tentative d'injection SQL (doit être BLOQUÉE par le WAF).

Python standard uniquement. À LANCER DEPUIS LE PC ATTAQUANT.

Les requêtes visent le WAF (:8080), qui évalue chaque requête AVANT l'application.
Une charge malveillante connue (CRS/OWASP) renvoie 403 = bloquée. Sinon elle passe à
l'app (qui répond 401 sans jeton). Montre qu'on distingue défense (compromission) et
restauration de disponibilité (scénario DoS).

Usage :
    python3 sqli_probe.py --target http://localhost:8080
"""
import argparse, urllib.request, urllib.error
from urllib.parse import quote

PAYLOADS = [
    "1 OR 1=1",
    "1' OR '1'='1",
    "1; DROP TABLE users--",
    "1 UNION SELECT NULL,password_hash,NULL FROM users--",
]


def probe(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="http://localhost:8080")
    args = ap.parse_args()

    print(f"[*] Tentatives d'injection SQL sur {args.target} (via le WAF)")
    blocked = passed = 0
    for p in PAYLOADS:
        code = probe(f"{args.target}/transactions?limit={quote(p)}")
        verdict = "BLOQUÉ (WAF 403)" if code == 403 else f"passé → {code}"
        if code == 403: blocked += 1
        else: passed += 1
        print(f"    {p[:34]:<34} => {verdict}")

    print(f"\n[résultat] bloqués par le WAF : {blocked} | passés : {passed}")
    print("[*] Les tentatives bloquées sont visibles dans Grafana (logs job=modsec).")
    if passed:
        print("    NB : une requête 'passée' reste sans effet — les requêtes SQL de l'API sont")
        print("    paramétrées (défense en profondeur). Le WAF est la 1re barrière.")


if __name__ == "__main__":
    main()
