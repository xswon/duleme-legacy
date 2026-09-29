import { useCallback, useEffect, useMemo, useState } from "react";
import type { ArticleNote } from "../types";
import type { ArticleLookup } from "../services/articleIndex";
import {
  deleteArticleNoteFromDB,
  deleteArticleNotesFromDB,
  getAllArticleNotesFromDB,
  NOTES_CHANGED_EVENT,
  saveArticleNoteToDB,
} from "../services/dbService";

interface UseArticleNotesOptions {
  articleLookup: ArticleLookup;
  showToast: (message: string) => void;
}

export function useArticleNotes({ articleLookup, showToast }: UseArticleNotesOptions) {
  const [notes, setNotes] = useState<ArticleNote[]>([]);

  const reload = useCallback(async () => {
    const storedNotes = await getAllArticleNotesFromDB();
    setNotes(storedNotes);
    return storedNotes;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const reloadOnChange = () => {
      void getAllArticleNotesFromDB()
        .then((storedNotes) => { if (!cancelled) setNotes(storedNotes); })
        .catch((error) => console.warn("Failed to load notes:", error));
    };
    reloadOnChange();
    window.addEventListener(NOTES_CHANGED_EVENT, reloadOnChange);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTES_CHANGED_EVENT, reloadOnChange);
    };
  }, []);

  const visibleNotes = useMemo(
    () => notes.filter((note) => articleLookup.byId.has(note.articleId)),
    [articleLookup, notes],
  );

  const updateNote = useCallback((note: ArticleNote, text: string) => {
    const updated = { ...note, note: text.trim() || undefined, updatedAt: Date.now() };
    setNotes((current) => current.map((item) => item.id === note.id ? updated : item));
    void saveArticleNoteToDB(updated).catch((error) => {
      console.warn("Failed to update note:", error);
      void reload().catch((reloadError) => console.warn("Failed to restore notes after a save failure:", reloadError));
    });
  }, [reload]);

  const deleteNote = useCallback((note: ArticleNote) => {
    if (note.note && !window.confirm("这条摘录包含笔记内容，确定删除吗？")) return;
    setNotes((current) => current.filter((item) => item.id !== note.id));
    void deleteArticleNoteFromDB(note.id).catch((error) => {
      console.warn("Failed to delete note:", error);
      void reload().catch((reloadError) => console.warn("Failed to restore notes after a delete failure:", reloadError));
    });
  }, [reload]);

  const clearNotes = useCallback(async () => {
    const notesToDelete = notes.filter((note) => articleLookup.byId.has(note.articleId));
    if (notesToDelete.length === 0) return;
    const previousNotes = notes;
    const deletingIds = new Set(notesToDelete.map((note) => note.id));
    setNotes((current) => current.filter((note) => !deletingIds.has(note.id)));
    try {
      await deleteArticleNotesFromDB(notesToDelete.map((note) => note.id));
      showToast("笔记已全部删除");
    } catch (error) {
      console.warn("Failed to delete notes:", error);
      try {
        await reload();
      } catch {
        setNotes(previousNotes);
      }
      showToast("笔记删除失败，请重试");
    }
  }, [articleLookup, notes, reload, showToast]);

  return { notes, setNotes, visibleNotes, updateNote, deleteNote, clearNotes };
}
