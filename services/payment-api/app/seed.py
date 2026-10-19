"""Réinitialise les comptes témoins et exécute quelques transactions de référence.
Lancé par `make seed`.
"""
import os
import psycopg

DB_DSN = os.environ["DB_DSN"]

with psycopg.connect(DB_DSN) as conn:
    row = conn.execute("SELECT id FROM users WHERE username='demo'").fetchone()
    if not row:
        raise SystemExit("utilisateur demo absent — démarrez d'abord le service auth")
    uid = row[0]
    conn.execute("DELETE FROM transactions")
    conn.execute("UPDATE accounts SET balance=1000 WHERE owner_id=%s", (uid,))
    accts = conn.execute("SELECT id FROM accounts WHERE owner_id=%s ORDER BY id", (uid,)).fetchall()
    if len(accts) >= 2:
        a, b = accts[0][0], accts[1][0]
        for amount in (10, 25, 5):
            conn.execute(
                "INSERT INTO transactions (from_account,to_account,amount) VALUES (%s,%s,%s)", (a, b, amount)
            )
        print(f"seed ok : comptes {a},{b} réinitialisés, 3 transactions témoins")
