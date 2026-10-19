# Matrice Red / Blue — attaques, détection, défense, réponse

> Chaque attaque est jouée depuis le PC Attaquant contre le SI **fictif** (sujet §9).
> On distingue **disponibilité** (on *restaure*) et **compromission** (on *bloque / contient*).

| # | Attaque (Red) | Catégorie | Signal / détection (SOC) | Défense (Blue) | Réponse |
|---|---------------|-----------|--------------------------|----------------|---------|
| 1 | DoS (contention DB) | Disponibilité | latence p95 ↑, 5xx ↑ (Prometheus) → **détecteur ML** | pool borné, moteur de remédiation | **délestage** auto (429) + vérif santé |
| 2 | Injection SQL | Compromission | logs WAF `job=modsec` (Loki) | **WAF** CRS + requêtes paramétrées | **blocage** 403 (pas de restauration) |
| 3 | XSS | Compromission | logs WAF (Loki) | **WAF** CRS | blocage 403 |
| 4 | Traversée de répertoire / LFI | Compromission | logs WAF (Loki) | **WAF** CRS | blocage 403 |
| 5 | Reconnaissance (scan) | Reconnaissance | **alerte `ScanSuspecte`** (pic 4xx) | aucune surface sensible exposée | 403/404, surveillance |
| 6 | Brute-force auth | Compromission | **alerte `BruteForceSuspectee`** (pic 401) | **verrouillage** temporaire (auth) | 429 après N échecs |
| 7 | Falsification JWT | Compromission (intégrité) | 401 répétés (logs auth/API) | **validation de signature** HS256 | rejet 401 |
| 8 | Élévation de privilèges | Compromission (accès) | 401 sur `/admin/*` (logs) | **endpoint admin protégé** par jeton | rejet 401 |

## Lecture

- **Disponibilité (ligne 1)** : une attaque qui ne *casse* rien mais *sature* → la bonne réponse
  est de **restaurer le service** (délestage), pas de « corriger une fuite ».
- **Compromission (lignes 2-8)** : la bonne réponse est de **bloquer/contenir en amont**
  (WAF, verrouillage, validation, contrôle d'accès). On ne « redémarre » pas une compromission.

Cette distinction est explicitement valorisée par le sujet (§2, §3.4).

## Détection : deux voies complémentaires

- **Par métriques** (Prometheus → détecteur ML + règles d'alerte) : disponibilité, brute-force, scan.
- **Par journaux** (WAF + services → Promtail → Loki → Grafana) : injections, XSS, traversée,
  accès refusés — consultables et corrélables (fonction SOC).
