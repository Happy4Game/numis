# Analyse de risques — EBIOS Risk Manager

> Méthode ANSSI. Structure en 5 ateliers. À compléter en équipe le lundi (J1).
> Source à citer dans le dossier : *EBIOS Risk Manager — Guide ANSSI* (anssi.gouv.fr).

## Atelier 1 — Cadrage & socle de sécurité
- **Objet étudié** : plateforme de paiement fictive RESILIENCE-ALPHA.
- **Valeurs métier** :
  - V1 — Exécuter une transaction de paiement.
  - V2 — Disponibilité du service de paiement.
  - V3 — Intégrité des soldes et de l'historique.
- **Biens supports** : `payment-api`, `db`, `auth`, `waf`, réseau du consortium, PC Hôte.
- **Événements redoutés (ER)** :
  | ER | Valeur métier | Impact | Gravité (1-4) |
  |----|---------------|--------|---------------|
  | ER1 | V2 | Indisponibilité du paiement | 4 |
  | ER2 | V3 | Altération d'un solde | 4 |
  | ER3 | V1 | Transaction refusée à tort | 3 |

## Atelier 2 — Sources de risque (SR) / Objectifs visés (OV)
| SR | Motivation | OV |
|----|-----------|----|
| Attaquant opportuniste | nuisance / déni | rendre le paiement indisponible |
| Fraudeur | gain | altérer un solde, exfiltrer des données |

## Atelier 3 — Scénarios stratégiques
- SS1 : un attaquant externe sature l'API → ER1 (indisponibilité). *→ couvert par la démo DoS.*
- SS2 : injection applicative pour lire/altérer la base → ER2. *→ couvert par WAF + requêtes paramétrées.*

## Atelier 4 — Scénarios opérationnels (chaîne d'attaque)
- SO1 (DoS) : reconnaissance → flood `/accounts` via WAF → saturation pool DB → latence/5xx.
- SO2 (SQLi) : fuzzing des paramètres → payload d'injection → **bloqué par ModSecurity/CRS**.

## Atelier 5 — Traitement du risque
| Risque | Mesure | Dans le démonstrateur |
|--------|--------|------------------------|
| SO1 | détection ML + remédiation autonome + rate-limit WAF | ✅ démontré |
| SO2 | WAF CRS + requêtes paramétrées + alerte SOC | ✅ démontré |
| ER2 | moindre privilège remédiation, secrets SOPS | ✅ |
| Résiduel | pas de HA, warmup court | accepté (prototype 4 j) |

## Objectifs de sécurité → RTO/RPO
→ voir `pca-pra.md`.
