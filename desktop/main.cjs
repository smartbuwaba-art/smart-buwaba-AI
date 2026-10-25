const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

const APP_URL = "https://smart-buwaba-ai-app.vercel.app/";
const APP_ORIGIN = new URL(APP_URL).origin;
const INTERNAL_HOSTS = new Set([
  "smart-buwaba-ai-app.vercel.app",
  "accounts.google.com",
  "myaccount.google.com"
]);
const EXTERNAL_URLS = Object.freeze({
  youtube_music: "https://music.youtube.com/",
  youtube: "https://www.youtube.com/",
  spotify: "https://open.spotify.com/",
  whatsapp: "https://web.whatsapp.com/",
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
  google_maps: "https://maps.google.com/",
  gmail: "https://mail.google.com/",
  chrome: "https://www.google.com/",
  play_store: "https://play.google.com/store",
  chatgpt: "https://chatgpt.com/"
});
const WINDOWS_COMMANDS = Object.freeze({
  calculator: { command: "calc.exe", args: [] },
  notepad: { command: "notepad.exe", args: [] },
  file_explorer: { command: "explorer.exe", args: [] },
  task_manager: { command: "taskmgr.exe", args: [] },
  paint: { command: "mspaint.exe", args: [] }
});

function isAllowedInternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" &&
      (INTERNAL_HOSTS.has(url.hostname) || url.hostname.endsWith(".firebaseapp.com"));
  } catch {
    return false;
  }
}

function isTrustedAppSender(frameUrl) {
  try {
    return new URL(frameUrl).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function launchWindowsCommand(command, args) {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const child = spawn(command, args, {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
        shell: false
      });
      child.once("spawn", () => {
        child.unref();
        finish(true);
      });
      child.once("error", () => finish(false));
    } catch {
      finish(false);
    }
  });
}

async function openApprovedApp(appName) {
  if (typeof appName !== "string") return false;
  const key = appName.trim().toLowerCase();

  if (Object.hasOwn(EXTERNAL_URLS, key)) {
    try {
      await shell.openExternal(EXTERNAL_URLS[key]);
      return true;
    } catch {
      return false;
    }
  }

  if (Object.hasOwn(WINDOWS_COMMANDS, key)) {
    const item = WINDOWS_COMMANDS[key];
    return launchWindowsCommand(item.command, item.args);
  }

  if (key === "settings") {
    try {
      await shell.openExternal("ms-settings:");
      return true;
    } catch {
      return false;
    }
  }

  if (key === "camera") {
    try {
      await shell.openExternal("microsoft.windows.camera:");
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    title: "Smart Buwaba AI",
    backgroundColor: "#03070b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedInternalUrl(url)) return { action: "allow" };
    // Do not send arbitrary links to the operating system.
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, targetUrl) => {
    try {
      const target = new URL(targetUrl);
      if (target.origin === APP_ORIGIN || isAllowedInternalUrl(targetUrl)) return;
      event.preventDefault();
      // External browser navigation is restricted to HTTPS.
      if (target.protocol === "https:") void shell.openExternal(targetUrl).catch(() => {});
    } catch {
      event.preventDefault();
    }
  });

  window.loadURL(APP_URL);
  return window;
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.smartbuwaba.desktop");

  // Grant microphone access only to the actual Smart Buwaba web origin.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents?.getURL() || "";
    const isVoiceRequest = permission === "media" &&
      Array.isArray(details?.mediaTypes) &&
      details.mediaTypes.includes("audio");
    callback(isTrustedAppSender(requestingUrl) && isVoiceRequest);
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return permission === "media" && requestingOrigin === APP_ORIGIN;
  });

  ipcMain.handle("smart-buwaba:open-app", async (event, appName) => {
    if (!isTrustedAppSender(event.senderFrame?.url || event.sender.getURL())) return false;
    return openApprovedApp(appName);
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
