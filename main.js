const path = require('path');
const { app, BrowserWindow, ipcMain, Menu, dialog,
        globalShortcut, Notification, shell } = require('electron');
const { autoUpdater } = require('electron-updater');

if (!globalThis.crypto) {
    globalThis.crypto = require('crypto').webcrypto;
}

const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// ========= AUTO-UPDATE =========
autoUpdater.autoDownload         = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater(win) {
    autoUpdater.on('update-available', info => {
        win.webContents.send('update-status', { type: 'downloading', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
        win.webContents.send('update-status', { type: 'latest' });
    });
    autoUpdater.on('update-downloaded', info => {
        win.webContents.send('update-status', { type: 'ready', version: info.version });
        dialog.showMessageBox(win, {
            type: 'info', title: 'Обновление готово',
            message: `Версия ${info.version} скачана.\nУстановить сейчас и перезапустить?`,
            buttons: ['Установить', 'Позже']
        }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(); });
    });
    autoUpdater.on('error', err => console.error('[updater]', err.message));
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
}

// ========= IPC: TTS (Edge) =========
ipcMain.handle('tts', async (_, text, voice) => {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);
    return new Promise((resolve, reject) => {
        const chunks = [];
        audioStream.on('data',  c => chunks.push(c));
        audioStream.on('end',   () => resolve(Buffer.concat(chunks)));
        audioStream.on('error', reject);
    });
});

// ========= IPC: RUN PROCESS =========
ipcMain.handle('run-process', async (_, filePath, args) => {
    const { spawn } = require('child_process');
    return new Promise(resolve => {
        try {
            const parts = args ? args.trim().split(/\s+/).filter(Boolean) : [];
            const proc  = spawn(filePath, parts, { detached: true, stdio: 'ignore', shell: true });
            proc.unref();
            resolve({ ok: true });
        } catch (e) {
            resolve({ ok: false, error: e.message });
        }
    });
});

// ========= IPC: OPEN FILE / URL =========
ipcMain.handle('open-path', async (_, target) => {
    if (/^https?:\/\//i.test(target)) {
        await shell.openExternal(target);
    } else {
        await shell.openPath(target);
    }
});

// ========= IPC: WINDOWS NOTIFICATION =========
ipcMain.handle('notify', (_, title, body) => {
    if (Notification.isSupported()) {
        new Notification({ title, body, silent: true }).show();
    }
});

// ========= WINDOW =========
let win = null;

function createWindow() {
    Menu.setApplicationMenu(null);

    win = new BrowserWindow({
        width: 1200, height: 800,
        webPreferences: {
            nodeIntegration:    true,
            contextIsolation:   false,
            webSecurity:        false
        }
    });

    win.loadFile('index.html');

    // Ctrl+Shift+I → DevTools
    win.webContents.on('before-input-event', (e, input) => {
        if (input.control && input.shift && input.key === 'I') {
            win.webContents.openDevTools();
        }
    });

    win.once('ready-to-show', () => {
        if (app.isPackaged) setupAutoUpdater(win);
    });
}

// ========= GLOBAL HOTKEY =========
function registerHotkey() {
    const ret = globalShortcut.register('Ctrl+Alt+V', () => {
        if (!win) return;
        if (win.isVisible() && win.isFocused()) win.minimize();
        else { win.show(); win.focus(); win.webContents.send('hotkey-triggered'); }
    });
    if (!ret) console.warn('[hotkey] Ctrl+Alt+V не удалось зарегистрировать');
}

app.whenReady().then(() => {
    createWindow();
    registerHotkey();
});

app.on('before-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    app.quit();
});
