// Types partagés du pipeline Rédaction Augmentée

export type SourceType =
  | 'url_article'
  | 'url_match'
  | 'texte_brut'
  | 'communique_pdf'
  | 'transcript_audio'
  | 'transcript_video';

export type ContentType =
  | 'recap_sportif'
  | 'communique'
  | 'interview'
  | 'breve'
  | 'analyse'
  | 'portrait'
  | 'evenement'
  | 'autre';

export type Tone = 'factuel' | 'dynamique' | 'analytique' | 'conversationnel' | 'solennel';

export type OutputFormat =
  | 'article'
  | 'post_x'
  | 'post_instagram'
  | 'post_linkedin'
  | 'thread_x'
  | 'newsletter_blurb'
  | 'audio_flash'
  | 'visuel'
  | 'video_verticale'
  | 'seo_meta'
  | 'faq';

// Couche 1 → Couche 2
export interface IngestedContent {
  source_type: SourceType;
  raw_content: string;
  metadata: {
    title?: string;
    source_url?: string;
    source_name?: string;
    date?: string;
    language: string;
    word_count: number;
  };
}

// Couche 2 → Couche 3
export interface EditorialPlan {
  content_type: ContentType;
  angle: string;
  tone: Tone;
  hook_direction: string;
  key_facts: string[];
  target_formats: OutputFormat[];
  editorial_notes: string;
}

// Assets individuels
export interface ArticleAsset {
  title: string;
  chapo: string;
  body: string;
  chute: string;
}

export interface PostXAsset {
  text: string;
  hashtags: string[];
}

export interface PostInstagramAsset {
  caption: string;
  hashtags: string[];
}

export interface PostLinkedInAsset {
  text: string;
}

export interface NewsletterBlurbAsset {
  subject_line: string;
  body: string;
}

export interface AudioFlashAsset {
  script: string;
  duration_target_seconds: number;
}

export interface SeoMetaAsset {
  title_tag: string;
  meta_description: string;
  keywords: string[];
}

// Couche 3 → Couche 4/5
export interface GeneratedKit {
  editorial_plan: EditorialPlan;
  assets: {
    article?: ArticleAsset;
    post_x?: PostXAsset;
    post_instagram?: PostInstagramAsset;
    post_linkedin?: PostLinkedInAsset;
    newsletter_blurb?: NewsletterBlurbAsset;
    audio_flash?: AudioFlashAsset;
    seo_meta?: SeoMetaAsset;
  };
  generated_at: string;
  generation_time_ms: number;
}
