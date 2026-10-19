# PCA / PRA — Continuité & reprise

> Adapté à la solution livrée (sujet §3.5). Source à citer : guides ANSSI sur la continuité ;
> ISO 22301 pour le vocabulaire.

## 1. Services critiques & objectifs
| Service | Criticité | RTO visé | RPO visé |
|---------|-----------|----------|----------|
| payment-api | vitale | < 60 s (reprise autonome) | 0 (transaction non confirmée = échouée) |
| db | vitale | < 2 min | dernière transaction committée |
| auth | importante | < 2 min | n/a |
| observabilité | support | best effort | 6 h de rétention |

## 2. Scénarios couverts par le PRA
- **S1 — Indisponibilité de `payment-api`** : détection ML → `remediation-engine` restart +
  vérification `/health`. RTO mesuré = métrique `remediation_last_recovery_seconds`.
- **S2 — Tentative d'injection** : blocage WAF, pas d'interruption → PCA (le service continue).

## 3. Rôles & responsabilités
| Rôle | Qui | Action |
|------|-----|--------|
| Détection | `ml-detector` (auto) | signale l'anomalie |
| Décision/Action | `remediation-engine` (auto) | exécute le playbook |
| Supervision | opérateur + dashboard | observe, peut rejouer `ansible-playbook remediate.yml` |
| Assistance | `rag-assistant` | répond sur les procédures |

## 4. Choix de restauration
- Restart ciblé (allowlist) plutôt que redeploy complet → RTO minimal.
- Vérification de reprise = transaction témoin réussie (pas seulement conteneur "up").

## 5. Risques résiduels après reprise
- Si la cause persiste (attaque toujours en cours), le rate-limit WAF tient mais la latence
  reste dégradée → escalade humaine via le dashboard.
- Pas de bascule multi-nœuds (hors périmètre prototype).
