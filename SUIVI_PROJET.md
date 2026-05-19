# Rédaction Augmentée — Suivi de Projet

**Hackathon :** Académie IApreneurs × Hostinger — Thème 2 : Création de contenu
**Deadline :** 4 juin 2026, minuit
**Équipe :** Julien Delmas (Altiarc)

---

## État d'avancement

### Phase 0 — Cadrage & Infra (14-17 mai) ✅
- [x] n8n opérationnel (Railway)
- [x] Architecture validée (6 couches)
- [x] Décision Hostinger : front React sur Hostinger pour éligibilité, n8n reste Railway
- [x] Structure projet créée
- [x] Schéma de données pipeline défini
- [x] Prompts éditoriaux V1 (routeur + générateur)

### Phase 1 — Cœur du Pipeline (18-21 mai) ✅
- [x] Couche 1 : Module d'ingestion (texte brut + URL)
- [x] Couche 2 : Routeur éditorial (prompt + workflow n8n)
- [x] Couche 3 : Génération kit complet 7 formats (article, post_x, post_instagram, post_linkedin, newsletter_blurb, audio_flash, seo_meta)
- [x] Test end-to-end : input texte → kit éditorial (n8n + front)
- [x] Dashboard React fonctionnel (dark theme, pipeline visuel, toggle n8n/local)
- [x] Recherche d'images Pexels intégrée (illustration automatique par post)
- [x] Workflow n8n opérationnel sur Railway (9 noeuds, webhook production actif)
- [ ] Objectif atelier 21 mai : démo fonctionnelle texte → article + posts

### Phase 2 — Modules Multimédia (22-27 mai) ⏳
- [ ] Génération visuel IA (ou amélioration recherche Pexels)
- [ ] Audio flash ElevenLabs
- [ ] Vidéo verticale (Veo/Runway/Kling)
- [ ] Intégration dans le pipeline n8n

### Phase 3 — Qualité, Interface & Packaging (28-31 mai) ⏳
- [ ] Couche 4 : Contrôle qualité éditorial
- [x] Couche 5 : Dashboard React (interface live) — avancé en Phase 1
- [ ] Checkpoint humain (validation avant publication)
- [ ] Couche 6 (si le temps permet) : profils de charte

### Phase 4 — Polish & Vidéo (1-3 juin) ⏳
- [ ] Migration front → Hostinger
- [ ] Tests sur 2-3 inputs variés
- [ ] Vidéo de présentation 5 min
- [ ] Soumission formulaire

---

## Décisions techniques

| Date | Décision | Raison |
|------|----------|--------|
| 18 mai | n8n reste sur Railway | Migration risquée en dernière minute |
| 18 mai | Front React → Hostinger pour éligibilité | Simple et suffisant |
| 18 mai | Budget API modéré | À affiner — mix Claude/GPT-4o-mini selon tâche |
| 18 mai | GPT-4o-mini pour dev/tests | Rapport qualité/coût optimal, Claude pour la démo finale |
| 18 mai | Pexels pour images (pas DALL-E) | Photos réelles > images IA pour crédibilité éditoriale |
| 18 mai | Front standalone + mode n8n | Toggle local/n8n — front autonome pour démo offline |

---

## Risques identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Temps de génération vidéo IA | Démo lente | Pré-générer pour la démo, montrer le process |
| Coût API si beaucoup de tests | Budget explosé | Utiliser GPT-4o-mini pour les tests, Claude pour la démo |
| Migration Hostinger last-minute | Bug de démo | Tester la migration dès Phase 3 |
| Qualité éditoriale générique | Pas de "wow" | Itérer les prompts avec Julien, exemples concrets |
