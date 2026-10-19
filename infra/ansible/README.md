# Ansible — déploiement & reprise

```bash
ansible-galaxy collection install -r requirements.yml
ansible-playbook -i inventory.ini deploy.yml        # déploie toute la plateforme
ansible-playbook -i inventory.ini remediate.yml -e service=payment-api   # reprise manuelle
```

- `deploy.yml` : déploiement reproductible (build + up + attente santé + transaction témoin).
- `remediate.yml` : runbook de reprise à la demande, complémentaire du moteur autonome.
