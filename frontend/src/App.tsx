import { useState, useCallback, useRef } from 'react'
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

// --- CONFIG ---
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''
const API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = import.meta.env.VITE_MODEL || 'gpt-4o-mini'
const N8N_WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ''
const DEFAULT_USE_N8N = import.meta.env.VITE_USE_N8N === 'true'

// --- PROMPTS ---
const ROUTER_PROMPT = `Tu es le rédacteur en chef d'une rédaction numérique. Tu reçois un contenu brut et produis un editorial_plan en JSON.
Champs requis :
- content_type, angle, tone, hook_direction, key_facts (5-8), target_formats, editorial_notes
Réponds UNIQUEMENT en JSON pur.`

const GENERATOR_PROMPT = `Tu es un rédacteur polyvalent expert. Génère un kit éditorial cohérent.
RÈGLE ABSOLUE : utilise UNIQUEMENT les faits du contenu source.
Réponds en JSON avec un objet "assets".`

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

async function searchImage(editorialPlan: EditorialPlan): Promise<{url: string; photographer: string; src: string} | null> {
  if (!PEXELS_KEY) return null
  const facts = editorialPlan.key_facts || []
  const query = await callLLM(
    'Réponds UNIQUEMENT avec une requête image (2-4 mots en anglais), rien d\'autre.',
    `Type: ${editorialPlan.content_type || editorialPlan.source_type || 'article'}\nAngle: ${editorialPlan.angle || editorialPlan.title || editorialPlan.headline || ''}\nFaits: ${facts.slice(0, 3).join(', ')}`,
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
  if (audio && typeof audio === 'object') return audio.script
  return ''
}
function getAudioDuration(audio: Assets['audio_flash']): number {
  if (typeof audio === 'object' && audio && 'duration_target_seconds' in audio) return audio.duration_target_seconds
  return 30
}

function getKeyFactsList(plan: EditorialPlan): string[] {
  if (plan.key_facts?.length) return plan.key_facts
  if (plan.key_points?.length) return plan.key_points.map(kp => kp.point || kp.event || kp.details || '')
  return []
}

// --- COMPONENTS ---

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
            {score.points_forts.map((p, i) => <p key={i} className="text-white/60 mb-0.5">• {p}</p>)}
          </div>
        )}
        {score.points_amelioration?.length > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-1 text-amber-400"><AlertTriangle className="w-3 h-3" /> À améliorer</div>
            {score.points_amelioration.map((p, i) => <p key={i} className="text-white/60 mb-0.5">• {p}</p>)}
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
                <span className={f.verified ? 'text-white/80' : 'text-amber-200/80'}>{f.fact}</span>
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
                {s.title.substring(0, 40)} <ExternalLink className="w-2.5 h-2.5" />
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
              <img src={imageData.url} alt={`Illustration ${title}`} className="w-full h-48 object-cover rounded-lg" />
              <div className="flex items-center justify-between mt-1 text-xs text-white/30">
                <span>Photo : {imageData.photographer}</span>
                <a href={imageData.src} target="_blank" rel="noopener noreferrer" className="text-orange-400/60 hover:text-orange-300">Pexels</a>
              </div>
            </div>
          )}
          <div className="px-5 pb-5 pt-3 text-white/80 text-sm leading-relaxed">{children}</div>
        </div>
      )}
    </div>
  )
}

function ArticleView({ article, imageData }: { article: NonNullable<Assets['article']>; imageData?: Assets['image_data'] }) {
  const title = article.title || ''
  const chapo = article.chapo || ''
  const body = article.body || article.content || ''
  const chute = article.chute || ''
  return (
    <AssetCard title="Article" icon={FileText} color="bg-blue-600" imageData={imageData} copyText={`${title}\n\n${chapo}\n\n${body}\n\n${chute}`.trim()}>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      {chapo && <p className="text-orange-300 font-medium mb-4 italic">{chapo}</p>}
      <div className="whitespace-pre-wrap mb-4">{body}</div>
      {chute && <p className="text-white/50 italic border-t border-white/10 pt-3 mt-3">{chute}</p>}
      {article.author && <p className="text-xs text-white/30 mt-2">Par {article.author} — {article.publish_date}</p>}
    </AssetCard>
  )
}

function PostView({ platform, content, icon, color, imageData }: {
  platform: string; content: string; icon: React.ElementType; color: string; imageData?: Assets['image_data']
}) {
  return (
    <AssetCard title={`Post ${platform}`} icon={icon} color={color} imageData={imageData} copyText={content}>
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
  const titleTag = seo.title_tag || seo.title || ''
  const metaDesc = seo.meta_description || seo.description || ''
  const keywords = Array.isArray(seo.keywords) ? seo.keywords : (typeof seo.keywords === 'string' ? seo.keywords.split(',').map(k => k.trim()) : [])
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

function EditorialPlanView({ plan }: { plan: EditorialPlan }) {
  const facts = getKeyFactsList(plan)
  const formats = plan.target_formats || plan.formats || []
  return (
    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-orange-400" />
        <h3 className="font-bold text-orange-300">Analyse éditoriale</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-white/40 text-xs block">Type</span>
          <span className="text-white font-medium">{plan.content_type || plan.source_type || 'article'}</span>
        </div>
        <div>
          <span className="text-white/40 text-xs block">Ton</span>
          <span className="text-white font-medium">{plan.tone || 'informatif'}</span>
        </div>
        {(plan.angle || plan.title || plan.headline) && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Angle</span>
            <span className="text-orange-200">{plan.angle || plan.headline || plan.title}</span>
          </div>
        )}
        {plan.summary && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Résumé</span>
            <span className="text-white/70 text-xs">{plan.summary}</span>
          </div>
        )}
        {plan.target_audience && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Audience cible</span>
            <span className="text-white/70 text-xs">{plan.target_audience}</span>
          </div>
        )}
        {formats.length > 0 && (
          <div className="col-span-2">
            <span className="text-white/40 text-xs block">Formats</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {formats.map((f, i) => <span key={i} className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded-full">{f}</span>)}
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

  const runPipelineN8N = useCallback(async () => {
    if (!input.trim()) return
    if (!N8N_WEBHOOK_URL) { setError('URL webhook n8n manquante'); return }
    setStep('ingesting'); setKit(null); setError('')
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - start), 100)
    try {
      setStep('routing')
      const resp = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim(), source_type: 'text' })
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
      setStep('done')
    } catch (e: unknown) {
      clearInterval(timer)
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setStep('error')
    }
  }, [input])

  const runPipelineLocal = useCallback(async () => {
    if (!input.trim()) return
    if (!API_KEY) { setError('Clé API manquante'); return }
    setStep('ingesting'); setKit(null); setError('')
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - start), 100)
    try {
      const rawContent = input.trim()
      setStep('routing')
      const routerResult = await callLLM(ROUTER_PROMPT, `Analyse ce contenu:\n\n${rawContent}`, 0.3, 1500)
      const editorialPlan = parseJSON(routerResult)
      setStep('generating')
      const [genResult, imageData] = await Promise.all([
        callLLM(GENERATOR_PROMPT, `Plan:\n${JSON.stringify(editorialPlan)}\n\nSource:\n${rawContent}\n\nRéponds en JSON "assets".`, 0.7, 4000),
        searchImage(editorialPlan).catch(() => null)
      ])
      const parsed = parseJSON(genResult)
      const assets = parsed.assets || parsed
      if (imageData) assets.image_data = imageData
      clearInterval(timer)
      const totalTime = Date.now() - start
      setKit({ editorial_plan: editorialPlan, assets, generated_at: new Date().toISOString(), generation_time_ms: totalTime })
      setStep('done')
    } catch (e: unknown) {
      clearInterval(timer)
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setStep('error')
    }
  }, [input])

  const runPipeline = useN8N ? runPipelineN8N : runPipelineLocal

  const getPostText = (post: Assets['post_x'] | Assets['post_instagram'] | Assets['post_linkedin']): string => {
    if (typeof post === 'string') return post
    if (post && typeof post === 'object') {
      if ('text' in post) return post.text
      if ('caption' in post) return post.caption
    }
    return ''
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
            <span className="text-xs text-white/20 font-mono">v0.3 — Hackathon</span>
          </div>
        </div>
      </header>

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
          <div className="animate-in fade-in duration-500">
            <div className="flex items-center gap-4 mb-6 text-xs text-white/40">
              <span>Généré en <strong className="text-orange-400">{(kit.generation_time_ms / 1000).toFixed(1)}s</strong></span>
              <span>•</span>
              <span>{Object.keys(kit.assets).filter(k => k !== 'image_data').length} formats</span>
              <span>•</span>
              <span>Mode : {useN8N ? 'n8n Pipeline' : MODEL}</span>
              {kit.fact_check && <><span>•</span><span className="text-teal-400">Fact-check actif</span></>}
              {kit.quality_score && kit.quality_score.score_global > 0 && <><span>•</span><span className="text-purple-400">Score : {kit.quality_score.score_global}/10</span></>}
            </div>

            <EditorialPlanView plan={kit.editorial_plan} />
            {kit.fact_check && kit.fact_check.verified_facts?.length > 0 && <FactCheckView factCheck={kit.fact_check} />}
            {kit.quality_score && kit.quality_score.score_global > 0 && <QualityScoreView score={kit.quality_score} />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {kit.assets.article && <div className="lg:col-span-2"><ArticleView article={kit.assets.article} imageData={kit.assets.image_data} /></div>}
              {kit.assets.post_x && <PostView platform="X" content={getPostText(kit.assets.post_x)} icon={MessageCircle} color="bg-sky-600" imageData={kit.assets.image_data} />}
              {kit.assets.post_instagram && <PostView platform="Instagram" content={getPostText(kit.assets.post_instagram)} icon={Camera} color="bg-pink-600" imageData={kit.assets.image_data} />}
              {kit.assets.post_linkedin && <PostView platform="LinkedIn" content={getPostText(kit.assets.post_linkedin)} icon={Briefcase} color="bg-blue-700" />}
              {kit.assets.audio_flash && <AudioView audio={kit.assets.audio_flash} />}
              {kit.assets.seo_meta && <SeoView seo={kit.assets.seo_meta} />}
              {kit.assets.newsletter_blurb && (
                <AssetCard title="Newsletter" icon={FileText} color="bg-amber-600" copyText={`Objet : ${kit.assets.newsletter_blurb.subject_line || kit.assets.newsletter_blurb.subject || ''}\n\n${kit.assets.newsletter_blurb.body}`}>
                  <div className="text-amber-300 font-medium mb-2">{kit.assets.newsletter_blurb.subject_line || kit.assets.newsletter_blurb.subject}</div>
                  <p>{kit.assets.newsletter_blurb.body}</p>
                </AssetCard>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
