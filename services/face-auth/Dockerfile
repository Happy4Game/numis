FROM python:3.12-slim

# libgomp1 (OpenCV) + curl (téléchargement des modèles) ; utilisateur non-root (§3.4)
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 appuser
WORKDIR /app

# Modèles OpenCV Zoo : YuNet (détection) + SFace (empreinte 128-D).
# Téléchargés au build ; on VÉRIFIE la taille (évite un pointeur LFS / page d'erreur).
RUN mkdir -p /app/models \
 && curl -fsSL -o /app/models/face_detection_yunet.onnx \
      https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx \
 && curl -fsSL -o /app/models/face_recognition_sface.onnx \
      https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx \
 && python -c "import os,sys; sys.exit(0 if os.path.getsize('/app/models/face_recognition_sface.onnx')>1_000_000 and os.path.getsize('/app/models/face_detection_yunet.onnx')>50_000 else 1)" \
 && echo "modèles OK"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN mkdir -p /model/faces && chown -R appuser:appuser /model

USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
