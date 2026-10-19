FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

# NB : ce service tourne en root CAR il doit accéder à /var/run/docker.sock.
# Ce privilège est le prix de la remédiation ; il est encadré par l'allowlist
# applicative (MANAGED_CONTAINERS) + l'allowlist d'actions. Durcissement recommandé
# en prod : docker-socket-proxy (voir docs/runbooks/hardening.md).
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
