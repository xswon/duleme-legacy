import { Sparkles } from "lucide-react";

export function AiSummaryIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <Sparkles className={className} data-insight-icon="ai-summary" aria-hidden="true" />;
}

export function TranscriptWaveIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      data-insight-icon="transcript"
      aria-hidden="true"
    >
      <path
        d="M6 13v-2M9 16V8M12 19V5M15 16V8M18 13v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
