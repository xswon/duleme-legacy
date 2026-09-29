import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import {
  Article,
  DetailTab,
  LocalPodcastArtifacts,
  OverviewPanelState,
  OverviewPipelineStage,
  TranscriptPanelState,
} from "../types";
import { renderBidclubRichText } from "../services/bidclubRichText";
import { AiSummaryIcon, TranscriptWaveIcon } from "./InsightIcons";
import { sanitizeHtml } from "../utils/sanitizeHtml";

export interface InsightModel {
  article: Article;
  tab: DetailTab;
  summary: string | null;
  overviewState: OverviewPanelState;
  transcriptState?: TranscriptPanelState;
  pipelineStage?: OverviewPipelineStage;
  pipelinePendingSummary?: boolean;
  pipelineError?: string | null;
  enrichmentLoading: boolean;
  enrichmentError: string | null;
  overviewHtml?: string;
  digestHtml?: string;
  dek?: string;
  transcriptHtml?: string;
  bidclubEpisodeUrl?: string;
  onSummarize: () => void;
  onRegenerateSummary?: () => void;
  onCancelPipeline?: () => void;
  onConfigureAi?: () => void;
  onConfigureTranscription?: () => void;
  summarizing: boolean;
  summaryProgress?: number;
  summaryServiceLabel?: string;
  summaryError: string | null;
  localArtifacts?: LocalPodcastArtifacts | null;
  localProgress?: number;
  localFetchError?: string | null;
  localRestoring?: boolean;
  transcriptionMode?: "local" | "cloud";
  onStartTranscription?: () => void;
  onRegenerateTranscript?: () => void;
  onRetryTranscription?: () => void;
  onCreateInsight?: () => void;
  onSeekTranscript?: (seconds: number) => void;
}

function LoadingContent() {
  return (
    <div className="space-y-3 py-4" aria-label="正在加载整理内容">
      <div className="animate-pulse h-4 w-3/4 bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-full bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-5/6 bg-slate-100 rounded" />
      <div className="animate-pulse h-4 w-2/3 bg-slate-100 rounded" />
    </div>
  );
}

function EnrichmentUnavailable({ error }: { error: string | null }) {
  return (
    <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-sm" role="status">
      {error || "暂时无法加载整理内容，正文仍可正常阅读。"}
    </div>
  );
}

function HtmlContent({ html, emptyText, className = "" }: { html?: string; emptyText: string; className?: string }) {
  return html ? (
    <div className={`reader-content ${className}`.trim()} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
  ) : (
    <p className="text-sm text-slate-400 py-4">{emptyText}</p>
  );
}

function BidclubRichTextContent({ html, emptyText, className = "" }: { html?: string; emptyText: string; className?: string }) {
  return html ? (
    <div
      className={`reader-content ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: renderBidclubRichText(html) }}
    />
  ) : (
    <p className="text-sm text-slate-400 py-4">{emptyText}</p>
  );
}

function EnrichmentAttribution({ episodeUrl }: { episodeUrl?: string }) {
  return (
    <p className="mt-3 text-xs text-slate-400" data-testid="enrichment-attribution">
      增强内容由 {episodeUrl ? <a href={episodeUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">BidClub</a> : "BidClub"} 提供
    </p>
  );
}

function formatMinuteTimestamp(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minuteLabel = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const secondLabel = String(seconds).padStart(2, "0");

  return hours > 0
    ? `${hours}:${minuteLabel}:${secondLabel}`
    : `${minuteLabel}:${secondLabel}`;
}

function splitGeneratedPodcastSummary(summary: string): { overview: string; deepSummary: string } {
  const match = /^##\s+深度精华\s*$/m.exec(summary);
  const withoutOverviewHeading = (value: string) => value
    .replace(/^\s*#{1,3}\s+核心摘要\s*(?:\n+|$)/, "")
    .trim();
  if (!match || match.index === undefined) {
    return { overview: withoutOverviewHeading(summary), deepSummary: "" };
  }
  return {
    overview: withoutOverviewHeading(summary.slice(0, match.index)),
    deepSummary: summary.slice(match.index + match[0].length).trim(),
  };
}


function EmptyStateContainer({
  icon,
  title,
  description,
  children,
  tone = "blue",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
  tone?: "blue" | "slate";
}) {
  const iconToneClass = tone === "blue"
    ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100"
    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200/60";

  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-[360px] text-center">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${iconToneClass}`}>
          {icon}
        </div>
        <h3 className="mt-4 text-lg font-semibold leading-7 tracking-tight text-slate-800">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-[320px] text-sm leading-6 text-slate-500">{description}</p>
        {children}
      </div>
    </div>
  );
}

function FeatureEmptyStateContainer({
  icon,
  title,
  description,
  meta,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="reader-feature-empty">
      <div className="reader-feature-empty-preview" aria-hidden="true">
        <div className="reader-feature-empty-sheet">
          <div className="reader-feature-empty-sheet-heading">
            <span className="reader-feature-empty-icon">{icon}</span>
            <span className="reader-feature-empty-sheet-lines"><i /><i /></span>
          </div>
          <span className="reader-feature-empty-sheet-line" />
          <span className="reader-feature-empty-sheet-line" />
        </div>
      </div>
      <div className="reader-feature-empty-content">
        <h3>{title}</h3>
        <p>{description}</p>
        {children}
        {meta && <div className="reader-feature-empty-meta">{meta}</div>}
      </div>
    </div>
  );
}

function PrimaryActionButton({
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-5 wreader-btn wreader-btn-lg wreader-btn-primary ${className}`.trim()}
    >
      {children}
    </button>
  );
}

function ConfigRequirementAction({
  icon,
  label,
  onConfigure,
}: {
  icon: React.ReactNode;
  label: string;
  onConfigure?: () => void;
}) {
  return (
    <button type="button" onClick={onConfigure} className="reader-feature-config-action">
      {icon}
      <span>{label}</span>
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function ConfigEmptyState({
  icon,
  title,
  description,
  requirements,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  requirements: Array<{
    icon: React.ReactNode;
    label: string;
    onConfigure?: () => void;
  }>;
}) {
  return (
    <FeatureEmptyStateContainer icon={icon} title={title} description={description}>
      <div className="reader-feature-config-actions">
        {requirements.map((requirement) => (
          <ConfigRequirementAction
            key={requirement.label}
            icon={requirement.icon}
            label={requirement.label}
            onConfigure={requirement.onConfigure}
          />
        ))}
      </div>
    </FeatureEmptyStateContainer>
  );
}

function RetranscriptionConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/35 p-4"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="retranscription-dialog-title"
        aria-describedby="retranscription-dialog-description"
        className="w-full max-w-xs rounded-2xl bg-white p-5 text-left shadow-2xl ring-1 ring-slate-200/80"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="retranscription-dialog-title" className="text-base font-semibold text-slate-900">
          确认重新转录？
        </h3>
        <p id="retranscription-dialog-description" className="mt-2 text-sm leading-6 text-slate-500">
          将使用 Small 模型重新生成本地逐字稿。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PipelineProgressCard({
  stage,
  autoContinue,
  error,
  transcriptionFailed,
  onCancel,
  progress = 0,
  showTranscriptionStep = true,
}: {
  stage: OverviewPipelineStage;
  autoContinue: boolean;
  error?: string | null;
  transcriptionFailed?: boolean;
  onCancel?: () => void;
  progress?: number;
  showTranscriptionStep?: boolean;
}) {
  const transcribing = stage === "transcribing";
  const summarizing = stage === "summarizing";
  const failed = stage === "failed";
  const roundedProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const stepOneDone = summarizing || (failed && !transcriptionFailed);
  const stepOneClass = stepOneDone
    ? "bg-emerald-50 text-emerald-600"
    : transcribing
      ? "bg-blue-50 text-blue-600"
      : failed && transcriptionFailed
        ? "bg-rose-50 text-rose-600"
        : "bg-slate-100 text-slate-400";
  const stepTwoClass = summarizing
    ? "bg-blue-50 text-blue-600"
    : failed && !transcriptionFailed
      ? "bg-rose-50 text-rose-600"
      : "bg-slate-100 text-slate-400";

  return (
    <EmptyStateContainer
      icon={<AiSummaryIcon className="h-5 w-5" />}
      title={failed ? "生成遇到问题" : summarizing ? "正在生成 AI 摘要…" : "正在准备 AI 摘要…"}
      description={summarizing
        ? "正在提炼完整内容，完成后自动显示。"
        : autoContinue
          ? "无需切换页面，完成后自动显示。"
          : "逐字稿处理中，完成后即可生成摘要。"}
      tone="blue"
    >
      <div className="mt-5 space-y-4 text-left">
        {showTranscriptionStep && <div className="flex gap-3">
          <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " + stepOneClass}>
            {stepOneDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : "1"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-700">生成逐字稿</p>
              <span className="text-[11px] text-slate-400">
                {stepOneDone ? "已完成" : failed && transcriptionFailed ? "失败" : "进行中"}
              </span>
            </div>
            {transcribing && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
              </div>
            )}
          </div>
        </div>}
        <div className="flex gap-3">
          <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " + stepTwoClass}>
            {showTranscriptionStep ? "2" : "1"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-700">生成 AI 摘要</p>
              <span className="text-[11px] text-slate-400">
                {summarizing ? `${roundedProgress}%` : failed && !transcriptionFailed ? "失败" : "等待"}
              </span>
            </div>
            {summarizing && (
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label="AI 摘要进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={roundedProgress}
              >
                <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${roundedProgress}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-4 text-xs text-rose-600" role="alert">{error}</p>}
      {autoContinue && transcribing && onCancel && (
        <button type="button" onClick={onCancel} className="mt-4 wreader-btn-link">
          取消
        </button>
      )}
    </EmptyStateContainer>
  );
}

function ContentServiceBar({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="reader-service-bar">
      <span>{label}</span>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ArticleInsightTabs({ model: p }: { model: InsightModel }) {
  const [deepSummaryExpanded, setDeepSummaryExpanded] = useState(false);
  const [retranscriptionConfirmOpen, setRetranscriptionConfirmOpen] = useState(false);
  const transcriptionProgress = typeof p.localProgress === "number" && Number.isFinite(p.localProgress)
    ? Math.min(100, Math.max(0, Math.round(p.localProgress)))
    : null;

  useEffect(() => {
    setDeepSummaryExpanded(false);
    setRetranscriptionConfirmOpen(false);
  }, [p.article.id]);

  const retranscriptionDialog = (
    <RetranscriptionConfirmDialog
      open={retranscriptionConfirmOpen}
      onCancel={() => setRetranscriptionConfirmOpen(false)}
      onConfirm={() => {
        setRetranscriptionConfirmOpen(false);
        p.onRegenerateTranscript?.();
      }}
    />
  );

  const deepSummaryToggle = (
    <button
      type="button"
      className="audio-deep-summary-toggle"
      onClick={() => setDeepSummaryExpanded((expanded) => !expanded)}
      aria-expanded={deepSummaryExpanded}
    >
      <span>{deepSummaryExpanded ? "收起深度精华" : "展开深度精华"}</span>
      <ChevronDown aria-hidden="true" />
    </button>
  );

  if (p.tab === "body") {
    return (
      <HtmlContent
        html={p.article.content || (p.article.snippet ? `<p>${p.article.snippet}</p>` : "")}
        emptyText="暂无正文内容"
        className="article-copy"
      />
    );
  }

  const cloudTask = p.article.transcription;
  const localTask = p.article.localPodcast;
  const transcriptionFailed = cloudTask?.status === "failed" || localTask?.transcriptionStatus === "failed";
  const localDigest = p.localArtifacts?.digest;
  const hasPreparedOverview = Boolean(
    p.overviewHtml?.trim() || p.digestHtml?.trim() || localDigest
  );

  if (p.tab === "overview" && p.summary) {
    const generatedSummary = splitGeneratedPodcastSummary(p.summary);
    return (
      <div className="audio-insight-layout wreader-ai-summary-layout">
        <div className="reader-service-content">
          <ContentServiceBar
            label={`摘要模型：${p.summaryServiceLabel || "用户配置模型"}`}
            actionLabel="重新生成"
            onAction={p.onRegenerateSummary}
          />
          <section className="audio-highlight-body">
            <BidclubRichTextContent html={generatedSummary.overview} emptyText="暂无摘要" className="bidclub-overview" />
          </section>
        </div>
        {generatedSummary.deepSummary && <>
          {deepSummaryToggle}
          <section className="audio-deep-summary" hidden={!deepSummaryExpanded}>
            <BidclubRichTextContent html={generatedSummary.deepSummary} emptyText="暂无深度精华" className="bidclub-digest" />
          </section>
        </>}
      </div>
    );
  }

  if (p.tab === "overview" && !hasPreparedOverview) {
    switch (p.overviewState) {
      case "ready":
        return <LoadingContent />;
      case "needs_all_config":
        return (
          <ConfigEmptyState
            icon={<AiSummaryIcon className="h-5 w-5" />}
            title="尚无 AI 摘要"
            description="先配置转录服务和 AI 模型，生成时会自动创建逐字稿。"
            requirements={[
              {
                icon: <TranscriptWaveIcon className="h-4 w-4" />,
                label: "配置转录服务",
                onConfigure: p.onConfigureTranscription,
              },
              {
                icon: <Bot className="h-4 w-4" aria-hidden="true" />,
                label: "配置 AI 模型",
                onConfigure: p.onConfigureAi,
              },
            ]}
          />
        );
      case "needs_transcription_config":
        return (
          <ConfigEmptyState
            icon={<AiSummaryIcon className="h-5 w-5" />}
            title="尚无 AI 摘要"
            description="先配置转录服务，生成时会自动创建逐字稿。"
            requirements={[
              {
                icon: <TranscriptWaveIcon className="h-4 w-4" />,
                label: "配置转录服务",
                onConfigure: p.onConfigureTranscription,
              },
            ]}
          />
        );
      case "needs_ai_config":
        return (
          <ConfigEmptyState
            icon={<AiSummaryIcon className="h-5 w-5" />}
            title="尚无 AI 摘要"
            description="配置 AI 模型后，即可提炼内容要点。"
            requirements={[
              {
                icon: <Bot className="h-4 w-4" aria-hidden="true" />,
                label: "配置 AI 模型",
                onConfigure: p.onConfigureAi,
              },
            ]}
          />
        );
      case "can_generate":
        return (
          <FeatureEmptyStateContainer
            icon={<AiSummaryIcon className="h-8 w-8" />}
            title="尚无 AI 摘要"
            description={p.article.audioUrl
              ? "从逐字稿提炼本期要点，方便快速回顾。"
              : "从正文提炼关键信息，方便快速掌握内容。"}
          >
            {p.summaryError && <p className="mt-4 text-xs text-rose-600" role="alert">{p.summaryError}</p>}
            <PrimaryActionButton
              onClick={p.onSummarize}
              disabled={p.summarizing}
            >
              {p.pipelineError ? "重试生成" : p.summarizing ? "正在生成…" : "立即生成"}
            </PrimaryActionButton>
          </FeatureEmptyStateContainer>
        );
      case "processing":
      case "transcribing":
        return (
          <PipelineProgressCard
            stage={p.pipelineStage === "idle" || !p.pipelineStage ? "transcribing" : p.pipelineStage}
            autoContinue={Boolean(p.pipelinePendingSummary)}
            error={p.pipelineError || p.summaryError}
            transcriptionFailed={transcriptionFailed}
            onCancel={p.onCancelPipeline}
            progress={p.summaryProgress}
            showTranscriptionStep={Boolean(p.article.audioUrl)}
          />
        );
    }
  }

  // Remote enrichment state is scoped to enrichment-only tabs. It must never
  // replace the article body or podcast show notes rendered above.
  if (!p.article.audioUrl && p.enrichmentLoading) return <LoadingContent />;
  if (!p.article.audioUrl && p.enrichmentError) return <EnrichmentUnavailable error={p.enrichmentError} />;


  const renderList = (value: unknown) => Array.isArray(value) && value.length > 0 ? (
    <ul>{value.map((item, index) => <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul>
  ) : null;

  const renderLocalAiSummary = () => {
    if (!localDigest) return <LoadingContent />;
    const oneSentence = localDigest.one_sentence || localDigest.overview;
    const oneSentenceText = typeof oneSentence === "string" ? oneSentence : null;
    const sections = [localDigest.content_map, localDigest.distinctions, localDigest.uncovered].filter(Boolean);
    const chapters = Array.isArray(localDigest.chapters) ? localDigest.chapters : [];
    const deepSummaryAvailable = sections.length > 0 || chapters.length > 0;
    return (
      <div className="audio-insight-layout wreader-ai-summary-layout">
        <div className="reader-service-content">
          <ContentServiceBar label="摘要模型：本地 AI" actionLabel="重新生成" onAction={p.onCreateInsight} />
          <section className="audio-highlight-body">
            <div className="reader-content bidclub-overview">
            {oneSentenceText && <p>{oneSentenceText}</p>}
            {renderList(localDigest.key_insights)}
            {renderList(localDigest.listen_again)}
            </div>
          </section>
        </div>
        {deepSummaryAvailable && <>
          {deepSummaryToggle}
          <section className="audio-deep-summary" hidden={!deepSummaryExpanded}>
            <div className="reader-content bidclub-digest">
              {sections.map((section, index) => <section key={index}>{typeof section === "string" ? <p>{section}</p> : Array.isArray(section) ? renderList(section) : <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(section, null, 2)}</pre>}</section>)}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing local AI chapter payload is externally shaped. */}
              {chapters.map((chapter: any, index: number) => <section key={index}><h3>{String(chapter.title || `第 ${index + 1} 节`)}</h3><p>{String(chapter.summary || "")}</p></section>)}
            </div>
          </section>
        </>}
      </div>
    );
  };

  if (p.tab === "overview" || p.tab === "digest") {
    if (!p.overviewHtml?.trim() && !p.digestHtml?.trim()) return renderLocalAiSummary();
    const hasOverview = !!p.overviewHtml?.trim();
    const hasDigest = !!(p.digestHtml?.trim() || p.dek?.trim());
    return (
      <div className="audio-insight-layout wreader-ai-summary-layout">
        <div className="reader-service-content">
          <ContentServiceBar label="摘要服务：读了么官方整理" />
          {hasOverview && <section className="audio-highlight-body">
            <BidclubRichTextContent html={p.overviewHtml} emptyText="暂无短精华" className="bidclub-overview" />
          </section>}
        </div>
        {hasDigest && <>
          {deepSummaryToggle}
          <section className="audio-deep-summary" hidden={!deepSummaryExpanded}>
            {p.dek && <p className="text-slate-600 leading-relaxed">{p.dek}</p>}
            {p.digestHtml && <BidclubRichTextContent html={p.digestHtml} emptyText="暂无深度精华" className="bidclub-digest" />}
          </section>
        </>}
        <EnrichmentAttribution episodeUrl={p.bidclubEpisodeUrl} />
      </div>
    );
  }

  if (p.transcriptHtml?.trim()) return (
    <div className="reader-service-content">
      <ContentServiceBar label="转录服务：读了么官方转录" />
      <HtmlContent html={p.transcriptHtml} emptyText="暂无逐字稿" className="audio-tab-panel audio-transcript-panel" />
      <EnrichmentAttribution episodeUrl={p.bidclubEpisodeUrl} />
    </div>
  );
  if (cloudTask?.segments?.length) return (
    <div className="reader-service-content">
      <ContentServiceBar label="转录服务：阿里云百炼" />
      <div className="audio-tab-panel audio-transcript-panel">{cloudTask.segments.map((segment, index) => <p key={`${segment.startMs}-${index}`} data-transcript-start-ms={segment.startMs}><button type="button" onClick={() => p.onSeekTranscript?.(segment.startMs / 1000)} className="transcript-time">{formatMinuteTimestamp(segment.startMs)}</button><span>{segment.speaker && <small className="mr-2 text-slate-400">{segment.speaker}</small>}{segment.text}</span></p>)}</div>
    </div>
  );
  if (p.localArtifacts?.transcript?.length) return (
    <>
      <div className="reader-service-content">
        <ContentServiceBar
          label="转录服务：本地 · Small"
          actionLabel="重新转录"
          onAction={p.onRegenerateTranscript ? () => setRetranscriptionConfirmOpen(true) : undefined}
        />
        <div className="audio-tab-panel audio-transcript-panel">
          {p.localArtifacts.transcript.map((segment, index) => (
            <p key={`${segment.startMs}-${index}`} data-transcript-start-ms={segment.startMs}>
              <button type="button" onClick={() => p.onSeekTranscript?.(segment.startMs / 1000)} className="transcript-time">{formatMinuteTimestamp(segment.startMs)}</button>
              <span>{segment.text}</span>
            </p>
          ))}
        </div>
      </div>
      {retranscriptionDialog}
    </>
  );
  switch (p.transcriptState) {
    case "ready":
      return <LoadingContent />;
    case "generating":
      return (
        <EmptyStateContainer
          icon={<TranscriptWaveIcon className="h-5 w-5" />}
          title="正在生成逐字稿…"
          description="完成后会自动显示在这里。"
          tone="slate"
        >
          <div className="mx-auto mt-5 w-full max-w-xs">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
              <span>转录进度</span>
              {transcriptionProgress !== null && <span>{transcriptionProgress}%</span>}
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-label="转录进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={transcriptionProgress ?? undefined}
            >
              <div
                className={`h-full rounded-full bg-blue-500 transition-[width] duration-500 ease-out ${transcriptionProgress === null ? "w-1/2 animate-pulse" : ""}`}
                style={transcriptionProgress === null ? undefined : { width: `${transcriptionProgress}%` }}
              />
            </div>
          </div>
        </EmptyStateContainer>
      );
    case "can_generate":
      return (
        <FeatureEmptyStateContainer
          icon={<TranscriptWaveIcon className="h-8 w-8" />}
          title="尚无逐字稿"
          description="将音频转成可阅读文本，方便搜索与回听。"
          meta={p.transcriptionMode
            ? <>转录方式：{p.transcriptionMode === "local" ? "本地" : "云端（阿里云百炼）"}</>
            : undefined}
        >
          {(p.localFetchError || localTask?.error || cloudTask?.error) && (
            <p className="mt-4 text-xs text-rose-600" role="alert">{p.localFetchError || localTask?.error || cloudTask?.error}</p>
          )}
          <PrimaryActionButton
            onClick={transcriptionFailed ? p.onRetryTranscription : p.onStartTranscription}
          >
            {transcriptionFailed ? "重试生成" : "开始转录"}
          </PrimaryActionButton>
        </FeatureEmptyStateContainer>
      );
    case "needs_config":
    default:
      return (
        <ConfigEmptyState
          icon={<TranscriptWaveIcon className="h-5 w-5" />}
          title="尚无逐字稿"
          description="配置转录服务后，即可将音频转换为可搜索的文本。"
          requirements={[
            {
              icon: <TranscriptWaveIcon className="h-4 w-4" />,
              label: "配置转录服务",
              onConfigure: p.onConfigureTranscription,
            },
          ]}
        />
      );
  }

}
