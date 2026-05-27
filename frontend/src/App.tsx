import { useState, useCallback } from 'react'
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
} from 'lucide-react';

// --- TYPES ---
interface EditorialPlan {
  content_type: string
  angle: string
  tone: string
  hook_direction: string
  key_facts: string[]
  target_formats: string[]
  editorial_notes: string | string[]
}

interface Assets {
  article?: { title: string; chapo: string; body: string; chute: string }
  post_x?: { text: string; hashtags?: string[] } | string
  post_instagram?: { caption: string; hashtags?: string[] } | string
  post_linkedin?: { text: string } | string
  newsletter_blurb?: { subject_line: string; body: string }
  audio_flash?: { script: string; duration_target_seconds: number }
  seo_meta?: { title_tag: string; meta_description: string; keywords: string[] | string }
  image_data?: { url: string; photographer: string; src: string }
}

interface GeneratedKit {
  editorial_plan: EditorialPlan
  assets: Assets
  generated_at: string
  generation_time_ms: number
}

type PipelineStep = 'idle' | 'ingesting' | 'routing' | 'generating' | 'done' | 'error'

// --- CONFIG ---
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''
const API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = import.meta.env.VITE_MODEL || 'gpt-4o-mini'
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || ''
const DEFAULT_USE_N8N = import.meta.env.VITE_USE_N8N === 'true'

// --- PROMPTS (inline pour le front standalone) ---
const ROUTER_PROMPT = `Tu es le rédacteur en chef d'une rédaction numérique. Tu reçois un contenu brut et produis un editorial_plan en JSON.

Champs requis :
- content_type: recap_sportif | communique | interview | breve | analyse | portrait | evenement | autre
- angle: ce qui rend cette info intéressante (PAS un résumé, trouve un angle éditorial fort)
- tone: factuel | dynamique | analytique | conversationnel | solennel
- hook_direction: direction de l'accroche (percutante, pas descriptive)
- key_facts: 5-8 faits vérifiables extraits du contenu
- target_formats: TOUJOURS inclure au minimum [article, post_x, post_instagram, post_linkedin, newsletter_blurb, audio_flash, seo_meta]. Ne retire un format que s'il est vraiment inapproprié.
- editorial_notes: instructions spécifiques pour guider la génération (ton, style, ce qu'il faut mettre en avant)

IMPORTANT : tu es une rédaction complète, pas un blog. Chaque contenu mérite une déclinaison multi-plateforme. Réponds UNIQUEMENT en JSON pur.`

const GENERATOR_PROMPT = `Tu es un rédacteur polyvalent expert. Tu génères un kit éditorial cohérent à partir d'un plan éditorial ET du contenu source original.

RÈGLE ABSOLUE : utilise UNIQUEMENT les faits, noms, chiffres et informations présents dans le contenu source. Ne JAMAIS inventer de données. Chaque format doit parler du MÊME sujet avec les MÊMES faits.

Formats et structure JSON :
- article : {title, chapo (2-3 phrases d'accroche), body (pyramide inversée, 200-400 mots), chute (ouverture/question)}
- post_x : {text (max 280 car, percutant), hashtags (2-3 hashtags pertinents)}
- post_instagram : {caption (150-300 mots, hook fort ligne 1, emojis ok), hashtags (5-8)}
- post_linkedin : {text (150-250 mots, ton pro, hook expert)}
- newsletter_blurb : {subject_line (60 car max, donne envie d'ouvrir), body (80-120 mots)}
- audio_flash : {script (75-110 mots, style oral radio, avec [pause] entre les phrases), duration_target_seconds}
- seo_meta : {title_tag (55-60 car), meta_description (150-160 car), keywords (array 5-8 mots-clés)}

Ne génère QUE les formats demandés. Réponds en JSON avec un objet "assets".`

// --- API CALL ---
async function callLLM(system: string, user: string, temp = 0.3, maxTokens = 2000): Promise<string> {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: temp,
      max_tokens: maxTokens
    })
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
  const query = await callLLM(
    `Tu génères des requêtes de recherche d'images pour illustrer des articles de presse.

RÈGLES STRICTES :
- Réponds UNIQUEMENT avec la requête (2-4 mots en anglais), rien d'autre
- JAMAIS de noms de villes seuls (pas "Toulouse", pas "Paris")
- Cherche le SUJET principal : le sport, l'action, les personnes
- Pour du sport : utilise le sport + l'action (ex: "rugby tackle match", "rugby players celebration", "football stadium crowd")
- Pour une personne connue : utilise son nom + contexte (ex: "Antoine Dupont rugby")
- Pour un événement : décris la scène, pas le lieu`,
    `Type: ${editorialPlan.content_type}\nAngle: ${editorialPlan.angle}\nFaits clés: ${editorialPlan.key_facts.slice(0, 3).join(', ')}`,
    0.1, 50
  )
  const searchQuery = query.replace(/['"]/g, '').trim()
  // Chercher plusieurs photos et prendre la meilleure
  const resp = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`, {
    headers: { 'Authorization': PEXELS_KEY }
  })
  if (!resp.ok) return null
  const data = await resp.json()
  if (!data.photos || data.photos.length === 0) return null
  // Prendre la première photo (meilleure pertinence)
  const photo = data.photos[0]
  return { url: photo.src.large2x, photographer: photo.photographer, src: photo.url }
}

// --- COMPONENTS ---

function StepIndicator({ step, elapsed }: { step: PipelineStep; elapsed: number }) {
  const steps = [
    { key: 'ingesting', label: 'Ingestion', icon: Globe },
    { key: 'routing', label: 'Analyse éditoriale', icon: Sparkles },
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
              isDone ? 'bg-green-500/20 text-green-400' :
              'bg-white/5 text-white/30'
            }`}>
              {isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-0.5 ${isDone ? 'bg-green-500/50' : 'bg-white/10'}`} />
            )}
          </div>
        )
      })}
      {elapsed > 0 && (
        <span className="ml-4 text-sm text-white/40 font-mono">{(elapsed / 1000).toFixed(1)}s</span>
      )}
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
  imageData?: { url: string; photographer: string; src: string } | null
  copyText?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden transition-all`}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
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
  const fullText = `${article.title}\n\n${article.chapo}\n\n${article.body}\n\n${article.chute}`
  return (
    <AssetCard title="Article" icon={FileText} color="bg-blue-600" imageData={imageData} copyText={fullText}>
      <h3 className="text-lg font-bold text-white mb-2">{article.title}</h3>
      <p className="text-orange-300 font-medium mb-4 italic">{article.chapo}</p>
      <div className="whitespace-pre-wrap mb-4">{article.body}</div>
      <p className="text-white/50 italic border-t border-white/10 pt-3 mt-3">{article.chute}</p>
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
  return (
    <AssetCard title="Audio Flash" icon={Mic} color="bg-purple-600" copyText={audio.script}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">
          ~{audio.duration_target_seconds}s
        </span>
      </div>
      <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
        {audio.script}
      </p>
    </AssetCard>
  )
}

function SeoView({ seo }: { seo: NonNullable<Assets['seo_meta']> }) {
  const keywords = Array.isArray(seo.keywords) ? seo.keywords : (seo.keywords as string).split(',').map(k => k.trim())
  return (
    <AssetCard title="SEO" icon={Search} color="bg-green-600" copyText={`${seo.title_tag}\n${seo.meta_description}\n${keywords.join(', ')}`}>
      <div className="space-y-2">
        <div><span className="text-white/40 text-xs">Title tag:</span> <span className="text-green-300">{seo.title_tag}</span></div>
        <div><span className="text-white/40 text-xs">Meta desc:</span> <span>{seo.meta_description}</span></div>
        <div className="flex flex-wrap gap-1 mt-2">
          {keywords.map((k, i) => (
            <span key={i} className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">{k}</span>
          ))}
        </div>
      </div>
    </AssetCard>
  )
}

function EditorialPlanView({ plan }: { plan: EditorialPlan }) {
  return (
    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-orange-400" />
        <h3 className="font-bold text-orange-300">Analyse éditoriale</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-white/40 text-xs block">Type</span>
          <span className="text-white font-medium">{plan.content_type}</span>
        </div>
        <div>
          <span className="text-white/40 text-xs block">Ton</span>
          <span className="text-white font-medium">{plan.tone}</span>
        </div>
        <div className="col-span-2">
          <span className="text-white/40 text-xs block">Angle</span>
          <span className="text-orange-200">{plan.angle}</span>
        </div>
        <div className="col-span-2">
          <span className="text-white/40 text-xs block">Faits clés</span>
          <ul className="list-disc list-inside text-white/70 text-xs mt-1 space-y-1">
            {plan.key_facts.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
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

  // --- Pipeline via n8n (production) ---
  const runPipelineN8N = useCallback(async () => {
    if (!input.trim()) return
    if (!N8N_WEBHOOK_URL) { setError('URL webhook n8n manquante. Ajoute VITE_N8N_WEBHOOK_URL dans .env'); return }

    setStep('ingesting')
    setKit(null)
    setError('')
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - start), 100)

    try {
      setStep('routing')
      const resp = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim(), source_type: 'text' })
      })
      if (!resp.ok) throw new Error(`n8n Error ${resp.status}: ${await resp.text()}`)

      setStep('generating')
      const data = await resp.json()

      // n8n renvoie le kit complet depuis Assemble Kit Final
      const kitData = data as GeneratedKit

      // Chercher une image en parallèle si le plan éditorial est dispo
      let imageData: Assets['image_data'] = undefined
      if (kitData.editorial_plan) {
        imageData = await searchImage(kitData.editorial_plan).catch(() => null) ?? undefined
      }

      clearInterval(timer)
      const totalTime = Date.now() - start
      setElapsed(totalTime)

      const assets = kitData.assets || {}
      if (imageData) assets.image_data = imageData

      setKit({
        editorial_plan: kitData.editorial_plan,
        assets,
        generated_at: kitData.generated_at || new Date().toISOString(),
        generation_time_ms: totalTime
      })
      setStep('done')

    } catch (e: unknown) {
      clearInterval(timer)
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setStep('error')
    }
  }, [input])

  // --- Pipeline local (OpenAI direct) ---
  const runPipelineLocal = useCallback(async () => {
    if (!input.trim()) return
    if (!API_KEY) { setError('Clé API manquante. Ajoute VITE_OPENAI_API_KEY dans .env'); return }

    setStep('ingesting')
    setKit(null)
    setError('')
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - start), 100)

    try {
      // Couche 1 — Ingestion
      const rawContent = input.trim()
      const wordCount = rawContent.split(/\s+/).length

      // Couche 2 — Routeur
      setStep('routing')
      const routerResult = await callLLM(
        ROUTER_PROMPT,
        `Analyse ce contenu (${wordCount} mots, type: texte_brut) et produis un editorial_plan:\n\n${rawContent}`,
        0.3, 1500
      )
      const editorialPlan = parseJSON(routerResult)

      // Couche 3 — Génération texte + image en parallèle
      setStep('generating')
      const [genResult, imageData] = await Promise.all([
        callLLM(
          GENERATOR_PROMPT,
          `Plan éditorial:\n${JSON.stringify(editorialPlan, null, 2)}\n\nContenu source:\n${rawContent}\n\nFormats: ${editorialPlan.target_formats.join(', ')}\n\nRéponds en JSON avec un objet "assets".`,
          0.7, 4000
        ),
        searchImage(editorialPlan).catch(() => null)
      ])
      const parsed = parseJSON(genResult)
      const assets = parsed.assets || parsed
      if (imageData) assets.image_data = imageData

      clearInterval(timer)
      const totalTime = Date.now() - start
      setElapsed(totalTime)

      setKit({
        editorial_plan: editorialPlan,
        assets,
        generated_at: new Date().toISOString(),
        generation_time_ms: totalTime
      })
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
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Rédaction Augmentée</h1>
              <p className="text-xs text-white/40">by Altiarc — IA éditoriale multi-format</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setUseN8N(!useN8N)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                useN8N
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-white/5 text-white/40 border border-white/10'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${useN8N ? 'bg-green-400' : 'bg-white/20'}`} />
              {useN8N ? 'n8n' : 'Local'}
            </button>
            <span className="text-xs text-white/20 font-mono">v0.1 — Phase 1</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Input Zone */}
        <div className="mb-8">
          <label className="block text-sm text-white/50 mb-2">Colle ton contenu brut — article, brief, communiqué, notes...</label>
          <div className="relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Le Stade Toulousain s'est imposé 31-24 face à l'Union Bordeaux-Bègles en demi-finale du Top 14..."
              className="w-full h-40 bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-white/20 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all"
              disabled={step !== 'idle' && step !== 'done' && step !== 'error'}
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-3">
              <span className="text-xs text-white/30">{input.split(/\s+/).filter(Boolean).length} mots</span>
              <button
                onClick={runPipeline}
                disabled={!input.trim() || (step !== 'idle' && step !== 'done' && step !== 'error')}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {step !== 'idle' && step !== 'done' && step !== 'error' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Génération...</>
                ) : (
                  <><Send className="w-4 h-4" /> Générer le kit</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Pipeline Steps */}
        {step !== 'idle' && <StepIndicator step={step} elapsed={elapsed} />}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {kit && (
          <div className="animate-in fade-in duration-500">
            {/* Stats bar */}
            <div className="flex items-center gap-4 mb-6 text-xs text-white/40">
              <span>Généré en <strong className="text-orange-400">{(kit.generation_time_ms / 1000).toFixed(1)}s</strong></span>
              <span>•</span>
              <span>{Object.keys(kit.assets).length} formats</span>
              <span>•</span>
              <span>Mode : {useN8N ? 'n8n' : MODEL}</span>
            </div>

            {/* Editorial Plan */}
            <EditorialPlanView plan={kit.editorial_plan} />

            {/* Assets Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {kit.assets.article && <div className="lg:col-span-2"><ArticleView article={kit.assets.article} imageData={kit.assets.image_data} /></div>}
              {kit.assets.post_x && <PostView platform="X" content={getPostText(kit.assets.post_x)} icon={MessageCircle} color="bg-sky-600" imageData={kit.assets.image_data} />}
              {kit.assets.post_instagram && <PostView platform="Instagram" content={getPostText(kit.assets.post_instagram)} icon={Camera} color="bg-pink-600" imageData={kit.assets.image_data} />}
              {kit.assets.post_linkedin && <PostView platform="LinkedIn" content={getPostText(kit.assets.post_linkedin)} icon={Briefcase} color="bg-blue-700" imageData={kit.assets.image_data} />}
              {kit.assets.audio_flash && <AudioView audio={kit.assets.audio_flash} />}
              {kit.assets.seo_meta && <SeoView seo={kit.assets.seo_meta} />}
              {kit.assets.newsletter_blurb && (
                <AssetCard title="Newsletter" icon={FileText} color="bg-amber-600" copyText={`Objet : ${kit.assets.newsletter_blurb.subject_line}\n\n${kit.assets.newsletter_blurb.body}`}>
                  <div className="text-amber-300 font-medium mb-2">{kit.assets.newsletter_blurb.subject_line}</div>
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
