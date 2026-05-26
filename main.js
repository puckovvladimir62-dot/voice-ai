const { app, BrowserWindow, ipcMain, Menu } = require("electron");

// Node 18 не делает Web Crypto глобальным — msedge-tts его требует
if (!globalThis.crypto) {
    globalThis.crypto = require("crypto").webcrypto;
}

const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

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
}

app.whenReady().then(createWindow);
