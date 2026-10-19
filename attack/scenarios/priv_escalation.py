#!/usr/bin/env python3
"""Élévation de privilèges — tente d'activer le mode protection sans le jeton du moteur.
Catégorie : compromission (accès privilégié). Défense : endpoint admin protégé par jeton."""
import argparse, _common as c


def run(target):
    # Sans jeton
    c1, _, _ = c.hit("POST", f"{target}/admin/protect", data={"enabled": True})
    # Avec un faux jeton
    c2, _, _ = c.hit("POST", f"{target}/admin/protect", data={"enabled": True},
                     headers={"x-remediation-token": "faux-jeton"})
    blocked = (c1 == 401 and c2 == 401)
    return {"name": "Élévation de privilèges", "category": "Compromission",
            "defense": "Endpoint d'administration protégé par jeton partagé",
            "blocked": blocked,
            "detail": f"activation admin sans/avec faux jeton → {c1}/{c2} (401/401 attendus)"}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--target", default="http://localhost:8080")
    c.banner(run(ap.parse_args().target))
