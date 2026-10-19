#!/usr/bin/env bash
# Vérifie que le SI de paiement est utilisable : login -> compte -> transaction.
# Sert de preuve "le service répond" avant/après incident (sujet §2).
set -euo pipefail

FRONT="${FRONT:-http://localhost:3001}"   # proxy auth
WAF="${WAF:-http://localhost:8080}"       # API via WAF

echo "[smoke] authentification…"
TOKEN=$(curl -s -X POST "$FRONT/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo1234"}' | grep -oP '"access_token":"\K[^"]+')

if [ -z "${TOKEN:-}" ]; then echo "[smoke] ÉCHEC : pas de jeton"; exit 1; fi

echo "[smoke] lecture des comptes…"
ACCOUNTS=$(curl -s "$WAF/accounts" -H "Authorization: Bearer $TOKEN")
FROM=$(echo "$ACCOUNTS" | grep -oP '"id":\s*\K[0-9]+' | sed -n '1p')
TO=$(echo "$ACCOUNTS"   | grep -oP '"id":\s*\K[0-9]+' | sed -n '2p')

echo "[smoke] transaction témoin ($FROM -> $TO)…"
RES=$(curl -s -X POST "$WAF/transactions" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"from_account\":$FROM,\"to_account\":$TO,\"amount\":1}")

if echo "$RES" | grep -q '"status":"completed"'; then
  echo "[smoke] ✅ OK : $RES"
  exit 0
else
  echo "[smoke] ❌ ÉCHEC : $RES"
  exit 1
fi
