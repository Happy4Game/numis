#!/usr/bin/env python3
"""Brute-force d'authentification — doit être CONTENU par le verrouillage de l'auth.
Catégorie : compromission (accès). Cible un identifiant 'admin' (inexistant) pour ne pas
verrouiller le compte 'demo' utilisé par la démo."""
import argparse, _common as c

VICTIM = "admin"


def run(target):
    url = c.auth_url(target)
    locked_at = None
    for i in range(12):
        code, _, _ = c.hit("POST", url, data={"username": VICTIM, "password": f"guess{i}"})
        if code == 429:
            locked_at = i + 1
            break
    return {"name": "Brute-force auth", "category": "Compromission",
            "defense": "Verrouillage temporaire après N échecs (auth)",
            "blocked": locked_at is not None,
            "detail": (f"compte verrouillé (429) après {locked_at} tentatives"
                       if locked_at else "AUCUN verrouillage — à corriger")}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--target", default="http://localhost:8080")
    c.banner(run(ap.parse_args().target))
