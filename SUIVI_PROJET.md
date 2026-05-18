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

### Phase 1 — Cœur du Pipeline (18-21 mai) 🔄 EN COURS
- [ ] Couche 1 : Module d'ingestion (texte brut + URL)
- [ ] Couche 2 : Routeur éditorial (prompt + workflow n8n)
- [ ] Couche 3 partielle : Génération article + posts
- [ ] Test end-to-end : input texte → kit éditorial
- [ ] Objectif atelier 21 mai : démo fonctionnelle texte → article + posts

### Phase 2 — Modules Multimédia (22-27 mai) ⏳
- [ ] Génération visuel IA
- [ ] Audio flash ElevenLabs
- [ ] Vidéo verticale (Veo/Runway/Kling)
- [ ] Intégration dans le pipeline n8n

### Phase 3 — Qualité, Interface & Packaging (28-31 mai) ⏳
- [ ] Couche 4 : Contrôle qualité éditorial
- [ ] Couche 5 : Dashboard React (interface live)
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

---

## Risques identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Temps de génération vidéo IA | Démo lente | Pré-générer pour la démo, montrer le process |
| Coût API si beaucoup de tests | Budget explosé | Utiliser GPT-4o-mini pour les tests, Claude pour la démo |
| Migration Hostinger last-minute | Bug de démo | Tester la migration dès Phase 3 |
| Qualité éditoriale générique | Pas de "wow" | Itérer les prompts avec Julien, exemples concrets |
