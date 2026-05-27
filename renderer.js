const { ipcRenderer } = require('electron');
const _cfg = require('./config');
const { createClient } = require('@supabase/supabase-js');
const { marked } = require('marked');

// Настраиваем marked: переносы строк, GFM-разметка
marked.setOptions({ breaks: true, gfm: true });

// ========= SETTINGS =========
const STORAGE_KEY = 'voiceai_v1';

// ========= AUTH / API KEYS =========
const FREE_API_KEY     = _cfg.FREE_API_KEY;
const YANDEX_TTS_KEY   = _cfg.YANDEX_TTS_KEY;
const YANDEX_FOLDER_ID = _cfg.YANDEX_FOLDER_ID;
const DEV_EMAIL        = _cfg.DEV_EMAIL;

const supabase = createClient(_cfg.SUPABASE_URL, _cfg.SUPABASE_KEY);

let currentProfile = null; // { email, role, name }
let serverKeys     = {};   // Ключи из Supabase app_config — только в памяти, не на диске

const DEFAULT_QUICK_PROMPTS = [
    { id: 'qp1', label: '🌍 Переведи на английский', text: 'Переведи на английский: ' },
    { id: 'qp2', label: '✏️ Исправь текст',          text: 'Исправь ошибки в тексте: ' },
    { id: 'qp3', label: '💡 Придумай идеи',           text: 'Придумай 5 интересных идей на тему: ' },
    { id: 'qp4', label: '📝 Кратко',                  text: 'Объясни кратко и простыми словами: ' }
];

const DEFAULT_COMMANDS = [
    {
        id: 'dc1', name: 'Открыть калькулятор',
        trigger: 'открой калькулятор',
        action: 'run', path: 'calc.exe', args: '',
        response: 'Открываю калькулятор'
    },
    {
        id: 'dc2', name: 'Открыть YouTube',
        trigger: 'открой ютуб',
        action: 'open', path: 'https://youtube.com', args: '',
        response: 'Открываю YouTube'
    }
];

const DEFAULT_CFG = {
    sttProvider:    'groq',
    sttApiKey:      '',
    llmProvider:    'groq',
    llmApiKey:      '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',
    llmBaseUrl:     '',
    systemPrompt:   'Ты хороший друг который подробно отвечает на вопросы и любит японский автопром. Ты материшься но не очень много, общаешься свободно и легко.',
    model:          'llama-3.3-70b-versatile',
    ttsProvider:    'yandex',
    yandexTtsKey:   YANDEX_TTS_KEY,
    yandexFolderId: YANDEX_FOLDER_ID,
    voice:          'alena',
    threshold:      30,
    silenceMs:      2500,
    commands:       DEFAULT_COMMANDS,
    quickPrompts:   DEFAULT_QUICK_PROMPTS,
    wakeWords:      ['орб', 'orb', 'orb voice']
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
    ],
    gemini: [
        { value: 'gemini-1.5-flash-latest',          label: 'Gemini 1.5 Flash — стабильный 🎤'         },
        { value: 'gemini-1.5-flash-8b',            label: 'Gemini 1.5 Flash 8B — лёгкий 🎤'          },
        { value: 'gemini-2.0-flash',               label: 'Gemini 2.0 Flash — быстрый 🎤'            },
        { value: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash — умный 🎤 (preview)'    }
    ]
};

// ========= TTS VOICES =========
const TTS_VOICES = {
    groq: [
        { value: 'Celeste-PlayAI',   label: 'Celeste — женский, мягкий'        },
        { value: 'Arista-PlayAI',    label: 'Arista — женский, живой'          },
        { value: 'Eleanor-PlayAI',   label: 'Eleanor — женский, чёткий'        },
        { value: 'Jennifer-PlayAI',  label: 'Jennifer — женский, тёплый'       },
        { value: 'Isla-PlayAI',      label: 'Isla — женский, молодой'          },
        { value: 'Fritz-PlayAI',     label: 'Fritz — мужской, чёткий'          },
        { value: 'Atlas-PlayAI',     label: 'Atlas — мужской, глубокий'        },
        { value: 'Chip-PlayAI',      label: 'Chip — мужской, молодой'          },
        { value: 'Mason-PlayAI',     label: 'Mason — мужской, спокойный'       },
        { value: 'Mikail-PlayAI',    label: 'Mikail — мужской, энергичный'     }
    ],
    edge: [
        { value: 'ru-RU-SvetlanaNeural', label: 'Светлана — женский'           },
        { value: 'ru-RU-DmitryNeural',   label: 'Дмитрий — мужской'            }
    ],
    yandex: [
        { value: 'alena',  label: 'Алёна — женский (нейросеть)'                },
        { value: 'filipp', label: 'Филипп — мужской (нейросеть)'               },
        { value: 'jane',   label: 'Джейн — женский, эмоциональный'             },
        { value: 'omazh',  label: 'Омаж — женский, дружелюбный'                },
        { value: 'ermil',  label: 'Ермил — мужской, эмоциональный'             },
        { value: 'zahar',  label: 'Захар — мужской'                            }
    ]
};

const STT_PROVIDERS = {
    groq:  { url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3' },
    openai: { url: 'https://api.openai.com/v1/audio/transcriptions',     model: 'whisper-1'        }
};

const MAX_RECORD_MS = 300000; // 5 минут

// ========= BROWSER STT STATE =========
let recognition = null;   // SpeechRecognition instance
let sttPaused   = false;  // true пока TTS говорит — не перебиваем сами себя

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
    // Откат с Gemini на Groq (Gemini заблокирован в РФ)
    if (saved.llmProvider === 'gemini') {
        saved.llmProvider = 'groq';
        saved.llmApiKey   = FREE_API_KEY;
        saved.model       = 'llama-3.3-70b-versatile';
    }
    // Groq TTS по умолчанию если ещё не выбрано
    if (!saved.ttsProvider || saved.ttsProvider === 'edge') {
        saved.ttsProvider = 'groq';
        saved.voice       = 'Celeste-PlayAI';
    }
    if (!saved.yandexTtsKey)   saved.yandexTtsKey   = YANDEX_TTS_KEY;
    if (!saved.yandexFolderId) saved.yandexFolderId = YANDEX_FOLDER_ID;
    if (!saved.wakeWords || !saved.wakeWords.length) saved.wakeWords = DEFAULT_CFG.wakeWords;
    Object.assign(cfg, saved);
} catch {}

// ========= DOM =========
const viewLogin         = document.getElementById('viewLogin');
const viewMain          = document.getElementById('viewMain');
const viewSettings      = document.getElementById('viewSettings');
const viewCommands      = document.getElementById('viewCommands');
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
const ttsProviderSelect  = document.getElementById('ttsProviderSelect');
const yandexTtsKeyInput  = document.getElementById('yandexTtsKeyInput');
const yandexFolderIdInput= document.getElementById('yandexFolderIdInput');
const yandexTtsFields    = document.getElementById('yandexTtsFields');
const loginEmail        = document.getElementById('loginEmail');
const loginPassword     = document.getElementById('loginPassword');
const loginBtn          = document.getElementById('loginBtn');
const loginError        = document.getElementById('loginError');
const rememberMe        = document.getElementById('rememberMe');
const logoutBtn         = document.getElementById('logoutBtn');
const profileNameEl     = document.getElementById('profileName');
// Форма регистрации
const tabLogin          = document.getElementById('tabLogin');
const tabRegister       = document.getElementById('tabRegister');
const formLogin         = document.getElementById('formLogin');
const formRegister      = document.getElementById('formRegister');
const regName           = document.getElementById('regName');
const regEmail          = document.getElementById('regEmail');
const regPassword       = document.getElementById('regPassword');
const regBtn            = document.getElementById('regBtn');
const regError          = document.getElementById('regError');
const regSuccess        = document.getElementById('regSuccess');

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

function onTtsProviderChange() {
    const provider = ttsProviderSelect.value;
    const voices   = TTS_VOICES[provider] || TTS_VOICES.edge;
    const prev     = voiceSelect.value;
    voiceSelect.innerHTML = '';
    voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.value;
        opt.textContent = v.label;
        voiceSelect.appendChild(opt);
    });
    // Пробуем восстановить прежний выбор
    if ([...voiceSelect.options].some(o => o.value === prev)) voiceSelect.value = prev;
    if (yandexTtsFields) yandexTtsFields.style.display = provider === 'yandex' ? '' : 'none';
}
ttsProviderSelect.onchange = onTtsProviderChange;

// ========= APPLY SAVED SETTINGS =========
sttProviderSelect.value    = cfg.sttProvider || 'groq';
sttApiKeyInput.value       = cfg.sttApiKey   || '';
llmProviderSelect.value    = cfg.llmProvider  || 'groq';
llmApiKeyInput.value       = cfg.llmApiKey   || '';
llmBaseUrlInput.value      = cfg.llmBaseUrl  || '';
systemPromptEl.value       = cfg.systemPrompt;
thresholdInput.value       = cfg.threshold;
thresholdLabel.textContent = cfg.threshold;
silenceInput.value         = cfg.silenceMs;
silenceLabel.textContent   = cfg.silenceMs;

// Применяем TTS провайдер и голос
ttsProviderSelect.value    = cfg.ttsProvider    || 'edge';
yandexTtsKeyInput.value    = cfg.yandexTtsKey   || '';
yandexFolderIdInput.value  = cfg.yandexFolderId || '';
onTtsProviderChange();
voiceSelect.value = cfg.voice;

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
    viewCommands.classList.toggle('view--hidden', name !== 'commands');
    if (name === 'settings') {
        applyRoleToSettings();
        loadMicDevices();
        renderQuickPromptsSettings();
        updateApiKeySection();
    }
    if (name === 'commands') {
        renderCommandsView();
    }
}

function applyRoleToSettings() {
    if (!currentProfile) return;
    // Все пользователи равны — никаких ролевых ограничений
    viewSettings.classList.remove('user-mode', 'dev-mode');
    profileNameEl.textContent = currentProfile.name;
}

document.getElementById('openSettings').onclick  = () => showView('settings');
document.getElementById('closeSettings').onclick = () => showView('main');
document.getElementById('openCommands').onclick  = () => showView('commands');
document.getElementById('closeCommands').onclick = () => showView('main');

// ========= USER PROVIDER / API KEY SECTION =========
const USER_MODEL_DEFAULTS = {
    deepseek:   'deepseek-chat',
    groq:       'llama-3.3-70b-versatile',
    openai:     'gpt-4o-mini',
    openrouter: ''
};
const USER_KEY_PLACEHOLDERS = {
    deepseek:   'sk-... (свой ключ DeepSeek)',
    groq:       'gsk_...',
    openai:     'sk-...',
    openrouter: 'sk-or-...'
};

function updateApiKeySection() {
    const provider    = cfg.llmProvider;
    const isFree      = provider === 'deepseek' && !!serverKeys.deepseek_key && !cfg.llmApiKey;
    const notice      = document.getElementById('freeKeyNotice');
    const keyRow      = document.getElementById('apiKeyRow');
    const keyInput    = document.getElementById('llmApiKeyInput');
    const userSel     = document.getElementById('userProviderSelect');

    if (userSel) userSel.value = provider;
    if (notice)  notice.style.display  = isFree ? '' : 'none';
    if (keyRow)  keyRow.style.display  = isFree ? 'none' : '';
    if (keyInput && USER_KEY_PLACEHOLDERS[provider]) {
        keyInput.placeholder = USER_KEY_PLACEHOLDERS[provider];
    }
}

// Обработчик смены провайдера обычным пользователем
const userProviderSelectEl = document.getElementById('userProviderSelect');
if (userProviderSelectEl) {
    userProviderSelectEl.addEventListener('change', function () {
        cfg.llmProvider = this.value;
        cfg.model       = USER_MODEL_DEFAULTS[this.value] || cfg.model;
        llmProviderSelect.value = this.value;
        onLlmProviderChange();
        updateApiKeySection();
    });
}

// ========= AUTH TABS =========
tabLogin.onclick = () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display    = '';
    formRegister.style.display = 'none';
    loginError.textContent     = '';
};
tabRegister.onclick = () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.style.display = '';
    formLogin.style.display    = 'none';
    regError.textContent       = '';
    regSuccess.textContent     = '';
};

// ========= LOGIN / LOGOUT =========
async function doLogin() {
    const email = (loginEmail.value || '').trim();
    const pass  = loginPassword.value || '';
    if (!email || !pass) { loginError.textContent = 'Введи email и пароль'; return; }

    loginBtn.disabled    = true;
    loginBtn.textContent = 'Вхожу...';
    loginError.textContent = '';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    loginBtn.disabled    = false;
    loginBtn.textContent = 'Войти';

    if (error) {
        loginError.textContent =
            error.message === 'Invalid login credentials' ? 'Неверный email или пароль' :
            error.message === 'Email not confirmed'       ? 'Сначала подтверди email — проверь почту' :
            error.message;
        loginPassword.value = '';
        return;
    }
    await afterLogin(data.user);
}

// Загружает ключи из Supabase app_config.
// Ключи хранятся только в памяти — не сохраняются на диск и не попадают в git.
async function fetchServerConfig() {
    try {
        const { data, error } = await supabase
            .from('app_config')
            .select('key, value');
        if (!error && data) {
            serverKeys = Object.fromEntries(data.map(r => [r.key, r.value]));
        }
    } catch (e) {
        // Таблица ещё не создана или нет интернета — продолжаем без серверных ключей
        console.warn('[serverConfig]', e.message);
    }
}

async function afterLogin(user) {
    let role = 'user';
    let name = user.email.split('@')[0];

    try {
        const { data: prof } = await supabase
            .from('profiles')
            .select('role, name')
            .eq('id', user.id)
            .single();
        if (prof) {
            role = prof.role || 'user';
            if (prof.name) name = prof.name;
        }
    } catch (e) {}

    // DEV_EMAIL всегда имеет полный доступ
    if (user.email === DEV_EMAIL) role = 'dev';

    currentProfile         = { email: user.email, role, name };
    loginEmail.value       = '';
    loginPassword.value    = '';
    loginError.textContent = '';

    // Загружаем серверный конфиг (ключи только в памяти, не на диске)
    await fetchServerConfig();

    // Чистим старый Groq-фолбэк ключ
    if (!cfg.llmApiKey || cfg.llmApiKey === FREE_API_KEY) cfg.llmApiKey = '';

    // DeepSeek по умолчанию если есть серверный ключ и ещё ничего не выбрано
    if (serverKeys.deepseek_key && !cfg.llmApiKey && (!cfg.llmProvider || cfg.llmProvider === 'groq')) {
        cfg.llmProvider = 'deepseek';
        cfg.model       = 'deepseek-chat';
    }

    // Groq Whisper по умолчанию (browser STT нестабилен в Electron / заблокирован в РФ)
    if (!cfg.sttProvider) cfg.sttProvider = 'groq';

    // Синхронизируем все поля настроек
    llmApiKeyInput.value    = cfg.llmApiKey    || '';
    sttApiKeyInput.value    = cfg.sttApiKey    || '';
    llmProviderSelect.value = cfg.llmProvider  || 'deepseek';
    sttProviderSelect.value = cfg.sttProvider  || 'browser';
    ttsProviderSelect.value = cfg.ttsProvider  || 'yandex';
    llmBaseUrlInput.value   = cfg.llmBaseUrl   || '';
    systemPromptEl.value    = cfg.systemPrompt || DEFAULT_CFG.systemPrompt;
    yandexTtsKeyInput.value    = cfg.yandexTtsKey   || '';
    yandexFolderIdInput.value  = cfg.yandexFolderId || '';
    thresholdInput.value       = cfg.threshold;
    thresholdLabel.textContent = cfg.threshold;
    silenceInput.value         = cfg.silenceMs;
    silenceLabel.textContent   = cfg.silenceMs;
    onLlmProviderChange();
    onTtsProviderChange();
    voiceSelect.value = cfg.voice || DEFAULT_CFG.voice;
    if (LLM_MODELS[cfg.llmProvider]) llmModelSelect.value = cfg.model;
    else llmModelInput.value = cfg.model || '';

    renderQuickPrompts();
    showView('main');
    initVAD().catch(err => {
        statusEl.textContent = 'Нет доступа к микрофону: ' + err.message;
        orbEl.className = 'orb error';
    });
}

async function doRegister() {
    const name  = (regName.value || '').trim();
    const email = (regEmail.value || '').trim();
    const pass  = regPassword.value || '';

    regError.textContent   = '';
    regSuccess.textContent = '';

    if (!name)        { regError.textContent = 'Введи имя'; return; }
    if (!email)       { regError.textContent = 'Введи email'; return; }
    if (!pass)        { regError.textContent = 'Введи пароль'; return; }
    if (pass.length < 6) { regError.textContent = 'Пароль минимум 6 символов'; return; }

    regBtn.disabled    = true;
    regBtn.textContent = 'Регистрирую...';

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password: pass,
            options: { data: { name } }
        });

        regBtn.disabled    = false;
        regBtn.textContent = 'Зарегистрироваться';

        if (error) {
            const msg = error.message || '';
            regError.textContent =
                msg.includes('already registered') || msg.includes('already exists') ? 'Этот email уже зарегистрирован' :
                msg.includes('rate limit') || msg.includes('rate_limit')              ? 'Слишком много попыток — подожди немного' :
                msg.includes('invalid')                                               ? 'Неверный формат email' :
                msg;
        } else if (!data.user || data.user.identities?.length === 0) {
            // Supabase не показывает ошибку для дублирующихся email (защита от перебора)
            regError.textContent = 'Этот email уже зарегистрирован';
        } else {
            regSuccess.textContent = '✓ Письмо отправлено на ' + email + ' — проверь почту и нажми ссылку подтверждения, затем войди.';
            regName.value = regEmail.value = regPassword.value = '';
        }
    } catch (e) {
        regBtn.disabled    = false;
        regBtn.textContent = 'Зарегистрироваться';
        regError.textContent = 'Ошибка соединения: ' + e.message;
    }
}

loginBtn.onclick  = doLogin;
regBtn.onclick    = doRegister;
loginEmail.addEventListener('keydown',    e => { if (e.key === 'Enter') loginPassword.focus(); });
loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
regPassword.addEventListener('keydown',   e => { if (e.key === 'Enter') doRegister(); });

logoutBtn.onclick = async () => {
    await supabase.auth.signOut();
    currentProfile = null;
    isRecording    = false;
    isProcessing   = false;
    clearTimeout(silenceTimer);
    silenceTimer = null;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        try { mediaRecorder.stop(); } catch (e) {}
    }
    stopBrowserSTT();
    stopSpeaking();
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (audioCtx)  { audioCtx.close().catch(() => {}); audioCtx = null; analyser = null; }
    history          = [];
    chatEl.innerHTML = '';
    setOrbState('idle');
    showView('login');
    setTimeout(() => loginEmail.focus(), 100);
};

thresholdInput.oninput = () => { thresholdLabel.textContent = thresholdInput.value; };
silenceInput.oninput   = () => { silenceLabel.textContent   = silenceInput.value; };

document.getElementById('saveSettings').onclick = () => {
    const prevMic   = cfg.micId;
    const prevStt   = cfg.sttProvider;
    const hasPreset = LLM_MODELS[llmProviderSelect.value] !== undefined;
    cfg = {
        sttProvider:    sttProviderSelect.value,
        sttApiKey:      sttApiKeyInput.value.trim(),
        llmProvider:    llmProviderSelect.value,
        llmApiKey:      llmApiKeyInput.value.trim(),
        llmBaseUrl:     llmBaseUrlInput.value.trim(),
        model:          hasPreset
                        ? (llmModelSelect.value || DEFAULT_CFG.model)
                        : (llmModelInput.value.trim() || 'gpt-4o'),
        systemPrompt:   systemPromptEl.value.trim() || DEFAULT_CFG.systemPrompt,
        ttsProvider:    ttsProviderSelect.value,
        yandexTtsKey:   yandexTtsKeyInput.value.trim(),
        yandexFolderId: yandexFolderIdInput.value.trim(),
        voice:          voiceSelect.value,
        threshold:      parseInt(thresholdInput.value),
        silenceMs:      parseInt(silenceInput.value),
        bgColor:        cfg.bgColor,
        mood:           cfg.mood || '',
        micId:          micSelect.value,
        commands:       cfg.commands     || DEFAULT_CFG.commands,
        quickPrompts:   cfg.quickPrompts || DEFAULT_CFG.quickPrompts,
        wakeWords:      cfg.wakeWords    || DEFAULT_CFG.wakeWords
    };
    if (prevMic !== cfg.micId || prevStt !== cfg.sttProvider) restartVAD();
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
        if (recognition) try { recognition.abort(); } catch(e) {}
        setOrbState('muted');
    } else {
        if (cfg.sttProvider === 'browser' && recognition) {
            try { recognition.start(); } catch(e) {}
        }
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
    stopBrowserSTT();
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

    // Браузерный STT — запускаем Web Speech API
    if (cfg.sttProvider === 'browser') {
        startBrowserSTT();
    }
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

    // Ручная запись — только когда НЕ browser STT
    if (!isMuted && cfg.sttProvider !== 'browser') {
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
        let reply;

        if (cfg.llmProvider === 'gemini') {
            // Gemini нативно понимает аудио — STT не нужен
            addMsg('user', 'Ты', '🎤 голосовое');
            reply = await sendToGeminiAudio(blob);
            pushHistory('user', '[голосовое сообщение]');
        } else {
            const text = await transcribe(blob);
            if (!text || text.trim().length < 2) {
                setOrbState('idle');
                return;
            }

            // Определяем: wake word + команда / wake word без команды / обычная речь
            const wake = checkWakeWord(text);
            const cmd  = wake ? checkCommand(text) : null;

            if (cmd) {
                // ⚡ Голосовая команда выполнена
                addVoiceLog('⚡ ' + text, 'cmd');
                clearTimeout(safetyTimer);
                await executeCommand(cmd, text);
                return;
            } else if (wake) {
                // Имя орба слышно, команды нет — отправляем к ИИ
                addVoiceLog(text, 'wake');
            } else {
                // Обычная речь — к ИИ
                addVoiceLog(text, 'ai');
            }

            addMsg('user', 'Ты', text);
            pushHistory('user', text);
            reply = await sendToAI();
        }

        addMsg('ai', 'ИИ', reply);
        pushHistory('assistant', reply);
        setOrbState('speaking');
        showNotification(reply);
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
    // Если в качестве LLM стоит Gemini — для STT используем бесплатный Groq ключ
    // Ключ для STT: явный STT-ключ → LLM-ключ (только если провайдеры совпадают) → бесплатный Groq
    let apiKey = cfg.sttApiKey
        || (cfg.llmProvider === cfg.sttProvider ? cfg.llmApiKey : null)
        || FREE_API_KEY;
    if (apiKey.startsWith('AIza')) apiKey = FREE_API_KEY; // Gemini-ключ не годится для Whisper

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
    if (cfg.llmProvider === 'gemini') return sendToGeminiText();

    // Вычисляем базовый URL
    let baseUrl;
    if (cfg.llmProvider === 'custom') {
        baseUrl = (cfg.llmBaseUrl || '').replace(/\/$/, '');
    } else if (cfg.llmProvider === 'openrouter') {
        baseUrl = (cfg.llmBaseUrl || LLM_BASE_URLS.openrouter).replace(/\/$/, '');
    } else {
        baseUrl = LLM_BASE_URLS[cfg.llmProvider] || LLM_BASE_URLS.groq;
    }

    // Приоритет: свой ключ пользователя → серверный ключ → бесплатный Groq
    let effectiveApiKey = cfg.llmApiKey;
    if (!effectiveApiKey && cfg.llmProvider === 'deepseek' && serverKeys.deepseek_key) {
        effectiveApiKey = serverKeys.deepseek_key; // серверный ключ — только в памяти, не на диске
    }
    if (!effectiveApiKey) effectiveApiKey = FREE_API_KEY;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveApiKey}`
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

// ========= GEMINI API =========
function buildGeminiBody(extraUserParts) {
    const moodNote = MOOD_PROMPTS[cfg.mood || ''];
    const systemContent = moodNote ? cfg.systemPrompt + '\n\n' + moodNote : cfg.systemPrompt;

    // Конвертируем историю в формат Gemini (role: user/model)
    const contents = history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
    }));

    if (extraUserParts) {
        contents.push({ role: 'user', parts: extraUserParts });
    }

    return {
        systemInstruction: { parts: [{ text: systemContent }] },
        contents,
        generationConfig: { temperature: 1.0 }
    };
}

async function geminiRequest(body) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.llmApiKey}`;
    const res  = await fetchWithTimeout(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
    }, 45000);
    const d = await res.json();
    if (d.error) throw new Error('Gemini: ' + (d.error.message || JSON.stringify(d.error)));
    return d.candidates[0].content.parts.map(p => p.text || '').join('');
}

// Текстовый запрос (история уже содержит текущее сообщение пользователя)
async function sendToGeminiText() {
    return geminiRequest(buildGeminiBody(null));
}

// Аудио запрос — отправляем blob напрямую в Gemini
async function sendToGeminiAudio(audioBlob) {
    const base64 = await blobToBase64(audioBlob);
    const parts  = [
        { inlineData: { mimeType: 'audio/webm;codecs=opus', data: base64 } },
        { text: 'Ответь на русском языке.' }
    ];
    return geminiRequest(buildGeminiBody(parts));
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
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

    // Текстовой ввод: команды работают без wake word (намеренный ввод)
    const cmd = checkCommand(text);
    if (cmd) {
        await executeCommand(cmd, text);
        return;
    }

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
        showNotification(reply);
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

async function speakWithGroq(text) {
    const gen       = ++speakGen;
    const sentences = splitSentences(text);
    if (!sentences.length) return;

    // Ключ: свой LLM-ключ если Groq, иначе бесплатный ключ
    const apiKey = (cfg.llmProvider === 'groq' && cfg.llmApiKey)
        ? cfg.llmApiKey
        : (cfg.sttApiKey || FREE_API_KEY);

    for (const sentence of sentences) {
        if (gen !== speakGen) break;
        if (!sentence.trim()) continue;
        try {
            const res = await fetchWithTimeout(
                'https://api.groq.com/openai/v1/audio/speech',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type':  'application/json'
                    },
                    body: JSON.stringify({
                        model:           'playai-tts',
                        input:           sentence,
                        voice:           cfg.voice || 'Celeste-PlayAI',
                        response_format: 'mp3'
                    })
                },
                15000
            );
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error('Groq TTS: ' + (e.error?.message || res.status));
            }
            if (gen !== speakGen) break;
            const buf = await res.arrayBuffer();
            if (gen !== speakGen) break;
            const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
            await new Promise(resolve => {
                speakResolve = resolve;
                currentAudio = new Audio(url);
                const done = () => { URL.revokeObjectURL(url); currentAudio = null; speakResolve = null; resolve(); };
                currentAudio.onended = done;
                currentAudio.onerror = done;
                currentAudio.play().catch(done);
            });
        } catch (err) {
            console.error('[Groq TTS]', err);
            setStatus('❌ Groq TTS: ' + err.message);
        }
    }
}

async function speak(text) {
    // Останавливаем браузерный STT пока говорит TTS — иначе орб услышит себя
    sttPaused = true;
    if (recognition) try { recognition.abort(); } catch(e) {}

    if (cfg.ttsProvider === 'groq') {
        await speakWithGroq(text);
    } else if (cfg.ttsProvider === 'yandex') {
        await speakWithYandex(text);
    } else {
        await speakWithEdge(text);
    }

    // Возобновляем STT после окончания речи
    sttPaused = false;
    if (cfg.sttProvider === 'browser' && !isMuted && !isInterrupted) {
        setTimeout(() => { try { if (recognition) recognition.start(); } catch(e) {} }, 400);
    }
}

async function speakWithEdge(text) {
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

async function speakWithYandex(text) {
    const gen       = ++speakGen;
    const sentences = splitSentences(text);
    if (!sentences.length) return;

    for (const sentence of sentences) {
        if (gen !== speakGen) break;
        if (!sentence.trim()) continue;
        try {
            const params = new URLSearchParams({
                text:     sentence,
                lang:     'ru-RU',
                voice:    cfg.voice || 'alena',
                format:   'mp3',
                folderId: cfg.yandexFolderId || YANDEX_FOLDER_ID,
                speed:    '1.0'
            });
            const res = await fetchWithTimeout(
                'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize',
                {
                    method:  'POST',
                    headers: {
                        'Authorization': `Api-Key ${cfg.yandexTtsKey || YANDEX_TTS_KEY}`,
                        'Content-Type':  'application/x-www-form-urlencoded'
                    },
                    body: params.toString()
                },
                15000
            );
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error('Yandex TTS: ' + (e.message || res.status));
            }
            const buf = await res.arrayBuffer();
            if (gen !== speakGen) break;
            const url = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
            await new Promise(resolve => {
                speakResolve = resolve;
                currentAudio = new Audio(url);
                const done = () => { URL.revokeObjectURL(url); currentAudio = null; speakResolve = null; resolve(); };
                currentAudio.onended = done;
                currentAudio.onerror = done;
                currentAudio.play().catch(done);
            });
        } catch (err) {
            console.error('[Yandex TTS]', err);
            setStatus('❌ Яндекс TTS: ' + err.message);
        }
    }
}

function stopSpeaking() {
    speakGen++;
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = ''; // сбрасываем буфер — иначе аудио может продолжить играть
        currentAudio = null;
    }
    if (speakResolve) { const fn = speakResolve; speakResolve = null; fn(); }
}

// ========= CHAT UI =========
function addMsg(type, role, text) {
    const div = document.createElement('div');
    div.className = 'message ' + type;

    // AI-ответы рендерим как Markdown, пользовательские и ошибки — как текст
    const bodyHtml = type === 'ai'
        ? marked.parse(text)
        : `<span>${esc(text)}</span>`;

    div.innerHTML = `
        <span class="message-role">${role}</span>
        <div class="message-body">${bodyHtml}</div>
        ${type === 'ai' ? '<button class="copy-btn" title="Копировать">⎘</button>' : ''}
    `;

    if (type === 'ai') {
        const btn = div.querySelector('.copy-btn');
        btn.onclick = () => {
            navigator.clipboard.writeText(text).then(() => {
                btn.classList.add('copied');
                btn.textContent = '✓';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.textContent = '⎘';
                }, 1500);
            });
        };
    }

    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
}

function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ========= VOICE COMMANDS =========

// Проверяет, есть ли имя орба в тексте; возвращает найденное слово или null
function checkWakeWord(text) {
    const lower = text.toLowerCase().trim();
    const words = (cfg.wakeWords || DEFAULT_CFG.wakeWords)
        .map(w => w.toLowerCase().trim())
        .filter(Boolean);
    return words.find(w => lower.includes(w)) || null;
}

// Проверяет триггерные фразы (без проверки wake word)
function checkCommand(text) {
    const lower = text.toLowerCase().trim();
    return (cfg.commands || []).find(cmd => {
        const t = (cmd.trigger || '').toLowerCase().trim();
        return t.length > 0 && lower.includes(t);
    });
}

// ========= BROWSER STT (Web Speech API) =========

function startBrowserSTT() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        setStatus('❌ Web Speech API недоступен в этом Electron');
        return;
    }

    if (recognition) { try { recognition.abort(); } catch(e) {} recognition = null; }

    recognition = new SR();
    recognition.lang            = 'ru-RU';
    recognition.continuous      = false;   // per-utterance; перезапускаем сами в onend
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;

    // onstart / onspeechend не меняют состояние орба —
    // иначе орб мигает idle↔listening каждые ~3с даже в тишине
    recognition.onstart    = () => {};
    recognition.onspeechend = () => {};

    recognition.onresult = async (event) => {
        let finalText = '';
        let interim   = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
            else                          interim   += event.results[i][0].transcript;
        }
        // Переключаем в "Слушаю" только когда есть реальная речь
        if (interim && !isProcessing && !isMuted) {
            setOrbState('listening');
            setStatus('Слушаю: ' + interim);
        }
        if (finalText.trim().length >= 2 && !isProcessing && !isMuted) {
            await handleBrowserSTTResult(finalText.trim());
        }
    };

    recognition.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        console.error('[Browser STT]', e.error);
        if (e.error === 'network') {
            // Google speech серверы недоступны из Electron (блокировка в РФ или ограничения Electron)
            // Автоматически переключаемся на Groq Whisper
            stopBrowserSTT();
            cfg.sttProvider = 'groq';
            if (sttProviderSelect) sttProviderSelect.value = 'groq';
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
            setStatus('Web Speech недоступен — переключился на Groq Whisper');
            setTimeout(() => { if (!isProcessing) setOrbState('idle'); }, 2500);
        }
    };

    recognition.onend = () => {
        // Авто-рестарт пока не заглушён, не обрабатываем и не паузим TTS
        if (!sttPaused && !isMuted && !isProcessing && cfg.sttProvider === 'browser') {
            setTimeout(() => { try { if (recognition) recognition.start(); } catch(e) {} }, 250);
        }
        if (!isProcessing) setOrbState(isMuted ? 'muted' : 'idle');
    };

    try { recognition.start(); } catch(e) { console.error('[Browser STT start]', e); }
}

function stopBrowserSTT() {
    sttPaused = false;
    if (recognition) {
        try { recognition.abort(); } catch(e) {}
        recognition = null;
    }
}

async function handleBrowserSTTResult(text) {
    if (isMuted) return;
    // Если ИИ говорит — перебить и начать новый ответ
    if (ORB_STATE === 'speaking') {
        isInterrupted = true;
        isProcessing  = false;
        stopSpeaking();
    }
    if (isProcessing) return; // ещё обрабатываем предыдущий запрос — игнорируем
    isProcessing  = true;
    isInterrupted = false;
    setOrbState('thinking');

    const safetyTimer = setTimeout(() => {
        isProcessing = false;
        setOrbState('error');
        setTimeout(() => { if (!isProcessing) setOrbState('idle'); }, 2500);
    }, 45000);

    try {
        const wake = checkWakeWord(text);
        const cmd  = wake ? checkCommand(text) : null;

        if (cmd) {
            addVoiceLog('⚡ ' + text, 'cmd');
            clearTimeout(safetyTimer);
            await executeCommand(cmd, text);
            return;
        } else if (wake) {
            addVoiceLog(text, 'wake');
        } else {
            addVoiceLog(text, 'ai');
        }

        addMsg('user', 'Ты', text);
        pushHistory('user', text);

        const reply = await sendToAI();
        addMsg('ai', 'ИИ', reply);
        pushHistory('assistant', reply);
        setOrbState('speaking');
        showNotification(reply);
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

// ========= VOICE LOG =========
const MAX_VOICE_LOG = 60;

function addVoiceLog(text, type = 'ai') {
    const el = document.getElementById('voiceLog');
    if (!el) return;
    // Убираем заглушку при первой записи
    const empty = el.querySelector('.voice-log-empty');
    if (empty) empty.remove();
    // Добавляем строку
    const now  = new Date();
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const div  = document.createElement('div');
    div.className = 'voice-log-entry ' + type;
    div.innerHTML =
        `<span class="voice-log-time">${time}</span>` +
        `<span class="voice-log-text">${esc(text)}</span>`;
    el.appendChild(div);
    // Ограничиваем количество строк
    while (el.children.length > MAX_VOICE_LOG) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
}

async function executeCommand(cmd, userText) {
    isProcessing = true;
    addMsg('user', 'Ты', userText);

    if (cmd.response) {
        addMsg('ai', 'ИИ', cmd.response);
        setOrbState('speaking');
        await speak(cmd.response);
    }

    try {
        if (cmd.action === 'run' && cmd.path) {
            await ipcRenderer.invoke('run-process', cmd.path, cmd.args || '');
        } else if (cmd.action === 'open' && cmd.path) {
            await ipcRenderer.invoke('open-path', cmd.path);
        }
    } catch (e) {
        console.error('[Command exec]', e);
    }

    isProcessing = false;
    if (!isInterrupted) setOrbState('idle');
}

// ========= QUICK PROMPTS UI =========
function renderQuickPrompts() {
    const bar = document.getElementById('quickPromptsBar');
    if (!bar) return;
    bar.innerHTML = '';
    (cfg.quickPrompts || []).forEach(qp => {
        if (!qp.label) return;
        const btn = document.createElement('button');
        btn.className   = 'qp-btn';
        btn.textContent = qp.label;
        btn.onclick     = () => {
            textInput.value = qp.text || qp.label;
            textInput.focus();
        };
        bar.appendChild(btn);
    });
}

// ========= COMMANDS VIEW UI =========
function renderCommandsSettings() { renderCommandsView(); } // совместимость

function renderCommandsView() {
    // Wake words
    const wakeInput = document.getElementById('wakeWordsInput');
    if (wakeInput) wakeInput.value = (cfg.wakeWords || DEFAULT_CFG.wakeWords).join(', ');

    // Commands list
    const list = document.getElementById('commandsViewList');
    if (!list) return;
    const cmds = cfg.commands || [];
    list.innerHTML = cmds.length === 0
        ? '<div class="cmd-empty">Нет команд. Нажми «+ Добавить команду»</div>'
        : '';

    cmds.forEach((cmd, i) => renderCmdCard(list, cmd, i, renderCommandsView));

    // Кнопка «Добавить»
    const addBtn = document.getElementById('addCommandViewBtn');
    if (addBtn) {
        addBtn.onclick = () => {
            if (!cfg.commands) cfg.commands = [];
            cfg.commands.push({ id: Date.now().toString(), name: '', trigger: '', action: 'speak', path: '', args: '', response: '' });
            renderCommandsView();
            const forms = list.querySelectorAll('.cmd-form');
            if (forms.length) forms[forms.length - 1].style.display = '';
        };
    }
}

// Сохранение wake-слов
document.getElementById('saveWakeWords').addEventListener('click', () => {
    const input = document.getElementById('wakeWordsInput');
    const words = (input.value || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    cfg.wakeWords = words.length ? words : DEFAULT_CFG.wakeWords;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    const btn = document.getElementById('saveWakeWords');
    const orig = btn.textContent;
    btn.textContent = '✓ Сохранено';
    setTimeout(() => { btn.textContent = orig; }, 1500);
});

function renderCmdCard(list, cmd, i, refreshFn) {
    if (!refreshFn) refreshFn = renderCommandsSettings;
    const card = document.createElement('div');
    card.className = 'cmd-card';
    card.innerHTML = `
        <div class="cmd-header">
            <div class="cmd-info">
                <span class="cmd-name">${esc(cmd.name || 'Без названия')}</span>
                <span class="cmd-trigger">${cmd.trigger ? '"' + esc(cmd.trigger) + '"' : '—'}</span>
            </div>
            <div class="cmd-btns">
                <button class="cmd-edit-btn" title="Редактировать">✎</button>
                <button class="cmd-del-btn"  title="Удалить">✕</button>
            </div>
        </div>
        <div class="cmd-form" style="display:none">
            <div class="cmd-form-row">
                <div>
                    <label class="field-label">Название</label>
                    <input type="text" class="field-input cf-name" value="${esc(cmd.name || '')}" placeholder="Открыть браузер">
                </div>
                <div>
                    <label class="field-label">Триггерная фраза</label>
                    <input type="text" class="field-input cf-trigger" value="${esc(cmd.trigger || '')}" placeholder="открой браузер">
                </div>
            </div>
            <div>
                <label class="field-label">Действие</label>
                <select class="field-input cf-action">
                    <option value="speak" ${cmd.action==='speak'?'selected':''}>Только озвучить ответ</option>
                    <option value="run"   ${cmd.action==='run'  ?'selected':''}>Запустить программу</option>
                    <option value="open"  ${cmd.action==='open' ?'selected':''}>Открыть файл / URL</option>
                </select>
            </div>
            <div class="cmd-form-row">
                <div>
                    <label class="field-label">Путь / URL <span class="field-hint">(если нужно)</span></label>
                    <input type="text" class="field-input cf-path" value="${esc(cmd.path || '')}" placeholder="calc.exe  или  https://...">
                </div>
                <div>
                    <label class="field-label">Аргументы <span class="field-hint">(опц.)</span></label>
                    <input type="text" class="field-input cf-args" value="${esc(cmd.args || '')}" placeholder="--new-window">
                </div>
            </div>
            <div>
                <label class="field-label">Фраза при активации</label>
                <input type="text" class="field-input cf-response" value="${esc(cmd.response || '')}" placeholder="Открываю браузер">
            </div>
            <button class="cmd-save-btn">Сохранить</button>
        </div>
    `;

    const form    = card.querySelector('.cmd-form');
    const editBtn = card.querySelector('.cmd-edit-btn');
    const delBtn  = card.querySelector('.cmd-del-btn');
    const saveBtn = card.querySelector('.cmd-save-btn');
    const header  = card.querySelector('.cmd-header');

    header.onclick = () => { form.style.display = form.style.display === 'none' ? '' : 'none'; };
    editBtn.onclick = e => { e.stopPropagation(); form.style.display = form.style.display === 'none' ? '' : 'none'; };
    delBtn.onclick  = e => { e.stopPropagation(); cfg.commands.splice(i, 1); refreshFn(); };
    saveBtn.onclick = () => {
        cfg.commands[i] = {
            ...cfg.commands[i],
            name:     card.querySelector('.cf-name').value.trim(),
            trigger:  card.querySelector('.cf-trigger').value.trim().toLowerCase(),
            action:   card.querySelector('.cf-action').value,
            path:     card.querySelector('.cf-path').value.trim(),
            args:     card.querySelector('.cf-args').value.trim(),
            response: card.querySelector('.cf-response').value.trim()
        };
        refreshFn();
    };

    list.appendChild(card);
}

// ========= QUICK PROMPTS SETTINGS UI =========
function renderQuickPromptsSettings() {
    const list = document.getElementById('quickPromptsList');
    if (!list) return;
    const qps = cfg.quickPrompts || [];
    list.innerHTML = '';

    qps.forEach((qp, i) => {
        const card = document.createElement('div');
        card.className = 'qp-card';
        card.innerHTML = `
            <div class="qp-header">
                <div class="cmd-info">
                    <span class="cmd-name">${esc(qp.label || '')}</span>
                </div>
                <div class="cmd-btns">
                    <button class="cmd-edit-btn">✎</button>
                    <button class="cmd-del-btn">✕</button>
                </div>
            </div>
            <div class="qp-form" style="display:none">
                <div class="cmd-form-row">
                    <div>
                        <label class="field-label">Метка кнопки</label>
                        <input type="text" class="field-input qf-label" value="${esc(qp.label || '')}" placeholder="🌍 Переведи">
                    </div>
                    <div>
                        <label class="field-label">Текст промпта</label>
                        <input type="text" class="field-input qf-text" value="${esc(qp.text || '')}" placeholder="Переведи на английский: ">
                    </div>
                </div>
                <button class="cmd-save-btn">Сохранить</button>
            </div>
        `;
        const form    = card.querySelector('.qp-form');
        const header  = card.querySelector('.qp-header');
        const editBtn = card.querySelector('.cmd-edit-btn');
        const delBtn  = card.querySelector('.cmd-del-btn');
        const saveBtn = card.querySelector('.cmd-save-btn');

        header.onclick  = () => { form.style.display = form.style.display === 'none' ? '' : 'none'; };
        editBtn.onclick = e => { e.stopPropagation(); form.style.display = form.style.display === 'none' ? '' : 'none'; };
        delBtn.onclick  = e => { e.stopPropagation(); cfg.quickPrompts.splice(i, 1); renderQuickPromptsSettings(); renderQuickPrompts(); };
        saveBtn.onclick = () => {
            cfg.quickPrompts[i] = {
                ...cfg.quickPrompts[i],
                label: card.querySelector('.qf-label').value.trim(),
                text:  card.querySelector('.qf-text').value.trim()
            };
            renderQuickPromptsSettings();
            renderQuickPrompts();
        };

        list.appendChild(card);
    });

    const addBtn = document.getElementById('addQuickPromptBtn');
    if (addBtn) {
        addBtn.onclick = () => {
            if (!cfg.quickPrompts) cfg.quickPrompts = [];
            cfg.quickPrompts.push({ id: Date.now().toString(), label: '', text: '' });
            renderQuickPromptsSettings();
            const forms = list.querySelectorAll('.qp-form');
            if (forms.length) forms[forms.length - 1].style.display = '';
        };
    }
}

// ========= WINDOWS NOTIFICATION =========
function showNotification(text) {
    try {
        ipcRenderer.invoke('notify', 'Voice AI', text.substring(0, 120) + (text.length > 120 ? '...' : ''));
    } catch (e) {}
}

// Хоткей Ctrl+Alt+V — начать запись (или просто активировать окно в browser STT режиме)
ipcRenderer.on('hotkey-triggered', () => {
    if (currentProfile && !isProcessing && !isMuted) {
        if (cfg.sttProvider === 'browser') {
            // Browser STT всегда слушает — ничего делать не нужно
        } else if (!isRecording) {
            startCapture();
        }
    }
});

// ========= INIT =========
(async function () {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            await afterLogin(session.user);
            return;
        }
    } catch (e) {}
    showView('login');
    setTimeout(() => loginEmail.focus(), 50);
})();
