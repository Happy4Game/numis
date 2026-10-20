"""Microservice de reconnaissance faciale (IA légère).

Confirme que le visage présenté correspond à l'identifiant revendiqué. Appelé UNIQUEMENT
par le service `auth` (interne, jamais exposé publiquement). Gère aussi les habilitations
(enrôlement, liste, suppression des identités autorisées).

Pile volontairement légère (consigne : PC Hôte 16 Go) : OpenCV LBPH + détecteur Haar.
Pas de dlib ni de torch. Modèle et photos d'enrôlement persistés sur volume.
"""
import os, json, glob, base64, threading, logging, sys, time

import numpy as np
import cv2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

SERVICE = "face-auth"
_h = logging.StreamHandler(sys.stdout)
class _F(logging.Formatter):
    def format(self, r):
        return json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(r.created)),
                           "level": r.levelname, "service": SERVICE, "msg": r.getMessage()}, ensure_ascii=False)
_h.setFormatter(_F())
logging.getLogger().handlers = [_h]
logging.getLogger().setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
log = logging.getLogger(SERVICE)

MODEL_DIR = os.getenv("MODEL_DIR", "/model")
FACES_DIR = os.path.join(MODEL_DIR, "faces")
MODEL_PATH = os.path.join(MODEL_DIR, "lbph.yml")
LABELS_PATH = os.path.join(MODEL_DIR, "labels.json")
THRESHOLD = float(os.getenv("FACE_THRESHOLD", "70"))     # distance LBPH : plus bas = plus sûr
MIN_SAMPLES = int(os.getenv("FACE_MIN_SAMPLES", "3"))     # photos conseillées à l'enrôlement
SIZE = (200, 200)

os.makedirs(FACES_DIR, exist_ok=True)
_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
_lock = threading.Lock()
_state = {"recognizer": None, "labels": {}}   # labels : username -> int

app = FastAPI(title="RSA Face-Auth")


class EnrollIn(BaseModel):
    username: str
    images: list[str]          # images base64 (data-URL acceptées)

class VerifyIn(BaseModel):
    username: str
    image: str


# ----------------------------- traitement image -----------------------------
def _decode(b64: str):
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        arr = np.frombuffer(base64.b64decode(b64), np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        img = None
    if img is None:
        raise HTTPException(400, "image illisible")
    return img

def _largest_face(gray):
    faces = _cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    crop = cv2.resize(gray[y:y + h, x:x + w], SIZE)
    return cv2.equalizeHist(crop)

def _crop(b64: str):
    gray = cv2.cvtColor(_decode(b64), cv2.COLOR_BGR2GRAY)
    return _largest_face(gray)


# ----------------------------- modèle (train/load) --------------------------
def _retrain():
    users = sorted(d for d in os.listdir(FACES_DIR) if os.path.isdir(os.path.join(FACES_DIR, d)))
    labels = {u: i for i, u in enumerate(users)}
    X, y = [], []
    for u in users:
        for f in glob.glob(os.path.join(FACES_DIR, u, "*.png")):
            im = cv2.imread(f, cv2.IMREAD_GRAYSCALE)
            if im is not None:
                X.append(im); y.append(labels[u])
    if not X:
        _state.update(recognizer=None, labels={})
        if os.path.exists(MODEL_PATH):
            os.remove(MODEL_PATH)
        json.dump({}, open(LABELS_PATH, "w"))
        return 0
    rec = cv2.face.LBPHFaceRecognizer_create()
    rec.train(X, np.array(y))
    rec.write(MODEL_PATH)
    json.dump(labels, open(LABELS_PATH, "w"))
    _state.update(recognizer=rec, labels=labels)
    return len(X)

def _load():
    if os.path.exists(LABELS_PATH) and os.path.exists(MODEL_PATH):
        labels = json.load(open(LABELS_PATH))
        if labels:
            rec = cv2.face.LBPHFaceRecognizer_create()
            rec.read(MODEL_PATH)
            _state.update(recognizer=rec, labels=labels)
            log.info(f"modèle chargé ({len(labels)} identité(s))")


@app.on_event("startup")
def _startup():
    try:
        _load()
    except Exception as e:  # pragma: no cover
        log.error(f"chargement modèle impossible : {e}")


# ----------------------------- endpoints ------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "users": len(_state["labels"]), "threshold": THRESHOLD}

def _count(username):
    return len(glob.glob(os.path.join(FACES_DIR, username, "*.png")))

@app.get("/users")
def users():
    return [{"username": u, "samples": _count(u)} for u in sorted(_state["labels"])]

@app.post("/enroll")
def enroll(body: EnrollIn):
    u = body.username.strip()
    if not u:
        raise HTTPException(400, "identifiant vide")
    d = os.path.join(FACES_DIR, u)
    os.makedirs(d, exist_ok=True)
    accepted = 0
    with _lock:
        base = _count(u)
        for b64 in body.images:
            crop = _crop(b64)
            if crop is None:
                continue
            cv2.imwrite(os.path.join(d, f"{base + accepted:03d}.png"), crop)
            accepted += 1
        total = _retrain() if accepted else _count(u)
    if accepted == 0:
        raise HTTPException(422, "aucun visage détecté sur les photos fournies")
    log.info("enrôlement", extra={"extra_fields": {"user": u, "ajoutées": accepted}})
    return {"username": u, "added": accepted, "samples": _count(u),
            "ready": _count(u) >= MIN_SAMPLES, "total_samples": total}

@app.post("/verify")
def verify(body: VerifyIn):
    u = body.username.strip()
    rec = _state["recognizer"]
    if rec is None or u not in _state["labels"]:
        return {"recognized": False, "reason": "identité inconnue", "distance": None, "match": None}
    crop = _crop(body.image)
    if crop is None:
        return {"recognized": False, "reason": "aucun visage détecté", "distance": None, "match": None}
    label, dist = rec.predict(crop)
    inv = {i: name for name, i in _state["labels"].items()}
    match = inv.get(label)
    recognized = (match == u) and (dist <= THRESHOLD)
    log.info("vérification", extra={"extra_fields": {"user": u, "match": match, "dist": round(float(dist), 1), "ok": recognized}})
    return {"recognized": recognized, "reason": "ok" if recognized else "visage non concordant",
            "distance": round(float(dist), 1), "match": match}

@app.delete("/users/{username}")
def delete_user(username: str):
    d = os.path.join(FACES_DIR, username)
    if not os.path.isdir(d):
        raise HTTPException(404, "identité introuvable")
    with _lock:
        for f in glob.glob(os.path.join(d, "*")):
            os.remove(f)
        os.rmdir(d)
        _retrain()
    log.info("habilitation révoquée", extra={"extra_fields": {"user": username}})
    return {"deleted": username}
