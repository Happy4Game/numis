# Architecture — PROJECT RESILIENCE-ALPHA

> Document de référence du consortium. Il décrit les composants, les flux, la chaîne
> détection → décision → reprise, le modèle de privilèges et les choix techniques.
> Il alimente directement le `Dossier.pdf` (sujet §7.1).

## 1. Vue logique

Cinq domaines imposés, une plateforme unique :

| Domaine | Composants | Rôle |
|---|---|---|
| Développement | `auth`, `payment-api`, `frontend` | SI de paiement fictif + supervision |
| Infrastructure | `docker-compose`, `ansible`, Prometheus/Grafana/Loki | déployer, observer, rétablir |
| IA / Data | `ml-detector`, `rag-assistant` (+ `ollama`) | détecter l'anomalie, assister l'opérateur |
| Cybersécurité | `waf`, SOC (Loki/Grafana), SOPS, `attack/` | éprouver et défendre |
| Gouvernance | `docs/ebios-rm`, `docs/pca-pra`, `docs/nis2-dora` | justifier les choix |

## 2. Flux de données

### 2.1 Chemin métier (nominal)
```
navigateur ──► WAF (:8080) ──► payment-api ──► db
                                   ▲
                               auth (JWT)
```
- `auth` émet un JWT (HS256). `payment-api` **valide le jeton localement** avec le secret
  partagé plutôt que d'appeler `auth` à chaque requête : on évite un aller-retour réseau par
  requête (critique sous charge d'attaque). `auth` garde la responsabilité unique de l'identité.
- Toutes les requêtes métier passent par le **WAF** : c'est le seul point d'entrée publié.

### 2.2 Chaîne de résilience (le cœur du sujet)
```
payment-api ──/metrics──► Prometheus ──query──► ml-detector ──(anomalie persistante)──► remediation-engine
     ▲                         │                                                              │
     │                    alertmanager (alertes SOC lisibles)                                 │
     └──────────────────── restart + vérification /health ◄───────────────────────────────────┘
```
1. `payment-api` expose des métriques (débit, erreurs, latence histogramme).
2. `prometheus` scrape toutes les 10 s.
3. `ml-detector` interroge Prometheus, construit un vecteur de 3 features, le score avec un
   **Isolation Forest** appris sur une fenêtre de normalité.
4. Une anomalie n'est traitée comme **incident** que si elle s'accompagne d'une **dégradation**
   réelle (erreurs ou latence au-dessus d'un seuil) : un simple creux de trafic ne déclenche rien.
   Après **N cycles d'incident consécutifs** (anti faux-positif), il appelle `remediation-engine`.
5. `remediation-engine` applique un **playbook** : service injoignable (planté) → `restart` du
   conteneur autorisé ; service vivant mais saturé (DoS) → **délestage de charge** (il active un
   rate-limiting sur l'API, qui rejette l'excédent en 429 et libère le pool). Puis il **vérifie le
   retour à `/health`** : un conteneur relancé ne suffit pas, on prouve le retour à un état utilisable.
6. Le `frontend` et Grafana rendent l'état visible **avant / pendant / après**.

### 2.3 Chaîne d'observabilité / SOC
```
conteneurs ──logs JSON──► promtail ──► loki ──► grafana
WAF ──audit JSON──────────┘                      ▲ (alerting = fonction SOC)
```
Pas d'Elastic (trop lourd pour 16 Go, déconseillé par le sujet) : Loki + Grafana tiennent le
rôle de SIEM/SOC léger.

## 3. Modèle de privilèges du moteur de remédiation (point noté §3.4)

La remédiation a besoin de droits élevés (piloter Docker). On les **encadre** :

1. **Isolation** : seul `remediation-engine` monte `/var/run/docker.sock`.
2. **Allowlist de cibles** : variable `MANAGED_CONTAINERS` ; toute autre cible est refusée (403).
3. **Allowlist d'actions** : `restart` (conteneur de l'allowlist) ou `throttle` (délestage via
   l'API, jeton partagé). Pas d'exec arbitraire.
4. **Authentification** : header `x-remediation-token` obligatoire (détenu par `ml-detector`).
5. **Traçabilité** : chaque demande (acceptée ou refusée) est journalisée et comptée (métriques
   `remediation_actions_total`, `remediation_refused_total`).

Durcissement prévu (voir `runbooks/hardening.md`) : remplacer le socket brut par un
`docker-socket-proxy` limité à `POST /containers/{id}/restart`.

L'assistant RAG, lui, n'a **aucun** privilège : il lit la doc en lecture seule (sujet §3.3).

## 4. Choix techniques justifiés

| Choix | Pourquoi | Alternative écartée |
|---|---|---|
| FastAPI (Python) partout | ML + RAG déjà en Python → un seul langage à maîtriser | Node/Go : 2e langage à défendre |
| Isolation Forest | non supervisé, léger, **explicable** | autoencodeur : plus lourd, moins lisible |
| SOPS + age | pas de serveur (RAM) | Vault serveur : +RAM, +complexité |
| Loki/Grafana comme SOC | tient sur 16 Go | Elastic/Wazuh : trop lourd |
| Qwen2.5 3B | tient sur PC Hôte 16 Go, FR correct | 7-8B : nécessite 32 Go ou 3e PC |
| ModSecurity CRS | WAF standard reconnu, règles OWASP | WAF maison : non crédible |

## 5. Budget mémoire (PC Hôte 16 Go)

| Bloc | ~RAM |
|---|---|
| PostgreSQL + 5 services FastAPI | ~0,8 Go |
| Prometheus + Loki + Promtail + Grafana + Alertmanager | ~0,8 Go |
| WAF + frontend | ~0,2 Go |
| Ollama + Qwen2.5 3B (chargé) | ~3–4 Go |
| **Total estimé** | **~6 Go** (marge confortable) |

## 6. Politique d'exposition réseau (§4)

Exposés sur `RESILIENCE-G<n>` : WAF (:8080), dashboard (:3001), Grafana (:3000, lecture seule).
Jamais exposés : db, auth, prometheus, loki, remediation-engine, ml-detector, ollama. Le
dashboard atteint les services internes via un **reverse-proxy nginx** (le navigateur ne parle
qu'au frontend).

## 7. Limites assumées (à dire au jury)

- Détection sur 3 features : couvre la dégradation de disponibilité, pas toutes les attaques.
- Remédiation = restart (crash) ou délestage (DoS) : traite la **disponibilité**, pas la
  correction d'une compromission (scénario SQLi → bloqué en amont par le WAF, pas d'auto-remédiation).
- Fenêtre de normalité courte (warmup) : un trafic de référence atypique fausserait le modèle.
- Prototype 4 jours : pas de HA, pas de persistance longue des métriques.
