# Runbook — Durcissement

## Moteur de remédiation : socket Docker
Le moteur a besoin de Docker pour redémarrer un conteneur. Le socket brut donne un accès large.
**Durcissement recommandé** : interposer `tecnativa/docker-socket-proxy` ne laissant passer que
le restart.

```yaml
  docker-proxy:
    image: tecnativa/docker-socket-proxy:0.3.0
    environment:
      CONTAINERS: 1          # lecture
      POST: 1                # autorise les POST (restart)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [rsa-net]
```
Puis pointer `remediation-engine` sur `tcp://docker-proxy:2375` (variable `DOCKER_HOST`) au lieu
du socket, et retirer le montage du socket du moteur.

## Secrets (SOPS)
- `age.key` et `.env` **jamais** commités (cf. `.gitignore`).
- Seul `secrets.enc.env` (chiffré) est versionné (sujet §7.4 : aucun secret en clair).

## Conteneurs
- Services applicatifs en utilisateur non-root (`appuser`).
- Pools de connexions bornés (limite l'amplitude d'un déni de service).
- WAF en `RULE_ENGINE=On` pendant la démo (blocage réel).

## Exposition réseau
- Publier uniquement WAF, dashboard, Grafana. Vérifier avant la démo :
  `docker compose ps` → aucune autre correspondance de port côté hôte.
