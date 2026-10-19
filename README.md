# PROJECT RESILIENCE-ALPHA — Workshop2026-M2-G\<n\>

Démonstrateur de **cyber-résilience et reprise autonome** (Zero-Touch Recovery) pour un
SI de paiement fictif. Une attaque lancée depuis un poste distinct provoque une anomalie
observable ; la plateforme la **détecte, décide et répare seule**, puis prouve le retour
à un état utilisable par une nouvelle transaction.

> ⚠️ Environnement **100 % fictif**. Aucune donnée bancaire réelle. Les actions offensives
> sont strictement limitées au SI de l'équipe (sujet §9).

---

## 1. Architecture en un coup d'œil

```
 PC ATTAQUANT                         PC HÔTE (Docker Compose)
 ─────────────                        ────────────────────────────────────────────
 dos_flood.py ───▶  :8080  waf  ──▶  payment-api ──▶  db (PostgreSQL)
 sqli_probe.py      (ModSec/CRS)        │  ▲              auth
                                        │  │
                      métriques /metrics│  │ restart/isolation (allowlist)
                                        ▼  │
                                   prometheus ──▶ ml-detector ──▶ remediation-engine
                                        │               (Isolation Forest)      │
                                   alertmanager ─────────────────────────────────┘
                                        │
 logs ──▶ promtail ──▶ loki ──▶  grafana (dashboards + alerting = fonction SOC)
                                        ▲
                                   frontend (React/Tailwind : supervision)
                                   rag-assistant ──▶ ollama (LLM local ≤ 8B)
```

Détail complet : [`docs/architecture.md`](docs/architecture.md).

## 2. Les 5 piliers imposés → où ils sont

| Pilier (sujet §3) | Dans ce dépôt |
|---|---|
| Développement | `services/{auth,payment-api}`, `frontend/` |
| Infrastructure | `docker-compose.yml`, `infra/`, `infra/ansible/` |
| IA / Data | `services/ml-detector/` (détection) + `services/rag-assistant/` (assistant) |
| Cybersécurité | `infra/waf/`, SOC via Loki/Grafana, `.sops.yaml`, `attack/` |
| Gouvernance | `docs/ebios-rm.md`, `docs/pca-pra.md`, `docs/nis2-dora.md` |

## 3. Prérequis (PC Hôte)

- Windows 10/11 + **Docker Desktop (WSL2)**, 16 Go RAM, ~20 Go libres.
- Point d'accès mobile Windows `RESILIENCE-G<n>`, PC Hôte en `192.168.137.1`.

## 4. Démarrage rapide

```bash
# 1. Secrets de dev
cp .env.example .env        # puis ÉDITEZ les mots de passe
#    (en conditions "réelles", déchiffrer : sops --decrypt secrets.enc.env > .env)

# 2. Démarrer la plateforme
make up                     # = docker compose up -d --build

# 3. Charger le modèle LLM local (une fois)
make pull-model

# 4. Vérifier que le métier répond
make smoke                  # exécute une transaction fictive témoin
```

Interfaces :
- **Paiement (via WAF)** : http://192.168.137.1:8080
- **Dashboard supervision** : http://192.168.137.1:3001
- **Grafana (SOC)** : http://192.168.137.1:3000  (anonyme lecture seule)
- **Assistant opérateur (RAG)** : http://192.168.137.1:8001

## 5. Jouer la démo de reprise (le cœur noté)

```bash
# Terminal A (PC Hôte) — observer
make logs            # ou ouvrir le dashboard + Grafana

# Terminal B (PC ATTAQUANT) — attaquer
make attack-dos      # DoS contrôlé -> pic latence/erreurs sur payment-api
```

Séquence attendue, **sans intervention humaine** :
1. `payment-api` sature → métriques dégradées visibles dans Prometheus/Grafana.
2. `ml-detector` détecte l'anomalie (persistante N cycles) et appelle `remediation-engine`.
3. `remediation-engine` applique le playbook (restart + vérification santé) sur le **seul**
   conteneur autorisé.
4. Le dashboard repasse au vert ; `make smoke` (ou une transaction depuis l'UI) réussit.

Scénario secondaire (montre qu'on distingue *dispo* vs *compromission*) :
```bash
make attack-sqli     # tentative d'injection -> bloquée par le WAF + alerte SOC
```

## 6. Structure du dépôt

```
docker-compose.yml        Orchestration de toute la stack
Makefile                  Raccourcis (up/down/attack/smoke...)
.sops.yaml                Gestion des secrets (SOPS + age)
services/                 Microservices FastAPI (auth, payment-api, ml-detector,
                          remediation-engine, rag-assistant)
frontend/                 Dashboard React + Tailwind
infra/                    prometheus, alertmanager, loki, promtail, grafana, waf, ansible
attack/                   Scénarios Red Team (depuis le PC Attaquant)
docs/                     Architecture + livrables de gouvernance (EBIOS, PCA/PRA, NIS2/DORA)
tests/                    Tests de fumée / vérification de reprise
```

## 7. Répartition des contributions

Voir [`docs/contributions.md`](docs/contributions.md) (exigé par la grille — "contribution de chacun visible").

## 8. Mentions

Code assisté par IA (sujet §5) ; l'équipe reste responsable de la vérification, de
l'intégration et de la maîtrise de l'ensemble présenté.
