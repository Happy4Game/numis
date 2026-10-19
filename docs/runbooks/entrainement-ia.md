# Runbook — Entraîner le détecteur sur le comportement normal

Le modèle doit apprendre à quoi ressemble un trafic **nominal** pour pouvoir repérer un écart.
« Lancer et attendre » ne suffit pas : il faut (1) du trafic représentatif pendant
l'apprentissage, et (2) ne pas tout ré-apprendre à chaque redémarrage.

## Données & features
3 features calculées depuis Prometheus (fenêtre 1 min), par échantillon :
`request_rate` (débit), `error_ratio` (taux de 5xx), `p95_latency` (latence p95).
Modèle : **Isolation Forest** (non supervisé) — pas besoin d'incidents étiquetés.

## Méthode A — apprentissage en direct sur trafic nominal (simple)
1. (Re)démarrer le détecteur sans modèle → il entre en phase d'apprentissage.
2. Dans un terminal, générer du trafic normal pendant toute la phase :
   ```bash
   make traffic           # utilisateurs légitimes : consultations + petits virements
   ```
3. Quand la barre « Apprentissage » est pleine → le modèle est **entraîné ET sauvegardé**
   (`/model/model.pkl`). Au prochain redémarrage il est rechargé : plus d'attente.

## Méthode B — entraînement hors-ligne reproductible (pour le dossier)
1. Lancer du trafic nominal : `make traffic` (dans un terminal).
2. Dans un autre : `make train` → collecte N échantillons depuis Prometheus, entraîne,
   sauvegarde le modèle, puis recharge le détecteur (démarrage immédiat, sans apprentissage).

→ Avantage : jeu d'entraînement contrôlé, modèle versionnable, séparation apprentissage/service.

## Ré-apprendre à neuf
```bash
make retrain               # oublie le modèle et relance un apprentissage
```

## Réglages (dans docker-compose.yml, service ml-detector)
- `WARMUP_SAMPLES` : nombre d'échantillons d'apprentissage (défaut 20).
- `POLL_INTERVAL_SECONDS` : période d'échantillonnage (défaut 10 s).
- `ANOMALY_PERSIST_CYCLES` : cycles anormaux consécutifs avant de déclencher la reprise (défaut 2).
