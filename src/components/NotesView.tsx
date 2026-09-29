import React, { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Article, ArticleNote } from "../types";

interface NotesViewProps {
  notes: ArticleNote[];
  articles: Article[];
  onOpen: (note: ArticleNote) => void;
  onUpdate: (note: ArticleNote, text: string) => void;
  onDelete: (note: ArticleNote) => void;
}

function noteTime(updatedAt: number) {
  const elapsed = Math.max(0, Date.now() - updatedAt);
  const days = Math.floor(elapsed / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return new Date(updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function NoteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>;
}

export function NotesView({ notes, articles, onOpen, onUpdate, onDelete }: NotesViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const articlesById = new Map(articles.map((article) => [article.id, article]));
  const visibleNotes = notes
    .filter((note) => articlesById.has(note.articleId))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="wreader-tool-view wreader-notes-view" aria-label="全部笔记">
      {visibleNotes.length === 0 ? (
        <div className="wreader-notes-empty"><strong>暂无笔记</strong></div>
      ) : (
        <div className="wreader-notes-list">
          {visibleNotes.map((note) => {
            const article = articlesById.get(note.articleId)!;
            const title = note.note?.trim() || note.quote;
            return (
              <article key={note.id} className={selectedId === note.id ? "is-selected" : ""} onClick={() => {
                if (editingId === note.id) return;
                setSelectedId(note.id);
                onOpen(note);
              }}>
                <span className="wreader-notes-icon"><NoteIcon /></span>
                <span className="wreader-notes-copy"><strong>{title}</strong><small>{article.title} · {noteTime(note.updatedAt)}</small></span>
                <span className="wreader-notes-actions">
                  <button type="button" aria-label="编辑笔记" title="编辑笔记" onClick={(event) => { event.stopPropagation(); setEditingId(note.id); setDraft(note.note || ""); }}><Pencil /></button>
                  <button type="button" aria-label="删除笔记" title="删除笔记" onClick={(event) => { event.stopPropagation(); onDelete(note); }}><Trash2 /></button>
                </span>
                {editingId === note.id && (
                  <div className="wreader-notes-editor" onClick={(event) => event.stopPropagation()}>
                    <textarea aria-label="笔记内容" value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} autoFocus placeholder="写下你的想法（可留空）" />
                    <div><button type="button" onClick={() => setEditingId(null)}>取消</button><button type="button" className="primary" onClick={() => { onUpdate(note, draft); setEditingId(null); }}>保存</button></div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
