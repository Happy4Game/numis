#!/usr/bin/env python3
"""Lance tout le catalogue d'attaques (hors DoS, qui est long) et affiche un tableau
de synthèse Red/Blue : chaque attaque, sa catégorie, et si la défense a tenu.

> ⚠️ Uniquement contre le SI fictif de l'équipe (sujet §9).

Usage :  python3 attack/run_all.py --target http://localhost:8080
"""
import argparse, importlib, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "scenarios"))

SCENARIOS = ["sqli_probe", "xss_probe", "path_traversal", "recon_scan",
             "brute_force", "jwt_tamper", "priv_escalation"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="http://localhost:8080")
    args = ap.parse_args()

    print(f"╔══ Catalogue Red/Blue — cible {args.target} ══╗")
    print("   (le DoS/disponibilité se joue à part : make attack-dos)\n")

    results = []
    for name in SCENARIOS:
        mod = importlib.import_module(name)
        try:
            results.append(mod.run(args.target))
        except Exception as e:
            results.append({"name": name, "category": "?", "defense": "?",
                            "blocked": False, "detail": f"erreur : {e}"})

    # Attaque via le dashboard (:3001) — proxy du front, cible distincte du WAF
    front = args.target.replace(":8080", ":3001")
    try:
        import front_proxy
        results.append(front_proxy.run(front))
    except Exception as e:
        results.append({"name": "Attaque via le dashboard (:3001)", "category": "Compromission",
                        "defense": "proxy front", "blocked": False, "detail": f"erreur : {e}"})

    # tableau
    w = max(len(r["name"]) for r in results)
    print(f"{'Attaque'.ljust(w)} │ {'Catégorie'.ljust(16)} │ Défense tenue ?")
    print("─" * (w + 40))
    held = 0
    for r in results:
        ok = "✅ oui" if r["blocked"] else "⚠️  NON"
        held += r["blocked"]
        print(f"{r['name'].ljust(w)} │ {r['category'].ljust(16)} │ {ok}")
    print("─" * (w + 40))
    print(f"\nBilan : {held}/{len(results)} attaques neutralisées par les défenses.\n")

    for r in results:
        print(f"  • {r['name']} — {r['detail']}")


if __name__ == "__main__":
    main()
