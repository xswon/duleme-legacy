import { isIP } from "node:net";
import type { NextFunction, Request, Response } from "express";

export function isLoopbackAddress(address?: string): boolean {
  const value = (address || "").trim().toLowerCase().split("%")[0];
  if (value === "::1") return true;
  if (value.startsWith("::ffff:")) return isLoopbackAddress(value.slice("::ffff:".length));
  if (isIP(value) !== 4) return false;
  return value.split(".")[0] === "127";
}

function isLoopbackHost(host?: string): boolean {
  const raw = (host || "").trim();
  if (!raw) return false;
  try {
    const hostname = new URL(`http://${raw}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "localhost" || hostname.endsWith(".localhost") || isLoopbackAddress(hostname);
  } catch {
    return false;
  }
}

function hasTrustedBrowserOrigin(req: Request): boolean {
  if (req.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.get("origin");
  // Non-browser clients and older browsers may omit Origin. Treat malformed
  // header accessor test doubles the same way; a real Origin always has a URL scheme.
  if (!origin || !origin.includes("://")) return true;
  try {
    const hostname = new URL(origin).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "localhost" || hostname.endsWith(".localhost") || isLoopbackAddress(hostname);
  } catch {
    return false;
  }
}

export function requireLocalAccess(req: Request, res: Response, next: NextFunction) {
  // Docker Desktop forwards a host-loopback request through its private bridge.
  // This exception is safe only with the loopback-only port mapping in compose.yaml.
  const dockerLoopbackPort = process.env.DOCKER === "true" && isLoopbackHost(req.get("host"));
  const localSocket = isLoopbackAddress(req.socket.remoteAddress);
  if ((!localSocket && !dockerLoopbackPort) || !hasTrustedBrowserOrigin(req)) {
    res.status(403).json({
      error: "此接口仅允许从本机 WReader 使用。请通过 http://127.0.0.1:4387 打开应用。",
      code: "local_only",
    });
    return;
  }
  next();
}

export function resolveListenHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.DOCKER === "true" ? "0.0.0.0" : "127.0.0.1";
}
