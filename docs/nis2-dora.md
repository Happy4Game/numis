# NIS2 & DORA — enjeux pour une activité financière (fictive)

> On distingue les exigences **pertinentes et illustrables** par le démonstrateur de celles
> qui **ne peuvent pas** être prouvées en 4 jours (sujet §3.5).
> Sources à citer : Directive (UE) 2022/2555 (**NIS2**) et Règlement (UE) 2022/2554 (**DORA**),
> EUR-Lex ; transposition NIS2 en droit français (ANSSI). *[Référencer les articles précis en J2.]*

## 1. DORA (résilience opérationnelle numérique du secteur financier)
| Pilier DORA | Illustrable ici ? | Comment |
|-------------|-------------------|---------|
| Gestion du risque TIC | ✅ partiel | EBIOS RM + cette doc |
| Gestion/notification des incidents | ✅ partiel | détection + journalisation + historique de remédiation |
| Tests de résilience (TLPT) | ✅ partiel | scénarios Red Team + chaos (injection de défaillances J4) |
| Risque lié aux tiers (prestataires TIC) | ❌ | pas de vrai fournisseur externe |
| Partage d'information sur les cybermenaces | ❌ | hors périmètre |

## 2. NIS2 (cybersécurité, entités essentielles/importantes)
| Exigence NIS2 | Illustrable ? | Comment |
|---------------|---------------|---------|
| Analyse de risque & politique SSI | ✅ | EBIOS RM, durcissement, moindre privilège |
| Gestion des incidents | ✅ | SOC (Loki/Grafana), alertes, remédiation tracée |
| Continuité (sauvegarde, reprise) | ✅ partiel | PCA/PRA + reprise autonome |
| Notification des incidents aux autorités | ❌ | obligation organisationnelle, non démontrable par un prototype |
| Chaîne d'approvisionnement | ❌ | hors périmètre |
| Gouvernance & responsabilité des dirigeants | ⚠️ | on le traite comme recommandation, pas comme preuve |

## 3. Recommandations à une direction (posture conseil)
1. Formaliser la notification d'incident (process + délais) — non couvert par le proto.
2. Étendre la détection au-delà de la disponibilité (intégrité, exfiltration).
3. Industrialiser la gestion des secrets (passer de SOPS à un coffre centralisé type Vault).
4. Mettre en place des tests de résilience réguliers (le chaos engineering du J4 en est l'amorce).
