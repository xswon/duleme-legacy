import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import type { Server } from "node:http";
import { createServer as createViteServer } from "vite";
import { createRssRouter } from "./server/routes/rss";
import { createProxyRouter } from "./server/routes/proxy";
import { createBidclubRouter } from "./server/routes/bidclub";
import { createAiRouter } from "./server/routes/ai";
import { createLocalPodcastRouter } from "./server/routes/localPodcast";
import { createTranscriptionRouter } from "./server/routes/transcription";
import { requireLocalAccess, resolveListenHost } from "./server/middleware/localAccess";

export function createApp() {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; media-src 'self' blob: http: https:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; font-src 'self' data:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: "5mb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api", requireLocalAccess);
  app.use("/api/rss", createRssRouter());
  app.use("/api/proxy", createProxyRouter());
  app.use("/api", (req, _res, next) => {
    if (req.url.startsWith("/proxy-image")) req.url = "/image" + req.url.slice("/proxy-image".length);
    if (req.url.startsWith("/proxy-audio")) req.url = "/audio" + req.url.slice("/proxy-audio".length);
    next();
  }, createProxyRouter());
  app.use("/api/bidclub", createBidclubRouter());
  app.use("/api/ai", createAiRouter());
  app.use("/api/local-podcast", createLocalPodcastRouter());
  app.use("/api/transcription", createTranscriptionRouter());
  return app;
}

export interface StartServerOptions {
  port?: number;
  host?: string;
  hmrPort?: number;
  staticDir?: string;
  production?: boolean;
}

export async function startServer(options: StartServerOptions = {}): Promise<Server> {
  const expressApp = createApp();
  const port = options.port ?? (Number(process.env.PORT) || 4387);
  const host = options.host ?? resolveListenHost();
  const hmrPort = options.hmrPort ?? (Number(process.env.HMR_PORT) || 4388);
  const distPath = options.staticDir ?? path.join(process.cwd(), "dist");
  const production = options.production ?? process.env.NODE_ENV === "production";

  if (production) {
    if (!fs.existsSync(distPath)) throw new Error(`Frontend build not found: ${distPath}`);
    expressApp.use(express.static(distPath));
    expressApp.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: hmrPort } },
      appType: "spa",
    });
    expressApp.use(vite.middlewares);
  }

  return new Promise<Server>((resolve, reject) => {
    const server = expressApp.listen(port, host, () => resolve(server));
    server.once("error", reject);
  });
}
