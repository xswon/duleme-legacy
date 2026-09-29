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

async function ensureLocalServer() {
  if (localServer && localAppUrl) return localAppUrl;

  const localHost = "127.0.0.1";
  const staticDir = path.join(app.getAppPath(), "dist");
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

app.whenReady().then(async () => {
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
}).catch((error) => {
  console.error("Unable to start Duleme desktop", error);
  app.quit();
});

app.on("before-quit", () => {
  localServer?.close();
  localServer = undefined;
  localAppUrl = undefined;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
