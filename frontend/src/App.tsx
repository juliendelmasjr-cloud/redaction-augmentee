import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Send, Loader2, FileText, MessageCircle, Camera, Briefcase, Mic, Search,
  ChevronDown, ChevronUp, Sparkles, Globe2, Newspaper, Check, Copy, Play,
  Square, ShieldCheck, ShieldAlert, ExternalLink, Star, TrendingUp,
  AlertTriangle, Zap, Clock, BarChart3, HelpCircle, X, Wand2,
} from 'lucide-react';

// --- TYPES ---
interface EditorialPlan {
  content_type?: string; title?: string; headline?: string; source_type?: string
  angle?: string; tone?: string; hook_direction?: string; key_facts?: string[]
  key_points?: Array<{ point?: string; event?: string; details?: string }>
  target_formats?: string[]; formats?: string[]; editorial_notes?: string | string[]
  summary?: string; introduction?: string; target_audience?: string
}
interface VerifiedFact { fact: string; verified: boolean; source: string | null; source_title: string | null }
interface FactCheck { verified_facts: VerifiedFact[]; sources: Array<{ title: string; url: string }>; checked_at: string }
interface QualityScore { scores: Record<string, number>; score_global: number; points_forts: string[]; points_amelioration: string[] }
interface Assets {
  article?: { title: string; chapo?: string; body?: string; chute?: string; content?: string; author?: string; publish_date?: string }
  post_x?: { text: string; hashtags?: string[] } | string
  post_instagram?: { caption: string; hashtags?: string[] } | string
  post_linkedin?: { text: string } | string
  newsletter_blurb?: { subject_line?: string; subject?: string; body: string }
  audio_flash?: { script: string; duration_target_seconds: number } | string
  seo_meta?: { title_tag?: string; title?: string; meta_description?: string; description?: string; keywords: string[] | string }
  image_data?: { url: string; photographer: string; src: string }
}
interface GeneratedKit { editorial_plan: EditorialPlan; assets: Assets; generated_at: string; generation_time_ms: number; fact_check?: FactCheck; quality_score?: QualityScore }
type PipelineStep = 'idle' | 'ingesting' | 'routing' | 'generating' | 'done' | 'error'
type ProfileId = 'bfm' | 'lequipe' | 'konbini' | 'linkedin'

// --- CONFIG ---
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''
const API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = import.meta.env.VITE_MODEL || 'gpt-4o-mini'
const N8N_WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ''
const DEFAULT_USE_N8N = import.meta.env.VITE_USE_N8N === 'true'
const PEXELS_KEY = import.meta.env.VITE_PEXELS_API_KEY || ''

// --- SOCLE JOURNALISTIQUE COMMUN (Perplexity) ---
const JOURNALISTIC_BASE = `Tu es un journaliste professionnel expérimenté. Tu produis des contenus éditoriaux fiables, structurés et engageants à partir d'un document source.

OBJECTIF : Transformer une information brute en contenu journalistique de haute qualité, prêt à être publié.

RÈGLES FONDAMENTALES DU JOURNALISME :
- Prioriser l'information essentielle (angle clair dès le début).
- Appliquer la règle des 5W : Who, What, When, Where, Why (+ How si pertinent).
- Vérifier la cohérence interne des faits (pas d'invention, pas d'extrapolation non justifiée).
- Hiérarchiser l'information (du plus important au secondaire).
- Rester factuel, précis, et éviter le langage promotionnel.
- Introduire du contexte pour donner du sens à l'information.
- Éviter les banalités et les phrases creuses.

STRUCTURE ARTICLE ATTENDUE :
1. Titre (informatif, spécifique, sans clickbait abusif)
2. Chapô (résumé clair en 2-3 phrases avec l'essentiel)
3. Corps : paragraphe 1 = info principale, paragraphe 2 = contexte/background, paragraphes 3+ = détails, implications, chiffres, citations
4. Conclusion ouverte (impact, suite possible, enjeux)

STYLE GÉNÉRAL : Phrases fluides, variées, naturelles. Ton professionnel, jamais robotique. Pas de jargon inutile, pas de répétition.

INTERDICTIONS : Ne pas inventer de faits ou citations. Ne pas surinterpréter. Ne pas transformer en publicité. Ne pas utiliser de formules vagues sans justification.

AMÉLIORATION ÉDITORIALE : Si l'information est pauvre, enrichir avec du contexte général pertinent. Reformuler pour plus de clarté et d'impact. Ajouter des angles journalistiques implicites (enjeux, conséquences, acteurs).

INSTRUCTION CLÉ : Avant de rédiger, résume en une phrase l'angle de l'article. Puis rédige en respectant cet angle.`

const STYLE_MODULES: Record<ProfileId, string> = {
  bfm: `STYLE ÉDITORIAL : BFMTV — Ton direct, rapide, efficace. Priorité à l'immédiateté et à l'impact. Phrases courtes à moyennes. Angle centré sur l'actualité et l'urgence. Aller droit au fait dès le titre et le chapô. Mettre en avant les éléments nouveaux ou marquants. Utiliser des formulations dynamiques ("ce que l'on sait", "ce qu'il faut retenir"). Structurer en blocs courts. Ajouter intertitres. Mettre en avant chiffres et faits clés. Ton neutre mais rythmé.`,
  lequipe: `STYLE ÉDITORIAL : L'ÉQUIPE — Ton expert, précis, passionné mais maîtrisé. Vocabulaire spécifique au sport. Analyse + récit. Décrire les performances, actions ou enjeux sportifs. Intégrer des éléments tactiques ou techniques. Donner du contexte (classement, historique, forme). Mettre en avant les acteurs (joueurs, entraîneurs). Raconter une histoire sportive (tension, performance, retournement). Ton crédible, analytique, légèrement narratif.`,
  konbini: `STYLE ÉDITORIAL : KONBINI — Ton moderne, accessible, incarné. Angle sociétal, culturel ou générationnel. Accroche forte dès le début. Simplification intelligente. Mise en récit (storytelling). Adresse indirecte au lecteur. Pourquoi ça concerne les gens. Ce que ça dit de la société. Phrases courtes à moyennes. Rythme dynamique. Ton conversationnel mais maîtrisé. Pas de vulgarité gratuite, toujours garder du fond.`,
  linkedin: `STYLE ÉDITORIAL : LINKEDIN PRO — Ton professionnel, crédible, orienté valeur. Informer + apporter un insight. Accroche orientée problématique ou constat. Mise en perspective business/marché. Ajout d'enseignements ou implications. Hook (1-2 phrases impactantes) + Développement clair + Analyse ou leçon à tirer. Ce que cela change. Pourquoi c'est important pour les professionnels. Ton posé, expert, accessible. Pas corporate creux.`
}

const OUTPUT_FORMAT = `
FORMATS À PRODUIRE (tous en JSON dans un objet "assets") :
- article : { "title", "chapo", "body" (minimum 500 mots, structuré en paragraphes), "chute", "author": "Rédaction [PROFIL]", "publish_date" }
- post_x : { "text" (max 280 car), "hashtags": [] }
- post_instagram : { "caption" (4-5 lignes engageantes), "hashtags": [] }
- post_linkedin : { "text" (hook fort + 4-5 lignes + CTA) }
- newsletter_blurb : { "subject" (objet email accrocheur), "body" (5 lignes max) }
- audio_flash : "script à lire à voix haute, 30 secondes max, ton adapté au profil"
- seo_meta : { "title" (60 car max), "description" (155 car max), "keywords": [] }
RÈGLE ABSOLUE : Tous les champs texte doivent être des chaînes de caractères simples, jamais des objets imbriqués.
Réponds UNIQUEMENT en JSON avec un objet "assets".`

// --- PROFILES ---
interface EditorialProfile { id: ProfileId; label: string; emoji: string; color: string; generatorPrompt: string }
const PROFILES: EditorialProfile[] = [
  { id: 'bfm', label: 'BFM TV', emoji: '🔴', color: 'border-red-500/50 bg-red-500/10 text-red-400', generatorPrompt: `${JOURNALISTIC_BASE}\n\n${STYLE_MODULES.bfm}\n\n${OUTPUT_FORMAT}` },
  { id: 'lequipe', label: "L'Équipe", emoji: '🟡', color: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400', generatorPrompt: `${JOURNALISTIC_BASE}\n\n${STYLE_MODULES.lequipe}\n\n${OUTPUT_FORMAT}` },
  { id: 'konbini', label: 'Konbini', emoji: '🟣', color: 'border-purple-500/50 bg-purple-500/10 text-purple-400', generatorPrompt: `${JOURNALISTIC_BASE}\n\n${STYLE_MODULES.konbini}\n\n${OUTPUT_FORMAT}` },
  { id: 'linkedin', label: 'LinkedIn Pro', emoji: '🔵', color: 'border-blue-500/50 bg-blue-500/10 text-blue-400', generatorPrompt: `${JOURNALISTIC_BASE}\n\n${STYLE_MODULES.linkedin}\n\n${OUTPUT_FORMAT}` }
]

const ROUTER_PROMPT = `Tu es le rédacteur en chef d'une rédaction numérique. Tu reçois un contenu brut et produis un editorial_plan en JSON.
Champs requis : content_type, angle, tone, hook_direction, key_facts (5-8), target_formats, editorial_notes, summary, target_audience
Réponds UNIQUEMENT en JSON pur.`

// --- API ---
async function callLLM(system: string, user: string, temp = 0.3, maxTokens = 2000): Promise<string> {
  const resp = await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: temp, max_tokens: maxTokens })
  })
  if (!resp.ok) throw new Error(`API Error ${resp.status}`)
  const data = await resp.json()
  return data.choices[0].message.content
}

function parseJSON(text: string) {
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

// --- IMAGE SEARCH ---

// Wikipedia FR : image d'infobox (personne, lieu, organisation)
async function searchWikipediaImage(editorialPlan: EditorialPlan): Promise<{url: string; photographer: string; src: string} | null> {
  try {
    const angle = editorialPlan.angle || editorialPlan.title || editorialPlan.headline || ''
    const facts = editorialPlan.key_facts || []
    // GPT génère 3 noms d'articles Wikipedia à tester (événement d'abord, puis lieu, puis personne)
    const entitiesPrompt = await callLLM(
      `À partir du sujet ci-dessous, donne exactement 3 titres d'articles Wikipedia FR séparés par des virgules.
ORDRE DE PRIORITÉ :
1) L'événement ou la compétition (ex: "Ligue des champions de l'UEFA 2025-2026", "Roland-Garros 2026")
2) Le lieu principal (ex: "Stade de France", "Court Philippe-Chatrier")
3) La personne ou l'organisation principale
Utilise les noms exacts tels qu'ils apparaissent sur Wikipedia FR.
Réponds UNIQUEMENT avec les 3 titres séparés par des virgules, rien d'autre.`,
      `Sujet : ${angle}\nFaits : ${facts.slice(0, 4).join(' / ')}`,
      0.1, 80
    )
    const entities = entitiesPrompt.replace(/['"]/g, '').split(',').map(e => e.trim()).filter(Boolean)
    
    // Teste chaque entité via l'API pageimages (image d'infobox)
    for (const entity of entities.slice(0, 3)) {
      try {
        const url = `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(entity)}&prop=pageimages&format=json&pithumbsize=1200&origin=*`
        const resp = await fetch(url)
        if (!resp.ok) continue
        const data = await resp.json()
        const pages = data.query?.pages || {}
        const page = Object.values(pages)[0] as { pageid?: number; pageimage?: string; thumbnail?: { source: string; width: number; height: number } }
        
        if (!page?.thumbnail?.source) continue
        const imgName = (page.pageimage || '').toLowerCase()
        // Exclure les SVG, logos, blasons, drapeaux
        if (imgName.endsWith('.svg') || imgName.includes('logo') || imgName.includes('blason') || imgName.includes('flag') || imgName.includes('crest') || imgName.includes('emblem')) continue
        
        return {
          url: page.thumbnail.source,
          photographer: entity,
          src: `https://fr.wikipedia.org/wiki/${encodeURIComponent(entity)}`
        }
      } catch { continue }
    }
    return null
  } catch (e) {
    console.warn('Wikipedia image search failed:', e)
    return null
  }
}

// Fallback Pexels — vraies photos stock, query simplifiée sans appel LLM
async function searchPexels(editorialPlan: EditorialPlan): Promise<{url: string; photographer: string; src: string} | null> {
  if (!PEXELS_KEY) return null
  try {
    const angle = editorialPlan.angle || editorialPlan.title || editorialPlan.headline || ''
    // Extrait 2-3 mots-clés du sujet sans appel LLM
    const words = angle.split(/\s+/).filter(w => w.length > 4).slice(0, 3).join(' ')
    const query = words || angle.substring(0, 30)
    const resp = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`, { headers: { 'Authorization': PEXELS_KEY } })
    if (!resp.ok) return null
    const data = await resp.json()
    if (!data.photos?.length) return null
    const photo = data.photos[0]
    return { url: photo.src.large2x, photographer: photo.photographer, src: photo.url }
  } catch { return null }
}

// Orchestrateur : Wikipedia (vraies images) → Pexels (photos stock réelles)
async function searchImage(editorialPlan: EditorialPlan): Promise<{url: string; photographer: string; src: string} | null> {
  const wiki = await searchWikipediaImage(editorialPlan)
  if (wiki) return wiki
  return await searchPexels(editorialPlan)
}

async function generateAudio(script: string): Promise<string | null> {
  if (!API_KEY) return null
  try {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: 'tts-1', input: script, voice: 'onyx', response_format: 'mp3' })
    })
    if (!resp.ok) return null
    const blob = await resp.blob()
    return URL.createObjectURL(blob)
  } catch { return null }
}

// --- HELPERS ---
function safeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean).join('\n\n')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('paragraph' in obj) return safeText(obj.paragraph)
    if ('text' in obj) return safeText(obj.text)
    if ('content' in obj) return safeText(obj.content)
    if ('value' in obj) return safeText(obj.value)
    return Object.values(obj).map(safeText).filter(Boolean).join('\n\n')
  }
  return ''
}

function normalizeKit(raw: unknown): GeneratedKit & { generation_time_ms: number } {
  let data: unknown = Array.isArray(raw) ? raw[0] : raw
  if (data && typeof data === 'object' && 'kit' in (data as Record<string, unknown>)) data = (data as Record<string, unknown>).kit
  const obj = data as Record<string, unknown>
  let ep = (obj.editorial_plan || {}) as Record<string, unknown>
  if (ep && typeof ep === 'object' && 'editorial_plan' in ep) ep = ep.editorial_plan as Record<string, unknown>
  return { editorial_plan: ep as unknown as EditorialPlan, assets: (obj.assets || {}) as Assets, generated_at: (obj.generated_at as string) || new Date().toISOString(), generation_time_ms: 0, fact_check: obj.fact_check as FactCheck | undefined, quality_score: obj.quality_score as QualityScore | undefined }
}

function getAudioScript(audio: Assets['audio_flash']): string { return typeof audio === 'string' ? audio : audio ? safeText(audio.script) : '' }
function getAudioDuration(audio: Assets['audio_flash']): number { return typeof audio === 'object' && audio && 'duration_target_seconds' in audio ? audio.duration_target_seconds : 30 }
function getKeyFactsList(plan: EditorialPlan): string[] {
  if (plan.key_facts?.length) return plan.key_facts.map(safeText)
  if (plan.key_points?.length) return plan.key_points.map(kp => safeText(kp.point || kp.event || kp.details || ''))
  return []
}

function countTotalWords(assets: Assets): number {
  const cw = (t: string | undefined | null) => t ? t.split(/\s+/).filter(Boolean).length : 0
  let total = 0
  if (assets.article) total += cw(safeText(assets.article.title)) + cw(safeText(assets.article.chapo)) + cw(safeText(assets.article.body || assets.article.content)) + cw(safeText(assets.article.chute))
  if (assets.post_x) total += cw(safeText(assets.post_x))
  if (assets.post_instagram) total += cw(safeText(assets.post_instagram))
  if (assets.post_linkedin) total += cw(safeText(assets.post_linkedin))
  if (assets.newsletter_blurb) total += cw(safeText(assets.newsletter_blurb.body))
  if (assets.audio_flash) total += cw(typeof assets.audio_flash === 'string' ? assets.audio_flash : safeText(assets.audio_flash.script))
  if (assets.seo_meta) total += cw(safeText(assets.seo_meta.title_tag || assets.seo_meta.title)) + cw(safeText(assets.seo_meta.meta_description || assets.seo_meta.description))
  return total
}

function formatTimeSaved(tw: number): string {
  const m = Math.round((tw / 250) * 60)
  return m >= 60 ? `${Math.floor(m / 60)}h${(m % 60) > 0 ? String(m % 60).padStart(2, '0') : '00'}` : `${m} min`
}

// --- HOOKS ---
function useReveal(delay: number, trigger: unknown): boolean {
  const [v, setV] = useState(false)
  useEffect(() => { setV(false); const t = setTimeout(() => setV(true), delay); return () => clearTimeout(t) }, [delay, trigger])
  return v
}
function RevealWrapper({ delay, trigger, children }: { delay: number; trigger: unknown; children: React.ReactNode }) {
  const v = useReveal(delay, trigger)
  return <div className={`transition-all duration-500 ${v ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}>{v && children}</div>
}
function TypewriterText({ text, speed = 25, trigger }: { text: string; speed?: number; trigger: unknown }) {
  const [d, setD] = useState(''); const [done, setDone] = useState(false)
  useEffect(() => { setD(''); setDone(false); let i = 0; const iv = setInterval(() => { if (i < text.length) { setD(text.substring(0, i + 1)); i++ } else { clearInterval(iv); setDone(true) } }, speed); return () => clearInterval(iv) }, [text, speed, trigger])
  return <span>{d}{!done && <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse" />}</span>
}

// --- COMPONENTS ---
function TimeSavedBanner({ kit }: { kit: GeneratedKit }) {
  const tw = countTotalWords(kit.assets), ts = formatTimeSaved(tw), fc = Object.keys(kit.assets).filter(k => k !== 'image_data').length, ps = (kit.generation_time_ms / 1000).toFixed(0)
  const [showInfo, setShowInfo] = useState(false)
  return (
    <div className="mb-6 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 p-5 shadow-lg shadow-emerald-500/10">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center"><Zap className="w-6 h-6 text-emerald-400" /></div>
          <div className="flex items-start gap-1"><div><div className="text-2xl font-bold text-emerald-300">{ts}</div><div className="text-xs text-emerald-400/60">économisées</div></div>
            <button onClick={() => setShowInfo(!showInfo)} className="ml-1 p-0.5 rounded-full hover:bg-emerald-500/20 transition-colors"><HelpCircle className="w-3.5 h-3.5 text-emerald-400/60 hover:text-emerald-300" /></button></div></div>
        <div className="h-10 w-px bg-emerald-500/20 hidden sm:block" />
        <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald-400/60" /><div><div className="text-lg font-semibold text-white">{tw.toLocaleString()}</div><div className="text-xs text-white/40">mots générés</div></div></div>
        <div className="h-10 w-px bg-emerald-500/20 hidden sm:block" />
        <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-400/60" /><div><div className="text-lg font-semibold text-white">{fc}</div><div className="text-xs text-white/40">formats</div></div></div>
        <div className="h-10 w-px bg-emerald-500/20 hidden sm:block" />
        <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-400/60" /><div><div className="text-lg font-semibold text-white">{ps}s</div><div className="text-xs text-white/40">de pipeline</div></div></div>
      </div>
      {showInfo && <div className="mt-4 pt-4 border-t border-emerald-500/20 text-xs text-white/70 leading-relaxed">
        <div className="flex items-start justify-between gap-2 mb-2"><div className="font-semibold text-emerald-300">Comment ce temps est-il calculé ?</div><button onClick={() => setShowInfo(false)} className="p-0.5 rounded hover:bg-white/10"><X className="w-3.5 h-3.5 text-white/40" /></button></div>
        <p className="mb-2">L'estimation s'appuie sur une vitesse moyenne de <strong className="text-emerald-300">250 mots/heure</strong> pour un rédacteur produisant du contenu <strong>multi-format</strong> (article + posts réseaux sociaux + SEO + newsletter + script audio).</p>
        <p className="mb-2">Cette vitesse intègre la phase d'adaptation entre formats : un journaliste rédige 400-600 mots/heure sur un seul format, mais cette productivité chute à 200-300 mots/heure sur du multi-canal.</p>
        <p className="text-white/40 text-[10px]">Sources : benchmarks Content Marketing Institute, HubSpot Content Performance Reports.</p>
      </div>}
    </div>
  )
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100, color = score >= 8 ? '#22c55e' : score >= 6 ? '#eab308' : '#ef4444'
  return (<div className="flex flex-col items-center gap-1"><div className="relative w-12 h-12"><svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${pct} 100`} strokeLinecap="round" /></svg><span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>{score}</span></div><span className="text-[10px] text-white/40 text-center leading-tight">{label}</span></div>)
}

function QualityScoreView({ score }: { score: QualityScore }) {
  const entries = Object.entries(score.scores || {}), labels: Record<string, string> = { fidelite_faits: 'Fidélité', qualite_redactionnelle: 'Rédaction', diversite_formats: 'Diversité', ton_editorial: 'Ton', seo: 'SEO' }
  return (<div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5 mb-6"><div className="flex items-center gap-2 mb-4"><Star className="w-5 h-5 text-purple-400" /><h3 className="font-bold text-purple-300">Score qualité</h3><span className="ml-auto text-2xl font-bold text-purple-300">{score.score_global}/10</span></div>
    {entries.length > 0 && <div className="flex justify-around mb-4">{entries.map(([k, v]) => <ScoreGauge key={k} score={v} label={labels[k] || k} />)}</div>}
    <div className="grid grid-cols-2 gap-3 text-xs">{score.points_forts?.length > 0 && <div><div className="flex items-center gap-1 mb-1 text-green-400"><TrendingUp className="w-3 h-3" /> Points forts</div>{score.points_forts.map((p, i) => <p key={i} className="text-white/60 mb-0.5">• {safeText(p)}</p>)}</div>}
      {score.points_amelioration?.length > 0 && <div><div className="flex items-center gap-1 mb-1 text-amber-400"><AlertTriangle className="w-3 h-3" /> À améliorer</div>{score.points_amelioration.map((p, i) => <p key={i} className="text-white/60 mb-0.5">• {safeText(p)}</p>)}</div>}</div></div>)
}

function FactCheckView({ factCheck }: { factCheck: FactCheck }) {
  const ok = factCheck.verified_facts?.filter(f => f.verified).length || 0, total = factCheck.verified_facts?.length || 0
  return (<div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-5 mb-6"><div className="flex items-center gap-2 mb-3"><ShieldCheck className="w-5 h-5 text-teal-400" /><h3 className="font-bold text-teal-300">Vérification des faits</h3><span className="ml-auto text-sm text-teal-300 font-medium">{ok}/{total} vérifiés</span></div>
    {factCheck.verified_facts?.length > 0 && <div className="space-y-2 mb-3">{factCheck.verified_facts.map((f, i) => (<div key={i} className="flex items-start gap-2 text-sm">{f.verified ? <ShieldCheck className="w-4 h-4 text-green-400 mt-0.5 shrink-0" /> : <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />}<div><span className={f.verified ? 'text-white/80' : 'text-amber-200/80'}>{safeText(f.fact)}</span>{f.source && <a href={f.source} target="_blank" rel="noopener noreferrer" className="ml-2 text-teal-400/60 hover:text-teal-300 inline-flex items-center gap-1 text-xs">source <ExternalLink className="w-3 h-3" /></a>}</div></div>))}</div>}
    {factCheck.sources?.length > 0 && <div className="border-t border-teal-500/20 pt-2 mt-2"><p className="text-[10px] text-white/30 mb-1">Sources consultées :</p><div className="flex flex-wrap gap-2">{factCheck.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-teal-400/50 hover:text-teal-300 flex items-center gap-1">{safeText(s.title).substring(0, 40)} <ExternalLink className="w-2.5 h-2.5" /></a>)}</div></div>}</div>)
}

function StepIndicator({ step, elapsed }: { step: PipelineStep; elapsed: number }) {
  const steps = [{ key: 'ingesting', label: 'Ingestion', icon: Globe2 }, { key: 'routing', label: 'Analyse', icon: Sparkles }, { key: 'generating', label: 'Génération', icon: Newspaper }]
  const ci = steps.findIndex(s => s.key === step)
  return (<div className="flex items-center justify-center gap-2 mb-8">{steps.map((s, i) => { const Icon = s.icon, isA = s.key === step, isD = ci > i || step === 'done'; return (<div key={s.key} className="flex items-center gap-2"><div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-500 ${isA ? 'bg-orange-500 text-white scale-105 shadow-lg shadow-orange-500/30' : isD ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/30'}`}>{isA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}{s.label}</div>{i < steps.length - 1 && <div className={`w-8 h-0.5 ${isD ? 'bg-green-500/50' : 'bg-white/10'}`} />}</div>) })}{elapsed > 0 && <span className="ml-4 text-sm text-white/40 font-mono">{(elapsed / 1000).toFixed(1)}s</span>}</div>)
}

function CopyButton({ text }: { text: string }) {
  const [c, setC] = useState(false)
  return <button onClick={async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 2000) }} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Copier">{c ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/40 hover:text-white/70" />}</button>
}

function AssetCard({ title, icon: Icon, children, color, imageData, copyText }: { title: string; icon: React.ElementType; children: React.ReactNode; color: string; imageData?: { url: string; photographer: string; src: string } | null; copyText?: string }) {
  const [open, setOpen] = useState(true)
  const isAI = false // Plus d'images IA, uniquement des vraies photos
  const sourceLabel = imageData?.src?.includes('wikipedia') || imageData?.src?.includes('wikimedia') ? 'Wikipedia' : 'Pexels'
  return (<div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden transition-all">
    <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-4 h-4 text-white" /></div><span className="font-semibold text-white flex-1">{title}</span>{copyText && <CopyButton text={copyText} />}{open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}</button>
    {open && <div>{imageData && <div className="px-5 pt-2"><img src={imageData.url} alt={`Illustration ${title}`} className="w-full aspect-[16/9] object-cover rounded-lg bg-gray-800" loading="eager" /><div className="flex items-center justify-between mt-1 text-xs text-white/30"><span>📷 {imageData.photographer}</span><a href={imageData.src} target="_blank" rel="noopener noreferrer" className="text-orange-400/60 hover:text-orange-300">{sourceLabel}</a></div></div>}<div className="px-5 pb-5 pt-3 text-white/80 text-sm leading-relaxed">{children}</div></div>}
  </div>)
}

function ArticleView({ article, imageData, trigger }: { article: NonNullable<Assets['article']>; imageData?: Assets['image_data']; trigger: unknown }) {
  const [currentTitle, setCurrentTitle] = useState('')
  const ch = safeText(article.chapo), b = safeText(article.body || article.content), chu = safeText(article.chute), au = safeText(article.author)
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const originalTitle = safeText(article.title)

  // Titre Lab state
  const [showTitreLab, setShowTitreLab] = useState(false)
  const [altTitles, setAltTitles] = useState<Array<{ title: string; score: number; style: string }>>([])
  const [loadingTitles, setLoadingTitles] = useState(false)

  useEffect(() => { setCurrentTitle(originalTitle); setShowTitreLab(false); setAltTitles([]) }, [originalTitle])

  const generateAltTitles = async () => {
    setLoadingTitles(true)
    try {
      const result = await callLLM(
        `Tu es un expert en titraille presse et en optimisation de clics. À partir d'un titre et du chapô d'un article, génère exactement 3 titres alternatifs avec des styles différents.
Pour chaque titre, attribue un score de viralité estimé (0-100) basé sur : émotion, curiosité, spécificité, urgence.
Réponds UNIQUEMENT en JSON :
[
  { "title": "...", "score": 85, "style": "Émotionnel" },
  { "title": "...", "score": 72, "style": "Factuel" },
  { "title": "...", "score": 91, "style": "Provocateur" }
]`,
        `Titre actuel : ${currentTitle}\nChapô : ${ch}\nDébut article : ${b.substring(0, 200)}`,
        0.8, 500
      )
      const parsed = JSON.parse(result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
      setAltTitles(parsed)
    } catch { setAltTitles([]) }
    setLoadingTitles(false)
  }

  const viralityColor = (score: number) => score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-orange-400'
  const viralityBg = (score: number) => score >= 80 ? 'bg-green-400' : score >= 60 ? 'bg-yellow-400' : 'bg-orange-400'

  return (<AssetCard title="Article" icon={FileText} color="bg-blue-600" imageData={imageData} copyText={`${currentTitle}\n\n${ch}\n\n${b}\n\n${chu}`.trim()}>
    <div className="flex items-start justify-between gap-2 mb-2">
      <h3 className="text-lg font-bold text-white flex-1"><TypewriterText text={currentTitle} speed={20} trigger={trigger} /></h3>
      <button onClick={() => { if (!showTitreLab) generateAltTitles(); setShowTitreLab(!showTitreLab) }}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-xs font-medium text-white transition-all shadow-lg shadow-violet-500/20">
        <Wand2 className="w-3.5 h-3.5" /> Titre Lab
      </button>
    </div>

    {showTitreLab && (
      <div className="mb-4 p-4 rounded-lg border border-violet-500/30 bg-violet-500/5">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-violet-300">Titre Lab — Optimiseur de titres</span>
        </div>
        {loadingTitles ? (
          <div className="flex items-center gap-2 text-sm text-white/50 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Génération de titres alternatifs...</div>
        ) : altTitles.length > 0 ? (
          <div className="space-y-2">
            {altTitles.map((alt, i) => (
              <button key={i} onClick={() => { setCurrentTitle(alt.title); setShowTitreLab(false) }}
                className="w-full text-left p-3 rounded-lg border border-white/10 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all group">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-xs text-violet-400/70 font-medium">{alt.style}</span>
                  <span className={`text-xs font-bold ${viralityColor(alt.score)}`}>{alt.score}/100</span>
                </div>
                <p className="text-sm text-white/90 font-medium mb-2 group-hover:text-white">{alt.title}</p>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${viralityBg(alt.score)} transition-all duration-500`} style={{ width: `${alt.score}%` }} />
                </div>
              </button>
            ))}
            <p className="text-[10px] text-white/30 mt-2">Cliquez sur un titre pour l'appliquer à l'article</p>
          </div>
        ) : (
          <p className="text-sm text-white/40 py-2">Aucun titre généré. Réessayez.</p>
        )}
      </div>
    )}

    {ch && <p className="text-orange-300 font-medium mb-4 italic">{ch}</p>}
    <div className="whitespace-pre-wrap mb-4">{b}</div>
    {chu && <p className="text-white/50 italic border-t border-white/10 pt-3 mt-3">{chu}</p>}
    {au && <p className="text-xs text-white/30 mt-2">Par {au} — {today}</p>}
  </AssetCard>)
}

function PostView({ platform, content, icon, color }: { platform: string; content: string; icon: React.ElementType; color: string }) {
  return <AssetCard title={`Post ${platform}`} icon={icon} color={color} copyText={content}><p className="whitespace-pre-wrap">{content}</p></AssetCard>
}

function AudioView({ audio }: { audio: NonNullable<Assets['audio_flash']> }) {
  const script = getAudioScript(audio), duration = getAudioDuration(audio)
  const [url, setUrl] = useState<string | null>(null), [loading, setLoading] = useState(false), [playing, setPlaying] = useState(false)
  const ref = useRef<HTMLAudioElement | null>(null)
  return (<AssetCard title="Audio Flash" icon={Mic} color="bg-purple-600" copyText={script}>
    <div className="flex items-center gap-2 mb-3"><span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">~{duration}s</span></div>
    {!url && <button onClick={async () => { setLoading(true); setUrl(await generateAudio(script)); setLoading(false) }} disabled={loading} className="flex items-center gap-2 mb-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}{loading ? 'Génération audio...' : 'Générer l\'audio'}</button>}
    {url && <div className="mb-4"><audio ref={ref} src={url} onEnded={() => setPlaying(false)} className="hidden" /><div className="flex items-center gap-3 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20"><button onClick={() => { if (!ref.current) return; playing ? (ref.current.pause(), setPlaying(false)) : (ref.current.play(), setPlaying(true)) }} className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors">{playing ? <Square className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}</button><div className="flex-1"><div className="text-xs text-purple-300 font-medium">Flash audio généré</div><div className="text-xs text-white/40">Voix IA — {duration}s</div></div><a href={url} download="audio-flash.mp3" className="text-xs text-purple-400 hover:text-purple-300">MP3</a></div></div>}
    <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/60">{script}</p>
  </AssetCard>)
}

function SeoView({ seo }: { seo: NonNullable<Assets['seo_meta']> }) {
  const t = safeText(seo.title_tag || seo.title), d = safeText(seo.meta_description || seo.description)
  const kw = Array.isArray(seo.keywords) ? seo.keywords.map(safeText) : (typeof seo.keywords === 'string' ? seo.keywords.split(',').map(k => k.trim()) : [])
  return (<AssetCard title="SEO" icon={Search} color="bg-green-600" copyText={`${t}\n${d}\n${kw.join(', ')}`}><div className="space-y-2"><div><span className="text-white/40 text-xs">Title tag:</span> <span className="text-green-300">{t}</span></div><div><span className="text-white/40 text-xs">Meta desc:</span> <span>{d}</span></div><div className="flex flex-wrap gap-1 mt-2">{kw.map((k, i) => <span key={i} className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">{k}</span>)}</div></div></AssetCard>)
}

function EditorialPlanView({ plan, profileId }: { plan: EditorialPlan; profileId: ProfileId }) {
  const facts = getKeyFactsList(plan), formats = plan.target_formats || plan.formats || [], profile = PROFILES.find(p => p.id === profileId)!
  return (<div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5 mb-6"><div className="flex items-center gap-2 mb-3"><Sparkles className="w-5 h-5 text-orange-400" /><h3 className="font-bold text-orange-300">Analyse éditoriale</h3><span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${profile.color}`}>{profile.emoji} {profile.label}</span></div>
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div><span className="text-white/40 text-xs block">Type</span><span className="text-white font-medium">{safeText(plan.content_type || plan.source_type || 'article')}</span></div>
      <div><span className="text-white/40 text-xs block">Ton</span><span className="text-white font-medium">{safeText(plan.tone || 'informatif')}</span></div>
      {(plan.angle || plan.title || plan.headline) && <div className="col-span-2"><span className="text-white/40 text-xs block">Angle</span><span className="text-orange-200">{safeText(plan.angle || plan.headline || plan.title)}</span></div>}
      {plan.summary && <div className="col-span-2"><span className="text-white/40 text-xs block">Résumé</span><span className="text-white/70 text-xs">{safeText(plan.summary)}</span></div>}
      {plan.target_audience && <div className="col-span-2"><span className="text-white/40 text-xs block">Audience cible</span><span className="text-white/70 text-xs">{safeText(plan.target_audience)}</span></div>}
      {formats.length > 0 && <div className="col-span-2"><span className="text-white/40 text-xs block">Formats</span><div className="flex flex-wrap gap-1 mt-1">{formats.map((f, i) => <span key={i} className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full">{safeText(f)}</span>)}</div></div>}
      {facts.length > 0 && <div className="col-span-2"><span className="text-white/40 text-xs block">Faits clés</span><ul className="list-disc list-inside text-white/70 text-xs mt-1 space-y-1">{facts.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
    </div></div>)
}

// --- MAIN APP ---
export default function App() {
  const [input, setInput] = useState(''), [step, setStep] = useState<PipelineStep>('idle'), [kit, setKit] = useState<GeneratedKit | null>(null)
  const [error, setError] = useState(''), [elapsed, setElapsed] = useState(0), [useN8N, setUseN8N] = useState(DEFAULT_USE_N8N)
  const [profile, setProfile] = useState<ProfileId>('bfm'), [activeProfile, setActiveProfile] = useState<ProfileId>('bfm'), [revealTrigger, setRevealTrigger] = useState(0)

  const runPipelineN8N = useCallback(async () => {
    if (!input.trim()) return; if (!N8N_WEBHOOK_URL) { setError('URL webhook n8n manquante'); return }
    setStep('ingesting'); setKit(null); setError(''); const cp = profile; setActiveProfile(cp)
    const sp = PROFILES.find(p => p.id === cp)!; const start = Date.now(); const timer = setInterval(() => setElapsed(Date.now() - start), 100)
    try {
      setStep('routing')
      const resp = await fetch(N8N_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: input.trim(), source_type: 'text', profile_id: cp, profile_prompt: sp.generatorPrompt }) })
      if (!resp.ok) throw new Error(`n8n Error ${resp.status}: ${await resp.text()}`)
      setStep('generating'); const raw = await resp.json(); const norm = normalizeKit(raw)
      let img: Assets['image_data'] = undefined
      if (norm.editorial_plan) img = await searchImage(norm.editorial_plan).catch(() => null) ?? undefined
      clearInterval(timer); const tt = Date.now() - start; setElapsed(tt)
      if (img) norm.assets.image_data = img; setKit({ ...norm, generation_time_ms: tt }); setRevealTrigger(t => t + 1); setStep('done')
    } catch (e: unknown) { clearInterval(timer); setError(e instanceof Error ? e.message : 'Erreur inconnue'); setStep('error') }
  }, [input, profile])

  const runPipelineLocal = useCallback(async () => {
    if (!input.trim()) return; if (!API_KEY) { setError('Clé API manquante'); return }
    setStep('ingesting'); setKit(null); setError(''); const cp = profile; setActiveProfile(cp)
    const sp = PROFILES.find(p => p.id === cp)!; const start = Date.now(); const timer = setInterval(() => setElapsed(Date.now() - start), 100)
    try {
      const raw = input.trim(); setStep('routing')
      const ep = parseJSON(await callLLM(ROUTER_PROMPT, `Analyse ce contenu:\n\n${raw}`, 0.3, 1500))
      setStep('generating')
      const [gen, img] = await Promise.all([callLLM(sp.generatorPrompt, `Plan:\n${JSON.stringify(ep)}\n\nSource:\n${raw}\n\nRéponds en JSON "assets".`, 0.7, 4000), searchImage(ep).catch(() => null)])
      const parsed = parseJSON(gen); const assets = parsed.assets || parsed; if (img) assets.image_data = img
      clearInterval(timer); const tt = Date.now() - start
      setKit({ editorial_plan: ep, assets, generated_at: new Date().toISOString(), generation_time_ms: tt }); setRevealTrigger(t => t + 1); setStep('done')
    } catch (e: unknown) { clearInterval(timer); setError(e instanceof Error ? e.message : 'Erreur inconnue'); setStep('error') }
  }, [input, profile])

  const run = useN8N ? runPipelineN8N : runPipelineLocal
  const gpt = (post: Assets['post_x'] | Assets['post_instagram'] | Assets['post_linkedin']): string => safeText(post)

  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      {/* Fond décoratif */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-teal-500/3 rounded-full blur-[150px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Rédaction Augmentée</h1>
              <p className="text-xs text-white/40">by <span className="text-orange-400/70">Altiarc</span> — Pipeline IA éditorial multi-format</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setUseN8N(!useN8N)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
                useN8N ? 'bg-green-500/15 text-green-400 border border-green-500/30 shadow-sm shadow-green-500/10' : 'bg-white/5 text-white/40 border border-white/10'
              }`}>
              <div className={`w-2 h-2 rounded-full transition-colors ${useN8N ? 'bg-green-400 shadow-sm shadow-green-400' : 'bg-white/20'}`} />
              {useN8N ? 'n8n Pipeline' : 'Local'}
            </button>
            <span className="text-xs text-white/15 font-mono tracking-wider">v2.3</span>
          </div>
        </div>
      </header>

      <div className="border-b border-white/5 px-6 py-3.5 bg-gray-950/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <span className="text-xs text-white/25 shrink-0 uppercase tracking-wider">Profil</span>
          <div className="flex gap-2 flex-wrap">
            {PROFILES.map(p => (
              <button key={p.id} onClick={() => setProfile(p.id)}
                className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all duration-200 ${
                  profile === p.id
                    ? `${p.color} shadow-lg`
                    : 'border-white/10 bg-white/[0.03] text-white/35 hover:text-white/60 hover:border-white/20 hover:bg-white/[0.06]'
                }`}>
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-10 relative z-10">
        <div className="mb-10">
          <label className="block text-sm text-white/40 mb-3 font-medium">Colle ton contenu brut — article, brief, communiqué, notes...</label>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500/20 to-red-600/20 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
            <textarea value={input} onChange={e => setInput(e.target.value)}
              placeholder="Le Stade Toulousain s'est imposé 31-24 face à l'Union Bordeaux-Bègles en demi-finale du Top 14..."
              className="relative w-full h-40 bg-white/[0.03] border border-white/10 rounded-xl px-5 py-4 text-white placeholder-white/15 resize-none focus:outline-none focus:border-orange-500/50 transition-all"
              disabled={step !== 'idle' && step !== 'done' && step !== 'error'} />
            <div className="absolute bottom-3 right-3 flex items-center gap-3">
              <span className="text-xs text-white/25 font-mono">{input.split(/\s+/).filter(Boolean).length} mots</span>
              <button onClick={run} disabled={!input.trim() || (step !== 'idle' && step !== 'done' && step !== 'error')}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg font-semibold text-sm hover:shadow-xl hover:shadow-orange-500/25 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200">
                {step !== 'idle' && step !== 'done' && step !== 'error'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération...</>
                  : <><Send className="w-4 h-4" /> Générer le kit</>}
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap items-center">
            <span className="text-[11px] text-white/20 uppercase tracking-wider font-medium">Démos</span>
            <button onClick={() => { setInput("Le repas à 1 euro pour tous les étudiants entre en vigueur le 4 mai 2026. Le dispositif est étendu à l'ensemble des étudiants dans les restaurants universitaires, avec pour objectif d'alléger le coût des repas du quotidien. Cette mesure figure parmi les changements annoncés pour le mois de mai 2026."); setProfile('bfm') }} className="text-[11px] px-3 py-1.5 rounded-full border border-red-500/20 bg-red-500/5 text-red-400/80 hover:bg-red-500/15 hover:text-red-300 transition-all">🍽️ Repas 1€ — BFM</button>
            <button onClick={() => { setInput("La Commission de régulation de l'énergie annonce une hausse du prix repère du gaz pour mai 2026. Selon les publications d'avril 2026, le prix repère augmente en moyenne de 15,4%, avec des hausses distinctes selon les usages, notamment pour la cuisson, l'eau chaude et le chauffage. Cette évolution doit peser sur les factures des ménages concernés."); setProfile('linkedin') }} className="text-[11px] px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 text-blue-400/80 hover:bg-blue-500/15 hover:text-blue-300 transition-all">⛽ Prix gaz — LinkedIn</button>
            <button onClick={() => { setInput("Le Paris Saint-Germain remporte la Ligue des champions 2025-2026 face à Arsenal. La finale s'est jouée le 30 mai 2026 et s'est conclue sur un score de 1-1 après prolongation, puis 4 tirs au but à 3 en faveur du PSG. Plusieurs sources de presse sportives et généralistes confirment ce résultat."); setProfile('lequipe') }} className="text-[11px] px-3 py-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/5 text-yellow-400/80 hover:bg-yellow-500/15 hover:text-yellow-300 transition-all">⚽ PSG LDC — L'Équipe</button>
            <button onClick={() => { setInput("Fin mai 2026, la France connaît un épisode de chaleur exceptionnel. Les températures enregistrées entre le 23 et le 28 mai battent plusieurs records mensuels, et la vigilance canicule est maintenue dans plusieurs départements. Le 30 mai, la vigilance orange est levée dans tout le pays sauf à Paris et en petite couronne."); setProfile('konbini') }} className="text-[11px] px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 text-purple-400/80 hover:bg-purple-500/15 hover:text-purple-300 transition-all">🌡️ Canicule — Konbini</button>
            <button onClick={() => { setInput("Arsenal a remporté la Ligue des Champions 2026 en battant le Real Madrid 3-1 en finale au Stade de France. Bukayo Saka a inscrit un doublé et Martin Ødegaard a été élu homme du match. C'est le premier titre européen des Gunners depuis 2006. 80 000 spectateurs ont assisté à la rencontre. L'entraîneur Mikel Arteta a déclaré : 'Ce soir, nous avons écrit l'histoire.'"); setProfile('bfm') }} className="text-[11px] px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-400/80 hover:bg-amber-500/15 hover:text-amber-300 transition-all">⚠️ Faux — Arsenal</button>
          </div>
        </div>

        {step !== 'idle' && <StepIndicator step={step} elapsed={elapsed} />}
        {error && <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

        {kit && <div>
          <div className="flex items-center gap-4 mb-8 text-xs text-white/35 font-medium">
            <span>Généré en <strong className="text-orange-400 font-bold">{(kit.generation_time_ms / 1000).toFixed(1)}s</strong></span>
            <span className="text-white/15">•</span>
            <span>{Object.keys(kit.assets).filter(k => k !== 'image_data').length} formats</span>
            <span className="text-white/15">•</span>
            <span>{useN8N ? 'n8n Pipeline' : MODEL}</span>
            {kit.fact_check && <><span className="text-white/15">•</span><span className="text-teal-400">Fact-check</span></>}
            {kit.quality_score?.score_global !== undefined && <><span className="text-white/15">•</span><span className="text-purple-400">{kit.quality_score.score_global}/10</span></>}
          </div>

          {kit.fact_check && kit.fact_check.verified_facts?.length > 0 && kit.fact_check.verified_facts.filter(f => f.verified).length / kit.fact_check.verified_facts.length < 0.5 && (
            <div className="mb-6 p-5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
              <div>
                <div className="font-bold text-red-300 mb-1 text-sm">⚠️ Contenu suspect — Vérification requise</div>
                <p className="text-sm text-red-200/60 leading-relaxed">Seul <strong className="text-red-300">{kit.fact_check.verified_facts.filter(f => f.verified).length} fait(s) sur {kit.fact_check.verified_facts.length}</strong> ont pu être vérifiés par nos sources. Ce contenu contient probablement des informations erronées ou invérifiables. <strong className="text-red-200/80">Une vérification manuelle est indispensable avant toute publication.</strong></p>
              </div>
            </div>
          )}

          <RevealWrapper delay={200} trigger={revealTrigger}><EditorialPlanView plan={kit.editorial_plan} profileId={activeProfile} /></RevealWrapper>
          {kit.fact_check && kit.fact_check.verified_facts?.length > 0 && <RevealWrapper delay={500} trigger={revealTrigger}><FactCheckView factCheck={kit.fact_check} /></RevealWrapper>}
          {kit.quality_score && <RevealWrapper delay={800} trigger={revealTrigger}><QualityScoreView score={kit.quality_score} /></RevealWrapper>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {kit.assets.article && <RevealWrapper delay={1100} trigger={revealTrigger}><div className="lg:col-span-2"><ArticleView article={kit.assets.article} imageData={kit.assets.image_data} trigger={revealTrigger} /></div></RevealWrapper>}
            {kit.assets.post_x && <RevealWrapper delay={1400} trigger={revealTrigger}><PostView platform="X" content={gpt(kit.assets.post_x)} icon={MessageCircle} color="bg-sky-600" /></RevealWrapper>}
            {kit.assets.post_instagram && <RevealWrapper delay={1700} trigger={revealTrigger}><PostView platform="Instagram" content={gpt(kit.assets.post_instagram)} icon={Camera} color="bg-pink-600" /></RevealWrapper>}
            {kit.assets.post_linkedin && <RevealWrapper delay={2000} trigger={revealTrigger}><PostView platform="LinkedIn" content={gpt(kit.assets.post_linkedin)} icon={Briefcase} color="bg-blue-700" /></RevealWrapper>}
            {kit.assets.audio_flash && <RevealWrapper delay={2300} trigger={revealTrigger}><AudioView audio={kit.assets.audio_flash} /></RevealWrapper>}
            {kit.assets.seo_meta && <RevealWrapper delay={2600} trigger={revealTrigger}><SeoView seo={kit.assets.seo_meta} /></RevealWrapper>}
            {kit.assets.newsletter_blurb && <RevealWrapper delay={2900} trigger={revealTrigger}><AssetCard title="Newsletter" icon={FileText} color="bg-amber-600" copyText={`Objet : ${safeText(kit.assets.newsletter_blurb.subject_line || kit.assets.newsletter_blurb.subject)}\n\n${safeText(kit.assets.newsletter_blurb.body)}`}><div className="text-amber-300 font-medium mb-2">{safeText(kit.assets.newsletter_blurb.subject_line || kit.assets.newsletter_blurb.subject)}</div><p className="whitespace-pre-wrap">{safeText(kit.assets.newsletter_blurb.body)}</p></AssetCard></RevealWrapper>}
          </div>
          <div className="mt-8"><RevealWrapper delay={3300} trigger={revealTrigger}><TimeSavedBanner kit={kit} /></RevealWrapper></div>
        </div>}

        {!kit && step === 'idle' && (
          <div className="text-center py-20 text-white/15">
            <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">Colle un contenu et sélectionne un profil pour commencer</p>
          </div>
        )}
      </main>

      <footer className="border-t border-white/5 py-6 mt-12 text-center">
        <p className="text-xs text-white/15">Rédaction Augmentée — Hackathon IApreneurs × Hostinger 2026 — <span className="text-orange-400/40">Altiarc</span></p>
      </footer>
    </div>
  )
}
