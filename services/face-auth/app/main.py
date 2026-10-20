"""Microservice de reconnaissance faciale par EMPREINTES (embeddings).

Confirme que le visage présenté correspond à l'identifiant revendiqué. Appelé UNIQUEMENT
par le service `auth` (interne). Gère les habilitations (enrôlement/liste/révocation).

Pile : `face_recognition` (détecteur HOG + réseau ResNet dlib -> empreinte 128-D). Modèles
livrés par pip (aucun téléchargement externe), wheel dlib pré-compilé. Comparaison par
distance euclidienne : reconnu si distance <= FACE_TOLERANCE (défaut 0.6 ; plus bas = plus strict).
"""
import os, glob, base64, threading, logging, sys, time, json, io

import numpy as np
from PIL import Image
import face_recognition
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
TOLERANCE = float(os.getenv("FACE_TOLERANCE", "0.6"))     # distance euclidienne max (plus bas = plus strict)
MIN_SAMPLES = int(os.getenv("FACE_MIN_SAMPLES", "2"))
DETECT_MODEL = os.getenv("FACE_DETECT_MODEL", "hog")       # 'hog' (CPU, rapide) ou 'cnn'

os.makedirs(FACES_DIR, exist_ok=True)
_lock = threading.Lock()
_emb = {}                                                  # username -> list[np.ndarray (128,)]

app = FastAPI(title="RSA Face-Auth (dlib)")


class EnrollIn(BaseModel):
    username: str
    images: list[str]

class VerifyIn(BaseModel):
    username: str
    image: str


# ----------------------------- traitement image -----------------------------
def _decode_rgb(b64: str):
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    except Exception:
        raise HTTPException(400, "image illisible")
    return np.array(img)

def _encoding(b64: str):
    rgb = _decode_rgb(b64)
    locs = face_recognition.face_locations(rgb, model=DETECT_MODEL)
    if not locs:
        return None
    loc = max(locs, key=lambda l: (l[2] - l[0]) * (l[1] - l[3]))   # plus grand visage
    encs = face_recognition.face_encodings(rgb, [loc])
    return encs[0] if encs else None

def _load():
    _emb.clear()
    for d in glob.glob(os.path.join(FACES_DIR, "*")):
        if os.path.isdir(d):
            u = os.path.basename(d)
            arrs = [np.load(f) for f in sorted(glob.glob(os.path.join(d, "*.npy")))]
            if arrs:
                _emb[u] = arrs
    log.info(f"empreintes chargées : {len(_emb)} identité(s)")


@app.on_event("startup")
def _startup():
    try:
        _load()
    except Exception as e:  # pragma: no cover
        log.error(f"chargement empreintes impossible : {e}")


# ----------------------------- endpoints ------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "users": len(_emb), "tolerance": TOLERANCE, "detector": DETECT_MODEL}

@app.get("/users")
def users():
    return [{"username": u, "samples": len(_emb[u])} for u in sorted(_emb)]

@app.post("/enroll")
def enroll(body: EnrollIn):
    u = body.username.strip()
    if not u:
        raise HTTPException(400, "identifiant vide")
    d = os.path.join(FACES_DIR, u)
    os.makedirs(d, exist_ok=True)
    added = 0
    with _lock:
        base = len(glob.glob(os.path.join(d, "*.npy")))
        for b64 in body.images:
            enc = _encoding(b64)
            if enc is None:
                continue
            np.save(os.path.join(d, f"{base + added:03d}.npy"), enc)
            _emb.setdefault(u, []).append(enc)
            added += 1
    if added == 0:
        raise HTTPException(422, "aucun visage détecté sur les photos fournies")
    n = len(_emb.get(u, []))
    log.info("enrôlement", extra={"extra_fields": {"user": u, "ajoutées": added, "total": n}})
    return {"username": u, "added": added, "samples": n, "ready": n >= MIN_SAMPLES}

@app.post("/verify")
def verify(body: VerifyIn):
    u = body.username.strip()
    if u not in _emb:
        return {"recognized": False, "reason": "identité inconnue", "score": None}
    enc = _encoding(body.image)
    if enc is None:
        return {"recognized": False, "reason": "aucun visage détecté", "score": None}
    dists = face_recognition.face_distance(_emb[u], enc)
    best = float(np.min(dists))
    ok = best <= TOLERANCE
    log.info("vérification", extra={"extra_fields": {"user": u, "distance": round(best, 3), "ok": ok}})
    return {"recognized": ok, "reason": "ok" if ok else "visage non concordant",
            "score": round(best, 3), "threshold": TOLERANCE}

@app.delete("/users/{username}")
def delete_user(username: str):
    d = os.path.join(FACES_DIR, username)
    if not os.path.isdir(d):
        raise HTTPException(404, "identité introuvable")
    with _lock:
        for f in glob.glob(os.path.join(d, "*")):
            os.remove(f)
        os.rmdir(d)
        _emb.pop(username, None)
    log.info("habilitation révoquée", extra={"extra_fields": {"user": username}})
    return {"deleted": username}
