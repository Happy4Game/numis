#!/usr/bin/env python3
"""Cross-Site Scripting (XSS) — doit être BLOQUÉ par le WAF. Catégorie : compromission."""
import argparse, _common as c

PAYLOADS = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>',
            'javascript:alert(document.cookie)', '<svg/onload=alert(1)>']


def run(target):
    blocked = sum(1 for p in PAYLOADS if c.hit("GET", f"{target}/transactions?limit={c.quote(p)}")[0] == 403)
    return {"name": "XSS", "category": "Compromission",
            "defense": "WAF ModSecurity/CRS",
            "blocked": blocked == len(PAYLOADS),
            "detail": f"{blocked}/{len(PAYLOADS)} charges XSS bloquées (403)"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--target", default="http://localhost:8080")
    c.banner(run(ap.parse_args().target))
