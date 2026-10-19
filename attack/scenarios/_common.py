"""Helpers partagés des scénarios Red Team (Python standard uniquement).

Rappel périmètre (sujet §9) : uniquement contre le SI fictif de l'équipe.
L'auth passe par le proxy du dashboard (:3001), les attaques applicatives visent le WAF (:8080).
"""
import json, time, urllib.request, urllib.error
from urllib.parse import urlsplit, quote

quote = quote  # ré-export


def auth_url(target):
    u = urlsplit(target)
    return f"{u.scheme}://{u.hostname}:3001/api/auth/login"


def login(target, user="demo", pw="demo1234"):
    data = json.dumps({"username": user, "password": pw}).encode()
    req = urllib.request.Request(auth_url(target), data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())["access_token"]


def hit(method, url, token=None, data=None, headers=None, timeout=6):
    """Retourne (status_code | None, secondes, corps_bytes)."""
    h = dict(headers or {})
    if token:
        h["Authorization"] = f"Bearer {token}"
    body = None
    if data is not None:
        body = json.dumps(data).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, time.perf_counter() - t0, r.read()
    except urllib.error.HTTPError as e:
        return e.code, time.perf_counter() - t0, e.read()
    except Exception as ex:
        return None, time.perf_counter() - t0, str(ex).encode()


def banner(result):
    """Affiche un résultat de scénario de façon lisible."""
    mark = "✅" if result["blocked"] else "⚠️ "
    print(f"\n=== {result['name']} [{result['category']}] ===")
    print(f"  Défense : {result['defense']}")
    print(f"  Résultat : {mark} {result['detail']}")
    return result
