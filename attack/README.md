# Scénarios Red Team

> ⚠️ À exécuter **uniquement** depuis le PC Attaquant, contre le SI fictif de l'équipe.
> Réseaux du campus, autres groupes et services tiers sont **hors périmètre** (sujet §9).

**Aucune dépendance à installer** : scripts en Python standard (`python3`).

```bash
# DoS applicatif contrôlé -> détecté par le ML -> réparé par la remédiation
python3 scenarios/dos_flood.py --target http://localhost:8080 --concurrency 60 --duration 40

# Injection SQL -> bloquée par le WAF, tracée dans le SOC
python3 scenarios/sqli_probe.py --target http://localhost:8080
```

Ou via le Makefile (cible locale par défaut) :
```bash
make attack-dos                                   # vise localhost:8080
make attack-dos TARGET=http://192.168.137.1:8080  # démo sur le réseau du workshop
make attack-sqli
```

L'auth passe par le proxy du dashboard (`:3001`), le flood vise le WAF (`:8080`).
