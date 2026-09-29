export type FilterType = "all" | "unread" | "starred";

export type ActiveTab = "feeds" | "saved" | "search" | "playlist" | "notes" | "settings";

export type ContentType = "article" | "podcast";

export type ProcessingState = "raw" | "digested";

export type LocalTaskStatus = "not_started" | "processing" | "completed" | "failed";

export interface AiConfig {
  enabled: boolean;
  providerPreset?: string;
  baseURL: string;
  model: string;
}

export interface AiSecret {
  apiKey: string;
  baseURL?: string;
}

export interface RuntimeCapabilities {
  aiConfigured: boolean;
  transcriptionAvailable: boolean;
}

export type OverviewPanelState =
  | "ready"
  | "can_generate"
  | "needs_all_config"
  | "needs_ai_config"
  | "processing"
  | "transcribing"
  | "needs_transcription_config";

export type OverviewPipelineStage =
  | "idle"
  | "transcribing"
  | "summarizing"
  | "failed";

export type TranscriptPanelState =
  | "ready"
  | "can_generate"
  | "generating"
  | "needs_config";

export interface LocalPodcastProcessing {
  sessionId?: string;
  jobId?: string;
  sourceAudioUrl: string;
  transcriptionStatus: LocalTaskStatus;
  insightStatus: LocalTaskStatus;
  updatedAt: string;
  error?: string;
  insightError?: string;
}

export interface TranscriptSegment {
  startMs: number;
  endMs?: number;
  text: string;
  timestamp?: string;
  speaker?: string;
}

export interface CloudTranscriptionTask {
  provider: "aliyun";
  taskId?: string;
  sourceAudioUrl: string;
  status: LocalTaskStatus;
  segments?: TranscriptSegment[];
  updatedAt: string;
  error?: string;
}

export interface LocalPodcastArtifacts {
  transcript: TranscriptSegment[];
  digest?: Record<string, unknown>;
  transcriptSource?: string;
}

export type EnrichmentProvider = "bidclub";

export type EnrichmentMatchMethod =
  | "source-url"
  | "episode-number"
  | "title"
  | "pub-date"
  | "api"
  | "legacy";

export interface EnrichmentReference {
  provider: EnrichmentProvider;
  episodeId: string;
  episodeUrl?: string;
  status: "candidate" | "available";
  matchedBy: EnrichmentMatchMethod;
}

export type EnrichmentStatus =
  | "none"
  | "candidate"
  | "checking"
  | "available"
  | "unavailable"
  | "error";

export type DetailTab = "overview" | "body" | "digest" | "transcript";

export type NoteSource = DetailTab;

export interface ArticleNote {
  id: string;
  articleId: string;
  source: NoteSource;
  quote: string;
  note?: string;
  /** Present only for transcript excerpts, in milliseconds. */
  transcriptStartMs?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ContentCapabilities {
  hasAudio: boolean;
  hasCover: boolean;
  hasBody: boolean;
  hasOverview: boolean;
  hasDigest: boolean;
  hasTranscript: boolean;
  canGenerateOverview: boolean;
}

export interface DetailTabPresentation {
  key: DetailTab;
  label: string;
}

export interface ArticlePresentation {
  contentType: ContentType;
  processingState: ProcessingState;
  enrichmentStatus: EnrichmentStatus;
  enrichmentProvider?: EnrichmentProvider;
  capabilities: ContentCapabilities;
  overviewState: OverviewPanelState;
  transcriptState?: TranscriptPanelState;
  tabs: DetailTabPresentation[];
  defaultTab: DetailTab;
}

export interface AudioProgress {
  currentTime: number;
  duration: number;
  updatedAt: number;
}

export interface Article {
  id: string;
  feedId: string;
  feedTitle: string;
  feedFavicon?: string;
  title: string;
  link: string;
  content: string;
  snippet: string;
  pubDate: string;
  author?: string;
  thumbnail?: string;
  read: boolean;
  starred: boolean;
  savedAt?: string;
  aiSummary?: string;
  /** Identifies whether a generated summary came from article text or a completed transcript. */
  aiSummarySource?: "article" | "transcript";
  /** Generated results that have not yet been opened in their corresponding detail tab. */
  insightUnread?: {
    transcript?: boolean;
    summary?: boolean;
  };
  /** Fraction of the article body that the reader has consumed (0..1). */
  readingProgress?: number;
  readingProgressUpdatedAt?: number;
  audioUrl?: string;
  duration?: string;
  enrichment?: EnrichmentReference;
  /** Lightweight reference only. Full artifacts remain in NextEcho. */
  localPodcast?: LocalPodcastProcessing;
  /** Non-sensitive cloud task metadata and the completed normalized transcript. */
  transcription?: CloudTranscriptionTask;
}

export interface Feed {
  id: string;
  title: string;
  feedUrl: string;
  siteUrl: string;
  favicon?: string;
  category: string;
  description?: string;
  unreadCount: number;
  lastUpdated?: string;
  error?: string;
  lastSyncStatus?: "success" | "error";
  lastSyncError?: string;
  bidclubFeedUrl?: string;
  bidclubShowSlug?: string;
  enrichmentDisabled?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  feedIds: string[];
}

export interface RssParseResponse {
  title: string;
  description: string;
  link: string;
  feedUrl: string;
  favicon: string;
  feedImage?: string;
  itemCount: number;
  items: Array<{
    id: string;
    title: string;
    link: string;
    content: string;
    snippet: string;
    pubDate: string;
    author?: string;
    thumbnail?: string;
    audioUrl?: string;
    duration?: string;
    enrichment?: EnrichmentReference;
  }>;
}

export interface CuratedFeedOption {
  id: string;
  title: string;
  feedUrl: string;
  siteUrl?: string;
  category: string;
  description: string;
  favicon: string;
  featured?: boolean;
  contentType?: ContentType;
  bidclubFeedUrl?: string;
  bidclubShowSlug?: string;
}

export interface BidclubEpisode {
  title: string;
  dek: string;
  dekAlt: string;
  lang: string;
  langAlt: string;
  tldrHtml: string;
  digestHtml: string;
  transcriptHtml: string;
  tldrAltHtml: string;
  digestAltHtml: string;
  chapters: { id: string; title: string }[];
  chaptersAlt: { id: string; title: string }[];
  sourceUrl?: string;
  sourceLabel?: string;
  thumbnailUrl?: string;
  durationMin?: number | null;
  showName?: string;
  hosts?: string;
  chips?: string[];
}
