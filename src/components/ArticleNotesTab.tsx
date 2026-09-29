import React, { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { ArticleNote, NoteSource } from "../types";

const SOURCE_LABELS: Record<NoteSource, string> = {
  body: "正文",
  overview: "内容精华",
  digest: "深度摘要",
  transcript: "逐字稿",
};

function formatTimestamp(milliseconds?: number): string | null {
  if (milliseconds === undefined) return null;
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface ArticleNotesTabProps {
  notes: ArticleNote[];
  onUpdate: (note: ArticleNote, text: string) => void;
  onDelete: (note: ArticleNote) => void;
  onOpenTranscript: (note: ArticleNote) => void;
}

export function ArticleNotesTab({ notes, onUpdate, onDelete, onOpenTranscript }: ArticleNotesTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="audio-notes-panel reader-notes-panel" aria-label="文章笔记">
      {notes.map((item) => {
        const timestamp = formatTimestamp(item.transcriptStartMs);
        const canOpenTranscript = item.source === "transcript" && item.transcriptStartMs !== undefined;
        return (
          <article
            key={item.id}
            className={`reader-note-card ${canOpenTranscript ? "is-openable" : ""}`}
            onClick={() => canOpenTranscript && editingId !== item.id && onOpenTranscript(item)}
          >
            <div className="reader-note-heading">
              <span>
                {SOURCE_LABELS[item.source]}{timestamp ? ` · ${timestamp}` : ""}
              </span>
              <div className="reader-note-actions">
                <button
                  type="button"
                  aria-label="编辑笔记"
                  title="编辑笔记"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingId(item.id);
                    setDraft(item.note || "");
                  }}
                  className="reader-note-action"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="删除笔记"
                  title="删除笔记"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(item);
                  }}
                  className="reader-note-action reader-note-delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <blockquote className="reader-note-quote">
              {item.quote}
            </blockquote>
            {editingId === item.id ? (
              <div className="reader-note-editor mt-3" onClick={(event) => event.stopPropagation()}>
                <textarea
                  aria-label="笔记内容"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  autoFocus
                  className="reader-note-textarea w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  placeholder="写下你的想法（可留空）"
                />
                <div className="reader-note-editor-actions mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className="wreader-btn wreader-btn-sm wreader-btn-ghost">取消</button>
                  <button type="button" onClick={() => { onUpdate(item, draft); setEditingId(null); }} className="wreader-btn wreader-btn-sm wreader-btn-primary">保存</button>
                </div>
              </div>
            ) : item.note ? (
              <p className="reader-note-body mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.note}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
