# Scénarios Red Team

> ⚠️ À exécuter **uniquement** depuis le PC Attaquant, contre le SI fictif de l'équipe.
> Réseaux du campus, autres groupes et services tiers sont **hors périmètre** (sujet §9).

```bash
pip install -r requirements.txt

# DoS applicatif contrôlé -> détecté par le ML -> réparé par la remédiation
python scenarios/dos_flood.py --target http://192.168.137.1:8080 --concurrency 60 --duration 40

# Injection SQL -> bloquée par le WAF, tracée dans le SOC
python scenarios/sqli_probe.py --target http://192.168.137.1:8080
```
