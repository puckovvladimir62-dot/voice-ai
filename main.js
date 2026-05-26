const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

// Node 18 не делает Web Crypto глобальным — msedge-tts его требует
if (!globalThis.crypto) {
    globalThis.crypto = require("crypto").webcrypto;
}

const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

// ========= AUTO-UPDATE =========
autoUpdater.autoDownload    = true;   // скачать автоматически
autoUpdater.autoInstallOnAppQuit = true; // установить при закрытии

function setupAutoUpdater(win) {
    // Нашли обновление — начинаем скачивать
    autoUpdater.on("update-available", info => {
        win.webContents.send("update-status", {
            type: "downloading",
            version: info.version
        });
    });

    // Уже последняя версия
    autoUpdater.on("update-not-available", () => {
        win.webContents.send("update-status", { type: "latest" });
    });

    // Обновление скачано — спрашиваем установить сейчас
    autoUpdater.on("update-downloaded", info => {
        win.webContents.send("update-status", {
            type: "ready",
            version: info.version
        });
        dialog.showMessageBox(win, {
            type:    "info",
            title:   "Обновление готово",
            message: `Версия ${info.version} скачана.\nУстановить сейчас и перезапустить?`,
            buttons: ["Установить", "Позже"]
        }).then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall();
        });
    });

    autoUpdater.on("error", err => {
        console.error("[updater]", err.message);
    });

    // Проверяем при запуске (и потом каждые 30 мин)
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
}

// TTS runs in main process (Node.js) — browser WebSocket doesn't support custom headers.
// New instance per request: reusing one instance causes onclose to zero out the stream
// when the server drops the idle WebSocket between calls.
ipcMain.handle("tts", async (_, text, voice) => {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);

    return new Promise((resolve, reject) => {
        const chunks = [];
        audioStream.on("data",  c => chunks.push(c));
        audioStream.on("end",   () => resolve(Buffer.concat(chunks)));
        audioStream.on("error", reject);
    });
});

function createWindow() {
    Menu.setApplicationMenu(null);

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    win.loadFile("index.html");
    win.webContents.on("before-input-event", (e, input) => {
        if (input.control && input.shift && input.key === 'I') {
            win.webContents.openDevTools();
        }
    });
    win.once("ready-to-show", () => {
        if (app.isPackaged) setupAutoUpdater(win);
    });
}

app.whenReady().then(createWindow);
