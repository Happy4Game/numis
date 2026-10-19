# Scénarios Red Team + réponses Blue Team

> ⚠️ Uniquement contre le SI **fictif** de l'équipe (sujet §9). Python standard, aucune install.

## Tout jouer d'un coup (synthèse Red/Blue)
```bash
make attack-all                 # catalogue complet (hors DoS) + tableau de résultats
```

## Disponibilité (on restaure)
```bash
make attack-dos                 # DoS par contention DB -> détection ML -> délestage auto
```

## Compromission / reconnaissance (on bloque / contient)
```bash
python3 attack/scenarios/sqli_probe.py       --target http://localhost:8080  # WAF 403
python3 attack/scenarios/xss_probe.py        --target http://localhost:8080  # WAF 403
python3 attack/scenarios/path_traversal.py   --target http://localhost:8080  # WAF 403
python3 attack/scenarios/recon_scan.py       --target http://localhost:8080  # rien d'exposé + SOC
python3 attack/scenarios/brute_force.py      --target http://localhost:8080  # verrouillage 429
python3 attack/scenarios/jwt_tamper.py       --target http://localhost:8080  # rejet 401
python3 attack/scenarios/priv_escalation.py  --target http://localhost:8080  # rejet 401
```

Démo réseau : ajouter `TARGET=http://192.168.137.1:8080` aux cibles `make`, ou `--target …` aux scripts.

La correspondance attaque → détection → défense → réponse est détaillée dans
[`../docs/red-blue-matrix.md`](../docs/red-blue-matrix.md).
