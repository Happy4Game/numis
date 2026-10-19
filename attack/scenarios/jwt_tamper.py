#!/usr/bin/env python3
"""Falsification de jeton JWT — doit être REJETÉE (signature invalide).
Catégorie : compromission (intégrité). Défense : validation de signature HS256."""
import argparse, _common as c


def run(target):
    try:
        token = c.login(target)
    except Exception as e:
        return {"name": "Falsification JWT", "category": "Compromission",
                "defense": "Validation de signature", "blocked": False,
                "detail": f"login préalable impossible : {e}"}
    # Corrompt la signature (dernier caractère)
    forged = token[:-1] + ("A" if token[-1] != "A" else "B")
    code, _, _ = c.hit("GET", f"{target}/accounts", token=forged)
    return {"name": "Falsification JWT", "category": "Compromission",
            "defense": "Validation de signature HS256 côté API",
            "blocked": code == 401,
            "detail": f"accès avec jeton falsifié → HTTP {code} (401 attendu)"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--target", default="http://localhost:8080")
    c.banner(run(ap.parse_args().target))
