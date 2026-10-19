# Raccourcis de pilotage de la plateforme RESILIENCE-ALPHA.
# Usage : make <cible>

SHELL := /bin/bash

# Cible des attaques (local par défaut ; démo réseau : make attack-dos TARGET=http://192.168.137.1:8080)
TARGET ?= http://localhost:8080

.PHONY: help init up down logs ps build pull-model seed smoke attack-dos attack-sqli traffic train retrain clean

help:            ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n",$$1,$$2}'

init:            ## Prépare l'environnement (.env depuis l'exemple si absent)
	@test -f .env || (cp .env.example .env && echo ">> .env créé depuis .env.example — ÉDITEZ les mots de passe !")

up: init         ## Démarre toute la stack
	docker compose up -d --build

down:            ## Arrête la stack
	docker compose down

build:           ## (Re)build les images applicatives
	docker compose build

pull-model:      ## Télécharge le modèle LLM local dans Ollama
	docker compose exec ollama ollama pull $${OLLAMA_MODEL:-qwen2.5:3b}

seed:            ## (Ré)injecte des transactions fictives de référence
	docker compose exec payment-api python -m app.seed

smoke:           ## Vérifie que le service métier répond (transaction témoin)
	@bash tests/smoke_test.sh

logs:            ## Suit les logs de tous les services
	docker compose logs -f --tail=100

ps:              ## État des conteneurs
	docker compose ps

attack-dos:      ## (depuis PC Attaquant) lance le scénario DoS contrôlé
	python3 attack/scenarios/dos_flood.py --target $(TARGET)

attack-sqli:     ## (depuis PC Attaquant) lance la tentative d'injection SQL
	python3 attack/scenarios/sqli_probe.py --target $(TARGET)

clean:           ## Supprime conteneurs + volumes (reset complet)
	docker compose down -v

traffic:         ## Génère du trafic nominal (pour entraîner le modèle sur le comportement normal)
	python3 load/normal_traffic.py --target $(TARGET) --rate 4 --duration 240

train:           ## Entraîne le modèle hors-ligne depuis Prometheus, puis recharge le détecteur
	docker compose exec -T ml-detector python -m app.train --samples 40
	docker compose restart ml-detector

retrain:         ## Oublie le modèle appris et relance un apprentissage à neuf
	docker compose exec -T ml-detector rm -f /model/model.pkl || true
	docker compose restart ml-detector
