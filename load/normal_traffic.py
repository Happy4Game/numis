#!/usr/bin/env python3
"""Générateur de trafic NOMINAL (utilisateurs légitimes).

Python standard uniquement. À lancer pendant la phase d'apprentissage du détecteur
(ou en fond pendant la démo) pour que le modèle apprenne une vraie "normalité" :
consultations de comptes + quelques petits virements, à un rythme réaliste et jitteré.

Ce n'est PAS une attaque : charge modérée, montants minuscules, sens alterné (les soldes
ne bougent quasi pas). C'est le "comportement classique" de l'application.

Usage :
    python3 load/normal_traffic.py --target http://localhost:8080 --rate 4 --duration 240
    # --duration 0 = tourne jusqu'à Ctrl+C
"""
import argparse, json, random, time, urllib.request, urllib.error
from urllib.parse import urlsplit

DEMO_USER, DEMO_PASS = "demo", "demo1234"


def login(target):
    u = urlsplit(target)
    url = f"{u.scheme}://{u.hostname}:3001/api/auth/login"
    data = json.dumps({"username": DEMO_USER, "password": DEMO_PASS}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())["access_token"]


def get(target, path, token):
    req = urllib.request.Request(f"{target}{path}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())


def post_transfer(target, token, a, b, amount):
    body = json.dumps({"from_account": a, "to_account": b, "amount": amount}).encode()
    req = urllib.request.Request(f"{target}/transactions", data=body,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            r.read()
    except urllib.error.HTTPError:
        pass  # solde insuffisant ponctuel : sans conséquence pour le profil


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="http://localhost:8080")
    ap.add_argument("--rate", type=float, default=4.0, help="requêtes/s approx.")
    ap.add_argument("--duration", type=int, default=240, help="secondes (0 = infini)")
    args = ap.parse_args()

    token = login(args.target)
    accts = get(args.target, "/accounts", token)
    ids = [a["id"] for a in accts]
    if len(ids) < 2:
        raise SystemExit("il faut au moins 2 comptes")

    print(f"[*] Trafic nominal sur {args.target} à ~{args.rate} req/s "
          f"({'infini' if args.duration == 0 else str(args.duration)+'s'}). Ctrl+C pour arrêter.")
    end = time.perf_counter() + args.duration if args.duration else float("inf")
    n, flip = 0, 0
    try:
        while time.perf_counter() < end:
            roll = random.random()
            if roll < 0.55:
                get(args.target, "/accounts", token)
            elif roll < 0.85:
                get(args.target, "/transactions?limit=5", token)
            else:
                a, b = (ids[0], ids[1]) if flip % 2 == 0 else (ids[1], ids[0])
                post_transfer(args.target, token, a, b, random.choice([1, 2, 3]))
                flip += 1
            n += 1
            if n % 25 == 0:
                print(f"    {n} requêtes nominales émises…")
            time.sleep(max(0.0, (1.0 / args.rate) * random.uniform(0.6, 1.4)))
    except KeyboardInterrupt:
        pass
    print(f"[*] Terminé : {n} requêtes nominales.")


if __name__ == "__main__":
    main()
