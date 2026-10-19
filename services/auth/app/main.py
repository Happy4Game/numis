"""Service d'authentification — émet des JWT et gère les utilisateurs fictifs.

Responsabilité unique : identité. La validation des jetons est faite localement par
payment-api (secret partagé) pour ne pas ajouter un appel réseau par requête — choix
assumé, documenté dans docs/architecture.md.
"""
import os
import time

import jwt
import psycopg
from fastapi import FastAPI, HTTPException
from passlib.hash import pbkdf2_sha256
from pydantic import BaseModel
from psycopg_pool import ConnectionPool

from .obs import MetricsMiddleware, metrics_response, setup_logging

SERVICE = "auth"
log = setup_logging(SERVICE, os.getenv("LOG_LEVEL", "INFO"))

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_TTL = int(os.getenv("JWT_TTL_SECONDS", "3600"))
DB_DSN = os.environ["DB_DSN"]

pool = ConnectionPool(DB_DSN, min_size=1, max_size=5, open=False)

app = FastAPI(title="RSA Auth Service")
app.add_middleware(MetricsMiddleware)


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


@app.on_event("startup")
def _startup():
    pool.open()
    _seed_demo()


def _seed_demo():
    """Garantit qu'il existe un utilisateur 'demo' (mdp demo1234) et un compte."""
    pw_hash = pbkdf2_sha256.hash("demo1234")
    with pool.connection() as conn:
        conn.execute(
            "UPDATE users SET password_hash=%s WHERE username='demo' AND password_hash='SEED_AT_RUNTIME'",
            (pw_hash,),
        )
        row = conn.execute("SELECT id FROM users WHERE username='demo'").fetchone()
        if row:
            uid = row[0]
            has_acct = conn.execute("SELECT 1 FROM accounts WHERE owner_id=%s", (uid,)).fetchone()
            if not has_acct:
                conn.execute("INSERT INTO accounts (owner_id,label,balance) VALUES (%s,'Compte A',1000),(%s,'Compte B',1000)", (uid, uid))
    log.info("seed demo terminé")


@app.get("/health")
def health():
    try:
        with pool.connection() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok"}
    except Exception as e:  # pragma: no cover
        raise HTTPException(503, f"db indisponible: {e}")


@app.get("/metrics")
def metrics():
    return metrics_response()


@app.post("/login", response_model=TokenOut)
def login(body: LoginIn):
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username=%s", (body.username,)
        ).fetchone()
    if not row or not pbkdf2_sha256.verify(body.password, row[1]):
        log.info("login refusé", extra={"extra_fields": {"user": body.username}})
        raise HTTPException(401, "identifiants invalides")
    now = int(time.time())
    token = jwt.encode(
        {"sub": str(row[0]), "username": body.username, "iat": now, "exp": now + JWT_TTL},
        JWT_SECRET, algorithm="HS256",
    )
    log.info("login ok", extra={"extra_fields": {"user": body.username}})
    return TokenOut(access_token=token)
