#!/usr/bin/env python3
"""Injection SQL — doit être BLOQUÉE par le WAF (ModSecurity/CRS). Catégorie : compromission."""
import argparse, _common as c

PAYLOADS = ["1 OR 1=1", "1' OR '1'='1", "1; DROP TABLE users--",
            "1 UNION SELECT NULL,password_hash,NULL FROM users--"]


def run(target):
    blocked = 0
    for p in PAYLOADS:
        code, _, _ = c.hit("GET", f"{target}/transactions?limit={c.quote(p)}")
        if code == 403:
            blocked += 1
    return {"name": "Injection SQL", "category": "Compromission",
            "defense": "WAF ModSecurity/CRS + requêtes paramétrées",
            "blocked": blocked == len(PAYLOADS),
            "detail": f"{blocked}/{len(PAYLOADS)} charges bloquées (403) par le WAF"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--target", default="http://localhost:8080")
    c.banner(run(ap.parse_args().target))
