// ==UserScript==
// @name         TW UI Kit
// @version      1.0
// @description  Design system reutilizável para scripts do Tribal Wars — tema escuro, componentes prontos, sem conflitos.
// @match        https://*.tribalwars.com.br/game.php*
// @grant        none
// ==/UserScript==

/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║                         TW UI KIT  v1.0                            ║
 * ║              Design System para scripts do Tribal Wars              ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║                                                                      ║
 * ║  COMO USAR NO SEU SCRIPT:                                            ║
 * ║                                                                      ║
 * ║  1. Inclua este arquivo antes do seu script (via @require no         ║
 * ║     Tampermonkey, ou simplesmente copie o objeto TWUI para           ║
 * ║     dentro do seu script).                                           ║
 * ║                                                                      ║
 * ║  2. Inicialize o kit passando um prefixo único:                      ║
 * ║       const ui = TWUI.create('meu-script');                          ║
 * ║                                                                      ║
 * ║  3. Use os métodos para montar seu layout:                            ║
 * ║       ui.injectStyles();          // injeta CSS prefixado             ║
 * ║       ui.renderApp(innerHTML);    // monta o wrapper #p-app          ║
 * ║       ui.header('Título', extra); // barra de cabeçalho              ║
 * ║       ui.configBar([...fields]);  // barra de configurações          ║
 * ║       ui.statsStrip([...cards]);  // faixa de estatísticas           ║
 * ║       ui.progressBar();           // barra de progresso              ║
 * ║       ui.toolbar(leftHTML, rightHTML); // barra de ações             ║
 * ║       ui.logEntry(msg, tipo);     // adiciona entrada no log         ║
 * ║       ui.floatBtn(id, label, cb); // botão flutuante na página       ║
 * ║                                                                      ║
 * ║  PREFIXO:                                                             ║
 * ║    Cada instância usa um prefixo (ex: 'rb' para ResourceBalancer).   ║
 * ║    Todas as classes/IDs ficam como: #rb-app, .rb-header, etc.        ║
 * ║    Isso garante zero conflito entre scripts rodando juntos.          ║
 * ║                                                                      ║
 * ║  TOKENS DE COR (CSS Variables — disponíveis em todo o escopo):       ║
 * ║    --twui-bg          fundo principal                                ║
 * ║    --twui-bg-card     fundo de cards/painéis                         ║
 * ║    --twui-green       verde de destaque                              ║
 * ║    --twui-green-dim   verde translúcido (hover, fundo sutil)         ║
 * ║    --twui-green-light verde claro (hover em botões)                  ║
 * ║    --twui-text        texto principal                                ║
 * ║    --twui-text-dim    texto secundário/apagado                       ║
 * ║    --twui-border      borda padrão                                   ║
 * ║    --twui-red         erro                                           ║
 * ║    --twui-yellow      aviso                                          ║
 * ║    --twui-blue        informação                                     ║
 * ║    --twui-wood        cor madeira                                    ║
 * ║    --twui-stone       cor pedra                                      ║
 * ║    --twui-iron        cor ferro                                      ║
 * ║                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

/* global window, document */

(function (global) {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────
    // TOKENS GLOBAIS (CSS Custom Properties injetadas em :root)
    // ─────────────────────────────────────────────────────────────────────

    const TOKENS = {
        '--twui-bg':           '#080c10',
        '--twui-bg-card':      '#0d1117',
        '--twui-bg-table':     '#0b0f14',

        '--twui-green':        '#00d97e',
        '--twui-green-dark':   '#001a0e',
        '--twui-green-light':  '#33ffaa',
        '--twui-green-dim':    '#00d97e22',
        '--twui-green-border': '#00d97e33',

        '--twui-text':         '#c9d1d9',
        '--twui-text-dim':     '#8b949e',

        '--twui-border':       '#21262d',

        '--twui-red':          '#f85149',
        '--twui-red-dim':      '#f8514922',

        '--twui-yellow':       '#d29922',
        '--twui-yellow-dim':   '#d2992222',

        '--twui-blue':         '#388bfd',
        '--twui-blue-dim':     '#388bfd22',

        '--twui-wood':         '#8b6914',
        '--twui-stone':        '#607080',
        '--twui-iron':         '#5a8a9f',

        '--twui-orange':       '#c97c00',
        '--twui-orange-light': '#e8900a',
    };

    // ─────────────────────────────────────────────────────────────────────
    // CSS BASE (prefixado via interpolação — evita colisão)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Gera o bloco CSS completo com todas as classes prefixadas com `p`.
     * Ex: p = 'rb' → .rb-header, #rb-app, etc.
     */
    function buildCSS(p) {
        return `
/* ── TW UI KIT — prefixo: ${p} ── */

/* Reset local */
#${p}-app *, #${p}-app *::before, #${p}-app *::after {
    box-sizing: border-box;
}

/* Scrollbar */
#${p}-app ::-webkit-scrollbar              { width: 6px; height: 6px; }
#${p}-app ::-webkit-scrollbar-track        { background: var(--twui-bg); }
#${p}-app ::-webkit-scrollbar-thumb        { background: var(--twui-border); border-radius: 3px; }
#${p}-app ::-webkit-scrollbar-thumb:hover  { background: var(--twui-green-dim); }

/* ── WRAPPER RAIZ ── */
#${p}-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--twui-bg);
    color: var(--twui-text);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

/* ── HEADER ── */
#${p}-header {
    background: var(--twui-bg-card);
    border-bottom: 1px solid var(--twui-border);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
}
#${p}-header h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--twui-green);
    letter-spacing: 0.03em;
}
#${p}-header h1 span {
    color: var(--twui-text-dim);
    font-weight: 400;
    font-size: 12px;
}
.${p}-header-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
}

/* ── CONFIG BAR ── */
#${p}-config-bar {
    background: var(--twui-bg-card);
    border-bottom: 1px solid var(--twui-border);
    padding: 8px 20px;
    display: flex;
    align-items: center;
    gap: 24px;
    flex-shrink: 0;
    flex-wrap: wrap;
}
.${p}-config-group {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: var(--twui-text-dim);
}
.${p}-config-group label { white-space: nowrap; }
.${p}-config-group input[type=number],
.${p}-config-group input[type=text],
.${p}-config-group select {
    background: var(--twui-bg);
    color: var(--twui-text);
    border: 1px solid var(--twui-border);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
    outline: none;
    transition: border-color 0.15s;
}
.${p}-config-group input[type=number]:focus,
.${p}-config-group input[type=text]:focus,
.${p}-config-group select:focus {
    border-color: var(--twui-green-border);
}
.${p}-config-group input[type=number] { width: 65px; }
.${p}-config-group select             { min-width: 80px; }

/* ── STATS STRIP ── */
#${p}-stats-strip {
    display: flex;
    gap: 12px;
    padding: 10px 20px;
    background: var(--twui-bg);
    border-bottom: 1px solid var(--twui-border);
    flex-shrink: 0;
    flex-wrap: wrap;
}
.${p}-stat-card {
    background: var(--twui-bg-card);
    border: 1px solid var(--twui-border);
    border-radius: 6px;
    padding: 8px 14px;
    min-width: 160px;
    flex: 1;
    transition: border-color 0.2s, transform 0.2s;
}
.${p}-stat-card:hover {
    border-color: var(--twui-green-border);
    transform: translateY(-1px);
}
.${p}-stat-title {
    font-size: 10px;
    color: var(--twui-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 5px;
}
.${p}-stat-body {
    font-size: 12px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}
.${p}-stat-val   { color: var(--twui-text); }
.${p}-stat-val b { color: var(--twui-green); }

/* ── PROGRESS BAR ── */
#${p}-progress-wrap {
    padding: 0 20px 8px;
    display: none;
    flex-shrink: 0;
}
#${p}-progress-track {
    background: var(--twui-bg-card);
    border: 1px solid var(--twui-border);
    border-radius: 6px;
    height: 22px;
    overflow: hidden;
    position: relative;
}
#${p}-progress-fill {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, var(--twui-green-dark), var(--twui-green));
    border-radius: 6px;
    transition: width 0.35s ease;
}
#${p}-progress-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    color: var(--twui-text);
    pointer-events: none;
}

/* ── TOOLBAR ── */
#${p}-toolbar {
    padding: 8px 20px;
    background: var(--twui-bg);
    border-bottom: 1px solid var(--twui-border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    flex-wrap: wrap;
}
.${p}-toolbar-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
}

/* ── MAIN LAYOUT ── */
#${p}-main {
    display: flex;
    flex: 1;
    overflow: hidden;
}
#${p}-content {
    flex: 3;
    overflow-y: auto;
}
#${p}-log-panel {
    width: 300px;
    flex-shrink: 0;
    border-left: 1px solid var(--twui-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
#${p}-log-header {
    padding: 10px 14px;
    background: var(--twui-bg-card);
    border-bottom: 1px solid var(--twui-border);
    font-size: 11px;
    color: var(--twui-green);
    font-weight: 600;
    flex-shrink: 0;
}
#${p}-log-area {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
}
.${p}-log-entry {
    padding: 5px 0;
    border-bottom: 1px solid var(--twui-border);
    font-size: 11px;
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    display: flex;
    gap: 8px;
    align-items: baseline;
}
.${p}-log-dot  { flex-shrink: 0; }
.${p}-log-time { color: var(--twui-text-dim); flex-shrink: 0; }
.${p}-log-msg  { word-break: break-word; }

/* ── TABELA ── */
.${p}-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}
.${p}-table thead th {
    background: var(--twui-bg-card);
    color: var(--twui-green);
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 10px 12px;
    border-bottom: 1px solid var(--twui-border);
    position: sticky;
    top: 0;
    z-index: 10;
    white-space: nowrap;
}
.${p}-table tbody tr {
    border-bottom: 1px solid var(--twui-border);
    transition: background 0.15s;
}
.${p}-table tbody tr:hover { background: var(--twui-green-dim); }
.${p}-table tbody td { padding: 9px 12px; vertical-align: middle; }

/* ── CÉLULAS DE ALDEIA ── */
.${p}-village-name   { font-weight: 600; color: var(--twui-text);     font-size: 12px; }
.${p}-village-coord  { font-size: 9px;   color: var(--twui-green-border); margin-top: 2px; }
.${p}-village-meta   { font-size: 10px;  color: var(--twui-text-dim); margin-top: 3px; }
.${p}-village-res    { font-size: 9px;   color: var(--twui-text-dim); margin-top: 3px; }

/* Barra de preenchimento de armazém */
.${p}-fill-bar {
    background: var(--twui-bg);
    border-radius: 3px;
    height: 4px;
    width: 70px;
    margin-top: 5px;
    overflow: hidden;
}
.${p}-fill-inner {
    height: 100%;
    background: var(--twui-red);
    border-radius: 3px;
    transition: width 0.3s;
}

/* Badge "a caminho" */
.${p}-incoming-badge {
    display: inline-block;
    margin-top: 3px;
    font-size: 9px;
    color: var(--twui-yellow);
    background: var(--twui-yellow-dim);
    border: 1px solid color-mix(in srgb, var(--twui-yellow) 30%, transparent);
    border-radius: 3px;
    padding: 1px 5px;
}

/* ── CHIPS DE RECURSO ── */
.${p}-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.${p}-chip {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    padding: 2px 7px;
    border: 1px solid transparent;
}
.${p}-chip-wood  { background: #8b691411; border-color: color-mix(in srgb, var(--twui-wood)  40%, transparent); color: #c9a227; }
.${p}-chip-stone { background: #60708011; border-color: color-mix(in srgb, var(--twui-stone) 40%, transparent); color: #8ca0b0; }
.${p}-chip-iron  { background: #5a8a9f11; border-color: color-mix(in srgb, var(--twui-iron)  40%, transparent); color: var(--twui-iron); }

/* ── BADGES GENÉRICOS ── */
.${p}-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    border-radius: 3px;
    padding: 2px 6px;
    border: 1px solid transparent;
}
.${p}-badge-green  { background: var(--twui-green-dim);  border-color: var(--twui-green-border); color: var(--twui-green); }
.${p}-badge-red    { background: var(--twui-red-dim);    border-color: color-mix(in srgb, var(--twui-red)    30%, transparent); color: var(--twui-red); }
.${p}-badge-yellow { background: var(--twui-yellow-dim); border-color: color-mix(in srgb, var(--twui-yellow) 30%, transparent); color: var(--twui-yellow); }
.${p}-badge-blue   { background: var(--twui-blue-dim);   border-color: color-mix(in srgb, var(--twui-blue)   30%, transparent); color: var(--twui-blue); }

/* ── BOTÕES ── */
.${p}-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 16px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    transition: all 0.15s;
    white-space: nowrap;
    font-family: inherit;
}
.${p}-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

.${p}-btn-primary {
    background: var(--twui-green);
    color: #000;
}
.${p}-btn-primary:hover:not(:disabled) {
    background: var(--twui-green-light);
    transform: translateY(-1px);
    box-shadow: 0 3px 10px var(--twui-green-dim);
}

.${p}-btn-warning {
    background: var(--twui-orange);
    color: #fff;
}
.${p}-btn-warning:hover:not(:disabled) {
    background: var(--twui-orange-light);
    box-shadow: 0 2px 10px color-mix(in srgb, var(--twui-orange) 40%, transparent);
}

.${p}-btn-danger {
    background: var(--twui-red-dim);
    color: var(--twui-red);
    border: 1px solid color-mix(in srgb, var(--twui-red) 30%, transparent);
}
.${p}-btn-danger:hover:not(:disabled) {
    background: var(--twui-red);
    color: #fff;
    transform: translateY(-1px);
}

.${p}-btn-ghost {
    background: transparent;
    color: var(--twui-text-dim);
    border: 1px solid var(--twui-border);
}
.${p}-btn-ghost:hover:not(:disabled) {
    border-color: var(--twui-green-border);
    color: var(--twui-green);
}

.${p}-btn-sm { padding: 4px 10px; font-size: 10px; }
.${p}-btn-lg { padding: 10px 22px; font-size: 13px; }

/* ── BOTÃO FLUTUANTE (página principal) ── */
#${p}-float-btn {
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 999999;
    padding: 7px 13px;
    background: var(--twui-bg);
    color: var(--twui-green);
    border: 1px solid color-mix(in srgb, var(--twui-green) 35%, transparent);
    border-radius: 6px;
    cursor: pointer;
    font-family: monospace;
    font-weight: bold;
    font-size: 11px;
    box-shadow: 0 2px 10px color-mix(in srgb, var(--twui-green) 8%, transparent);
    transition: all 0.2s ease;
    user-select: none;
}
#${p}-float-btn:hover {
    border-color: var(--twui-green);
    box-shadow: 0 2px 14px color-mix(in srgb, var(--twui-green) 28%, transparent);
}

/* ── SEPARADOR ── */
.${p}-divider {
    border: none;
    border-top: 1px solid var(--twui-border);
    margin: 8px 0;
}

/* ── TEXTO AUXILIAR ── */
.${p}-muted  { color: var(--twui-text-dim); font-size: 10px; }
.${p}-mono   { font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; }
.${p}-label  { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--twui-text-dim); }

/* ── EMPTY STATE ── */
.${p}-empty {
    text-align: center;
    padding: 48px 24px;
    color: var(--twui-text-dim);
}
.${p}-empty-icon  { font-size: 32px; margin-bottom: 12px; }
.${p}-empty-title { font-size: 14px; font-weight: 600; color: var(--twui-text); margin-bottom: 6px; }
.${p}-empty-sub   { font-size: 11px; }

/* ── TOOLTIP simples ── */
.${p}-tooltip-wrap { position: relative; display: inline-block; }
.${p}-tooltip-wrap .${p}-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--twui-bg-card);
    border: 1px solid var(--twui-border);
    color: var(--twui-text);
    font-size: 10px;
    padding: 4px 8px;
    border-radius: 4px;
    white-space: nowrap;
    z-index: 99999;
    pointer-events: none;
    box-shadow: 0 4px 12px #00000066;
}
.${p}-tooltip-wrap:hover .${p}-tooltip { display: block; }

/* ── SKELETON LOADER ── */
.${p}-skeleton {
    background: linear-gradient(90deg, var(--twui-border) 25%, var(--twui-bg-card) 50%, var(--twui-border) 75%);
    background-size: 200% 100%;
    animation: ${p}-shimmer 1.4s infinite;
    border-radius: 4px;
    display: inline-block;
}
@keyframes ${p}-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
`;
    }

    // ─────────────────────────────────────────────────────────────────────
    // FACTORY — TWUI.create(prefixo)
    // ─────────────────────────────────────────────────────────────────────

    const TWUI = {

        /**
         * Cria uma instância do UI Kit com prefixo isolado.
         * @param {string} prefix  Prefixo curto, ex: 'rb', 'spy', 'farm'
         * @returns {object} API de componentes
         */
        create(prefix) {
            if (!prefix || !/^[a-z][a-z0-9-]*$/.test(prefix)) {
                throw new Error(`[TWUI] Prefixo inválido: "${prefix}". Use apenas letras minúsculas, números e hífens, iniciando com letra.`);
            }

            const p = prefix;

            // ── Tokens CSS (injetados uma vez globalmente) ──────────────
            const _injectTokens = () => {
                if (document.getElementById('twui-tokens')) return;
                const el = document.createElement('style');
                el.id = 'twui-tokens';
                el.textContent = `:root {\n${Object.entries(TOKENS).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
                document.head.appendChild(el);
            };

            // ── CSS prefixado ────────────────────────────────────────────
            const _injectCSS = () => {
                const styleId = `twui-styles-${p}`;
                if (document.getElementById(styleId)) return;
                const el = document.createElement('style');
                el.id = styleId;
                el.textContent = buildCSS(p);
                document.head.appendChild(el);
            };

            // ── Helpers internos ─────────────────────────────────────────
            const $ = (id) => document.getElementById(id);
            const timeStr = () => new Date().toLocaleTimeString();

            const LOG_COLORS = {
                success: 'var(--twui-green)',
                error:   'var(--twui-red)',
                warning: 'var(--twui-yellow)',
                info:    'var(--twui-blue)',
            };

            // ── API PÚBLICA ──────────────────────────────────────────────
            return {

                prefix: p,

                /**
                 * Injeta tokens e CSS no documento.
                 * Chamar antes de qualquer renderização.
                 */
                injectStyles() {
                    _injectTokens();
                    _injectCSS();
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // LAYOUT PRINCIPAL
                // ─────────────────────────────────────────────────────────

                /**
                 * Substitui document.body e monta o wrapper raiz #p-app.
                 * @param {string} [innerHTML]  Conteúdo adicional dentro do app (opcional).
                 */
                renderApp(innerHTML = '') {
                    document.body.innerHTML = '';
                    document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;';
                    const app = document.createElement('div');
                    app.id = `${p}-app`;
                    app.innerHTML = innerHTML;
                    document.body.appendChild(app);
                    return this;
                },

                /**
                 * Retorna o elemento #p-app ou null.
                 */
                app() { return $(`${p}-app`); },

                // ─────────────────────────────────────────────────────────
                // HEADER
                // ─────────────────────────────────────────────────────────

                /**
                 * Cria e insere o header no topo do app.
                 * @param {string} title     Texto principal (aceita HTML).
                 * @param {string} [version] Versão exibida em texto apagado.
                 * @param {string} [extra]   HTML extra inserido no lado direito.
                 */
                header(title, version = '', extra = '') {
                    const el = document.createElement('div');
                    el.id = `${p}-header`;
                    el.innerHTML = `
                        <h1>${title}${version ? ` <span>${version}</span>` : ''}</h1>
                        <div class="${p}-header-right">${extra}</div>
                    `;
                    this.app()?.prepend(el);
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // CONFIG BAR
                // ─────────────────────────────────────────────────────────

                /**
                 * Insere a barra de configurações.
                 * @param {Array<{label, id, type, value, min, max, step, unit, options}>} fields
                 *   - type: 'number' | 'text' | 'select' | 'checkbox'
                 *   - options: array de {value, label} para select
                 *   - unit: texto após o input (ex: '%')
                 * @param {Function} [onChange]  Callback(id, value) chamado em mudança.
                 */
                configBar(fields = [], onChange = null) {
                    const bar = document.createElement('div');
                    bar.id = `${p}-config-bar`;

                    bar.innerHTML = fields.map(f => {
                        let input = '';
                        if (f.type === 'select') {
                            const opts = (f.options || []).map(o =>
                                `<option value="${o.value}"${o.value == f.value ? ' selected' : ''}>${o.label}</option>`
                            ).join('');
                            input = `<select id="${f.id}">${opts}</select>`;
                        } else if (f.type === 'checkbox') {
                            input = `<input type="checkbox" id="${f.id}"${f.value ? ' checked' : ''}>`;
                        } else {
                            const extras = [
                                f.min  != null ? `min="${f.min}"`   : '',
                                f.max  != null ? `max="${f.max}"`   : '',
                                f.step != null ? `step="${f.step}"` : '',
                            ].filter(Boolean).join(' ');
                            input = `<input type="${f.type || 'number'}" id="${f.id}" value="${f.value ?? ''}" ${extras}>`;
                        }
                        return `
                            <div class="${p}-config-group">
                                <label for="${f.id}">${f.label}:</label>
                                ${input}
                                ${f.unit ? `<span>${f.unit}</span>` : ''}
                            </div>`;
                    }).join('');

                    this.app()?.appendChild(bar);

                    if (onChange) {
                        fields.forEach(f => {
                            const el = $(f.id);
                            if (!el) return;
                            el.addEventListener('change', () => {
                                const val = el.type === 'checkbox' ? el.checked
                                    : el.type === 'number' ? parseFloat(el.value)
                                    : el.value;
                                onChange(f.id, val);
                            });
                        });
                    }
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // STATS STRIP
                // ─────────────────────────────────────────────────────────

                /**
                 * Insere faixa de cards de estatísticas.
                 * @param {Array<{title, id, items: [{icon, id}]}>} cards
                 *   Cada item gera um <b id="..."> atualizável via updateStat().
                 */
                statsStrip(cards = []) {
                    const strip = document.createElement('div');
                    strip.id = `${p}-stats-strip`;
                    strip.innerHTML = cards.map(c => `
                        <div class="${p}-stat-card">
                            <div class="${p}-stat-title">${c.title}</div>
                            <div class="${p}-stat-body">
                                ${(c.items || []).map(i =>
                                    `<span class="${p}-stat-val">${i.icon || ''} <b id="${i.id}">0</b></span>`
                                ).join('')}
                            </div>
                        </div>`).join('');
                    this.app()?.appendChild(strip);
                    return this;
                },

                /**
                 * Atualiza o valor de um item de estatística.
                 * @param {string} id      ID do elemento <b>
                 * @param {number|string} value
                 */
                updateStat(id, value) {
                    const el = $(id);
                    if (el) el.textContent = typeof value === 'number'
                        ? value.toLocaleString('pt-BR')
                        : value;
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // PROGRESS BAR
                // ─────────────────────────────────────────────────────────

                /** Insere o container da barra de progresso (oculto por padrão). */
                progressBar() {
                    const wrap = document.createElement('div');
                    wrap.id = `${p}-progress-wrap`;
                    wrap.innerHTML = `
                        <div id="${p}-progress-track">
                            <div id="${p}-progress-fill"></div>
                            <div id="${p}-progress-label">0%</div>
                        </div>`;
                    this.app()?.appendChild(wrap);
                    return this;
                },

                /**
                 * Atualiza e exibe a barra de progresso.
                 * @param {number} pct        0–100
                 * @param {string} [label]    Texto central (padrão: "pct%")
                 */
                setProgress(pct, label = null) {
                    const wrap  = $(`${p}-progress-wrap`);
                    const fill  = $(`${p}-progress-fill`);
                    const lbl   = $(`${p}-progress-label`);
                    if (wrap)  wrap.style.display = 'block';
                    if (fill)  fill.style.width   = `${Math.min(100, pct)}%`;
                    if (lbl)   lbl.textContent     = label ?? `${Math.round(pct)}%`;
                    return this;
                },

                /** Oculta a barra de progresso. */
                hideProgress(delay = 0) {
                    const wrap = $(`${p}-progress-wrap`);
                    const fill = $(`${p}-progress-fill`);
                    const lbl  = $(`${p}-progress-label`);
                    setTimeout(() => {
                        if (wrap) wrap.style.display = 'none';
                        if (fill) fill.style.width   = '0%';
                        if (lbl)  lbl.textContent    = '0%';
                    }, delay);
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // TOOLBAR
                // ─────────────────────────────────────────────────────────

                /**
                 * Insere a barra de ações (toolbar).
                 * @param {string} leftHTML   HTML do lado esquerdo (botões, etc.)
                 * @param {string} [rightHTML] HTML do lado direito (contadores, etc.)
                 */
                toolbar(leftHTML = '', rightHTML = '') {
                    const el = document.createElement('div');
                    el.id = `${p}-toolbar`;
                    el.innerHTML = `
                        <div style="display:flex;gap:10px;align-items:center;">${leftHTML}</div>
                        <div class="${p}-toolbar-right">${rightHTML}</div>`;
                    this.app()?.appendChild(el);
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // MAIN + LOG
                // ─────────────────────────────────────────────────────────

                /**
                 * Insere o layout principal (conteúdo + painel de log lateral).
                 * @param {string} contentHTML  HTML do conteúdo central.
                 * @param {string} [logTitle]   Título do painel de log.
                 */
                mainLayout(contentHTML = '', logTitle = '📝 Log de Atividades') {
                    const main = document.createElement('div');
                    main.id = `${p}-main`;
                    main.innerHTML = `
                        <div id="${p}-content">${contentHTML}</div>
                        <div id="${p}-log-panel">
                            <div id="${p}-log-header">${logTitle}</div>
                            <div id="${p}-log-area"></div>
                        </div>`;
                    this.app()?.appendChild(main);
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // LOG
                // ─────────────────────────────────────────────────────────

                /**
                 * Adiciona uma entrada no log.
                 * @param {string} msg
                 * @param {'success'|'error'|'warning'|'info'} [tipo='info']
                 * @param {number} [maxEntries=250]
                 */
                log(msg, tipo = 'info', maxEntries = 250) {
                    const area = $(`${p}-log-area`);
                    if (!area) return this;

                    const cor  = LOG_COLORS[tipo] || 'var(--twui-text-dim)';
                    const dot  = tipo ? '●' : '○';
                    const entry = document.createElement('div');
                    entry.className = `${p}-log-entry`;
                    entry.innerHTML = `
                        <span class="${p}-log-dot"  style="color:${cor}">${dot}</span>
                        <span class="${p}-log-time">${timeStr()}</span>
                        <span class="${p}-log-msg"  style="color:${cor}">${msg}</span>`;
                    area.insertBefore(entry, area.firstChild);

                    while (area.children.length > maxEntries) area.removeChild(area.lastChild);
                    return this;
                },

                /** Limpa todas as entradas do log. */
                clearLog() {
                    const area = $(`${p}-log-area`);
                    if (area) area.innerHTML = '';
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // BOTÃO FLUTUANTE
                // ─────────────────────────────────────────────────────────

                /**
                 * Insere um botão flutuante no canto superior direito da página.
                 * @param {string}   label  Texto/emoji do botão.
                 * @param {Function} cb     Callback ao clicar.
                 * @param {object}   [pos]  { top, right } em pixels (padrão: 10, 10).
                 */
                floatBtn(label, cb, pos = {}) {
                    if ($(`${p}-float-btn`)) return this;
                    if (!document.body) { setTimeout(() => this.floatBtn(label, cb, pos), 100); return this; }

                    const btn = document.createElement('div');
                    btn.id = `${p}-float-btn`;
                    btn.innerHTML = label;
                    if (pos.top   != null) btn.style.top   = `${pos.top}px`;
                    if (pos.right != null) btn.style.right = `${pos.right}px`;
                    btn.onclick = cb;
                    document.body.appendChild(btn);
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // HELPERS DE CONSTRUÇÃO HTML
                // ─────────────────────────────────────────────────────────

                /**
                 * Gera HTML de uma tabela.
                 * @param {string[]} headers
                 * @param {string}   tbodyId  ID para o <tbody>
                 * @returns {string} HTML da tabela
                 */
                tableHTML(headers = [], tbodyId = `${p}-tbody`) {
                    const ths = headers.map(h => `<th>${h}</th>`).join('');
                    return `
                        <table class="${p}-table">
                            <thead><tr>${ths}</tr></thead>
                            <tbody id="${tbodyId}"></tbody>
                        </table>`;
                },

                /**
                 * Gera HTML de um chip de recurso.
                 * @param {'wood'|'stone'|'iron'} type
                 * @param {number} amount
                 * @param {string} [icon]
                 */
                chipHTML(type, amount, icon = '') {
                    const icons = { wood: '🌲', stone: '🧱', iron: '⚙️' };
                    const i = icon || icons[type] || '';
                    return `<span class="${p}-chip ${p}-chip-${type}">${i} ${amount.toLocaleString('pt-BR')}</span>`;
                },

                /**
                 * Gera HTML de um badge genérico.
                 * @param {string} text
                 * @param {'green'|'red'|'yellow'|'blue'} [color='green']
                 */
                badgeHTML(text, color = 'green') {
                    return `<span class="${p}-badge ${p}-badge-${color}">${text}</span>`;
                },

                /**
                 * Gera HTML de um botão.
                 * @param {string} id
                 * @param {string} label
                 * @param {'primary'|'warning'|'danger'|'ghost'} [variant='primary']
                 * @param {string} [size]  'sm' | '' | 'lg'
                 */
                btnHTML(id, label, variant = 'primary', size = '') {
                    const sizeClass = size ? ` ${p}-btn-${size}` : '';
                    return `<button id="${id}" class="${p}-btn ${p}-btn-${variant}${sizeClass}">${label}</button>`;
                },

                /**
                 * Gera HTML de estado vazio para tabelas.
                 * @param {string} icon
                 * @param {string} title
                 * @param {string} [sub]
                 * @param {number} [colspan=4]
                 */
                emptyRowHTML(icon, title, sub = '', colspan = 4) {
                    return `
                        <tr>
                            <td colspan="${colspan}">
                                <div class="${p}-empty">
                                    <div class="${p}-empty-icon">${icon}</div>
                                    <div class="${p}-empty-title">${title}</div>
                                    ${sub ? `<div class="${p}-empty-sub">${sub}</div>` : ''}
                                </div>
                            </td>
                        </tr>`;
                },

                /**
                 * Gera HTML de skeleton loader (linhas de carregamento).
                 * @param {number} rows
                 * @param {number} [colspan=4]
                 */
                skeletonRowsHTML(rows = 3, colspan = 4) {
                    const row = `
                        <tr>
                            <td colspan="${colspan}" style="padding:10px 12px;">
                                <span class="${p}-skeleton" style="width:${40 + Math.random() * 40 | 0}%; height:12px;"></span>
                            </td>
                        </tr>`;
                    return Array(rows).fill(row).join('');
                },

                // ─────────────────────────────────────────────────────────
                // CONTROLE DE BOTÕES
                // ─────────────────────────────────────────────────────────

                /**
                 * Seta estado de loading em um botão.
                 * @param {string} id     ID do botão
                 * @param {string} [text] Texto durante loading
                 */
                btnLoading(id, text = '⏳ Aguarde…') {
                    const el = $(id);
                    if (el) { el.disabled = true; el._origText = el.textContent; el.textContent = text; }
                    return this;
                },

                /**
                 * Restaura um botão do estado de loading.
                 * @param {string} id
                 * @param {string} [text]  Se omitido, usa o texto original.
                 */
                btnRestore(id, text = null) {
                    const el = $(id);
                    if (el) { el.disabled = false; el.textContent = text ?? el._origText ?? el.textContent; }
                    return this;
                },

                // ─────────────────────────────────────────────────────────
                // TOKENS EXPOSTOS (para uso inline se necessário)
                // ─────────────────────────────────────────────────────────
                tokens: TOKENS,
            };
        }
    };

    // Expõe globalmente
    global.TWUI = TWUI;

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);


// ═══════════════════════════════════════════════════════════════════════════
//  EXEMPLO DE USO COMPLETO (remova este bloco no uso real)
// ═══════════════════════════════════════════════════════════════════════════
/*

// No seu script:
const ui = TWUI.create('rb');   // 'rb' = ResourceBalancer (prefixo único)

ui.injectStyles();
ui.renderApp();
ui.header('⚖️ Resource Balancer', 'v3.5');
ui.configBar([
    { label: 'Tolerância', id: 'rb-tolerancia', type: 'number', value: 5,    min: 1, max: 50, step: 1, unit: '%' },
    { label: 'Mínimo',     id: 'rb-min-envio',  type: 'number', value: 1000, min: 1000, step: 1000 },
    { label: 'Buffer',     id: 'rb-buffer',     type: 'number', value: 10,   min: 0, max: 40, step: 5, unit: '%' },
], (id, val) => {
    console.log(`Config ${id} = ${val}`);
});
ui.statsStrip([
    { title: '📦 Totais', items: [
        { icon: '🌲', id: 'rb-total-wood' },
        { icon: '🧱', id: 'rb-total-stone' },
        { icon: '⚙️', id: 'rb-total-iron' },
    ]},
    { title: '📊 Médias', items: [
        { icon: '🌲', id: 'rb-media-wood' },
        { icon: '🧱', id: 'rb-media-stone' },
        { icon: '⚙️', id: 'rb-media-iron' },
    ]},
]);
ui.progressBar();
ui.toolbar(
    ui.btnHTML('rb-btn-load', '🔄 CARREGAR DADOS', 'warning'),
    `<span id="rb-count" class="rb-muted"></span>`
);
ui.mainLayout(
    `<div style="overflow-x:auto;">
        ${ui.tableHTML(['Origem', 'Destino', 'Sugestão', 'Ação'], 'rb-tbody')}
     </div>`,
    '📝 Log de Atividades'
);

// Atualizar stats:
ui.updateStat('rb-total-wood', 150000);

// Log:
ui.log('Dados carregados com sucesso!', 'success');
ui.log('Atenção: buffer ativo', 'warning');

// Barra de progresso:
ui.setProgress(55, '55%  (11/20)');
ui.hideProgress(2000);

// Estado de botão:
ui.btnLoading('rb-btn-load', '⏳ Carregando…');
ui.btnRestore('rb-btn-load', '🔄 CARREGAR DADOS');

// Chips e badges inline:
const chipHtml  = ui.chipHTML('wood', 12000);          // → span com estilo madeira
const badgeHtml = ui.badgeHTML('✅ Balanceado');         // → badge verde
const emptyRow  = ui.emptyRowHTML('📭', 'Sem dados', 'Clique em CARREGAR', 4);

// Botão flutuante (página principal):
ui.floatBtn('⚖️ Resource Balancer', () => {
    window.open('/game.php?twBalancer=true', 'TWBalancer');
});

// Segundo script rodando junto sem conflito:
const ui2 = TWUI.create('spy');   // prefixo 'spy' — IDs e classes totalmente distintos
ui2.injectStyles();
// ...

*/
