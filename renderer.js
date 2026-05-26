const { ipcRenderer } = require('electron');

// ========= SETTINGS =========
const STORAGE_KEY = 'voiceai_v1';

// ========= PROFILES =========
const FREE_API_KEY = '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';

const PROFILES = [
    { login: 'VladimirPutin', password: 'pizzafire', role: 'dev',  name: 'Разработчик'    },
    { login: 'user1',         password: '1234',       role: 'user', name: 'Пользователь 1' },
    { login: 'user2',         password: '1234',       role: 'user', name: 'Пользователь 2' },
    { login: 'user3',         password: '1234',       role: 'user', name: 'Пользователь 3' },
    { login: 'user4',         password: '1234',       role: 'user', name: 'Пользователь 4' }
];

let currentProfile = null;

const DEFAULT_CFG = {
    sttProvider:  'groq',
    sttApiKey:    '',
    llmProvider:  'groq',
    llmApiKey:    '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',
    llmBaseUrl:   '',
    systemPrompt: 'Ты хороший друг который подробно отвечает на вопросы и любит японский автопром. Ты материшься но не очень много, общаешься свободно и легко.',
    model:        'llama-3.3-70b-versatile',
    voice:        'ru-RU-SvetlanaNeural',
    threshold:    30,
    silenceMs:    2500
};

// ========= MOODS =========
const MOOD_PROMPTS = {
    '':       '',
    angry:    'Сейчас ты злой и раздражённый. Отвечаешь резко, с агрессией, можешь грубить.',
    playful:  'Сейчас ты игривый и шутливый. Подшучиваешь, иронизируешь, отвечаешь с юмором и приколами.',
    happy:    'Сейчас ты в отличном настроении — весёлый и энергичный. Отвечаешь с энтузиазмом и позитивом.',
    lazy:     'Сейчас ты очень ленивый. Отвечаешь нехотя, коротко, как будто тебя оторвали от сна.'
};

const MOODS = {
    '': {
        blob1a: '#6a3de8', blob1b: '#3d5afe', blob1c: '#7c1fff',
        blob2a: '#00d4c8', blob2b: '#0091ea', blob2c: '#00bfa5',
        glow:   '82, 113, 255'
    },
    angry: {
        blob1a: '#e53935', blob1b: '#c62828', blob1c: '#ff3d00',
        blob2a: '#ff1744', blob2b: '#b71c1c', blob2c: '#ff6d00',
        glow:   '220, 50, 50'
    },
    playful: {
        blob1a: '#e91e63', blob1b: '#9c27b0', blob1c: '#ff4081',
        blob2a: '#f06292', blob2b: '#ce93d8', blob2c: '#ea80fc',
        glow:   '233, 30, 99'
    },
    happy: {
        blob1a: '#ffa000', blob1b: '#ff6f00', blob1c: '#ffca28',
        blob2a: '#ffeb3b', blob2b: '#ff8f00', blob2c: '#fff176',
        glow:   '255, 160, 0'
    },
    lazy: {
        blob1a: '#455a64', blob1b: '#546e7a', blob1c: '#607d8b',
        blob2a: '#78909c', blob2b: '#4db6ac', blob2c: '#80cbc4',
        glow:   '96, 125, 139'
    }
};

function applyMood(mood) {
    const m = MOODS[mood] || MOODS[''];
    const r = document.documentElement;
    r.style.setProperty('--blob1-a', m.blob1a);
    r.style.setProperty('--blob1-b', m.blob1b);
    r.style.setProperty('--blob1-c', m.blob1c);
    r.style.setProperty('--blob2-a', m.blob2a);
    r.style.setProperty('--blob2-b', m.blob2b);
    r.style.setProperty('--blob2-c', m.blob2c);
    r.style.setProperty('--orb-glow', m.glow);
    document.querySelectorAll('.mood-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.mood === mood));
    cfg.mood = mood;
}

// Клики на кнопки настроения — живой предпросмотр
document.querySelectorAll('.mood-btn').forEach(btn =>
    btn.addEventListener('click', () => applyMood(btn.dataset.mood)));

// ========= PROVIDER CONFIG =========
const LLM_BASE_URLS = {
    groq:       'https://api.groq.com/openai/v1',
    openai:     'https://api.openai.com/v1',
    deepseek:   'https://api.deepseek.com/v1',
    openrouter: 'https://openrouter.ai/api/v1'
};

const LLM_MODELS = {
    groq: [
        { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — умный'   },
        { value: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B — быстрый'  },
        { value: 'gemma2-9b-it',            label: 'Gemma 2 9B'               },
        { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B'             }
    ],
    openai: [
        { value: 'gpt-4o',      label: 'GPT-4o — умный'        },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini — быстрый' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo'           },
        { value: 'o1-mini',     label: 'o1-mini'                }
    ],
    deepseek: [
        { value: 'deepseek-chat',     label: 'DeepSeek Chat — умный'     },
        { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)'    }
    ]
};

const STT_PROVIDERS = {
    groq:  { url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3' },
    openai: { url: 'https://api.openai.com/v1/audio/transcriptions',     model: 'whisper-1'        }
};

const MAX_RECORD_MS = 300000; // 5 минут

let cfg = { ...DEFAULT_CFG };
try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // Миграция со старого формата (apiKey → llmApiKey)
    if (saved.apiKey && !saved.llmApiKey) {
        saved.llmApiKey = saved.apiKey;
        delete saved.apiKey;
    }
    if (!saved.llmProvider) saved.llmProvider = 'groq';
    if (!saved.sttProvider) saved.sttProvider = 'groq';
    Object.assign(cfg, saved);
} catch {}

// ========= DOM =========
const viewLogin         = document.getElementById('viewLogin');
const viewMain          = document.getElementById('viewMain');
const viewSettings      = document.getElementById('viewSettings');
const sttProviderSelect = document.getElementById('sttProviderSelect');
const sttApiKeyInput    = document.getElementById('sttApiKeyInput');
const llmProviderSelect = document.getElementById('llmProviderSelect');
const llmApiKeyInput    = document.getElementById('llmApiKeyInput');
const llmBaseUrlRow     = document.getElementById('llmBaseUrlRow');
const llmBaseUrlInput   = document.getElementById('llmBaseUrlInput');
const llmModelSelect    = document.getElementById('llmModelSelect');
const llmModelInput     = document.getElementById('llmModelInput');
const systemPromptEl    = document.getElementById('systemPrompt');
const voiceSelect       = document.getElementById('voiceSelect');
const thresholdInput    = document.getElementById('thresholdInput');
const thresholdLabel    = document.getElementById('thresholdLabel');
const silenceInput      = document.getElementById('silenceInput');
const silenceLabel      = document.getElementById('silenceLabel');
const orbEl             = document.getElementById('orb');
const orbWrapper        = document.getElementById('orbWrapper');
const ringsEl           = document.getElementById('rings');
const statusEl          = document.getElementById('status');
const volumeFill        = document.getElementById('volumeFill');
const chatEl            = document.getElementById('chat');
const muteBtn           = document.getElementById('muteBtn');
const volLabel          = document.getElementById('volLabel');
const micSelect         = document.getElementById('micSelect');
const testMicBtn        = document.getElementById('testMicBtn');
const testStatus        = document.getElementById('testStatus');
const textInput         = document.getElementById('textInput');
const sendBtn           = document.getElementById('sendBtn');
const loginUsername     = document.getElementById('loginUsername');
const loginPassword     = document.getElementById('loginPassword');
const loginBtn          = document.getElementById('loginBtn');
const loginError        = document.getElementById('loginError');
const logoutBtn         = document.getElementById('logoutBtn');
const profileNameEl     = document.getElementById('profileName');

// ========= PROVIDER UI =========
function populateModelSelect(provider) {
    const models = LLM_MODELS[provider] || [];
    llmModelSelect.innerHTML = '';
    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        llmModelSelect.appendChild(opt);
    });
}

function onLlmProviderChange() {
    const provider = llmProviderSelect.value;
    const isCustom = provider === 'custom' || provider === 'openrouter';
    const hasPreset = LLM_MODELS[provider] !== undefined; // groq / openai / deepseek

    // Показываем поле базового URL только для OpenRouter/Custom
    llmBaseUrlRow.style.display = isCustom ? '' : 'none';
    if (provider === 'openrouter' && !llmBaseUrlInput.value) {
        llmBaseUrlInput.value = LLM_BASE_URLS.openrouter;
    }

    // Для провайдеров с предустановленными моделями — выпадашка, для остальных — текстовое поле
    if (hasPreset) {
        llmModelSelect.style.display = '';
        llmModelInput.style.display  = 'none';
        populateModelSelect(provider);
    } else {
        llmModelSelect.style.display = 'none';
        llmModelInput.style.display  = '';
    }
}

llmProviderSelect.onchange = onLlmProviderChange;

// ========= APPLY SAVED SETTINGS =========
sttProviderSelect.value    = cfg.sttProvider || 'groq';
sttApiKeyInput.value       = cfg.sttApiKey   || '';
llmProviderSelect.value    = cfg.llmProvider  || 'groq';
llmApiKeyInput.value       = cfg.llmApiKey   || '';
llmBaseUrlInput.value      = cfg.llmBaseUrl  || '';
systemPromptEl.value       = cfg.systemPrompt;
voiceSelect.value          = cfg.voice;
thresholdInput.value       = cfg.threshold;
thresholdLabel.textContent = cfg.threshold;
silenceInput.value         = cfg.silenceMs;
silenceLabel.textContent   = cfg.silenceMs;

// Применяем сохранённое настроение
applyMood(cfg.mood || '');

// Инициализируем UI провайдера и выставляем сохранённую модель
onLlmProviderChange();
const _hasPresetOnLoad = LLM_MODELS[cfg.llmProvider] !== undefined;
if (_hasPresetOnLoad) {
    llmModelSelect.value = cfg.model;
} else {
    llmModelInput.value = cfg.model;
}

// ========= VIEWS =========
function showView(name) {
    viewLogin.classList.toggle('view--hidden',    name !== 'login');
    viewMain.classList.toggle('view--hidden',     name !== 'main');
    viewSettings.classList.toggle('view--hidden', name !== 'settings');
    if (name === 'settings') {
        applyRoleToSettings();
        loadMicDevices();
    }
}

function applyRoleToSettings() {
    if (!currentProfile) return;
    viewSettings.classList.toggle('user-mode', currentProfile.role !== 'dev');
    profileNameEl.textContent = currentProfile.name;
}

document.getElementById('openSettings').onclick  = () => showView('settings');
document.getElementById('closeSettings').onclick = () => showView('main');

// ========= LOGIN / LOGOUT =========
function doLogin() {
    const login   = (loginUsername.value || '').trim();
    const pass    = loginPassword.value || '';
    const profile = PROFILES.find(p => p.login === login && p.password === pass);
    if (!profile) {
        loginError.textContent = 'Неверный логин или пароль';
        loginPassword.value = '';
        loginPassword.focus();
        return;
    }
    currentProfile         = profile;
    loginError.textContent = '';
    loginUsername.value    = '';
    loginPassword.value    = '';

    if (profile.role !== 'dev') {
        // Для обычного пользователя — заблокировать API
        cfg.llmApiKey        = FREE_API_KEY;
        cfg.sttProvider      = 'groq';
        cfg.llmProvider      = 'groq';
        cfg.model            = DEFAULT_CFG.model;
        llmApiKeyInput.value    = '';
        sttApiKeyInput.value    = '';
        llmProviderSelect.value = 'groq';
        sttProviderSelect.value = 'groq';
        onLlmProviderChange();
    }

    showView('main');
    initVAD().catch(err => {
        statusEl.textContent = 'Нет доступа к микрофону: ' + err.message;
        orbEl.className = 'orb error';
    });
}

loginBtn.onclick = doLogin;
loginUsername.addEventListener('keydown', e => { if (e.key === 'Enter') loginPassword.focus(); });
loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

logoutBtn.onclick = () => {
    currentProfile = null;
    isRecording    = false;
    isProcessing   = false;
    clearTimeout(silenceTimer);
    silenceTimer = null;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch (e) {}
    }
    stopSpeaking();
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (audioCtx)  { audioCtx.close().catch(() => {}); audioCtx = null; analyser = null; }
    history          = [];
    chatEl.innerHTML = '';
    setOrbState('idle');
    showView('login');
    setTimeout(() => loginUsername.focus(), 100);
};

thresholdInput.oninput = () => { thresholdLabel.textContent = thresholdInput.value; };
silenceInput.oninput   = () => { silenceLabel.textContent   = silenceInput.value; };

document.getElementById('saveSettings').onclick = () => {
    const prevMic = cfg.micId;
    const isUser  = currentProfile && currentProfile.role !== 'dev';

    if (isUser) {
        // Обычный пользователь: только базовые настройки
        cfg.voice     = voiceSelect.value;
        cfg.threshold = parseInt(thresholdInput.value);
        cfg.silenceMs = parseInt(silenceInput.value);
        cfg.micId     = micSelect.value;
        // API ключ всегда заблокирован
        cfg.llmApiKey   = FREE_API_KEY;
        cfg.sttProvider = 'groq';
        cfg.llmProvider = 'groq';
        cfg.model       = DEFAULT_CFG.model;
    } else {
        const hasPreset = LLM_MODELS[llmProviderSelect.value] !== undefined;
        cfg = {
            sttProvider:  sttProviderSelect.value,
            sttApiKey:    sttApiKeyInput.value.trim(),
            llmProvider:  llmProviderSelect.value,
            llmApiKey:    llmApiKeyInput.value.trim() || DEFAULT_CFG.llmApiKey,
            llmBaseUrl:   llmBaseUrlInput.value.trim(),
            model:        hasPreset
                            ? (llmModelSelect.value || DEFAULT_CFG.model)
                            : (llmModelInput.value.trim() || 'gpt-4o'),
            systemPrompt: systemPromptEl.value.trim() || DEFAULT_CFG.systemPrompt,
            voice:        voiceSelect.value,
            threshold:    parseInt(thresholdInput.value),
            silenceMs:    parseInt(silenceInput.value),
            bgColor:      cfg.bgColor,
            mood:         cfg.mood || '',
            micId:        micSelect.value
        };
    }
    if (prevMic !== cfg.micId) restartVAD();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    showView('main');
    setStatus('Настройки сохранены');
    setTimeout(() => { if (!isProcessing) setStatus(STATUS_TEXT.idle); }, 1500);
};

document.getElementById('clearChat').onclick = () => {
    chatEl.innerHTML = '';
    history = [];
};

// ========= MUTE =========
let isMuted = false;

muteBtn.onclick = () => {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🎤';
    muteBtn.title = isMuted ? 'Включить микрофон' : 'Выключить микрофон';
    muteBtn.classList.toggle('muted', isMuted);
    if (isMuted) {
        if (isRecording) stopCapture();
        setOrbState('muted');
    } else {
        setOrbState('idle');
    }
};

// ========= BACKGROUND COLOR =========
function applyBgColor(color) {
    document.documentElement.style.setProperty('--bg', color);
    cfg.bgColor = color;
    document.querySelectorAll('.swatch:not(.swatch--custom)').forEach(s => {
        s.classList.toggle('active', s.dataset.color === color);
    });
}

if (cfg.bgColor) {
    applyBgColor(cfg.bgColor);
    const customInput = document.getElementById('customColor');
    if (customInput) customInput.value = cfg.bgColor;
}

document.querySelectorAll('.swatch[data-color]').forEach(s => {
    s.onclick = () => applyBgColor(s.dataset.color);
});
document.getElementById('customColor').oninput = e => applyBgColor(e.target.value);

// ========= ORB STATE =========
const STATUS_TEXT = {
    idle:      'Говори — я слушаю',
    listening: 'Слушаю...',
    thinking:  'Думаю...',
    speaking:  'Отвечаю...',
    error:     'Ошибка — говори снова',
    muted:     'Микрофон выключен'
};

let ORB_STATE = 'idle';

function setOrbState(state) {
    ORB_STATE = state;
    orbEl.className = 'orb' + (state !== 'idle' ? ' ' + state : '');
    ringsEl.className = 'rings' + (state === 'listening' || state === 'speaking' ? ' ' + state : '');
    setStatus(STATUS_TEXT[state] || '');
}

function setStatus(text) { statusEl.textContent = text; }

// ========= CONVERSATION HISTORY =========
let history = [];
const MAX_HISTORY = 14;

function pushHistory(role, content) {
    history.push({ role, content });
    if (history.length > MAX_HISTORY) history.splice(0, 2);
}

// ========= VAD =========
const MIN_BLOB_SIZE = 900;

let audioCtx, analyser, dataArray;
let micStream, mediaRecorder;
let chunks = [];
let isRecording  = false;
let isProcessing = false;
let silenceTimer = null;

async function loadMicDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    micSelect.innerHTML = '';
    mics.forEach((mic, i) => {
        const opt = document.createElement('option');
        opt.value = mic.deviceId;
        opt.textContent = mic.label || `Микрофон ${i + 1}`;
        if (mic.deviceId === cfg.micId) opt.selected = true;
        micSelect.appendChild(opt);
    });
}

async function restartVAD() {
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    if (audioCtx)  { await audioCtx.close(); audioCtx = null; }
    await initVAD();
}

testMicBtn.onclick = async () => {
    testMicBtn.textContent = '⏺ Запись 3с...';
    testMicBtn.classList.add('recording');
    testStatus.textContent = 'Говори в микрофон...';

    const constraints = { audio: cfg.micId ? { deviceId: { exact: cfg.micId } } : true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const rec = new MediaRecorder(stream);
    const ch  = [];
    rec.ondataavailable = e => ch.push(e.data);
    rec.start();

    await new Promise(r => setTimeout(r, 3000));
    rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(ch, { type: 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
        testMicBtn.textContent = '▶ Тест';
        testMicBtn.classList.remove('recording');
        testStatus.textContent = '▶ Воспроизведение — слышишь себя?';
        setTimeout(() => { testStatus.textContent = ''; }, 5000);
    };
    rec.stop();
};

async function initVAD() {
    const constraints = { audio: cfg.micId ? { deviceId: { exact: cfg.micId } } : true, video: false };
    micStream = await navigator.mediaDevices.getUserMedia(constraints);
    audioCtx  = new AudioContext();
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    audioCtx.createMediaStreamSource(micStream).connect(analyser);
    setOrbState('idle');
    requestAnimationFrame(vadLoop);
}

function getVolume() {
    analyser.getByteFrequencyData(dataArray);
    return dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
}

function vadLoop() {
    if (!analyser) return;   // остановить цикл после выхода
    const vol  = getVolume();
    const norm = Math.min(vol / (cfg.threshold * 2.5), 1);

    volumeFill.style.width = (norm * 100) + '%';
    volLabel.textContent = `${Math.round(vol)} / ${cfg.threshold}`;

    orbWrapper.style.transform = (isRecording && !isProcessing)
        ? `scale(${1 + norm * 0.2})`
        : 'scale(1)';

    if (!isMuted) {
        if (vol > cfg.threshold) {
            if (!isRecording) {
                if (ORB_STATE === 'speaking') {
                    isInterrupted = true;
                    isProcessing  = false;
                    stopSpeaking();
                    startCapture();
                } else if (!isProcessing) {
                    startCapture();
                }
            } else {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }
        } else if (isRecording && !silenceTimer) {
            silenceTimer = setTimeout(stopCapture, cfg.silenceMs);
        }
    }

    requestAnimationFrame(vadLoop);
}

function startCapture() {
    isRecording = true;
    chunks = [];
    mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.start(100);
    setOrbState('listening');
    setTimeout(() => { if (isRecording) stopCapture(); }, MAX_RECORD_MS);
}

function stopCapture() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    isRecording = false;
    clearTimeout(silenceTimer);
    silenceTimer = null;
    mediaRecorder.onstop = handleAudio;
    mediaRecorder.stop();
}

async function handleAudio() {
    const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
    if (blob.size < MIN_BLOB_SIZE) {
        setOrbState('idle');
        return;
    }

    isProcessing  = true;
    isInterrupted = false;
    setOrbState('thinking');

    const safetyTimer = setTimeout(() => {
        isProcessing = false;
        setOrbState('error');
        setTimeout(() => { if (!isProcessing) setOrbState('idle'); }, 2500);
    }, 45000);

    try {
        const text = await transcribe(blob);
        if (!text || text.trim().length < 2) {
            setOrbState('idle');
            return;
        }

        addMsg('user', 'Ты', text);
        pushHistory('user', text);

        const reply = await sendToAI();
        addMsg('ai', 'ИИ', reply);
        pushHistory('assistant', reply);

        setOrbState('speaking');
        await speak(reply);
        if (!isInterrupted) setOrbState('idle');

    } catch (err) {
        console.error(err);
        addMsg('error', '⚠', err.message);
        setOrbState('error');
        setTimeout(() => { if (!isProcessing) setOrbState('idle'); }, 2500);
    } finally {
        clearTimeout(safetyTimer);
        isProcessing = false;
    }
}

// ========= API =========
function fetchWithTimeout(url, options, ms = 20000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal })
        .finally(() => clearTimeout(timer));
}

async function transcribe(blob) {
    const stt    = STT_PROVIDERS[cfg.sttProvider] || STT_PROVIDERS.groq;
    const apiKey = cfg.sttApiKey || cfg.llmApiKey;

    const form = new FormData();
    form.append('file', blob, 'audio.webm');
    form.append('model', stt.model);
    form.append('language', 'ru');

    const res = await fetchWithTimeout(stt.url, {
        method:  'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body:    form
    }, 30000);

    const d = await res.json();
    if (d.error) throw new Error('STT: ' + d.error.message);
    return d.text;
}

async function sendToAI() {
    // Вычисляем базовый URL
    let baseUrl;
    if (cfg.llmProvider === 'custom') {
        baseUrl = (cfg.llmBaseUrl || '').replace(/\/$/, '');
    } else if (cfg.llmProvider === 'openrouter') {
        baseUrl = (cfg.llmBaseUrl || LLM_BASE_URLS.openrouter).replace(/\/$/, '');
    } else {
        baseUrl = LLM_BASE_URLS[cfg.llmProvider] || LLM_BASE_URLS.groq;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.llmApiKey}`
    };

    // OpenRouter требует эти заголовки
    if (cfg.llmProvider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://voice-ai.local';
        headers['X-Title']      = 'Voice AI Desktop';
    }

    const moodNote = MOOD_PROMPTS[cfg.mood || ''];
    const systemContent = moodNote
        ? cfg.systemPrompt + '\n\n' + moodNote
        : cfg.systemPrompt;

    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method:  'POST',
        headers,
        body:    JSON.stringify({
            model:    cfg.model,
            messages: [
                { role: 'system', content: systemContent },
                ...history
            ]
        })
    }, 30000);

    const d = await res.json();
    if (d.error) throw new Error('LLM: ' + d.error.message);
    return d.choices[0].message.content;
}

// ========= TEXT INPUT =========
async function sendTextMessage() {
    const text = textInput.value.trim();
    if (!text || isProcessing) return;

    textInput.value = '';
    // Если идёт запись — остановить её
    if (isRecording) { isInterrupted = true; stopCapture(); }
    // Если ИИ говорит — перебить
    if (ORB_STATE === 'speaking') { isInterrupted = true; stopSpeaking(); }

    isProcessing  = true;
    isInterrupted = false;
    addMsg('user', 'Ты', text);
    pushHistory('user', text);
    setOrbState('thinking');

    const safetyTimer = setTimeout(() => {
        isProcessing = false;
        setOrbState('error');
        setTimeout(() => { if (!isProcessing) setOrbState('idle'); }, 2500);
    }, 45000);

    try {
        const reply = await sendToAI();
        addMsg('ai', 'ИИ', reply);
        pushHistory('assistant', reply);
        setOrbState('speaking');
        await speak(reply);
        if (!isInterrupted) setOrbState('idle');
    } catch (err) {
        console.error(err);
        addMsg('error', '⚠', err.message);
        setOrbState('error');
        setTimeout(() => { if (!isProcessing) setOrbState('idle'); }, 2500);
    } finally {
        clearTimeout(safetyTimer);
        isProcessing = false;
    }
}

sendBtn.onclick = sendTextMessage;
textInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendTextMessage(); });

// ========= TTS (Microsoft Edge Neural via main process IPC) =========
let currentAudio  = null;
let speakResolve  = null;
let isInterrupted = false;
let speakGen      = 0;

function splitSentences(text) {
    const parts = text.match(/[^.!?\n]+[.!?\n]*/g);
    return parts ? parts.map(s => s.trim()).filter(s => s.length > 1) : [text];
}

async function speak(text) {
    const gen = ++speakGen;
    const voice = cfg.voice || DEFAULT_CFG.voice;
    const sentences = splitSentences(text);
    if (!sentences.length) return;

    try {
        let nextBuf = ipcRenderer.invoke('tts', sentences[0], voice);

        for (let i = 0; i < sentences.length; i++) {
            if (gen !== speakGen) break;

            const buf = await nextBuf;
            if (gen !== speakGen) break;

            if (i + 1 < sentences.length) {
                nextBuf = ipcRenderer.invoke('tts', sentences[i + 1], voice);
            }

            if (!buf || (buf.byteLength ?? buf.length) === 0) continue;

            const blob = new Blob([buf], { type: 'audio/mpeg' });
            const url  = URL.createObjectURL(blob);
            await new Promise(resolve => {
                speakResolve = resolve;
                currentAudio = new Audio(url);
                const done = () => {
                    URL.revokeObjectURL(url);
                    currentAudio = null;
                    speakResolve = null;
                    resolve();
                };
                currentAudio.onended = done;
                currentAudio.onerror = done;
                currentAudio.play().catch(done);
            });
        }
    } catch (err) {
        console.error('[TTS] error:', err);
    }
}

function stopSpeaking() {
    speakGen++;
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if (speakResolve) { const fn = speakResolve; speakResolve = null; fn(); }
}

// ========= CHAT UI =========
function addMsg(type, role, text) {
    const div = document.createElement('div');
    div.className = 'message ' + type;
    div.innerHTML = `<span class="message-role">${role}</span><span>${esc(text)}</span>`;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
}

function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ========= INIT =========
showView('login');
setTimeout(() => loginUsername.focus(), 50);
