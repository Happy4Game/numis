# Objet connecté — Signalisation LED (ESP8266)

Module de signalisation de la **consigne additionnelle 1** : une LED bicolore (rouge/vert)
reflète l'état d'authentification du back-office. L'ESP8266 se connecte au point d'accès
`RESILIENCE-G<n>` et expose un petit serveur HTTP ; le service `auth` lui pousse l'état.

## Matériel
- ESP8266 (NodeMCU v2 ou Wemos D1 mini — adapter `board` dans `platformio.ini`).
- 1 LED bicolore **cathode commune** (rouge/vert) + 2 résistances ~330 Ω.

### Câblage
| ESP8266 | → | LED |
|---|---|---|
| D5 (GPIO14) | —[330 Ω]— | anode **verte** |
| D6 (GPIO12) | —[330 Ω]— | anode **rouge** |
| GND | ———— | cathode commune |

> LED à **anode commune** ? Reliez la commune au 3V3 et inversez la logique (`HIGH`↔`LOW`)
> dans `writeLeds()`, ou câblez les cathodes sur les GPIO.

## Mise en service (IDE imposé : JetBrains CLion + PlatformIO)
1. Installer le plugin **PlatformIO** dans CLion (Settings → Plugins).
2. **Open** ce dossier (`iot/esp8266-led`) dans CLion.
3. Éditer `src/main.cpp` : `WIFI_SSID` = `RESILIENCE-G<n>`, `WIFI_PASS` = mot de passe du PA.
4. Brancher l'ESP en USB, puis **Build** et **Upload** (icônes PlatformIO).
5. Ouvrir le **Monitor série** (115200 bauds) : l'IP attribuée s'affiche (ex. `192.168.137.50`).
6. Renseigner cette IP côté plateforme : `ESP_URL=http://192.168.137.50` dans `.env`, puis
   `docker compose up -d auth`.

## API
| Méthode | Route | Effet |
|---|---|---|
| `POST` | `/led` `{"state":"..."}` | applique l'état |
| `GET`  | `/led?state=...` | idem (pratique pour tester au navigateur) |
| `GET`  | `/` | état courant + IP + RSSI (debug) |

### États (timings gérés par le firmware)
| state | comportement |
|---|---|
| `off` | éteinte |
| `green_blink` | vert clignotant (visage reconnu, attente du mot de passe) — jusqu'au prochain ordre |
| `green_solid` | vert fixe **30 s** puis extinction (mot de passe validé) |
| `red_blink` | rouge clignote **10×** puis extinction (mot de passe faux) |
| `red_solid` | rouge fixe **30 s** puis extinction (visage non reconnu) |

## Test rapide (sans la plateforme)
```
curl "http://<IP_ESP>/led?state=green_blink"
curl -X POST http://<IP_ESP>/led -H 'Content-Type: application/json' -d '{"state":"red_blink"}'
```
