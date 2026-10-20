#!/usr/bin/env python3
"""Attaque via le DASHBOARD (:3001) — vérifie que le reverse-proxy du front n'ouvre pas de faille.
Catégorie : compromission (contournement / accès privilégié).

Le dashboard sert la SPA ET relaie les /api/*. On éprouve deux choses :
  1. Pas de BYPASS du WAF : une injection envoyée à /api/payment transite par le WAF -> 403.
  2. Frontière de privilège : déclencher une remédiation via /api/remediation/remediate
     sans le jeton (puis avec un faux) -> 401. Le proxy n'ouvre pas d'action privilégiée.

À LANCER DEPUIS LE PC ATTAQUANT, contre le dashboard de l'équipe (sujet §9).
Usage :  python3 front_proxy.py --target http://localhost:3001
"""
import argparse, _common as c

SQLI = "1' UNION SELECT NULL,password_hash,NULL FROM users--"


def run(front):
    # 1. injection via le proxy paiement -> passe par le WAF -> doit être bloquée (403)
    code_waf, _, _ = c.hit("GET", f"{front}/api/payment/transactions?limit={c.quote(SQLI)}")
    no_bypass = code_waf == 403
    # 2. déclencher une remédiation via le proxy, sans jeton puis avec un faux -> 401 attendu
    body = {"action": "restart", "target": "rsa-payment-api"}
    c1, _, _ = c.hit("POST", f"{front}/api/remediation/remediate", data=body)
    c2, _, _ = c.hit("POST", f"{front}/api/remediation/remediate", data=body,
                     headers={"x-remediation-token": "faux-jeton"})
    priv_ok = (c1 == 401 and c2 == 401)
    return {"name": "Attaque via le dashboard (:3001)", "category": "Compromission",
            "defense": "proxy paiement routé par le WAF + action de remédiation protégée par jeton",
            "blocked": no_bypass and priv_ok,
            "detail": (f"injection via /api/payment -> {code_waf} (403 = WAF, aucun bypass) ; "
                       f"remédiation sans/faux jeton -> {c1}/{c2} (401/401 attendus)")}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="http://localhost:3001")
    c.banner(run(ap.parse_args().target))
