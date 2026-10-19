# CLAUDE.md — Contexte projet RESILIENCE-ALPHA

## Ce que c'est
Workshop EPSI Bac+5 (4 jours, oct. 2026) : démonstrateur de **cyber-résilience et reprise
autonome** (Zero-Touch Recovery) pour un SI de paiement **fictif**. Une attaque lancée depuis
un PC distinct provoque une anomalie ; la plateforme la détecte, décide et répare **seule**,
puis prouve le retour à un état utilisable par une nouvelle transaction.

Équipe : Thibaut DUFEUTREL, Beny MBEMBA, Nour el houda OUKOUKES, Bouchra BASSIR (+ assistance IA).

## Stack (verrouillée)
- Services : **Python / FastAPI** (auth, payment-api, remediation-engine, ml-detector, rag-assistant)
- Front : **React + Tailwind** (Vite) — dashboard de supervision
- Infra : **Docker Compose**, **Ansible**, observabilité **Prometheus / Grafana / Loki / Promtail**
- Sécurité : **WAF ModSecurity/CRS**, SOC via Loki/Grafana, secrets **SOPS + age**
- IA : détection **Isolation Forest** (scikit-learn) + assistant **RAG Ollama+LangChain** (Qwen2.5 3B, ≤8B)
- Gouvernance : EBIOS RM, PCA/PRA, NIS2/DORA (docs/)

## Contrainte d'exécution importante
Docker Desktop tourne dans **le WSL/Windows de Thibaut**, PAS dans la VM Cowork où tournent
les device_bash. Donc : **Claude édite/prépare/valide ici** (code, builds node, git, docs) ;
**Thibaut lance la stack Docker dans son terminal WSL** (`make up`, `make pull-model`,
`make attack-dos`) et renvoie les logs. Pour debugger ensemble, il sauvegarde les logs dans
le dépôt (ex. `docker compose logs > debug/run.log`) et Claude les lit.

## Chaîne de la démo (le cœur noté)
PC Attaquant → `dos_flood.py` → pic latence/erreurs sur payment-api → Prometheus → ml-detector
(anomalie persistante) → remediation-engine (restart + **vérification /health**) → transaction
témoin OK. Visible avant/pendant/après sur le dashboard + Grafana.

## Point sensible à défendre au jury
Privilèges du moteur de remédiation : allowlist cibles (`MANAGED_CONTAINERS`) + allowlist
actions (`restart` seul) + token + reprise vérifiée. Durcissement : docker-socket-proxy
(voir docs/runbooks/hardening.md). L'assistant RAG n'a AUCUN privilège.

## Conventions
- Chaque service : `app/main.py` + `app/obs.py` (logs JSON + métriques Prometheus) + Dockerfile + requirements.txt
- Métrique clé : `http_requests_total`, `http_request_duration_seconds` (job="payment-api")
- `.env` = secrets de dev (gitignoré). `secrets.enc.env` (SOPS) = versionné, chiffré.
- Commits : terminer par les lignes Co-Authored-By / Claude-Session.

## À faire / en attente
- [ ] Répartition des 5 piliers par personne → docs/contributions.md
- [ ] Numéro d'équipe <n> → renommer les livrables Workshop2026-M2-G<n>-...
- [ ] 1er run réel (`make up`) → régler seuils ML/attaque
- [ ] Passe NIS2/DORA sourcée (EUR-Lex/ANSSI)
- [ ] Livrables jeudi : Dossier.pdf (8-12 p.), Pres.pptx, VidChrono.mp4 (60s), Code.zip
