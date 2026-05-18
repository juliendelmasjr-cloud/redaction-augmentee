/**
 * Test local du pipeline Rédaction Augmentée — Phase 1
 * Usage : node scripts/test_pipeline.js
 *
 * Simule le flow : Input → Ingestion → Routeur → Génération → Kit
 * Sans n8n, appelle directement l'API OpenAI/Claude
 */

const fs = require('fs');
const path = require('path');

// --- CONFIG ---
const API_KEY = process.env.OPENAI_API_KEY || 'REMPLACER_PAR_TA_CLE';
const MODEL = process.env.MODEL || 'gpt-4o-mini';
const API_URL = 'https://api.openai.com/v1/chat/completions';

// --- PROMPTS ---
const ROUTER_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'n8n', 'prompts', 'editorial_router.md'),
  'utf-8'
);
const GENERATOR_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'n8n', 'prompts', 'content_generator.md'),
  'utf-8'
);

// --- INPUT DE TEST ---
const TEST_INPUT = `
Le Stade Toulousain s'est imposé 31-24 face à l'Union Bordeaux-Bègles en demi-finale
du Top 14 ce samedi soir au Stadium. Antoine Dupont, de retour après trois semaines
d'absence pour une blessure au mollet, a été décisif avec deux essais et une
prestation défensive remarquable. Toulouse rejoint La Rochelle en finale, programmée
le 28 juin au Stade de France.

C'est la 10e victoire consécutive des Rouge et Noir toutes compétitions confondues,
une série inédite depuis la saison 2004-2005. "On savait que ce serait un combat,
UBB est une grande équipe", a déclaré le capitaine Julien Marchand après la rencontre.
"Mais ce groupe a une force mentale incroyable."

Côté bordelais, Damian Penaud a inscrit un doublé mais n'a pas suffi à renverser
la tendance. L'UBB termine sa saison avec les honneurs après un parcours remarquable
en phase régulière.

Toulouse visera un 23e titre de champion de France face aux Maritimes, qui avaient
remporté leur demi-finale plus tôt dans la journée contre le Racing 92 (27-19).
`;

// --- FONCTIONS ---

async function callLLM(systemPrompt, userMessage, temperature = 0.3, maxTokens = 2000) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

function parseJSON(text) {
  // Nettoie les blocs markdown
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

// --- COUCHE 1 : INGESTION ---
function ingest(rawInput) {
  console.log('\n📥 COUCHE 1 — Ingestion');

  const content = rawInput.trim();
  const words = content.split(/\s+/);

  const ingested = {
    source_type: 'texte_brut',
    raw_content: content,
    metadata: {
      language: 'fr',
      word_count: words.length,
      date: new Date().toISOString()
    }
  };

  console.log(`   Type détecté : ${ingested.source_type}`);
  console.log(`   Mots : ${ingested.metadata.word_count}`);

  return ingested;
}

// --- COUCHE 2 : ROUTEUR ÉDITORIAL ---
async function routeEditorial(ingested) {
  console.log('\n🧠 COUCHE 2 — Routeur Éditorial');

  const userMsg = `Analyse ce contenu et produis un editorial_plan en JSON.

Source type: ${ingested.source_type}
Métadonnées: ${JSON.stringify(ingested.metadata)}

Contenu brut:
${ingested.raw_content}`;

  const result = await callLLM(ROUTER_PROMPT, userMsg, 0.3, 1500);
  const editorialPlan = parseJSON(result);

  console.log(`   Type contenu : ${editorialPlan.content_type}`);
  console.log(`   Angle : ${editorialPlan.angle}`);
  console.log(`   Ton : ${editorialPlan.tone}`);
  console.log(`   Formats : ${editorialPlan.target_formats.join(', ')}`);
  console.log(`   Faits clés : ${editorialPlan.key_facts.length}`);

  return editorialPlan;
}

// --- COUCHE 3 : GÉNÉRATION ---
async function generateContent(editorialPlan, ingested) {
  console.log('\n✍️  COUCHE 3 — Génération Multi-Format');

  const userMsg = `Génère le kit éditorial pour ce contenu.

Plan éditorial:
${JSON.stringify(editorialPlan, null, 2)}

Contenu source:
${ingested.raw_content}

Formats à produire: ${editorialPlan.target_formats.join(', ')}

Réponds en JSON pur avec un objet 'assets' contenant chaque format.`;

  const result = await callLLM(GENERATOR_PROMPT, userMsg, 0.7, 4000);
  const parsed = parseJSON(result);
  const assets = parsed.assets || parsed;

  console.log(`   Assets générés : ${Object.keys(assets).join(', ')}`);

  return assets;
}

// --- PIPELINE COMPLET ---
async function runPipeline() {
  console.log('═══════════════════════════════════════════');
  console.log('  RÉDACTION AUGMENTÉE — Test Pipeline Phase 1');
  console.log('═══════════════════════════════════════════');
  console.log(`  Modèle : ${MODEL}`);

  const startTime = Date.now();

  try {
    // Couche 1
    const ingested = ingest(TEST_INPUT);

    // Couche 2
    const editorialPlan = await routeEditorial(ingested);

    // Couche 3
    const assets = await generateContent(editorialPlan, ingested);

    // Assemblage
    const kit = {
      editorial_plan: editorialPlan,
      assets,
      metadata: ingested.metadata,
      generated_at: new Date().toISOString(),
      generation_time_ms: Date.now() - startTime
    };

    console.log('\n═══════════════════════════════════════════');
    console.log(`  ✅ Kit généré en ${kit.generation_time_ms}ms`);
    console.log('═══════════════════════════════════════════');

    // Sauvegarde du résultat
    const outputPath = path.join(__dirname, '..', 'output_test.json');
    fs.writeFileSync(outputPath, JSON.stringify(kit, null, 2), 'utf-8');
    console.log(`\n📄 Résultat complet sauvegardé dans : ${outputPath}`);

    // Affichage résumé des assets
    if (assets.article) {
      console.log('\n--- ARTICLE ---');
      console.log(`Titre : ${assets.article.title}`);
      console.log(`Chapô : ${assets.article.chapo?.substring(0, 150)}...`);
    }
    if (assets.post_x) {
      console.log('\n--- POST X ---');
      console.log(assets.post_x.text);
    }
    if (assets.post_linkedin) {
      console.log('\n--- POST LINKEDIN ---');
      console.log(assets.post_linkedin.text?.substring(0, 200) + '...');
    }

  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    process.exit(1);
  }
}

runPipeline();
