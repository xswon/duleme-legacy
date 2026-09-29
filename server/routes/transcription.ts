import { Router } from "express";
import { transcriptionProvider, TranscriptionError, transcriptionErrorMessage } from "../services/transcriptionProvider";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express response remains untyped in this legacy route adapter.
const respond = (res: any, error: unknown) => { const known = error instanceof TranscriptionError ? error : new TranscriptionError("unknown"); res.status(known.status).json({ code: known.code, message: transcriptionErrorMessage(known.code) }); };
export function createTranscriptionRouter() { const router = Router();
  router.post("/settings/test", async (req, res) => { try { await transcriptionProvider.testConnection(String(req.body?.apiKey || "")); res.json({ ok: true }); } catch (error) { respond(res, error); } });
  router.post("/tasks", async (req, res) => { try { const result = await transcriptionProvider.submit({ apiKey: String(req.body?.apiKey || ""), audioUrl: String(req.body?.audioUrl || ""), language: req.body?.language, diarization: req.body?.diarization, context: req.body?.context }); res.status(202).json({ taskId: result.taskId, status: "processing" }); } catch (error) { respond(res, error); } });
  router.post("/tasks/:id/poll", async (req, res) => { try { const result = await transcriptionProvider.poll({ apiKey: String(req.body?.apiKey || ""), taskId: req.params.id }); res.json({ status: result.status, segments: result.segments, ...(result.error ? { code: result.error.code, message: transcriptionErrorMessage(result.error.code) } : {}) }); } catch (error) { respond(res, error); } });
  return router;
}
