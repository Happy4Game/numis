# WAF — OWASP ModSecurity CRS (nginx)

Frontal applicatif de `payment-api` (sujet §3.4). Image officielle `owasp/modsecurity-crs`.

- `MODSEC_RULE_ENGINE=On` → les attaques connues (ex. injection SQL) sont **bloquées**.
  Passer à `DetectionOnly` pour n'enregistrer que les alertes sans bloquer.
- Journal d'audit JSON écrit dans `logs/` → collecté par Promtail → Loki → Grafana (SOC).
- `PARANOIA=1` : niveau de rigueur des règles (augmenter = plus strict, plus de faux positifs).

Pour une exclusion de règle spécifique (si un faux positif gêne la démo), monter un fichier
`rules/` dans le conteneur et y placer une directive `SecRuleRemoveById`.
