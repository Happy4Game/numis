#!/usr/bin/env python3
"""Reconnaissance : balayage de chemins sensibles. Catégorie : reconnaissance.
Défense : rien de sensible exposé (403/404) + détection SOC (pic de 4xx dans Grafana/Loki)."""
import argparse, _common as c

PATHS = ["/.env", "/.git/config", "/admin", "/actuator/health", "/config.json",
         "/wp-login.php", "/server-status", "/.aws/credentials", "/backup.sql"]


def run(target):
    statuses = {}
    exposed = 0
    for p in PATHS:
        code, _, _ = c.hit("GET", f"{target}{p}")
        statuses[code] = statuses.get(code, 0) + 1
        if code == 200:
            exposed += 1
    return {"name": "Reconnaissance (scan)", "category": "Reconnaissance",
            "defense": "Aucune surface sensible exposée + détection SOC (pic 4xx)",
            "blocked": exposed == 0,
            "detail": f"{len(PATHS)} chemins sondés, {exposed} exposé(s) ; statuts {statuses}"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--target", default="http://localhost:8080")
    c.banner(run(ap.parse_args().target))
