#!/usr/bin/env python3
"""Traversée de répertoire / LFI — doit être BLOQUÉE par le WAF. Catégorie : compromission."""
import argparse, _common as c

PAYLOADS = ["../../../../etc/passwd", "..%2f..%2f..%2fetc%2fpasswd",
            "....//....//etc/passwd", "/etc/passwd%00.png"]


def run(target):
    blocked = sum(1 for p in PAYLOADS if c.hit("GET", f"{target}/accounts?x={c.quote(p)}")[0] == 403)
    return {"name": "Traversée de répertoire", "category": "Compromission",
            "defense": "WAF ModSecurity/CRS",
            "blocked": blocked >= 1,
            "detail": f"{blocked}/{len(PAYLOADS)} tentatives de traversée bloquées (403)"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--target", default="http://localhost:8080")
    c.banner(run(ap.parse_args().target))
