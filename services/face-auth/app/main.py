"""Microservice de reconnaissance faciale par EMPREINTES (embeddings).

Confirme que le visage présenté correspond à l'identifiant revendiqué. Appelé UNIQUEMENT
par le service `auth` (interne). Gère les habilitations (enrôlement/liste/révocation).

Pile : OpenCV **YuNet** (détection robuste) + **SFace** (empreinte 128-D), tous deux
inclus dans opencv-contrib — pas de dlib ni de torch. Bien plus fiable que LBPH.
On compare les empreintes par similarité cosinus. Modèles et empreintes persistés.
"""
import os, glob, base64, threading, logging, sys, time, json

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
YUNET = os.getenv("YUNET_PATH", "/app/models/face_detection_yunet.onnx")
SFACE = os.getenv("SFACE_PATH", "/app/models/face_recognition_sface.onnx")
COSINE = float(os.getenv("FACE_COSINE", "0.30"))      # similarité cosinus mini (SFace ~0.363)
MIN_SAMPLES = int(os.getenv("FACE_MIN_SAMPLES", "2"))

os.makedirs(FACES_DIR, exist_ok=True)
_lock = threading.Lock()
_emb = {}                                   # username -> list[np.ndarray (1,128)]
_models = {"det": None, "rec": None, "err": None}

app = FastAPI(title="RSA Face-Auth (SFace)")


class EnrollIn(BaseModel):
    username: str
    images: list[str]

class VerifyIn(BaseModel):
    username: str
    image: str


# ----------------------------- modèles & image ------------------------------
def _init_models():
    try:
        det = cv2.FaceDetectorYN.create(YUNET, "", (320, 320), 0.8, 0.3, 5000)
        rec = cv2.FaceRecognizerSF.create(SFACE, "")
        _models.update(det=det, rec=rec, err=None)
        log.info("modèles YuNet + SFace chargés")
    except Exception as e:  # pragma: no cover
        _models.update(err=str(e))
        log.error(f"chargement des modèles échoué : {e}")

def _decode(b64: str):
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        img = cv2.imdecode(np.frombuffer(base64.b64decode(b64), np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        img = None
    if img is None:
        raise HTTPException(400, "image illisible")
    return img

def _feature(img):
    det, rec = _models["det"], _models["rec"]
    if det is None or rec is None:
        raise HTTPException(503, f"modèles indisponibles : {_models['err']}")
    h, w = img.shape[:2]
    det.setInputSize((w, h))
    _, faces = det.detect(img)
    if faces is None or len(faces) == 0:
        return None
    face = faces[int(np.argmax(faces[:, -1]))]          # visage au meilleur score
    aligned = rec.alignCrop(img, face)
    return rec.feature(aligned).copy()                   # empreinte (1,128)

def _feature_b64(b64):
    return _feature(_decode(b64))

def _cos(a, b):
    return float(_models["rec"].match(a, b, cv2.FaceRecognizerSF_FR_COSINE))

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
    _init_models()
    try:
        _load()
    except Exception as e:  # pragma: no cover
        log.error(f"chargement empreintes impossible : {e}")


# ----------------------------- endpoints ------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "users": len(_emb), "cosine": COSINE,
            "models_ok": _models["err"] is None, "error": _models["err"]}

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
            feat = _feature_b64(b64)
            if feat is None:
                continue
            np.save(os.path.join(d, f"{base + added:03d}.npy"), feat)
            _emb.setdefault(u, []).append(feat)
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
    feat = _feature_b64(body.image)
    if feat is None:
        return {"recognized": False, "reason": "aucun visage détecté", "score": None}
    best = max(_cos(feat, e) for e in _emb[u])
    ok = best >= COSINE
    log.info("vérification", extra={"extra_fields": {"user": u, "score": round(best, 3), "ok": ok}})
    return {"recognized": ok, "reason": "ok" if ok else "visage non concordant",
            "score": round(best, 3), "threshold": COSINE}

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
