import type {
  Article,
  ArticlePresentation,
  DetailTabPresentation,
  EnrichmentStatus,
  OverviewPanelState,
  RuntimeCapabilities,
  TranscriptPanelState,
} from "../types";
import { isVerifiedBidclubEnrichment } from "./bidclubEpisodeCache";

export interface ArticleEnrichmentAvailability {
  status?: EnrichmentStatus;
  overview?: string | null;
  digest?: string | null;
  transcript?: string | null;
}

const DEFAULT_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  aiConfigured: false,
  transcriptionAvailable: false,
};

function hasText(value?: string | null): boolean {
  return !!value?.trim();
}

export function resolveArticlePresentation(
  article: Article,
  enrichment: ArticleEnrichmentAvailability = {},
  runtime: RuntimeCapabilities = DEFAULT_RUNTIME_CAPABILITIES,
): ArticlePresentation {
  const hasAudio = hasText(article.audioUrl);
  const hasProviderReference = article.enrichment?.provider === "bidclub";
  const hasProviderOverview = hasProviderReference && hasText(enrichment.overview);
  const hasProviderDigest = hasProviderReference && hasText(enrichment.digest);
  const hasProviderTranscript = hasProviderReference && hasText(enrichment.transcript);
  const hasProviderContent = hasProviderOverview || hasProviderDigest || hasProviderTranscript;
  const hasCloudTranscript = article.transcription?.status === "completed" && Boolean(article.transcription.segments?.length);
  const hasLocalTranscript = article.localPodcast?.transcriptionStatus === "completed";
  const hasLocalInsight = article.localPodcast?.insightStatus === "completed";
  const hasStoredArticleSummary = hasText(article.aiSummary) && (
    !hasAudio || article.aiSummarySource === "transcript"
  );

  const storedStatus = !hasProviderReference
    ? "none"
    : isVerifiedBidclubEnrichment(article.enrichment)
      ? "available"
      : "candidate";
  const requestedStatus = enrichment.status || storedStatus;
  const enrichmentStatus: EnrichmentStatus = !hasProviderReference
    ? "none"
    : enrichment.status && enrichment.status !== "available"
      ? enrichment.status
      : hasProviderContent
        ? "available"
        : isVerifiedBidclubEnrichment(article.enrichment)
          ? "available"
          : requestedStatus === "available"
            ? "candidate"
            : requestedStatus;
  const isDigested = enrichmentStatus === "available" && (
    isVerifiedBidclubEnrichment(article.enrichment) || hasProviderContent
  );

  const hasOverview = hasStoredArticleSummary || hasProviderOverview || (hasAudio && hasProviderDigest) || hasLocalInsight;
  const hasDigest = hasProviderDigest;
  const hasTranscript = hasProviderTranscript || hasCloudTranscript || hasLocalTranscript;
  const providerContentLoading = hasProviderReference && enrichmentStatus === "checking";
  const transcriptionProcessing = article.transcription?.status === "processing"
    || article.localPodcast?.transcriptionStatus === "processing";

  let transcriptState: TranscriptPanelState | undefined;
  if (hasAudio) {
    transcriptState = hasTranscript
      ? "ready"
      : providerContentLoading
        ? "ready"
      : transcriptionProcessing
        ? "generating"
        : runtime.transcriptionAvailable
          ? "can_generate"
          : "needs_config";
  }

  let overviewState: OverviewPanelState;
  if (hasOverview) {
    overviewState = "ready";
  } else if (providerContentLoading) {
    // A referenced BidClub episode may already contain both artifacts. Keep
    // configuration prompts hidden until that request has actually finished.
    overviewState = "ready";
  } else if (!hasAudio) {
    overviewState = runtime.aiConfigured ? "can_generate" : "needs_ai_config";
  } else if (hasTranscript) {
    overviewState = runtime.aiConfigured ? "can_generate" : "needs_ai_config";
  } else if (!runtime.transcriptionAvailable && !runtime.aiConfigured) {
    overviewState = "needs_all_config";
  } else if (!runtime.transcriptionAvailable) {
    overviewState = "needs_transcription_config";
  } else if (!runtime.aiConfigured) {
    overviewState = "needs_ai_config";
  } else if (transcriptionProcessing) {
    overviewState = "transcribing";
  } else {
    // Both dependencies are ready. The detail view owns the one-click
    // transcription -> summary pipeline when no transcript exists yet.
    overviewState = "can_generate";
  }

  const capabilities = {
    hasAudio,
    hasCover: hasText(article.thumbnail),
    hasBody: true,
    hasOverview,
    hasDigest,
    hasTranscript,
    canGenerateOverview: overviewState === "can_generate",
  };

  const tabs: DetailTabPresentation[] = [
    { key: "body", label: hasAudio ? "节目介绍" : "正文" },
    { key: "overview", label: "AI 摘要" },
  ];

  if (hasAudio) {
    tabs.push({ key: "transcript", label: "逐字稿" });
  }

  return {
    contentType: hasAudio ? "podcast" : "article",
    processingState: isDigested ? "digested" : "raw",
    enrichmentStatus,
    enrichmentProvider: article.enrichment?.provider,
    capabilities,
    overviewState,
    transcriptState,
    tabs,
    defaultTab: tabs[0]?.key || "body",
  };
}
