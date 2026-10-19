-- =====================================================================
--  Schéma du SI de paiement FICTIF.
--  Données volontairement non réalistes (sujet : aucune donnée bancaire réelle).
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    id         SERIAL PRIMARY KEY,
    owner_id   INTEGER NOT NULL REFERENCES users(id),
    label      TEXT NOT NULL,
    balance    NUMERIC(14,2) NOT NULL DEFAULT 1000.00,  -- "monnaie de jeu"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
    id          SERIAL PRIMARY KEY,
    from_account INTEGER NOT NULL REFERENCES accounts(id),
    to_account   INTEGER NOT NULL REFERENCES accounts(id),
    amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    status       TEXT NOT NULL DEFAULT 'completed',  -- completed | failed
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);

-- Comptes de démonstration.
-- Mot de passe par défaut "demo1234" (hash pbkdf2_sha256 généré par le service auth).
-- Les lignes sont (ré)insérées de façon idempotente par le seed applicatif si besoin.
INSERT INTO users (username, password_hash)
VALUES ('demo', 'SEED_AT_RUNTIME')
ON CONFLICT (username) DO NOTHING;
