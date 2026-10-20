# Consigne additionnelle 1 — MFA (reconnaissance faciale) + objet connecté

> Cette consigne s'ajoute au cahier des charges initial (elle n'en remplace aucune).
> Ce document assure la **traçabilité** exigence → implémentation.

## 1. Exigence
L'accès au **back-office** doit être confirmé par **reconnaissance faciale** (caméra USB sur le
**PC Hôte**), après l'identifiant et avant le mot de passe. L'état de chaque tentative est signalé
par un objet connecté **ESP8266** (LED bicolore rouge/vert) relié au point d'accès `RESILIENCE-G<n>`.

## 2. Machine à états (conforme à la consigne)

```
[identifiant] --saisie--> [VISAGE: caméra ON]
      ^                         |
      |            reconnu -----+-----> [MOT DE PASSE]  (LED vert clignotant)
      |                         |             |
      | non reconnu             |     bon --> [BACK-OFFICE]  (LED vert fixe 30s puis OFF)
      | (identifiant vidé,      |             |
      |  caméra OFF,            |     faux -> reprise identification  (LED rouge ×10 puis OFF)
      |  LED rouge fixe 30s)    |
      +--- 1 réessai puis BLOCAGE 5 min
```

## 3. Correspondance exigence → implémentation

| Exigence | Où | Détail |
|---|---|---|
| Caméra **sur le PC Hôte** | `frontend` (navigateur) | `getUserMedia` accède à la webcam du PC Hôte ; l'image est envoyée au back-end. |
| IA **légère** de reconnaissance de visage | `services/face-auth` | **face_recognition** (détecteur HOG + réseau ResNet dlib -> empreinte 128-D). Modèles livrés par pip (aucun téléchargement externe) ; empreintes persistées. |
| Confirme l'identifiant par le visage | `auth` `POST /identify` | appelle `face-auth /verify(username, image)`. |
| Puis mot de passe | `auth` `POST /backoffice/login` | exige un `face_token` court (étape visage réussie) + mot de passe. |
| Non reconnu → identifiant vidé, caméra off | `BackOffice.jsx` | retour à l'étape identifiant, `stopCam()`. |
| 1 réessai puis blocage 5 min | `auth` | `IDENT_MAX_FAILS=2`, `IDENT_LOCK_SECONDS=300`. |
| **Gestion complète des habilitations** | `auth /habilitations*` + `face-auth` | enrôlement multi-photos, liste, révocation (UI back-office). |
| Objet connecté **ESP8266** (CLion + PlatformIO) | `iot/esp8266-led/` | projet PlatformIO, WiFi `RESILIENCE-G<n>`, serveur HTTP `/led`. |
| LED bicolore rouge/vert | firmware | GPIO D5 (vert) / D6 (rouge). |
| LED éteinte par défaut | firmware | état initial `off`. |
| Reconnu → **vert clignotant** jusqu'au mot de passe | `auth`→`green_blink` | pas d'auto-extinction. |
| Mot de passe bon → **vert fixe 30 s** puis off | `auth`→`green_solid` | timer 30 s géré par l'ESP. |
| Mot de passe faux → **rouge ×10** puis off, reprise ident. | `auth`→`red_blink` | 10 clignotements. |
| Non reconnu → **rouge fixe 30 s** avant extinction caméra | `auth`→`red_solid` | timer 30 s géré par l'ESP. |

## 4. Choix & bootstrap
- **Caméra via navigateur** (et non un service accédant à `/dev/video`) : fiable sous Docker
  Desktop/WSL2, et la webcam reste bien **physiquement sur le PC Hôte**.
- **LED pilotée côté serveur** : `auth` POST l'état à l'ESP (`ESP_URL`). L'absence de l'objet
  n'empêche jamais l'authentification (appel best-effort, non bloquant).
- **Bootstrap** : le **premier** enrôlement est permis sans session (sinon poule/œuf — on ne
  pourrait jamais créer la 1re habilitation). Dès qu'une identité existe, l'enrôlement exige une
  session back-office.

## 5. Limites assumées (à dire au jury)
- **La reconnaissance par empreinte (dlib) n'a pas de détection de vivacité** : une **photo** du visage pourrait tromper la
  reconnaissance (attaque par présentation). Parade industrielle : *liveness* (clignement,
  mouvement, profondeur) — hors périmètre d'un prototype court. Voir matrice Red/Blue, ligne 10.
- Reconnaissance sensible à l'éclairage et au cadrage (enrôler 3–6 photos variées améliore).
- Le MFA protège le **back-office** ; la vue de supervision (démo de résilience) reste inchangée.
