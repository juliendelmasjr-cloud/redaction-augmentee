Rédaction Augmentée — Suivi de Projet
Hackathon : Académie IApreneurs × Hostinger — Thème 2 : Création de contenu
Deadline : 4 juin 2026, minuit
Équipe : Julien Delmas (Altiarc)
---
Infra & URLs
Composant	URL / Emplacement
Front React	https://redactionaugmentee.netlify.app
Pipeline n8n	https://n8n.srv1708007.hstgr.cloud
Webhook prod	https://n8n.srv1708007.hstgr.cloud/webhook/redaction-augmentee
Repo GitHub	https://github.com/juliendelmasjr-cloud/redaction-augmentee (privé)
Variables Netlify	VITE_OPENAI_API_KEY, VITE_USE_N8N=true, VITE_WEBHOOK_URL
Comptes API
Service	Statut	Notes
OpenAI	Tier 1, ~$2.45 crédits, budget $100/mois	Clé n8n : chatbot tcheel. Clé front : dédiée Netlify
Tavily	Actif, plan gratuit 1000 req/mois	Clé dans body du nœud HTTP Request
Pexels	Actif (optionnel, clé dans Netlify env)	Pour images d'illustration
ElevenLabs	Abandonné (payant même pour voice clone)	Remplacé par OpenAI TTS côté front
---
Architecture Workflow n8n (12 nœuds)
```
Webhook Input
    ↓
Couche 1 — Ingestion
    ↓
Besoin de Scraping ? → (true) Scraper HTTP → Nettoyeur HTML
    ↓ (false)              ↓
Merge Contenu ←────────────┘
    ↓
Couche 2 — Routeur Éditorial (GPT-4o-mini, JSON strict, interdit markdown)
    ↓
Parse Editorial Plan (Code JS — parse JSON, récupère ingested_content)
    ↓
Fact Check Tavily (HTTP Request POST → api.tavily.com/search)
    ↓
Enrichir Kit avec Fact Check (Code JS — badges ✓/⚠ par fait)
    ↓
Couche 3 — Générateur (GPT-4o-mini, prompt BFM-style, contenu source injecté)
    ↓
Assemble Kit Final (Code JS)
    ↓ (3 branches parallèles)
    ├→ OpenAI TTS (branche muette, génère MP3 mais résultat non utilisé côté n8n)
    ├→ Score qualité (Message Model GPT-4o-mini, note /10 par critère)
    │       ↓
    │   Assembler Réponse Finale (Code JS — combine kit + fact_check + quality_score)
    │       ↓
    └→ Réponse Webhook (All Incoming Items)
```
Prompts clés
Routeur — System : Tu es un routeur éditorial. Analyse le contenu, produis UNIQUEMENT un JSON. INTERDICTION de markdown.
Routeur — User (Expression) : Injecte $json.source_type, $json.word_count, $json.raw_content
Générateur — System : Rédacteur senior BFM TV. Prompt long avec règles par format (article min 400 mots, pyramide inversée, etc.)
Générateur — User (Expression) : Injecte $json.editorial_plan + $json.ingested_content.raw_content + formats à produire
Score qualité — System : Expert qualité éditoriale, JSON pur.
Score qualité — User (Expression) : Kit assets stringifié, demande scores par critère.
---
État d'avancement
Phase 0 — Cadrage & Infra (14-17 mai) ✅
[x] n8n opérationnel (Hostinger, migré depuis Railway)
[x] Architecture validée (6 couches)
[x] Front React déployé sur Netlify
[x] Structure projet créée
[x] Prompts éditoriaux V1
Phase 1 — Cœur du Pipeline (18-21 mai) ✅
[x] Module d'ingestion (texte brut + URL)
[x] Routeur éditorial (JSON strict, pas de markdown)
[x] Génération kit complet 7 formats
[x] Test end-to-end fonctionnel
[x] Dashboard React (dark theme, pipeline visuel, toggle n8n/local)
[x] Images Pexels intégrées
Phase 2 — Modules Avancés (22-28 mai) ✅
[x] Audio flash OpenAI TTS (côté front, bouton "Générer l'audio" + player Play/Stop + download MP3)
[x] Fact-check Tavily en temps réel (nœud entre Parse Editorial Plan et Générateur)
[x] Score qualité éditorial (Message Model, note /10 par critère)
[x] Prompt Générateur amélioré BFM-style
[x] Contenu source correctement injecté dans Routeur ET Générateur
[ ] Affichage fact-check et score dans le front (App.tsx v4 PRÊT, pas encore pushé)
Phase 3 — Polish & Optimisation (29 mai - 1 juin) ⏳
[ ] Pusher App.tsx v4 (badges fact-check ✓/⚠, gauges score qualité circulaires)
[ ] Tester sur 5 actualités variées (Roland-Garros, repas 1€, Eurovision, canicule, Belgique)
[ ] Image IA générée (Flux API) pour remplacer/compléter Pexels
[ ] Profils éditoriaux sélectionnables (BFM / L'Équipe / Konbini / LinkedIn Pro)
[ ] Améliorer qualité rédactionnelle (articles encore trop courts/génériques)
[ ] Input URL (scraper actif mais pas testé end-to-end depuis le front)
Phase 4 — Vidéo & Soumission (2-3 juin) ⏳
[ ] Tests finaux sur inputs variés
[ ] Vidéo de présentation 5 min
[ ] Soumission formulaire hackathon
---
Problèmes connus / résolus
Problème	Statut	Solution
Imports lucide-react inutilisés cassent le build Netlify	✅ Résolu	Globe→Globe2, supprimé ImageIcon, Paperclip
System prompts vides (Expression vers champ inexistant)	✅ Résolu	Basculé en Fixed avec texte en dur
Routeur renvoie du Markdown au lieu de JSON	✅ Résolu	"INTERDICTION ABSOLUE de markdown/titres/#/**" dans system prompt
Contenu source absent du Générateur	✅ Résolu	User prompt Expression injecte $json.ingested_content.raw_content
Réponse Webhook "Invalid JSON" avec binaire TTS	✅ Résolu	Architecture branche parallèle : Assemble Kit Final → Réponse Webhook direct
Score qualité non exécuté avant Assembler Réponse	✅ Résolu	Passage en séquentiel : Score qualité → Assembler Réponse Finale
OpenAI TTS timeout	⚠ Contourné	Continue on Fail activé, branche muette côté n8n
Analyse éditoriale affiche "-" pour Type et Ton	⏳ Fix dans App.tsx v4	normalizeKit gère headline, key_points, summary
Contenu encore trop générique parfois	⏳ En cours	Améliorer prompts, ajouter plus de contexte
---
Décisions techniques
Date	Décision	Raison
18 mai	n8n sur Railway → migré Hostinger	Éligibilité hackathon
18 mai	Front React sur Netlify	Simple, CI/CD auto avec GitHub
27 mai	ElevenLabs abandonné	Voice clone payant, remplacé par OpenAI TTS côté front
27 mai	Audio TTS côté front (pas n8n)	Évite les problèmes de binaire dans la réponse webhook
28 mai	Tavily pour fact-check	Gratuit 1000 req/mois, API simple, meilleur que Brave (pas de plan gratuit)
28 mai	Score qualité en séquentiel	Les branches parallèles causaient des erreurs de timing
28 mai	Réponse Webhook "All Incoming Items"	Évite tous les problèmes de sérialisation JSON
