import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpcHandlers } from "./ipc";

const isDev = !!process.env["ELECTRON_RENDERER_URL"];

function getDirname(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  return fileURLToPath(new URL(".", import.meta.url));
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(getDirname(), "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    const devUrl = process.env["ELECTRON_RENDERER_URL"] as string;
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(join(getDirname(), "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers(ipcMain);

  // Allow renderer to use Local Font Access API (queryLocalFonts) for the
  // settings page font picker.
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      if ((permission as string) === "local-fonts") {
        callback(true);
        return;
      }
      callback(false);
    }
  );

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
