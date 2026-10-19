# Runbook — Incident DoS (déroulé attendu)

1. **Attaque** (PC Attaquant) : `python attack/scenarios/dos_flood.py --target http://192.168.137.1:8080`.
2. **Symptômes** : latence p95 ↑, 5xx ↑ (Grafana / dashboard).
3. **Détection** : `ml-detector` flagge l'anomalie (N cycles) ; cause affichée (feature déviante).
4. **Reprise auto** : `remediation-engine` restart `rsa-payment-api` + vérifie `/health`.
5. **Preuve** : dashboard repasse au vert ; "Transaction témoin" ou `make smoke` réussit.
6. **Investigation** : logs dans Grafana (Loki), historique dans l'onglet remédiation.

Si la reprise n'est pas confirmée sous 60 s → le moteur renvoie `unverified` ;
rejouer manuellement : `ansible-playbook -i infra/ansible/inventory.ini infra/ansible/remediate.yml`.
