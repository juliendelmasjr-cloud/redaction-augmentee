import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Send,
  Loader2,
  FileText,
  MessageCircle,
  Camera,
  Briefcase,
  Mic,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Globe2,
  Newspaper,
  Check,
  Copy,
  Play,
  Square,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Star,
  TrendingUp,
  AlertTriangle,
  Zap,
  Clock,
  BarChart3,
  HelpCircle,
  X,
} from 'lucide-react';

// --- TYPES ---
interface EditorialPlan {
  content_type?: string
  title?: string
  headline?: string
  source_type?: string
  angle?: string
  tone?: string
  hook_direction?: string
  key_facts?: string[]
  key_points?: Array<{ point?: string; event?: string; details?: string }>
  target_formats?: string[]
  formats?: string[]
  editorial_notes?: string | string[]
  summary?: string
  introduction?: string
  target_audience?: string
}

interface VerifiedFact {
  fact: string
  verified: boolean
  source: string | null
  source_title: string | null
}

interface FactCheck {
  verified_facts: VerifiedFact[]
  sources: Array<{ title: string; url: string }>
  checked_at: string
}

interface QualityScore {
  scores: Record<string, number>
  score_global: number
  points_forts: string[]
  points_amelioration: string[]
}

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

interface GeneratedKit {
  editorial_plan: EditorialPlan
  assets: Assets
  generated_at: string
  generation_time_ms: number
  fact_check?: FactCheck
  quality_score?: QualityScore
}

type PipelineStep = 'idle' | 'ingesting' | 'routing' | 'generating' | 'done' | 'error'
type ProfileId = 'bfm' | 'lequipe' | 'konbini' | 'linkedin'

// --- CONFIG ---
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''
const API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = import.meta.env.VITE_MODEL || 'gpt-4o-mini'
const N8N_WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ''
const DEFAULT_USE_N8N = import.meta.env.VITE_USE_N8N === 'true'

// --- PROFILES ---
interface EditorialProfile {
  id: ProfileId
  label: string
  emoji: string
  color: string
  generatorPrompt: string
}

const PROFILES: EditorialProfile[] = [
  {
    id: 'bfm',
    label: 'BFM TV',
    emoji: '🔴',
    color: 'border-red-500/50 bg-red-500/10 text-red-400',
    generatorPrompt: `Tu es un rédacteur senior BFM TV.
STYLE : breaking news, direct, factuel, phrases courtes (max 20 mots), pyramide inversée.
ARTICLE : minimum 500 mots. Titre accrocheur + chapô 2 phrases + corps structuré en paragraphes courts + chute. Commence par le fait le plus important. Zéro fioritures.
POST X : 1 phrase choc + 1 stat clé. Max 280 caractères. Pas de hashtags inutiles.
POST INSTAGRAM : 3-4 lignes punchy + 3 hashtags pertinents.
POST LINKEDIN : angle professionnel, 3-4 lignes, 1 question finale.
NEWSLETTER : objet urgent (ex: "BREAKING :"), corps 5 lignes max.
AUDIO FLASH : script 4-5 phrases, ton radio urgente, 30 secondes.
RÈGLE ABSOLUE : utilise UNIQUEMENT les faits du contenu source. Ne jamais inventer.
Réponds UNIQUEMENT en JSON avec un objet "assets". Tous les champs de texte doivent être des chaînes de caractères, jamais des objets imbriqués.`
  },
  {
    id: 'lequipe',
    label: "L'Équipe",
    emoji: '🟡',
    color: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
    generatorPrompt: `Tu es un rédacteur senior L'Équipe.
STYLE : épique, narratif, émotionnel, chiffres mis en valeur, storytelling autour de la performance.
ARTICLE : minimum 500 mots. Titre évocateur + chapô dramatique + récit chronologique avec contexte historique + citations plausibles + chute inspirante.
POST X : formule épique, chiffre clé en évidence, émotion sportive.
POST INSTAGRAM : caption narrative avec émotion, 4-5 lignes, emojis sportifs, hashtags pertinents.
POST LINKEDIN : angle performance/dépassement de soi, insights business du sport.
NEWSLETTER : objet évocateur, résumé narratif 5 lignes.
AUDIO FLASH : script dynamique, ton commentateur sportif, 30 secondes.
RÈGLE ABSOLUE : utilise UNIQUEMENT les faits du contenu source. Ne jamais inventer.
Réponds UNIQUEMENT en JSON avec un objet "assets". Tous les champs de texte doivent être des chaînes de caractères, jamais des objets imbriqués.`
  },
  {
    id: 'konbini',
    label: 'Konbini',
    emoji: '🟣',
    color: 'border-purple-500/50 bg-purple-500/10 text-purple-400',
    generatorPrompt: `Tu es un rédacteur Konbini.
STYLE : jeune, cash, pop culture, comme un pote qui raconte, emojis naturels (2-3 max par post).
ARTICLE : minimum 500 mots. Titre question ou provoc + intro punchline + développement dynamique avec sous-titres courts + références culturelles + chute call-to-action.
POST X : ton pote qui réagit à l'actu, max 280 caractères, 1-2 emojis.
POST INSTAGRAM : caption engageante, question à la communauté, 4-5 lignes, hashtags trendy.
POST LINKEDIN : version adulte mais toujours accessible, hook fort, 3-4 lignes.
NEWSLETTER : objet intriguant, corps décontracté 5 lignes, CTA friendly.
AUDIO FLASH : script naturel, ton podcast jeune, 30 secondes.
RÈGLE ABSOLUE : utilise UNIQUEMENT les faits du contenu source. Ne jamais inventer.
Réponds UNIQUEMENT en JSON avec un objet "assets". Tous les champs de texte doivent être des chaînes de caractères, jamais des objets imbriqués.`
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Pro',
    emoji: '🔵',
    color: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
    generatorPrompt: `Tu es un expert en communication corporate LinkedIn.
STYLE : analytique, structuré, orienté insights et impact business, données chiffrées mises en avant.
ARTICLE : minimum 500 mots. Titre SEO + chapô synthétique + structure en 3 parties titrées (Contexte / Enjeux / Perspectives) + conclusion call-to-action.
POST X : angle data/insight, chiffre clé, ton expert.
POST INSTAGRAM : version visuelle, 3-4 lignes, focus sur le chiffre ou l'insight clé.
POST LINKEDIN : hook fort ligne 1 + développement 4-5 lignes + question ou CTA final. Max 3 hashtags.
NEWSLETTER : objet professionnel, résumé exécutif 5 lignes, CTA clair.
AUDIO FLASH : script briefing corporate, ton consultant, 30 secondes.
RÈGLE ABSOLUE : utilise UNIQUEMENT les faits du contenu source. Ne jamais inventer.
Réponds UNIQUEMENT en JSON avec un objet "assets". Tous les champs de texte doivent être des chaînes de caractères, jamais des objets imbriqués.`
  }
]

// --- PROMPTS ---
const ROUTER_PROMPT = `Tu es le rédacteur en chef d'une rédaction numérique. Tu reçois un contenu brut et produis un editorial_plan en JSON.
Champs requis :
- content_type, angle, tone, hook_direction, key_facts (5-8), target_formats, editorial_notes
Réponds UNIQUEMENT en JSON pur.`

// --- API ---
async function callLLM(system: string, user: string, temp = 0.3, maxTokens = 2000): Promise<string> {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: temp, max_tokens: maxTokens })
  })
  if (!resp.ok) throw new Error(`API Error ${resp.status}`)
  const data = await resp.json()
  return data.choices[0].message.content
}

function parseJSON(text: string) {
  return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
}

const PEXELS_KEY = import.meta.env.VITE_PEXELS_API_KEY || ''

async function generateAIImage(editorialPlan: EditorialPlan): Promise<{url: string; photographer: string; src: string} | null> {
  try {
    const angle = editorialPlan.angle || editorialPlan.title || editorialPlan.headline || ''
    const facts = editorialPlan.key_facts || []
    const promptQuery = await callLLM(
      'Réponds UNIQUEMENT avec un prompt image en anglais (10-15 mots), style photo journalistique, réaliste. Rien d\'autre.',
      `Sujet: ${angle}\nFaits: ${facts.slice(0, 2).join(', ')}`,
      0.3, 80
    )
    const clean = promptQuery.replace(/['"]/g, '').trim()
    const encoded = encodeURIComponent(`${clean}, photojournalism, realistic, high quality`)
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1200&height=630&nologo=true&seed=${Date.now()}`
    return { url, photographer: 'IA Générative', src: 'https://pollinations.ai' }
  } catch { return null }
}

async function searchImage(editorialPlan: EditorialPlan): Promise<{url: string; photographer: string; src: string} | null> {
  const aiImage = await generateAIImage(editorialPlan)
  if (aiImage) return aiImage
  if (!PEXELS_KEY) return null
  const facts = editorialPlan.key_facts || []
  const query = await callLLM(
    'Réponds UNIQUEMENT avec une requête image (2-4 mots en anglais), rien d\'autre.',
    `Type: ${editorialPlan.content_type || 'article'}\nAngle: ${editorialPlan.angle || ''}\nFaits: ${facts.slice(0, 3).join(', ')}`,
    0.1, 50
  )
  const resp = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query.replace(/['"]/g, '').trim())}&per_page=5&orientation=landscape`, { headers: { 'Authorization': PEXELS_KEY } })
  if (!resp.ok) return null
  const data = await resp.json()
  if (!data.photos?.length) return null
  const photo = data.photos[0]
  return { url: photo.src.large2x, photographer: photo.photographer, src: photo.url }
}

async function generateAudio(script: string): Promise<string | null> {
  if (!API_KEY) return null
  try {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: 'tts-1', input: script, voice: 'onyx', response_format: 'mp3' })
    })
    if (!resp.ok) return null
    const blob = await resp.blob()
    return URL.createObjectURL(blob)
  } catch { return null }
}

// --- HELPERS ---

// safeText : convertit n'importe quelle valeur en string utilisable par React
// Gère les cas où le LLM renvoie un objet imbriqué au lieu d'une string
function safeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean).join('\n\n')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // Essaie les champs texte usuels
    if ('paragraph' in obj) return safeText(obj.paragraph)
    if ('text' in obj) return safeText(obj.text)
    if ('content' in obj) return safeText(obj.content)
    if ('value' in obj) return safeText(obj.value)
    // Fallback : concatène toutes les valeurs scalaires/string
    return Object.values(obj).map(safeText).filter(Boolean).join('\n\n')
  }
  return ''
}

function normalizeKit(raw: unknown): GeneratedKit & { generation_time_ms: number } {
  let data: unknown = Array.isArray(raw) ? raw[0] : raw
  if (data && typeof data === 'object' && 'kit' in (data as Record<string, unknown>)) {
    data = (data as Record<string, unknown>).kit
  }
  const obj = data as Record<string, unknown>
  let ep = (obj.editorial_plan || {}) as Record<string, unknown>
  if (ep && typeof ep === 'object' && 'editorial_plan' in ep) {
    ep = ep.editorial_plan as Record<string, unknown>
  }
  return {
    editorial_plan: ep as unknown as EditorialPlan,
    assets: (obj.assets || {}) as Assets,
    generated_at: (obj.generated_at as string) || new Date().toISOString(),
    generation_time_ms: 0,
    fact_check: obj.fact_check as FactCheck | undefined,
    quality_score: obj.quality_score as QualityScore | undefined,
  }
}

function getAudioScript(audio: Assets['audio_flash']): string {
  if (typeof audio === 'string') return audio
  if (audio && typeof audio === 'object') return safeText(audio.script)
  return ''
}

function getAudioDuration(audio: Assets['audio_flash']): number {
  if (typeof audio === 'object' && audio && 'duration_target_seconds' in audio) return audio.duration_target_seconds
  return 30
}

function getKeyFactsList(plan: EditorialPlan): string[] {
  if (plan.key_facts?.length) return plan.key_facts.map(safeText)
  if (plan.key_points?.length) return plan.key_points.map(kp => safeText(kp.point || kp.event || kp.details || ''))
  return []
}

function countTotalWords(assets: Assets): number {
  let total = 0
  const countWords = (text: string | undefined | null) => {
    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
  }
  if (assets.article) {
    total += countWords(safeText(assets.article.title))
    total += countWords(safeText(assets.article.chapo))
    total += countWords(safeText(assets.article.body || assets.article.content))
    total += countWords(safeText(assets.article.chute))
  }
  if (assets.post_x) total += countWords(safeText(assets.post_x))
  if (assets.post_instagram) total += countWords(safeText(assets.post_instagram))
  if (assets.post_linkedin) total += countWords(safeText(assets.post_linkedin))
  if (assets.newsletter_blurb) total += countWords(safeText(assets.newsletter_blurb.body))
  if (assets.audio_flash) {
    const script = typeof assets.audio_flash === 'string' ? assets.audio_flash : safeText(assets.audio_flash.script)
    total += countWords(script)
  }
  if (assets.seo_meta) {
    total += countWords(safeText(assets.seo_meta.title_tag || assets.seo_meta.title))
    total += countWords(safeText(assets.seo_meta.meta_description || assets.seo_meta.description))
  }
  return total
}

function formatTimeSaved(totalWords: number): string {
  const humanWordsPerHour = 250
  const totalMinutes = Math.round((totalWords / humanWordsPerHour) * 60)
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    return `${hours}h${mins > 0 ? String(mins).padStart(2, '0') : '00'}`
  }
  return `${totalMinutes} min`
}

// --- STREAMING REVEAL HOOK ---
function useReveal(delay: number, trigger: unknown): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay, trigger])
  return visible
}

function RevealWrapper({ delay, trigger, children }: { delay: number; trigger: unknown; children: React.ReactNode }) {
  const visible = useReveal(delay, trigger)
  return (
    <div className={`transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}>
      {visible && children}
    </div>
  )
}

// --- TYPEWRITER ---
function TypewriterText({ text, speed = 25, trigger }: { text: string; speed?: number; trigger: unknown }) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.substring(0, i + 1))
        i++
      } else {
        clearInterval(interval)
        setDone(true)
      }
    }, speed)
    return () => clearInterval(interval)
  }, [text, speed, trigger])
  return (
    <span>
      {displayed}
      {!done && <span className="inline-block w-0.5 h-4 bg-orange-400 ml-0.5 animate-pulse" />}
    </span>
  )
}

// --- COMPONENTS ---

function TimeSavedBanner({ kit }: { kit: GeneratedKit }) {
  const totalWords = countTotalWords(kit.assets)
  const timeSaved = formatTimeSaved(totalWords)
  const formatCount = Object.keys(kit.assets).filter(k => k !== 'image_data').length
  const pipelineSeconds = (kit.generation_time_ms / 1000).toFixed(0)
  const [showInfo, setShowInfo] = useState(false)

  return (
    <div className="mb-6 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 p-5 shadow-lg shadow-emerald-500/10 relative">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Zap className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex items-start gap-1">
            <div>
              <div className="text-2xl font-bold text-emerald-300">{timeSaved}</div>
              <div className="text-xs text-emerald-400/60">économisées</div>
            </div>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="ml-1 p-0.5 rounded-full hover:bg-emerald-500/20 transition-colors"
              title="Comment ce temps est-il calculé ?"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-400/60 hover:text-emerald-300" />
            </button>
          </div>
        </div>
        <div className="h-10 w-px bg-emerald-500/20 hidden sm:block" />
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400/60" />
          <div>
            <div className="text-lg font-semibold text-white">{totalWords.toLocaleString()}</div>
            <div className="text-xs text-white/40">mots générés</div>
          </div>
        </div>
        <div className="h-10 w-px bg-emerald-500/20 hidden sm:block" />
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-400/60" />
          <div>
            <div className="text-lg font-semibold text-white">{formatCount}</div>
            <div className="text-xs text-white/40">formats</div>
          </div>
        </div>
        <div className="h-10 w-px bg-emerald-500/20 hidden sm:block" />
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400/60" />
          <div>
            <div className="text-lg font-semibold text-white">{pipelineSeconds}s</div>
            <div className="text-xs text-white/40">de pipeline</div>
          </div>
        </div>
      </div>

      {showInfo && (
        <div className="mt-4 pt-4 border-t border-emerald-500/20 text-xs text-white/70 leading-relaxed animate-in fade-in duration-300">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="font-semibold text-emerald-300">Comment ce temps est-il calculé ?</div>
            <button onClick={() => setShowInfo(false)} className="p-0.5 rounded hover:bg-white/10">
              <X className="w-3.5 h-3.5 text-white/40" />
            </button>
          </div>
          <p className="mb-2">
            L'estimation s'appuie sur une vitesse moyenne de <strong className="text-emerald-300">250 mots/heure</strong> pour un rédacteur produisant du contenu <strong>multi-format</strong> (article + posts réseaux sociaux + SEO + newsletter + script audio).
          </p>
          <p className="mb-2">
            Cette vitesse intègre la phase d'adaptation entre formats : un journaliste rédige 400-600 mots/heure sur un seul format, mais cette productivité chute à 200-300 mots/heure quand il doit décliner un contenu sur plusieurs canaux (recherche d'angle, hashtags, optimisation SEO, scripting audio).
          </p>
          <p className="text-white/40 text-[10px]">
            Sources : benchmarks Content Marketing Institute, HubSpot Content Performance Reports.
          </p>
        </div>
      )}
    </div>
  )
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100
  const color = score >= 8 ? '#22c55e' : score >= 6 ? '#eab308' : '#ef4444'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-12 h-12">
        <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${pct} 100`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color }}>{score}</span>
      </div>
      <span className="text-[10px] text-white/40 text-center leading-tight">{label}</span>
    </div>
  )
}

function QualityScoreView({ score }: { score: QualityScore }) {
  const scoreEntries = Object.entries(score.scores || {})
  const labelMap: Record<string, string> = {
    fidelite_faits: 'Fidélité',
    qualite_redactionnelle: 'Rédaction',
    diversite_formats: 'Diversité',
    ton_editorial: 'Ton',
    seo: 'SEO',
  }
  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-5 h-5 text-purple-400" />
        <h3 className="font-bold text-purple-300">Score qualité</h3>
        <span className="ml-auto text-2xl font-bold text-purple-300">{score.score_global}/10</span>
      </div>
      {scoreEntries.length > 0 && (
        <div className="flex justify-around mb-4">
          {scoreEntries.map(([key, val]) => (
            <ScoreGauge key={key} score={val} label={labelMap[key] || key} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {score.points_forts?.length > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-1 text-green-400"><TrendingUp className="w-3 h-3" /> Points forts</div>
            {score.points_forts.map((p, i) => <p key={i} className="text-white/60 mb-0.5">• {safeText(p)}</p>)}
          </div>
        )}
        {score.points_amelioration?.length > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-1 text-amber-400"><AlertTriangle className="w-3 h-3" /> À améliorer</div>
            {score.points_amelioration.map((p, i) => <p key={i} className="text-white/60 mb-0.5">• {safeText(p)}</p>)}
          </div>
        )}
      </div>
    </div>
  )
}

function FactCheckView({ factCheck }: { factCheck: FactCheck }) {
  const verified = factCheck.verified_facts?.filter(f => f.verified).length || 0
  const total = factCheck.verified_facts?.length || 0
  return (
    <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-5 h-5 text-teal-400" />
        <h3 className="font-bold text-teal-300">Vérification des faits</h3>
        <span className="ml-auto text-sm text-teal-300 font-medium">{verified}/{total} vérifiés</span>
      </div>
      {factCheck.verified_facts?.length > 0 && (
        <div className="space-y-2 mb-3">
          {factCheck.verified_facts.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {f.verified
                ? <ShieldCheck className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                : <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />}
              <div>
                <span className={f.verified ? 'text-white/80' : 'text-amber-200/80'}>{safeText(f.fact)}</span>
                {f.source && (
                  <a href={f.source} target="_blank" rel="noopener noreferrer" className="ml-2 text-teal-400/60 hover:text-teal-300 inline-flex items-center gap-1 text-xs">
                    source <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {factCheck.sources?.length > 0 && (
        <div className="border-t border-teal-500/20 pt-2 mt-2">
          <p className="text-[10px] text-white/30 mb-1">Sources consultées :</p>
          <div className="flex flex-wrap gap-2">
            {factCheck.sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-teal-400/50 hover:text-teal-300 flex items-center gap-1">
                {safeText(s.title).substring(0, 40)} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StepIndicator({ step, elapsed }: { step: PipelineStep; elapsed: number }) {
  const steps = [
    { key: 'ingesting', label: 'Ingestion', icon: Globe2 },
    { key: 'routing', label: 'Analyse', icon: Sparkles },
    { key: 'generating', label: 'Génération', icon: Newspaper },
  ]
  const currentIndex = steps.findIndex(s => s.key === step)
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((s, i) => {
        const Icon = s.icon
        const isActive = s.key === step
        const isDone = currentIndex > i || step === 'done'
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-500 ${
              isActive ? 'bg-orange-500 text-white scale-105 shadow-lg shadow-orange-500/30' :
              isDone ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/30'
            }`}>
              {isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
              {s.label}
            </div>
            {i < steps.length - 1 && <div className={`w-8 h-0.5 ${isDone ? 'bg-green-500/50' : 'bg-white/10'}`} />}
          </div>
        )
      })}
      {elapsed > 0 && <span className="ml-4 text-sm text-white/40 font-mono">{(elapsed / 1000).toFixed(1)}s</span>}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Copier">
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/40 hover:text-white/70" />}
    </button>
  )
}

function AssetCard({ title, icon: Icon, children, color, imageData, copyText }: {
  title: string; icon: React.ElementType; children: React.ReactNode; color: string
  imageData?: { url: string; photographer: string; src: string } | null; copyText?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden transition-all">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-4 h-4 text-white" /></div>
        <span className="font-semibold text-white flex-1">{title}</span>
        {copyText && <CopyButton text={copyText} />}
        {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>
      {open && (
        <div>
          {imageData && (
            <div className="px-5 pt-2">
              <img src={imageData.url} alt={`Illustration ${title}`} className="w-full aspect-[16/9] object-cover rounded-lg" />
              <div className="flex items-center justify-between mt-1 text-xs text-white/30">
                <span>{imageData.photographer === 'IA Générative' ? '🤖 Image générée par IA' : `Photo : ${imageData.photographer}`}</span>
                <a href={imageData.src} target="_blank" rel="noopener noreferrer" className="text-orange-400/60 hover:text-orange-300">
                  {imageData.photographer === 'IA Générative' ? 'Pollinations.ai' : 'Pexels'}
                </a>
              </div>
            </div>
          )}
          <div className="px-5 pb-5 pt-3 text-white/80 text-sm leading-relaxed">{children}</div>
        </div>
      )}
    </div>
  )
}

function ArticleView({ article, imageData, trigger }: { article: NonNullable<Assets['article']>; imageData?: Assets['image_data']; trigger: unknown }) {
  const title = safeText(article.title)
  const chapo = safeText(article.chapo)
  const body = safeText(article.body || article.content)
  const chute = safeText(article.chute)
  const author = safeText(article.author)
  const publishDate = safeText(article.publish_date)
  return (
    <AssetCard title="Article" icon={FileText} color="bg-blue-600" imageData={imageData} copyText={`${title}\n\n${chapo}\n\n${body}\n\n${chute}`.trim()}>
      <h3 className="text-lg font-bold text-white mb-2">
        <TypewriterText text={title} speed={20} trigger={trigger} />
      </h3>
      {chapo && <p className="text-orange-300 font-medium mb-4 italic">{chapo}</p>}
      <div className="whitespace-pre-wrap mb-4">{body}</div>
      {chute && <p className="text-white/50 italic border-t border-white/10 pt-3 mt-3">{chute}</p>}
      {author && <p className="text-xs text-white/30 mt-2">Par {author} {publishDate && `— ${publishDate}`}</p>}
    </AssetCard>
  )
}

function PostView({ platform, content, icon, color }: {
  platform: string; content: string; icon: React.ElementType; color: string
}) {
  return (
    <AssetCard title={`Post ${platform}`} icon={icon} color={color} copyText={content}>
      <p className="whitespace-pre-wrap">{content}</p>
    </AssetCard>
  )
}

function AudioView({ audio }: { audio: NonNullable<Assets['audio_flash']> }) {
  const script = getAudioScript(audio)
  const duration = getAudioDuration(audio)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const handleGenerate = async () => { setLoading(true); const url = await generateAudio(script); setAudioUrl(url); setLoading(false) }
  const handlePlay = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) } else { audioRef.current.play(); setPlaying(true) }
  }
  return (
    <AssetCard title="Audio Flash" icon={Mic} color="bg-purple-600" copyText={script}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">~{duration}s</span>
      </div>
      {!audioUrl && (
        <button onClick={handleGenerate} disabled={loading}
          className="flex items-center gap-2 mb-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          {loading ? 'Génération audio...' : 'Générer l\'audio'}
        </button>
      )}
      {audioUrl && (
        <div className="mb-4">
          <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} className="hidden" />
          <div className="flex items-center gap-3 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <button onClick={handlePlay} className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors">
              {playing ? <Square className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
            </button>
            <div className="flex-1">
              <div className="text-xs text-purple-300 font-medium">Flash audio généré</div>
              <div className="text-xs text-white/40">Voix IA — {duration}s</div>
            </div>
            <a href={audioUrl} download="audio-flash.mp3" className="text-xs text-purple-400 hover:text-purple-300">MP3</a>
          </div>
        </div>
      )}
      <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/60">{script}</p>
    </AssetCard>
  )
}

function SeoView({ seo }: { seo: NonNullable<Assets['seo_meta']> }) {
  const titleTag = safeText(seo.title_tag || seo.title)
  const metaDesc = safeText(seo.meta_description || seo.description)
  const keywords = Array.isArray(seo.keywords)
    ? seo.keywords.map(safeText)
    : (typeof seo.keywords === 'string' ? seo.keywords.split(',').map(k => k.trim()) : [])
  return (
    <AssetCard title="SEO" icon={Search} color="bg-green-600" copyText={`${titleTag}\n${metaDesc}\n${keywords.join(', ')}`}>
      <div className="space-y-2">
        <div><span className="text-white/40 text-xs">Title tag:</span> <span className="text-green-300">{titleTag}</span></div>
        <div><span className="text-white/40 text-xs">Meta desc:</span> <span>{metaDesc}</span></div>
        <div className="flex flex-wrap gap-1 mt-2">
          {keywords.map((k, i) => <span key={i} className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">{k}</span>)}
        </div>
      </div>
    </AssetCard>
  )
}

function EditorialPlanView({ plan, profileId }: { plan: EditorialPlan; profileId: ProfileId }) {
  const facts = getKeyFactsList(plan)
  const formats = plan.target_formats || plan.formats || []
  const profile = PROFILES.find(p => p.id === profileId)!
  return (
    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-orange-400" />
        <h3 className="font-bold text-orange-300">Analyse éditoriale</h3>
        <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${profile.color}`}>
          {profile.emoji} {profile.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-white/40 text-xs block">Type</span>
          <span className="text-white font-medium">{safeText(plan.content_type || plan.source_type || 'article')}</span>
        </div>
        <div>
          <span className="text-white/40 text-xs block">Ton</span>
          <span className="text-white font-medium">{safeText(plan.tone || 'informatif')}</span>
        </div>
        {(plan.angle || plan.title || plan.headline) && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Angle</span>
            <span className="text-orange-200">{safeText(plan.angle || plan.headline || plan.title)}</span>
          </div>
        )}
        {plan.summary && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Résumé</span>
            <span className="text-white/70 text-xs">{safeText(plan.summary)}</span>
          </div>
        )}
        {plan.target_audience && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Audience cible</span>
            <span className="text-white/70 text-xs">{safeText(plan.target_audience)}</span>
          </div>
        )}
        {formats.length > 0 && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Formats</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {formats.map((f, i) => <span key={i} className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full">{safeText(f)}</span>)}
            </div>
          </div>
        )}
        {facts.length > 0 && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Faits clés</span>
            <ul className="list-disc list-inside text-white/70 text-xs mt-1 space-y-1">
              {facts.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// --- MAIN APP ---
export default function App() {
  const [input, setInput] = useState('')
  const [step, setStep] = useState<PipelineStep>('idle')
  const [kit, setKit] = useState<GeneratedKit | null>(null)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [useN8N, setUseN8N] = useState(DEFAULT_USE_N8N)
  const [profile, setProfile] = useState<ProfileId>('bfm')
  const [activeProfile, setActiveProfile] = useState<ProfileId>('bfm')
  const [revealTrigger, setRevealTrigger] = useState(0)

  const runPipelineN8N = useCallback(async () => {
    if (!input.trim()) return
    if (!N8N_WEBHOOK_URL) { setError('URL webhook n8n manquante'); return }
    setStep('ingesting'); setKit(null); setError('')
    const currentProfile = profile
    setActiveProfile(currentProfile)
    const selectedProfile = PROFILES.find(p => p.id === currentProfile)!
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - start), 100)
    try {
      setStep('routing')
      const resp = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: input.trim(),
          source_type: 'text',
          profile_id: currentProfile,
          profile_prompt: selectedProfile.generatorPrompt
        })
      })
      if (!resp.ok) throw new Error(`n8n Error ${resp.status}: ${await resp.text()}`)
      setStep('generating')
      const raw = await resp.json()
      const normalized = normalizeKit(raw)
      let imageData: Assets['image_data'] = undefined
      if (normalized.editorial_plan) {
        imageData = await searchImage(normalized.editorial_plan).catch(() => null) ?? undefined
      }
      clearInterval(timer)
      const totalTime = Date.now() - start
      setElapsed(totalTime)
      const assets = normalized.assets
      if (imageData) assets.image_data = imageData
      setKit({ ...normalized, generation_time_ms: totalTime })
      setRevealTrigger(t => t + 1)
      setStep('done')
    } catch (e: unknown) {
      clearInterval(timer)
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setStep('error')
    }
  }, [input, profile])

  const runPipelineLocal = useCallback(async () => {
    if (!input.trim()) return
    if (!API_KEY) { setError('Clé API manquante'); return }
    setStep('ingesting'); setKit(null); setError('')
    const currentProfile = profile
    setActiveProfile(currentProfile)
    const selectedProfile = PROFILES.find(p => p.id === currentProfile)!
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - start), 100)
    try {
      const rawContent = input.trim()
      setStep('routing')
      const routerResult = await callLLM(ROUTER_PROMPT, `Analyse ce contenu:\n\n${rawContent}`, 0.3, 1500)
      const editorialPlan = parseJSON(routerResult)
      setStep('generating')
      const [genResult, imageData] = await Promise.all([
        callLLM(
          selectedProfile.generatorPrompt,
          `Plan:\n${JSON.stringify(editorialPlan)}\n\nSource:\n${rawContent}\n\nRéponds en JSON "assets". Tous les champs texte doivent être des chaînes simples, pas des objets imbriqués.`,
          0.7, 4000
        ),
        searchImage(editorialPlan).catch(() => null)
      ])
      const parsed = parseJSON(genResult)
      const assets = parsed.assets || parsed
      if (imageData) assets.image_data = imageData
      clearInterval(timer)
      const totalTime = Date.now() - start
      setKit({ editorial_plan: editorialPlan, assets, generated_at: new Date().toISOString(), generation_time_ms: totalTime })
      setRevealTrigger(t => t + 1)
      setStep('done')
    } catch (e: unknown) {
      clearInterval(timer)
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setStep('error')
    }
  }, [input, profile])

  const runPipeline = useN8N ? runPipelineN8N : runPipelineLocal

  const getPostText = (post: Assets['post_x'] | Assets['post_instagram'] | Assets['post_linkedin']): string => {
    return safeText(post)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Rédaction Augmentée</h1>
              <p className="text-xs text-white/40">by Altiarc — Pipeline IA éditorial multi-format</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setUseN8N(!useN8N)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                useN8N ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-white/40 border border-white/10'
              }`}>
              <div className={`w-2 h-2 rounded-full ${useN8N ? 'bg-green-400' : 'bg-white/20'}`} />
              {useN8N ? 'n8n Pipeline' : 'Local'}
            </button>
            <span className="text-xs text-white/20 font-mono">v1.0 — Hackathon</span>
          </div>
        </div>
      </header>

      <div className="border-b border-white/5 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <span className="text-xs text-white/30 shrink-0">Profil éditorial :</span>
          <div className="flex gap-2 flex-wrap">
            {PROFILES.map(p => (
              <button
                key={p.id}
                onClick={() => setProfile(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  profile === p.id
                    ? p.color
                    : 'border-white/10 bg-white/5 text-white/40 hover:text-white/60 hover:border-white/20'
                }`}
              >
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <label className="block text-sm text-white/50 mb-2">Colle ton contenu brut — article, brief, communiqué, notes...</label>
          <div className="relative">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              placeholder="Le Stade Toulousain s'est imposé 31-24 face à l'Union Bordeaux-Bègles en demi-finale du Top 14..."
              className="w-full h-40 bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-white/20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
              disabled={step !== 'idle' && step !== 'done' && step !== 'error'} />
            <div className="absolute bottom-3 right-3 flex items-center gap-3">
              <span className="text-xs text-white/30">{input.split(/\s+/).filter(Boolean).length} mots</span>
              <button onClick={runPipeline}
                disabled={!input.trim() || (step !== 'idle' && step !== 'done' && step !== 'error')}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {step !== 'idle' && step !== 'done' && step !== 'error'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération...</>
                  : <><Send className="w-4 h-4" /> Générer le kit</>}
              </button>
            </div>
          </div>
        </div>

        {step !== 'idle' && <StepIndicator step={step} elapsed={elapsed} />}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
        )}

        {kit && (
          <div>
            <div className="flex items-center gap-4 mb-6 text-xs text-white/40">
              <span>Généré en <strong className="text-orange-400">{(kit.generation_time_ms / 1000).toFixed(1)}s</strong></span>
              <span>•</span>
              <span>{Object.keys(kit.assets).filter(k => k !== 'image_data').length} formats</span>
              <span>•</span>
              <span>Mode : {useN8N ? 'n8n Pipeline' : MODEL}</span>
              {kit.fact_check && <><span>•</span><span className="text-teal-400">Fact-check actif</span></>}
              {kit.quality_score?.score_global !== undefined && (
                <><span>•</span><span className="text-purple-400">Score : {kit.quality_score.score_global}/10</span></>
              )}
            </div>

            <RevealWrapper delay={200} trigger={revealTrigger}>
              <EditorialPlanView plan={kit.editorial_plan} profileId={activeProfile} />
            </RevealWrapper>

            {kit.fact_check && kit.fact_check.verified_facts?.length > 0 && (
              <RevealWrapper delay={500} trigger={revealTrigger}>
                <FactCheckView factCheck={kit.fact_check} />
              </RevealWrapper>
            )}

            {kit.quality_score && (
              <RevealWrapper delay={800} trigger={revealTrigger}>
                <QualityScoreView score={kit.quality_score} />
              </RevealWrapper>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {kit.assets.article && (
                <RevealWrapper delay={1100} trigger={revealTrigger}>
                  <div className="lg:col-span-2"><ArticleView article={kit.assets.article} imageData={kit.assets.image_data} trigger={revealTrigger} /></div>
                </RevealWrapper>
              )}
              {kit.assets.post_x && (
                <RevealWrapper delay={1400} trigger={revealTrigger}>
                  <PostView platform="X" content={getPostText(kit.assets.post_x)} icon={MessageCircle} color="bg-sky-600" />
                </RevealWrapper>
              )}
              {kit.assets.post_instagram && (
                <RevealWrapper delay={1700} trigger={revealTrigger}>
                  <PostView platform="Instagram" content={getPostText(kit.assets.post_instagram)} icon={Camera} color="bg-pink-600" />
                </RevealWrapper>
              )}
              {kit.assets.post_linkedin && (
                <RevealWrapper delay={2000} trigger={revealTrigger}>
                  <PostView platform="LinkedIn" content={getPostText(kit.assets.post_linkedin)} icon={Briefcase} color="bg-blue-700" />
                </RevealWrapper>
              )}
              {kit.assets.audio_flash && (
                <RevealWrapper delay={2300} trigger={revealTrigger}>
                  <AudioView audio={kit.assets.audio_flash} />
                </RevealWrapper>
              )}
              {kit.assets.seo_meta && (
                <RevealWrapper delay={2600} trigger={revealTrigger}>
                  <SeoView seo={kit.assets.seo_meta} />
                </RevealWrapper>
              )}
              {kit.assets.newsletter_blurb && (
                <RevealWrapper delay={2900} trigger={revealTrigger}>
                  <AssetCard title="Newsletter" icon={FileText} color="bg-amber-600" copyText={`Objet : ${safeText(kit.assets.newsletter_blurb.subject_line || kit.assets.newsletter_blurb.subject)}\n\n${safeText(kit.assets.newsletter_blurb.body)}`}>
                    <div className="text-amber-300 font-medium mb-2">{safeText(kit.assets.newsletter_blurb.subject_line || kit.assets.newsletter_blurb.subject)}</div>
                    <p className="whitespace-pre-wrap">{safeText(kit.assets.newsletter_blurb.body)}</p>
                  </AssetCard>
                </RevealWrapper>
              )}
            </div>

            <div className="mt-6">
              <RevealWrapper delay={3300} trigger={revealTrigger}>
                <TimeSavedBanner kit={kit} />
              </RevealWrapper>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
