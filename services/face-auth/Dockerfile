FROM python:3.12-slim

# libgomp1 (dlib) ; utilisateur non-root (§3.4)
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 appuser
WORKDIR /app

# Reconnaissance faciale : face_recognition (embeddings dlib ResNet).
# dlib-bin = wheel pré-compilé (pas de compilation) ; modèles livrés par pip
# (face_recognition_models) -> AUCUN téléchargement externe au build.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir --no-deps face_recognition==1.3.0

COPY app ./app
RUN mkdir -p /model/faces && chown -R appuser:appuser /model

USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
