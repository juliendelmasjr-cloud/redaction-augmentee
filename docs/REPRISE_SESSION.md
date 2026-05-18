# Comment reprendre une session Cowork sur ce projet

## Étape 1 — Colle le system prompt
Ouvre le fichier `docs/SYSTEM_PROMPT.md` et copie-colle TOUT son contenu comme premier message dans ta nouvelle session Cowork.

## Étape 2 — Ajoute le contexte d'avancement
Après le system prompt, ajoute ce paragraphe :

> Le dossier projet est dans mon dossier sélectionné. Lis SUIVI_PROJET.md pour voir l'état d'avancement détaillé. Le repo GitHub est : https://github.com/juliendelmasjr-cloud/redaction-augmentee

## Étape 3 — Précise où tu en es
Dis simplement ce que tu veux faire dans cette session, par exemple :
- "On attaque la Phase 2 — modules multimédia"
- "Le front a un bug quand je clique sur Générer"
- "Je veux améliorer les prompts éditoriaux"

## Rappel : le .env n'est PAS sur GitHub
Recrée `frontend/.env` sur chaque nouvelle machine :
```
VITE_OPENAI_API_KEY=ta-cle-openai-ici
VITE_MODEL=gpt-4o-mini
```

## Rappel : installer Node.js
Sur chaque nouvelle machine : https://nodejs.org → Windows Installer (.msi)
Puis dans le dossier frontend : `npm install` puis `npm run dev`
