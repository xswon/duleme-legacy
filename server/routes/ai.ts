import { Router } from "express";
import {
  AiServiceError,
  getResolvedAiConfig,
  listAiModels,
  summarizeArticle,
  testAiConnection,
  type AiRequestConfig,
} from "../services/aiService";

function statusForAiError(error: AiServiceError): number {
  if (error.status && error.status >= 400 && error.status < 600) return error.status;
  if (error.code === "not_configured" || error.code === "invalid_config") return 400;
  if (error.code === "timeout") return 504;
  if (error.code === "connection_refused") return 502;
  return 502;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Express response remains untyped in this legacy route adapter.
function sendAiError(res: any, error: unknown) {
  if (error instanceof AiServiceError) {
    return res.status(statusForAiError(error)).json({
      error: error.message,
      code: error.code,
      ...(error.status ? { upstreamStatus: error.status } : {}),
    });
  }
  return res.status(500).json({
    error: "AI request failed.",
    code: "upstream_error",
  });
}

function aiErrorPayload(error: unknown) {
  if (error instanceof AiServiceError) {
    return {
      error: error.message,
      code: error.code,
      ...(error.status ? { upstreamStatus: error.status } : {}),
    };
  }
  return { error: "AI request failed.", code: "upstream_error" };
}

export function createAiRouter() {
  const router = Router();

  router.get("/status", (_req, res) => {
    try {
      const config = getResolvedAiConfig();
      return res.json({
        configured: true,
        baseURL: config.baseURL,
        model: config.model,
      });
    } catch (error) {
      if (error instanceof AiServiceError && (error.code === "not_configured" || error.code === "invalid_config")) {
        return res.json({ configured: false });
      }
      return sendAiError(res, error);
    }
  });

  router.post("/models", async (req, res) => {
    const config = req.body?.config as Partial<AiRequestConfig> | undefined;
    try {
      return res.json({ models: await listAiModels(config) });
    } catch (error) {
      return sendAiError(res, error);
    }
  });

  router.post("/test", async (req, res) => {
    const config = (req.body?.config || req.body) as Partial<AiRequestConfig> | undefined;
    const startedAt = Date.now();
    try {
      await testAiConnection(config);
      return res.json({ ok: true, latencyMs: Date.now() - startedAt });
    } catch (error) {
      return sendAiError(res, error);
    }
  });

  router.post("/summarize", async (req, res) => {
    const { title, content, snippet, config, source } = req.body || {};
    if (!title && !content && !snippet) {
      return res.status(400).json({ error: "Missing article title or content", code: "invalid_request" });
    }
    if (req.query?.stream === "1") {
      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      const send = (event: object) => res.write(`${JSON.stringify(event)}\n`);
      try {
        const summary = await summarizeArticle(
          title,
          content,
          snippet,
          config,
          source === "transcript" ? "transcript" : "article",
          (progress) => send({ type: "progress", progress }),
        );
        send({ type: "result", summary });
      } catch (error) {
        send({ type: "error", ...aiErrorPayload(error) });
      }
      return res.end();
    }
    try {
      return res.json({
        summary: await summarizeArticle(title, content, snippet, config, source === "transcript" ? "transcript" : "article"),
      });
    } catch (error) {
      return sendAiError(res, error);
    }
  });

  return router;
}
