import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { startServer } from "../server.ts";

let localServer;
let localAppUrl;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function openExternal(value) {
  if (isHttpUrl(value)) await shell.openExternal(value);
}

async function ensureLocalServer(staticDirOverride) {
  if (localServer && localAppUrl) return localAppUrl;

  const localHost = "127.0.0.1";
  const staticDir = staticDirOverride || path.join(app.getAppPath(), "dist");
  localServer = await startServer({
    host: localHost,
    port: 0,
    staticDir,
    production: true,
  });

  const address = localServer.address();
  if (!address || typeof address === "string") throw new Error("Unable to resolve desktop server port");
  localAppUrl = `http://${localHost}:${address.port}`;
  return localAppUrl;
}

async function createMainWindow() {
  const appUrl = await ensureLocalServer();
  const appOrigin = new URL(appUrl).origin;

  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: "读了么",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === appOrigin) return { action: "allow" };
    } catch {
      // Fall through and deny malformed URLs.
    }
    void openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === appOrigin) return;
    } catch {
      // Fall through and prevent malformed URLs.
    }
    event.preventDefault();
    void openExternal(url);
  });

  win.once("ready-to-show", () => win.show());
  await win.loadURL(appUrl);
}

function smokeResultPath() {
  if (process.env.DULEME_SMOKE_RESULT) return process.env.DULEME_SMOKE_RESULT;
  const prefix = "--smoke-result=";
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function writeSmokeResult(value) {
  const resultPath = smokeResultPath();
  if (resultPath) fs.writeFileSync(resultPath, value, "utf8");
}

async function runSmokeTest() {
  writeSmokeResult("starting");
  const packagedStaticDir = path.join(process.resourcesPath, "app.asar", "dist");
  const appUrl = await ensureLocalServer(packagedStaticDir);
  const response = await fetch(`${appUrl}/api/health`);
  if (!response.ok) throw new Error(`Desktop smoke test failed: HTTP ${response.status}`);
  writeSmokeResult("ok");
  localServer?.close();
}

const smokeMode = process.env.DULEME_SMOKE_TEST === "1" || process.argv.includes("--smoke-test");

if (smokeMode) {
  runSmokeTest()
    .then(() => process.exit(0))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      try { writeSmokeResult(`error:${message}`); } catch { /* best effort */ }
      console.error("Duleme desktop smoke test failed", error);
      process.exit(1);
    });
} else {
  app.whenReady().then(async () => {
    await createMainWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
    });
  }).catch((error) => {
    console.error("Unable to start Duleme desktop", error);
    app.quit();
  });
}

app.on("before-quit", () => {
  localServer?.close();
  localServer = undefined;
  localAppUrl = undefined;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
