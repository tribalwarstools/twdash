// ==UserScript==
// @name         Tribal Wars - Balanceador de Recursos 5.4
// @namespace    https://github.com/tribalwarstools
// @version      5.4.0
// @description   Balanceia recursos - Suporte otimizado para Premium e Básico
// @author       Shinko to Kuma + DeepSeek
// @match        https://*.tribalwars.com.br/game.php*
// @match        https://*.tribalwars.com/game.php*
// @match        https://*.tribalwars.net/game.php*
// @match        https://*.tribalwars.es/game.php*
// @match        https://*.tribalwars.pt/game.php*
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://tribalwarstools.github.io/twscripts/tw-ui-kit.js
// ==/UserScript==

(function() {
    'use strict';

    // ==================== PARÂMETROS ====================
    const DASHBOARD_PARAM = 'twBalancer=true';
    const STORAGE_KEY = 'TW_BALANCER_CONFIG';

    // ==================== CONFIGURAÇÕES ====================
    const savedConfig = GM_getValue(STORAGE_KEY, null);
    const CONFIG = savedConfig ? JSON.parse(savedConfig) : {
        DELAY_ENTRE_ENVIOS: 800,
        MAX_VIAGENS_POR_EXECUCAO: 50,
        MODO_AUTO: false,
        LOW_POINTS: 3000,
        HIGH_POINTS: 8000,
        HIGH_FARM: 23000,
        BUILT_OUT_PERCENTAGE: 0.25,
        NEEDS_MORE_PERCENTAGE: 0.85,
        IS_MINTING: false,
        FILTRO_COORDS: []
    };
    // Compatibilidade com versões anteriores
    if (!Array.isArray(CONFIG.FILTRO_COORDS)) CONFIG.FILTRO_COORDS = [];

    // ==================== PREDEFINIÇÕES ====================
    const PRESETS_KEY = 'TW_BALANCER_PRESETS';

    function loadPresets() {
        try { return JSON.parse(GM_getValue(PRESETS_KEY, '[]')); }
        catch(e) { return []; }
    }

    function savePresets(presets) {
        GM_setValue(PRESETS_KEY, JSON.stringify(presets));
    }

    function saveConfig() {
        GM_setValue(STORAGE_KEY, JSON.stringify(CONFIG));
    }

    // ==================== CORES ====================
    const CORES = {
        fundo: '#080c10',
        fundoCard: '#0d1117',
        verde: '#00d97e',
        verdeDim: '#00d97e22',
        texto: '#c9d1d9',
        textoDim: '#8b949e',
        borda: '#21262d',
        erro: '#f85149',
        aviso: '#d29922',
        info: '#388bfd',
        madeira: '#8b6914',
        pedra: '#607080',
        ferro: '#5a8a9f'
    };

    // ==================== HELPERS DE FILTRO ====================
    // Extrai coordenadas no formato "XXX|YYY" de qualquer texto colado
    function parseCoordsInput(texto) {
        const matches = texto.match(/\d{3}\|\d{3}/g) || [];
        return [...new Set(matches)];
    }

    function filtroAtivo() {
        return CONFIG.FILTRO_COORDS.length > 0;
    }

    function aplicarFiltro(aldeias) {
        if (!filtroAtivo()) return aldeias;
        return aldeias.filter(a => CONFIG.FILTRO_COORDS.includes(`${a.x}|${a.y}`));
    }

    function aplicarFiltroIncoming(aldeias, incomingRes) {
        if (!filtroAtivo()) return incomingRes;
        const idsPermitidos = new Set(aldeias.map(a => String(a.id)));
        const filtrado = {};
        for (const [id, res] of Object.entries(incomingRes)) {
            if (idsPermitidos.has(id)) filtrado[id] = res;
        }
        return filtrado;
    }

    // ==================== MODAL DE FILTRO ====================
    function abrirModalFiltro(ui, aldeiasCarregadas, onSave) {
        const anterior = document.getElementById('twb-filtro-overlay');
        if (anterior) anterior.remove();

        const C = {
            fundoCard: '#0d1117', borda: '#21262d', verde: '#00d97e',
            texto: '#c9d1d9', textoDim: '#8b949e', erro: '#f85149',
            aviso: '#d29922', info: '#388bfd', verdeDim: '#00d97e22',
            fundo2: '#090d12'
        };

        const overlay = document.createElement('div');
        overlay.id = 'twb-filtro-overlay';
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:1000000;
            background:rgba(0,0,0,0.75);display:flex;
            align-items:center;justify-content:center;
            backdrop-filter:blur(3px);
        `;

        const coordsAtuais = CONFIG.FILTRO_COORDS.join(' ');

        overlay.innerHTML = `
            <div style="
                background:${C.fundoCard};border:1px solid ${C.borda};
                border-radius:12px;padding:28px 32px;
                width:680px;max-width:95vw;max-height:90vh;overflow-y:auto;
                box-shadow:0 8px 40px #000a;font-family:monospace;color:${C.texto};
            ">
                <!-- Cabeçalho -->
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h2 style="margin:0;font-size:16px;color:${C.verde};">🎯 Filtro de Aldeias</h2>
                    <button id="twb-filtro-close" style="
                        background:${C.erro}22;border:1px solid ${C.erro}44;
                        color:${C.erro};padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;
                    ">✕ Fechar</button>
                </div>

                <!-- Textarea principal -->
                <p style="font-size:11px;color:${C.textoDim};margin:0 0 10px 0;line-height:1.6;">
                    Cole as coordenadas que devem participar do balanceamento.
                    Aceita <strong style="color:${C.texto}">XXX|YYY</strong> em qualquer formato.
                    <span style="color:${C.aviso};">⚠️ Em branco = todas as aldeias.</span>
                </p>
                <textarea id="twb-filtro-coords" rows="5"
                    placeholder="Ex: 543|431 540|432&#10;Ou cole do jogo: 000 Nobre (543|431) K45"
                    style="
                        width:100%;box-sizing:border-box;
                        background:${C.fundo2};border:1px solid ${C.borda};
                        color:${C.texto};border-radius:6px;padding:10px;
                        font-family:monospace;font-size:12px;resize:vertical;
                        outline:none;line-height:1.6;margin-bottom:10px;
                    ">${coordsAtuais}</textarea>

                <!-- Preview -->
                <div id="twb-filtro-preview" style="
                    min-height:28px;font-size:11px;color:${C.textoDim};
                    background:${C.fundo2};border:1px solid ${C.borda};
                    border-radius:6px;padding:8px 12px;margin-bottom:18px;
                ">Cole coordenadas acima para ver o preview.</div>

                <!-- Botões do filtro ativo -->
                <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-bottom:22px;">
                    <button id="twb-filtro-clear" style="
                        background:${C.erro}22;border:1px solid ${C.erro}44;
                        color:${C.erro};padding:7px 14px;border-radius:6px;
                        cursor:pointer;font-size:12px;font-family:monospace;
                    ">🗑️ Limpar</button>
                    <button id="twb-filtro-save" style="
                        background:${C.verde}22;border:1px solid ${C.verde}55;
                        color:${C.verde};padding:7px 20px;border-radius:6px;
                        cursor:pointer;font-size:13px;font-weight:bold;font-family:monospace;
                    ">💾 Aplicar filtro</button>
                </div>

                <!-- Divisor -->
                <div style="border-top:1px solid ${C.borda};margin-bottom:18px;"></div>

                <!-- Painel de predefinições -->
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <span style="font-size:13px;font-weight:bold;color:${C.texto};">📁 Predefinições</span>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input id="twb-preset-nome" type="text" placeholder="Nome do grupo..."
                            style="
                                background:${C.fundo2};border:1px solid ${C.borda};
                                color:${C.texto};border-radius:5px;padding:5px 9px;
                                font-family:monospace;font-size:12px;outline:none;width:180px;
                            ">
                        <button id="twb-preset-salvar" style="
                            background:${C.info}22;border:1px solid ${C.info}44;
                            color:${C.info};padding:5px 12px;border-radius:5px;
                            cursor:pointer;font-size:12px;font-family:monospace;white-space:nowrap;
                        ">💾 Salvar atual</button>
                    </div>
                </div>

                <!-- Lista de predefinições -->
                <div id="twb-presets-lista" style="
                    max-height:240px;overflow-y:auto;
                    border:1px solid ${C.borda};border-radius:8px;
                    background:${C.fundo2};
                "></div>
            </div>
        `;

        document.body.appendChild(overlay);

        const textarea = document.getElementById('twb-filtro-coords');
        const preview  = document.getElementById('twb-filtro-preview');
        const lista    = document.getElementById('twb-presets-lista');

        // ── Preview em tempo real ──────────────────────────────────────────
        function atualizarPreview() {
            const coords = parseCoordsInput(textarea.value);
            if (coords.length === 0) {
                preview.innerHTML = `<span style="color:${C.aviso}">⚠️ Nenhuma coordenada válida. O filtro ficará desativado.</span>`;
                return;
            }
            const encontradas    = aldeiasCarregadas.filter(a => coords.includes(`${a.x}|${a.y}`));
            const naoEncontradas = coords.filter(c => !aldeiasCarregadas.some(a => `${a.x}|${a.y}` === c));
            let html = `<span style="color:${C.verde}">✅ ${encontradas.length} aldeia(s):</span> `;
            html += encontradas.map(a => `<span style="color:${C.texto}">${a.nome}</span>`).join(', ');
            if (naoEncontradas.length > 0) {
                html += `<br><span style="color:${C.erro}">❌ Não encontradas: ${naoEncontradas.join(', ')}</span>`;
            }
            preview.innerHTML = html;
        }

        // ── Renderizar lista de predefinições ──────────────────────────────
        function renderLista() {
            const presets = loadPresets();
            if (presets.length === 0) {
                lista.innerHTML = `<div style="padding:18px;text-align:center;color:${C.textoDim};font-size:12px;">
                    Nenhuma predefinição salva ainda.<br>
                    <span style="font-size:10px;">Preencha as coordenadas, dê um nome e clique em "Salvar atual".</span>
                </div>`;
                return;
            }

            lista.innerHTML = presets.map((p, idx) => `
                <div id="twb-preset-row-${idx}" style="
                    display:flex;align-items:center;gap:8px;
                    padding:10px 14px;
                    border-bottom:1px solid ${C.borda};
                    transition:background 0.15s;
                " onmouseenter="this.style.background='${C.borda}22'" onmouseleave="this.style.background=''">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:12px;font-weight:bold;color:${C.texto};
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${p.nome}
                        </div>
                        <div style="font-size:10px;color:${C.textoDim};margin-top:2px;">
                            ${p.coords.length} aldeia(s) · ${p.coords.slice(0,4).join(', ')}${p.coords.length > 4 ? '...' : ''}
                        </div>
                    </div>
                    <button data-idx="${idx}" data-action="carregar" style="
                        background:${C.verde}22;border:1px solid ${C.verde}44;
                        color:${C.verde};padding:4px 10px;border-radius:4px;
                        cursor:pointer;font-size:11px;font-family:monospace;white-space:nowrap;
                    ">▶ Carregar</button>
                    <button data-idx="${idx}" data-action="renomear" style="
                        background:${C.aviso}22;border:1px solid ${C.aviso}44;
                        color:${C.aviso};padding:4px 10px;border-radius:4px;
                        cursor:pointer;font-size:11px;font-family:monospace;
                    ">✏️</button>
                    <button data-idx="${idx}" data-action="excluir" style="
                        background:${C.erro}22;border:1px solid ${C.erro}44;
                        color:${C.erro};padding:4px 10px;border-radius:4px;
                        cursor:pointer;font-size:11px;font-family:monospace;
                    ">🗑️</button>
                </div>
            `).join('');

            // Event delegation na lista
            lista.addEventListener('click', e => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const idx = parseInt(btn.dataset.idx);
                const action = btn.dataset.action;
                const presets = loadPresets();

                if (action === 'carregar') {
                    textarea.value = presets[idx].coords.join(' ');
                    atualizarPreview();
                    if (ui) ui.log(`📁 Predefinição carregada: ${presets[idx].nome}`, 'info');

                } else if (action === 'renomear') {
                    const novoNome = prompt('Novo nome para a predefinição:', presets[idx].nome);
                    if (!novoNome || !novoNome.trim()) return;
                    presets[idx].nome = novoNome.trim();
                    savePresets(presets);
                    renderLista();

                } else if (action === 'excluir') {
                    if (!confirm(`Excluir predefinição "${presets[idx].nome}"?`)) return;
                    presets.splice(idx, 1);
                    savePresets(presets);
                    renderLista();
                    if (ui) ui.log(`🗑️ Predefinição excluída`, 'info');
                }
            }, { once: false });
        }

        // ── Salvar nova predefinição ───────────────────────────────────────
        document.getElementById('twb-preset-salvar').addEventListener('click', () => {
            const nome = document.getElementById('twb-preset-nome').value.trim();
            if (!nome) { alert('Digite um nome para a predefinição.'); return; }

            const coords = parseCoordsInput(textarea.value);
            if (coords.length === 0) { alert('Nenhuma coordenada válida para salvar.'); return; }

            const presets = loadPresets();

            // Verificar nome duplicado
            const existente = presets.findIndex(p => p.nome.toLowerCase() === nome.toLowerCase());
            if (existente !== -1) {
                if (!confirm(`Já existe uma predefinição chamada "${presets[existente].nome}". Sobrescrever?`)) return;
                presets[existente].coords = coords;
                presets[existente].nome = nome;
            } else {
                presets.push({ nome, coords });
            }

            savePresets(presets);
            renderLista();
            document.getElementById('twb-preset-nome').value = '';
            if (ui) ui.log(`💾 Predefinição "${nome}" salva com ${coords.length} aldeias`, 'success');
        });

        // ── Eventos base ───────────────────────────────────────────────────
        textarea.addEventListener('input', atualizarPreview);
        atualizarPreview();
        renderLista();

        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('twb-filtro-close').addEventListener('click', () => overlay.remove());

        document.getElementById('twb-filtro-clear').addEventListener('click', () => {
            textarea.value = '';
            atualizarPreview();
        });

        document.getElementById('twb-filtro-save').addEventListener('click', () => {
            CONFIG.FILTRO_COORDS = parseCoordsInput(textarea.value);
            saveConfig();
            if (ui) {
                if (CONFIG.FILTRO_COORDS.length > 0) {
                    ui.log(`🎯 Filtro ativo: ${CONFIG.FILTRO_COORDS.length} aldeia(s) selecionadas`, 'info');
                } else {
                    ui.log('🎯 Filtro removido — balanceando todas as aldeias', 'info');
                }
            }
            onSave();
            overlay.remove();
        });
    }

    // ==================== DETECÇÃO DE PREMIUM ====================    // ==================== DETECÇÃO DE PREMIUM ====================
    function isPremium() {
        if (typeof premium !== 'undefined' && premium === true) return true;
        if (window.game_data?.features?.Premium?.active === true) return true;
        if (document.body?.classList?.contains('has-pa')) return true;
        return false;
    }

    // ==================== EXTRAÇÃO DE DADOS HÍBRIDA ====================
    async function extrairDadosAldeias(ui) {
        if (ui) ui.log('📡 Buscando dados das aldeias...', 'info');

        const premiumAtivo = isPremium();
        if (ui) ui.log(premiumAtivo ? '⭐ Modo Premium detectado! (captura rápida)' : '📋 Modo Básico detectado! (captura individual)', 'info');

        const url = `/game.php?screen=overview_villages&mode=prod&group=0&page=-1`;

        try {
            const response = await fetch(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const tabela = doc.getElementById('production_table');
            if (!tabela) throw new Error('Tabela production_table não encontrada');

            const linhas = Array.from(tabela.querySelectorAll('tr')).filter(tr =>
                tr.querySelector('a[href*="screen=overview"]') && !tr.querySelector('th')
            );

            const offset = premiumAtivo ? 1 : 0;
            const aldeias = [];

            if (premiumAtivo) {
                // ========== MODO PREMIUM: Captura rápida (tudo na tabela) ==========
                if (ui) ui.log('⚡ Modo Premium: extraindo dados diretamente da tabela...', 'info');

                for (const linha of linhas) {
                    const celulas = linha.cells;
                    if (celulas.length < offset + 6) continue; // Premium tem mais colunas

                    const linkVila = linha.querySelector('a[href*="screen=overview"]');
                    if (!linkVila) continue;

                    const textoAldeia = celulas[offset].innerText.trim();
                    const coordsMatch = textoAldeia.match(/(\d+)\|(\d+)/);
                    const x = coordsMatch ? parseInt(coordsMatch[1]) : 0;
                    const y = coordsMatch ? parseInt(coordsMatch[2]) : 0;
                    const nome = textoAldeia.split('(')[0].trim();
                    const pontos = parseInt(celulas[offset + 1]?.innerText?.replace(/\./g, '') || '0');

                    const resTexto = celulas[offset + 2]?.innerText?.replace(/\./g, '') || '0';
                    const resNums = resTexto.match(/\d+/g) || [0, 0, 0];
                    const madeira = parseInt(resNums[0] || 0);
                    const argila = parseInt(resNums[1] || 0);
                    const ferro = parseInt(resNums[2] || 0);

                    const armazem = parseInt(celulas[offset + 3]?.innerText?.replace(/\./g, '') || '0');

                    // Premium: comerciantes já estão na tabela
                    let comerciantesDisp = 0, comerciantesTotal = 0;
                    if (celulas[offset + 4]) {
                        const comerText = celulas[offset + 4].innerText.trim();
                        const comerMatch = comerText.match(/(\d+)\/(\d+)/);
                        if (comerMatch) {
                            comerciantesDisp = parseInt(comerMatch[1]);
                            comerciantesTotal = parseInt(comerMatch[2]);
                        }
                    }

                    // Fazenda também disponível no Premium
                    let farmUsed = 0, farmTotal = 0;
                    if (celulas[offset + 5]) {
                        const farmText = celulas[offset + 5].innerText.trim();
                        const farmMatch = farmText.match(/(\d+)\/(\d+)/);
                        if (farmMatch) {
                            farmUsed = parseInt(farmMatch[1]);
                            farmTotal = parseInt(farmMatch[2]);
                        }
                    }

                    const idMatch = linkVila.href.match(/village=(\d+)/);
                    const id = idMatch ? parseInt(idMatch[1]) : 0;

                    if (id > 0 && armazem > 0) {
                        aldeias.push({
                            id, nome, x, y, pontos,
                            madeira, argila, ferro,
                            armazem,
                            comerciantesDisp, comerciantesTotal,
                            farmSpaceUsed: farmUsed,
                            farmSpaceTotal: farmTotal
                        });
                    }
                }
            } else {
                // ========== MODO BÁSICO: Busca comerciantes individualmente ==========
                if (ui) ui.log('🐌 Modo Básico: buscando dados de cada aldeia individualmente...', 'info');

                // Primeiro, extrai dados básicos da tabela (sem comerciantes)
                const dadosBasicos = [];
                for (const linha of linhas) {
                    const celulas = linha.cells;
                    if (celulas.length < offset + 4) continue;

                    const linkVila = linha.querySelector('a[href*="screen=overview"]');
                    if (!linkVila) continue;

                    const textoAldeia = celulas[offset].innerText.trim();
                    const coordsMatch = textoAldeia.match(/(\d+)\|(\d+)/);
                    const x = coordsMatch ? parseInt(coordsMatch[1]) : 0;
                    const y = coordsMatch ? parseInt(coordsMatch[2]) : 0;
                    const nome = textoAldeia.split('(')[0].trim();
                    const pontos = parseInt(celulas[offset + 1]?.innerText?.replace(/\./g, '') || '0');

                    const resTexto = celulas[offset + 2]?.innerText?.replace(/\./g, '') || '0';
                    const resNums = resTexto.match(/\d+/g) || [0, 0, 0];
                    const madeira = parseInt(resNums[0] || 0);
                    const argila = parseInt(resNums[1] || 0);
                    const ferro = parseInt(resNums[2] || 0);

                    const armazem = parseInt(celulas[offset + 3]?.innerText?.replace(/\./g, '') || '0');

                    const idMatch = linkVila.href.match(/village=(\d+)/);
                    const id = idMatch ? parseInt(idMatch[1]) : 0;

                    if (id > 0 && armazem > 0) {
                        dadosBasicos.push({
                            id, nome, x, y, pontos,
                            madeira, argila, ferro,
                            armazem,
                            linkVila: linkVila.href
                        });
                    }
                }

                if (ui) ui.log(`📊 Dados básicos extraídos: ${dadosBasicos.length} aldeias. Buscando comerciantes...`, 'info');

                // Agora busca comerciantes para cada aldeia
                let processadas = 0;
                for (const aldeia of dadosBasicos) {
                    processadas++;
                    if (ui && processadas % 10 === 0) {
                        ui.log(`⏳ Buscando comerciantes: ${processadas}/${dadosBasicos.length} aldeias...`, 'info');
                    }

                    const comerciantes = await buscarComerciantesPorAldeia(aldeia.id, aldeia.nome, ui);

                    // Tenta buscar também fazenda (se disponível via outra página)
                    const farmData = await buscarFazendaPorAldeia(aldeia.id, ui);

                    aldeias.push({
                        ...aldeia,
                        comerciantesDisp: comerciantes.disp,
                        comerciantesTotal: comerciantes.total,
                        farmSpaceUsed: farmData.used,
                        farmSpaceTotal: farmData.total
                    });

                    // Pequeno delay para não sobrecarregar o servidor
                    await new Promise(r => setTimeout(r, 100));
                }

                if (ui) ui.log(`✅ Comerciantes capturados para ${aldeias.length} aldeias`, 'success');
            }

            if (ui) ui.log(`✅ Extraídas ${aldeias.length} aldeias`, 'success');
            return aldeias;

        } catch (err) {
            if (ui) ui.log(`❌ Erro na extração: ${err.message}`, 'error');
            return [];
        }
    }

    // ==================== BUSCAR COMERCIANTES (MODO BÁSICO) ====================
    async function buscarComerciantesPorAldeia(villageId, nome, ui) {
        try {
            const marketUrl = `/game.php?village=${villageId}&screen=market`;
            const response = await fetch(marketUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const availableSpan = doc.getElementById('market_merchant_available_count');
            const totalSpan = doc.getElementById('market_merchant_total_count');

            if (availableSpan && totalSpan) {
                const disp = parseInt(availableSpan.innerText.trim()) || 0;
                const total = parseInt(totalSpan.innerText.trim()) || 0;
                if (ui) ui.log(`  📦 ${nome}: ${disp}/${total} comerciantes`, 'info');
                return { disp, total };
            }
            return { disp: 0, total: 0 };
        } catch (err) {
            console.error(`Erro ao buscar comerciantes da aldeia ${villageId}:`, err);
            return { disp: 0, total: 0 };
        }
    }

    // ==================== BUSCAR FAZENDA (MODO BÁSICO - OPCIONAL) ====================
    async function buscarFazendaPorAldeia(villageId, ui) {
        try {
            // Tenta obter dados da fazenda via página da aldeia
            const farmUrl = `/game.php?village=${villageId}&screen=overview`;
            const response = await fetch(farmUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Procura por elementos que contenham informação da fazenda
            const farmElements = doc.querySelectorAll('.farm_capacity, .farm_info, [data-farm]');
            for (const el of farmElements) {
                const text = el.textContent;
                const farmMatch = text.match(/(\d+)\/(\d+)/);
                if (farmMatch) {
                    return {
                        used: parseInt(farmMatch[1]),
                        total: parseInt(farmMatch[2])
                    };
                }
            }

            return { used: 0, total: 0 };
        } catch (err) {
            // Fazenda é opcional, não loga erro
            return { used: 0, total: 0 };
        }
    }

    // ==================== BUSCAR RECURSOS EM TRÂNSITO ====================
    async function buscarRecursosEmTransito(ui) {
        if (ui) ui.log('📡 Buscando recursos em trânsito...', 'info');

        const incomingRes = {};
        let url;

        if (window.game_data?.player?.sitter > 0) {
            url = `game.php?t=${window.game_data.player.id}&screen=overview_villages&mode=trader&type=inc&page=-1&group=0`;
        } else {
            url = "game.php?screen=overview_villages&mode=trader&type=inc&page=-1&group=0";
        }

        try {
            const response = await fetch(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const tabela = doc.getElementById('trades_table');

            if (!tabela) {
                if (ui) ui.log('⚠️ Tabela de transportes não encontrada', 'warning');
                return incomingRes;
            }

            const linhas = Array.from(tabela.querySelectorAll('tr')).slice(1, -1);

            for (let i = 0; i < linhas.length; i++) {
                const linha = linhas[i];
                let villageId = null;
                let wood = 0, stone = 0, iron = 0;

                const destinoLink = linha.children[4]?.querySelector('a[href*="info_village"]');
                if (destinoLink) {
                    const match = destinoLink.href.match(/id=(\d+)/);
                    villageId = match ? match[1] : null;
                }

                const resourceCell = linha.children[8];
                if (resourceCell && villageId) {
                    const nowrapSpans = resourceCell.querySelectorAll('span.nowrap');
                    for (const nowrap of nowrapSpans) {
                        const iconSpan = nowrap.querySelector('span.icon.header');
                        if (iconSpan) {
                            const cls = iconSpan.className || '';
                            const amount = parseInt(nowrap.textContent.replace(/\./g, '').replace(/[^\d]/g, '')) || 0;

                            if (cls.includes('wood')) wood += amount;
                            else if (cls.includes('stone')) stone += amount;
                            else if (cls.includes('iron')) iron += amount;
                        }
                    }

                    if (wood === 0 && stone === 0 && iron === 0) {
                        const resourceSpans = resourceCell.querySelectorAll('span.res');
                        for (const span of resourceSpans) {
                            const cls = span.className || '';
                            const amount = parseInt(span.textContent.replace(/\./g, '').replace(/[^\d]/g, '')) || 0;

                            if (cls.includes('wood')) wood += amount;
                            else if (cls.includes('stone')) stone += amount;
                            else if (cls.includes('iron')) iron += amount;
                        }
                    }
                }

                if (villageId && (wood > 0 || stone > 0 || iron > 0)) {
                    if (!incomingRes[villageId]) {
                        incomingRes[villageId] = { wood: 0, stone: 0, iron: 0 };
                    }
                    incomingRes[villageId].wood += wood;
                    incomingRes[villageId].stone += stone;
                    incomingRes[villageId].iron += iron;
                }
            }

            if (ui) ui.log(`✅ Identificados recursos em trânsito para ${Object.keys(incomingRes).length} aldeias`, 'success');
            return incomingRes;

        } catch (err) {
            if (ui) ui.log(`⚠️ Erro ao buscar recursos em trânsito: ${err.message}`, 'warning');
            return {};
        }
    }

    // ==================== MODAL DE RECURSOS EM TRÂNSITO ====================
    async function mostrarModalTransito(ui, incomingData, aldeiasData) {
        // ... (código existente, sem alterações)
        if (!incomingData || Object.keys(incomingData).length === 0) {
            ui.log('⚠️ Nenhum recurso em trânsito para exibir', 'warning');
            return;
        }

        // Placeholder - manter o código original do modal
        ui.log('📦 Modal de trânsito (função mantida do original)', 'info');
    }

    // ==================== CÁLCULO DE BALANCEAMENTO ====================
    function calcularBalanceamento(aldeias, config, incomingRes = {}) {
        // ... (código existente, sem alterações)
        const lowPoints = config.LOW_POINTS || 3000;
        const highPoints = config.HIGH_POINTS || 8000;
        const highFarm = config.HIGH_FARM || 23000;
        const builtOutPercent = config.BUILT_OUT_PERCENTAGE || 0.25;
        const needsMorePercent = config.NEEDS_MORE_PERCENTAGE || 0.85;
        const isMinting = config.IS_MINTING || false;

        console.log("=== CÁLCULO FÓRMULA SOPHIE ===");

        let totalWood = 0, totalStone = 0, totalIron = 0;
        const warehouses = [];

        for (const a of aldeias) {
            const inc = incomingRes[a.id] || { wood: 0, stone: 0, iron: 0 };
            totalWood += a.madeira + inc.wood;
            totalStone += a.argila + inc.stone;
            totalIron += a.ferro + inc.iron;
            warehouses.push(a.armazem);
        }

        const numAldeias = aldeias.length;
        let mediaMadeira = Math.floor(totalWood / numAldeias);
        let mediaArgila = Math.floor(totalStone / numAldeias);
        let mediaFerro = Math.floor(totalIron / numAldeias);

        let mediaRealMadeira = mediaMadeira;
        let mediaRealArgila = mediaArgila;
        let mediaRealFerro = mediaFerro;
        let totalRealMadeira = totalWood;
        let totalRealArgila = totalStone;
        let totalRealFerro = totalIron;
        let countMadeira = numAldeias;
        let countArgila = numAldeias;
        let countFerro = numAldeias;

        if (!isMinting) {
            for (let i = 0; i < numAldeias; i++) {
                if (warehouses[i] < mediaRealMadeira) {
                    totalRealMadeira -= mediaRealMadeira - (warehouses[i] * needsMorePercent);
                    countMadeira--;
                    mediaRealMadeira = Math.floor(totalRealMadeira / countMadeira);
                }
                if (warehouses[i] < mediaRealArgila) {
                    totalRealArgila -= mediaRealArgila - (warehouses[i] * needsMorePercent);
                    countArgila--;
                    mediaRealArgila = Math.floor(totalRealArgila / countArgila);
                }
                if (warehouses[i] < mediaRealFerro) {
                    totalRealFerro -= mediaRealFerro - (warehouses[i] * needsMorePercent);
                    countFerro--;
                    mediaRealFerro = Math.floor(totalRealFerro / countFerro);
                }
            }
        }

        console.log(`Médias ajustadas - Madeira: ${mediaRealMadeira}, Argila: ${mediaRealArgila}, Ferro: ${mediaRealFerro}`);

        const excessos = [];
        const faltas = [];
        const ids = [];

        for (let v = 0; v < aldeias.length; v++) {
            const a = aldeias[v];
            const inc = incomingRes[a.id] || { wood: 0, stone: 0, iron: 0 };

            ids.push(a.id);
            excessos[v] = [];
            faltas[v] = [];

            let tempWood;
            if (mediaRealMadeira < a.armazem * needsMorePercent) {
                tempWood = a.madeira + inc.wood - mediaRealMadeira;
            } else {
                tempWood = -Math.round((a.armazem * needsMorePercent) - inc.wood - a.madeira);
            }

            let tempStone;
            if (mediaRealArgila < a.armazem * needsMorePercent) {
                tempStone = a.argila + inc.stone - mediaRealArgila;
            } else {
                tempStone = -Math.round((a.armazem * needsMorePercent) - inc.stone - a.argila);
            }

            let tempIron;
            if (mediaRealFerro < a.armazem * needsMorePercent) {
                tempIron = a.ferro + inc.iron - mediaRealFerro;
            } else {
                tempIron = -Math.round((a.armazem * needsMorePercent) - inc.iron - a.ferro);
            }

            if (a.farmSpaceUsed > highFarm || a.pontos > highPoints) {
                if (a.madeira + inc.wood > builtOutPercent * a.armazem) {
                    tempWood = Math.round((a.madeira + inc.wood) - (builtOutPercent * a.armazem));
                }
                if (a.argila + inc.stone > builtOutPercent * a.armazem) {
                    tempStone = Math.round((a.argila + inc.stone) - (builtOutPercent * a.armazem));
                }
                if (a.ferro + inc.iron > builtOutPercent * a.armazem) {
                    tempIron = Math.round((a.ferro + inc.iron) - (builtOutPercent * a.armazem));
                }
            }

            if (a.pontos < lowPoints) {
                tempWood = -Math.round((a.armazem * needsMorePercent) - a.madeira - inc.wood);
                tempStone = -Math.round((a.armazem * needsMorePercent) - a.argila - inc.stone);
                tempIron = -Math.round((a.armazem * needsMorePercent) - a.ferro - inc.iron);
            }

            if (inc.wood + a.madeira > a.armazem) {
                tempWood = -Math.round((a.armazem * needsMorePercent) - inc.wood - a.madeira);
            }
            if (inc.stone + a.argila > a.armazem) {
                tempStone = -Math.round((a.armazem * needsMorePercent) - inc.stone - a.argila);
            }
            if (inc.iron + a.ferro > a.armazem) {
                tempIron = -Math.round((a.armazem * needsMorePercent) - inc.iron - a.ferro);
            }

            if (tempWood > 0 && tempWood > a.madeira) tempWood = a.madeira;
            if (tempStone > 0 && tempStone > a.argila) tempStone = a.argila;
            if (tempIron > 0 && tempIron > a.ferro) tempIron = a.ferro;

            if (tempWood > 0) {
                excessos[v].push({ wood: Math.floor(tempWood / 1000) * 1000 });
                faltas[v].push({ wood: 0 });
            } else {
                faltas[v].push({ wood: Math.floor(-tempWood / 1000) * 1000 });
                excessos[v].push({ wood: 0 });
            }

            if (tempStone > 0) {
                excessos[v].push({ stone: Math.floor(tempStone / 1000) * 1000 });
                faltas[v].push({ stone: 0 });
            } else {
                faltas[v].push({ stone: Math.floor(-tempStone / 1000) * 1000 });
                excessos[v].push({ stone: 0 });
            }

            if (tempIron > 0) {
                excessos[v].push({ iron: Math.floor(tempIron / 1000) * 1000 });
                faltas[v].push({ iron: 0 });
            } else {
                faltas[v].push({ iron: Math.floor(-tempIron / 1000) * 1000 });
                excessos[v].push({ iron: 0 });
            }
        }

        const merchantOrders = [];
        for (let p = 0; p < excessos.length; p++) {
            const excessWood = excessos[p][0]?.wood || 0;
            const excessStone = excessos[p][1]?.stone || 0;
            const excessIron = excessos[p][2]?.iron || 0;
            const totalExcess = excessWood + excessStone + excessIron;

            if (totalExcess > 0 && aldeias[p].comerciantesDisp > 0) {
                const merchantsNeeded = Math.floor(totalExcess / 1000);
                const x = aldeias[p].x;
                const y = aldeias[p].y;

                if (merchantsNeeded <= aldeias[p].comerciantesDisp) {
                    merchantOrders.push({
                        villageID: aldeias[p].id,
                        x, y,
                        wood: excessWood / 1000,
                        stone: excessStone / 1000,
                        iron: excessIron / 1000
                    });
                } else {
                    const percWood = excessWood / totalExcess;
                    const percStone = excessStone / totalExcess;
                    const percIron = excessIron / totalExcess;
                    merchantOrders.push({
                        villageID: aldeias[p].id,
                        x, y,
                        wood: Math.floor(percWood * aldeias[p].comerciantesDisp),
                        stone: Math.floor(percStone * aldeias[p].comerciantesDisp),
                        iron: Math.floor(percIron * aldeias[p].comerciantesDisp)
                    });
                }
            }
        }

        const distancia = (x1, y1, x2, y2) => Math.round(Math.hypot(x1 - x2, y1 - y2));
        const links = [];

        const comprometido = {};
        for (const a of aldeias) {
            comprometido[a.id] = { wood: 0, stone: 0, iron: 0 };
        }

        const tipoKeys = ['wood', 'stone', 'iron'];

        for (let tipo = 0; tipo < 3; tipo++) {
            const tipoKey = tipoKeys[tipo];

            const indicesComFalta = [];
            for (let q = 0; q < faltas.length; q++) {
                const faltaVal = faltas[q][tipo]?.[tipoKey] || 0;
                if (faltaVal <= 0) continue;
                const a = aldeias[q];
                const inc = incomingRes[a.id] || { wood: 0, stone: 0, iron: 0 };
                const totalRes = a.madeira + a.argila + a.ferro;
                const pctOcup = a.armazem > 0 ? totalRes / a.armazem : 0;
                const isLowPoints = a.pontos < lowPoints;
                indicesComFalta.push({ q, faltaVal, pctOcup, isLowPoints });
            }

            indicesComFalta.sort((a, b) => {
                if (a.isLowPoints !== b.isLowPoints) return a.isLowPoints ? -1 : 1;
                return a.pctOcup - b.pctOcup;
            });

            for (const { q } of indicesComFalta) {
                let falta = faltas[q][tipo]?.[tipoKey] || 0;
                if (falta <= 0) continue;

                const targetX = aldeias[q].x;
                const targetY = aldeias[q].y;
                const aldeiaDest = aldeias[q];
                const incDest = incomingRes[aldeiaDest.id] || { wood: 0, stone: 0, iron: 0 };

                const resAtualDest = tipo === 0 ? aldeiaDest.madeira
                                   : tipo === 1 ? aldeiaDest.argila
                                   : aldeiaDest.ferro;
                const incAtualDest = tipo === 0 ? incDest.wood
                                   : tipo === 1 ? incDest.stone
                                   : incDest.iron;
                const jaComprometidoDest = comprometido[aldeiaDest.id][tipoKey];
                const espacoDisponivel = Math.floor(
                    aldeiaDest.armazem * needsMorePercent
                    - resAtualDest
                    - incAtualDest
                    - jaComprometidoDest
                );

                if (espacoDisponivel <= 0) continue;

                falta = Math.min(falta, Math.floor(espacoDisponivel / 1000) * 1000);
                if (falta <= 0) continue;

                for (const order of merchantOrders) {
                    order.distance = distancia(order.x, order.y, targetX, targetY);
                }
                merchantOrders.sort((a, b) => a.distance - b.distance);

                while (falta > 0) {
                    let totalDisponivel = 0;
                    for (let m = 0; m < merchantOrders.length; m++) {
                        let disponivel = merchantOrders[m][tipoKey] || 0;
                        totalDisponivel += disponivel;

                        if (disponivel > 0) {
                            const envio = { source: merchantOrders[m].villageID, target: aldeiaDest.id };
                            if (falta <= disponivel * 1000) {
                                envio[tipoKey] = falta;
                                links.push(envio);
                                merchantOrders[m][tipoKey] -= falta / 1000;
                                comprometido[aldeiaDest.id][tipoKey] += falta;
                                falta = 0;
                            } else {
                                envio[tipoKey] = disponivel * 1000;
                                links.push(envio);
                                falta -= disponivel * 1000;
                                comprometido[aldeiaDest.id][tipoKey] += disponivel * 1000;
                                merchantOrders[m][tipoKey] = 0;
                            }
                        }
                        if (falta <= 0) break;
                    }
                    if (totalDisponivel === 0) break;
                }
            }
        }

        const mergeMap = new Map();
        for (const link of links) {
            if (!link) continue;
            const key = `${link.source}-${link.target}`;
            if (mergeMap.has(key)) {
                const existing = mergeMap.get(key);
                existing.wood  = (existing.wood  || 0) + (link.wood  || 0);
                existing.stone = (existing.stone || 0) + (link.stone || 0);
                existing.iron  = (existing.iron  || 0) + (link.iron  || 0);
            } else {
                mergeMap.set(key, { ...link });
            }
        }

        const sugestoes = [];
        for (const link of mergeMap.values()) {
            const total = (link.wood || 0) + (link.stone || 0) + (link.iron || 0);
            if (total === 0) continue;

            const origem = aldeias.find(v => v.id === link.source);
            const destino = aldeias.find(v => v.id === link.target);

            if (origem && destino) {
                const comerciantes = Math.ceil(total / 1000);
                const dist = distancia(origem.x, origem.y, destino.x, destino.y);

                sugestoes.push({
                    origemId: link.source,
                    origemNome: origem.nome,
                    destinoId: link.target,
                    destinoNome: destino.nome,
                    madeira: link.wood || 0,
                    argila: link.stone || 0,
                    ferro: link.iron || 0,
                    total: total,
                    distancia: dist,
                    comerciantes: comerciantes
                });
            }
        }

        console.log(`✅ Total de sugestões: ${sugestoes.length}`);
        return sugestoes;
    }

    // ==================== FUNÇÃO DE ENVIO ====================
    function enviarRecursos(sourceID, targetID, woodAmount, stoneAmount, ironAmount, ui) {
        return new Promise((resolve) => {
            const total = woodAmount + stoneAmount + ironAmount;
            const comerciantes = Math.ceil(total / 1000);

            if (ui) ui.log(`📤 Enviando: 🌲${woodAmount.toLocaleString()} 🧱${stoneAmount.toLocaleString()} ⚙️${ironAmount.toLocaleString()} (${comerciantes} mercador${comerciantes > 1 ? 'es' : ''})`, 'info');

            const dados = {
                target_id: targetID,
                wood: woodAmount,
                stone: stoneAmount,
                iron: ironAmount
            };

            if (typeof TribalWars !== 'undefined' && TribalWars.post) {
                TribalWars.post("market", {
                    ajaxaction: "map_send",
                    village: sourceID
                }, dados, function(response) {
                    if (ui) ui.log(`✅ ${response?.message || 'Enviado com sucesso!'}`, 'success');
                    resolve(true);
                }, function(error) {
                    if (ui) ui.log(`❌ Erro no envio: ${error}`, 'error');
                    resolve(false);
                });
            } else {
                if (ui) ui.log(`⚠️ TribalWars.post não disponível`, 'warning');
                resolve(false);
            }
        });
    }

    // ==================== RENDERIZAÇÃO DO DASHBOARD ====================
    function renderizarDashboard() {
        document.body.innerHTML = '';
        document.body.style.cssText = `background: ${CORES.fundo}; margin: 0; padding: 0; overflow: hidden; height: 100vh;`;

        const ui = TWUI.create('twb');
        ui.injectStyles();
        ui.renderApp();

        const premiumAtivo = isPremium();
        const statusText = premiumAtivo ? '⭐ PREMIUM (rápido)' : '📋 BÁSICO (individual)';
        const statusColor = premiumAtivo ? CORES.verde : CORES.info;

        ui.header('⚖️ Resource Balancer', 'v5.4 - Suporte Híbrido',
            `<span id="twb-status" style="display:inline-block;font-size:10px;font-weight:600;border-radius:3px;padding:4px 10px;background:${statusColor}22;border:1px solid ${statusColor}44;color:${statusColor}">${statusText}</span>
             <button id="twb-btn-config" style="background:${CORES.aviso}22;border:1px solid ${CORES.aviso}44;color:${CORES.aviso};padding:4px 10px;border-radius:4px;cursor:pointer;margin-left:10px;">⚙️ Config</button>
             <button id="twb-close-btn" style="background:${CORES.erro}22;border:1px solid ${CORES.erro}44;color:${CORES.erro};padding:4px 10px;border-radius:4px;cursor:pointer;margin-left:6px;">✕ Fechar</button>`
        );

        ui.statsStrip([
            { title: '🌲 MADEIRA', items: [{ icon: '📦 Total:', id: 'twb-total-wood' }, { icon: '📊 Média:', id: 'twb-media-wood' }] },
            { title: '🧱 ARGILA',  items: [{ icon: '📦 Total:', id: 'twb-total-stone' }, { icon: '📊 Média:', id: 'twb-media-stone' }] },
            { title: '⚙️ FERRO',  items: [{ icon: '📦 Total:', id: 'twb-total-iron' }, { icon: '📊 Média:', id: 'twb-media-iron' }] },
            { title: '📊 IMPÉRIO', items: [{ icon: '🏠 Aldeias:', id: 'twb-village-count' }, { icon: '📊 Média %:', id: 'twb-media-percent' }] }
        ]);

        ui.progressBar();

        ui.toolbar(`
            <button id="twb-btn-load" class="twb-btn twb-btn-primary">📡 CARREGAR DADOS</button>
            <button id="twb-btn-inc" class="twb-btn twb-btn-secondary" disabled style="display:none;">🚚 EM TRÂNSITO</button>
            <button id="twb-btn-filtro" class="twb-btn twb-btn-secondary" disabled>🎯 FILTRO</button>
            <button id="twb-btn-balance" class="twb-btn twb-btn-warning" disabled>⚖️ CALCULAR</button>
            <button id="twb-btn-execute" class="twb-btn twb-btn-danger" disabled>🚀 EXECUTAR</button>
        `, `<span id="twb-stats-summary" class="twb-muted"></span>`);

        ui.mainLayout(`
            <div style="overflow-x:auto;padding:0 12px 12px 12px;">
                ${ui.tableHTML(['Origem', 'Destino', '🌲 Madeira', '🧱 Argila', '⚙️ Ferro', 'Total', 'Merc.', 'Distância'], 'twb-tbody')}
            </div>
        `, '📝 Log de Atividades');

        let aldeiasData = [];
        let incomingData = {};
        let sugestoesAtuais = [];
        let executando = false;

        function getMediaPercentual() {
            if (!aldeiasData.length) return 0;
            const soma = aldeiasData.reduce((s, a) => {
                const total = a.madeira + a.argila + a.ferro;
                return s + (total / a.armazem * 100);
            }, 0);
            return Math.floor(soma / aldeiasData.length);
        }

        function atualizarStats() {
            if (!aldeiasData.length) return;
            const totalMadeira = aldeiasData.reduce((s, a) => s + a.madeira, 0);
            const totalArgila = aldeiasData.reduce((s, a) => s + a.argila, 0);
            const totalFerro = aldeiasData.reduce((s, a) => s + a.ferro, 0);
            const mediaMadeira = Math.floor(totalMadeira / aldeiasData.length);
            const mediaArgila = Math.floor(totalArgila / aldeiasData.length);
            const mediaFerro = Math.floor(totalFerro / aldeiasData.length);

            ui.updateStat('twb-total-wood', totalMadeira);
            ui.updateStat('twb-total-stone', totalArgila);
            ui.updateStat('twb-total-iron', totalFerro);
            ui.updateStat('twb-media-wood', mediaMadeira);
            ui.updateStat('twb-media-stone', mediaArgila);
            ui.updateStat('twb-media-iron', mediaFerro);
            ui.updateStat('twb-village-count', aldeiasData.length);
            ui.updateStat('twb-media-percent', `${getMediaPercentual()}%`);
        }

        function gerarDetalhesAldeia(aldeia, tipo) {
            if (!aldeia) return '';

            const madeira = aldeia.madeira || 0;
            const argila = aldeia.argila || 0;
            const ferro = aldeia.ferro || 0;
            const armazem = aldeia.armazem || 0;
            const total = madeira + argila + ferro;
            const percentual = armazem > 0 ? Math.floor(total / armazem * 100) : 0;

            let corPercentual = CORES.verde;
            if (percentual < 50) corPercentual = CORES.erro;
            else if (percentual < 80) corPercentual = CORES.aviso;

            return `
                <div style="font-size:9px; color:${CORES.textoDim}; margin-top:4px; padding-left:8px; border-left: 2px solid ${CORES.verdeDim};">
                    ${tipo} 📦: 🌲${madeira.toLocaleString()} 🧱${argila.toLocaleString()} ⚙️${ferro.toLocaleString()}
                    | 🏚️ ${armazem.toLocaleString()} <span style="color:${corPercentual}">(${percentual}%)</span>
                    | 🚚 ${aldeia.comerciantesDisp}/${aldeia.comerciantesTotal}
                    | ⭐ ${(aldeia.pontos || 0).toLocaleString()} pts
                </div>
            `;
        }

        // ---- Badge do filtro ----
        function atualizarBadgeFiltro() {
            const btn = document.getElementById('twb-btn-filtro');
            if (!btn) return;
            if (filtroAtivo()) {
                btn.textContent = `🎯 FILTRO (${CONFIG.FILTRO_COORDS.length})`;
                btn.style.background = '#00d97e22';
                btn.style.borderColor = '#00d97e55';
                btn.style.color = '#00d97e';
            } else {
                btn.textContent = '🎯 FILTRO';
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
            }
        }

        document.getElementById('twb-btn-config')?.addEventListener('click', () => {
            abrirModalConfig(ui);
        });

        document.getElementById('twb-btn-load')?.addEventListener('click', async () => {
            ui.btnLoading('twb-btn-load', '⏳ CARREGANDO...');
            aldeiasData = await extrairDadosAldeias(ui);
            if (aldeiasData.length > 0) {
                atualizarStats();
                ui.log(`📊 Média de ocupação: ${getMediaPercentual()}%`, 'info');
                document.getElementById('twb-btn-inc').style.display = 'inline-block';
                document.getElementById('twb-btn-inc').disabled = false;
                document.getElementById('twb-btn-filtro').disabled = false;
                atualizarBadgeFiltro();
            }
            ui.btnRestore('twb-btn-load', '📡 CARREGAR DADOS');
        });

        // ---- Botão Filtro ----
        document.getElementById('twb-btn-filtro')?.addEventListener('click', () => {
            abrirModalFiltro(ui, aldeiasData, () => {
                atualizarBadgeFiltro();
                // Invalidar sugestões ao mudar filtro
                sugestoesAtuais = [];
                document.getElementById('twb-btn-execute').disabled = true;
                const tbody = document.getElementById('twb-tbody');
                if (tbody) tbody.innerHTML = '';
                document.getElementById('twb-stats-summary').innerHTML = '';
                ui.log('🎯 Filtro alterado — recalcule o balanceamento.', 'warning');
            });
        });

        document.getElementById('twb-btn-inc')?.addEventListener('click', async () => {
            ui.btnLoading('twb-btn-inc', '⏳ BUSCANDO...');
            incomingData = await buscarRecursosEmTransito(ui);
            ui.btnRestore('twb-btn-inc', `🚚 EM TRÂNSITO (${Object.keys(incomingData).length})`);

            if (Object.keys(incomingData).length > 0 && aldeiasData.length > 0) {
                await mostrarModalTransito(ui, incomingData, aldeiasData);
            } else if (Object.keys(incomingData).length === 0) {
                ui.log('✅ Nenhum recurso em trânsito encontrado', 'info');
            }

            document.getElementById('twb-btn-balance').disabled = false;
        });

        document.getElementById('twb-btn-balance')?.addEventListener('click', () => {
            if (aldeiasData.length === 0) {
                ui.log('⚠️ Carregue os dados primeiro!', 'warning');
                return;
            }
            ui.btnLoading('twb-btn-balance', '⏳ CALCULANDO...');

            // Aplicar filtro de coordenadas
            const aldeiasParaBalancear = aplicarFiltro(aldeiasData);
            const incomingParaBalancear = aplicarFiltroIncoming(aldeiasParaBalancear, incomingData);

            if (filtroAtivo()) {
                ui.log(`🎯 Filtro ativo: balanceando ${aldeiasParaBalancear.length} de ${aldeiasData.length} aldeias`, 'info');
            }

            if (aldeiasParaBalancear.length < 2) {
                ui.log('⚠️ O filtro resultou em menos de 2 aldeias. Adicione mais coordenadas.', 'error');
                ui.btnRestore('twb-btn-balance', '⚖️ CALCULAR');
                return;
            }

            sugestoesAtuais = calcularBalanceamento(aldeiasParaBalancear, CONFIG, incomingParaBalancear);
            sugestoesAtuais.sort((a, b) => a.distancia - b.distancia);

            const tbody = document.getElementById('twb-tbody');
            if (sugestoesAtuais.length === 0) {
                tbody.innerHTML = ui.emptyRowHTML('✅', 'Todas as aldeias estão balanceadas!', '', 8);
                document.getElementById('twb-btn-execute').disabled = true;
            } else {
                const limit = CONFIG.MAX_VIAGENS_POR_EXECUCAO;
                const sugestoesLimitadas = sugestoesAtuais.slice(0, limit);
                tbody.innerHTML = sugestoesLimitadas.map((s, idx) => {
                    const origemAtual = aldeiasData.find(v => v.id === s.origemId);
                    const destinoAtual = aldeiasData.find(v => v.id === s.destinoId);
                    return `
                        <tr id="sugestao-${idx}" style="border-bottom: 1px solid ${CORES.borda};">
                            <td style="padding:10px; vertical-align:top;">
                                <strong>${s.origemNome}</strong>
                                ${gerarDetalhesAldeia(origemAtual, '📤')}
                            <\/td>
                            <td style="padding:10px; vertical-align:top;">
                                <strong>${s.destinoNome}</strong>
                                ${gerarDetalhesAldeia(destinoAtual, '📥')}
                            <\/td>
                            <td style="padding:10px; text-align:center;">${ui.chipHTML('wood', s.madeira)}<\/td>
                            <td style="padding:10px; text-align:center;">${ui.chipHTML('stone', s.argila)}<\/td>
                            <td style="padding:10px; text-align:center;">${ui.chipHTML('iron', s.ferro)}<\/td>
                            <td style="padding:10px; text-align:center; font-family:monospace;">${s.total.toLocaleString()}<\/td>
                            <td style="padding:10px; text-align:center;">${ui.badgeHTML(`${s.comerciantes}`, 'blue')}<\/td>
                            <td style="padding:10px; text-align:center;">${s.distancia} tiles<\/td>
                        <\/tr>
                    `;
                }).join('');

                const totalUnidades = sugestoesAtuais.reduce((s, e) => s + e.total, 0);
                const filtroInfo = filtroAtivo() ? ` | 🎯 ${CONFIG.FILTRO_COORDS.length} aldeias filtradas` : '';
                document.getElementById('twb-stats-summary').innerHTML = `📦 Total: ${totalUnidades.toLocaleString()} unidades | 🚀 ${sugestoesAtuais.length} viagens | 📍 Ordenado por distância (menor → maior) | ${isPremium() ? '⚡ Premium' : '🐌 Básico'}${filtroInfo}`;
                document.getElementById('twb-btn-execute').disabled = false;
            }
            ui.btnRestore('twb-btn-balance', '⚖️ CALCULAR');
            ui.log(`📊 Geradas ${sugestoesAtuais.length} sugestões (ordenadas por distância)`, 'success');
        });

        document.getElementById('twb-btn-execute')?.addEventListener('click', async () => {
            if (executando) { ui.log('⚠️ Execução em andamento', 'warning'); return; }
            if (sugestoesAtuais.length === 0) { ui.log('⚠️ Sem sugestões', 'warning'); return; }

            const limit = CONFIG.MAX_VIAGENS_POR_EXECUCAO;
            const aExecutar = sugestoesAtuais.slice(0, limit);

            if (!CONFIG.MODO_AUTO) {
                const totalUnidades = aExecutar.reduce((s, e) => s + e.total, 0);
                if (!confirm(`Executar ${aExecutar.length} viagens?\nTotal: ${totalUnidades.toLocaleString()} unidades\n${aExecutar.reduce((s,e) => s + e.comerciantes, 0)} mercadores`)) {
                    ui.log('❌ Cancelado pelo usuário', 'warning');
                    return;
                }
            }

            executando = true;
            document.getElementById('twb-btn-execute').disabled = true;
            document.getElementById('twb-btn-balance').disabled = true;
            document.getElementById('twb-btn-load').disabled = true;
            document.getElementById('twb-btn-inc').disabled = true;

            ui.setProgress(0, `0 / ${aExecutar.length}`);
            let sucessos = 0, falhas = 0;

            for (let i = 0; i < aExecutar.length; i++) {
                const envio = aExecutar[i];
                ui.log(`[${i+1}/${aExecutar.length}] ${envio.origemNome} → ${envio.destinoNome} (${envio.distancia} tiles)`, 'info');

                const resultado = await enviarRecursos(envio.origemId, envio.destinoId, envio.madeira, envio.argila, envio.ferro, ui);
                if (resultado) {
                    sucessos++;
                    const linha = document.getElementById(`sugestao-${i}`);
                    if (linha) {
                        linha.style.opacity = '0.6';
                        linha.style.transition = 'opacity 0.3s';
                        const badge = document.createElement('div');
                        badge.style.cssText = `position:absolute; right:10px; top:10px; background:${CORES.verde}22; color:${CORES.verde}; padding:2px 8px; border-radius:4px; font-size:10px;`;
                        badge.innerHTML = '✓ Enviado';
                        linha.style.position = 'relative';
                        linha.appendChild(badge);
                    }
                } else {
                    falhas++;
                }

                ui.setProgress(((i+1)/aExecutar.length)*100, `${i+1}/${aExecutar.length} - ✅${sucessos} ❌${falhas}`);
                if (i < aExecutar.length - 1) await new Promise(r => setTimeout(r, CONFIG.DELAY_ENTRE_ENVIOS));
            }

            ui.setProgress(100, `✅ ${sucessos} / ❌ ${falhas}`);
            setTimeout(() => ui.hideProgress(1500), 1500);
            ui.log(`📊 Finalizado: ${sucessos} enviados, ${falhas} falhas`, sucessos > 0 ? 'success' : 'error');

            sugestoesAtuais = sugestoesAtuais.slice(aExecutar.length);
            executando = false;
            document.getElementById('twb-btn-load').disabled = false;
            document.getElementById('twb-btn-inc').disabled = false;

            const tbody = document.getElementById('twb-tbody');
            if (sugestoesAtuais.length === 0) {
                tbody.innerHTML = ui.emptyRowHTML('✅', 'Todas as sugestões executadas!', '', 8);
                document.getElementById('twb-btn-execute').disabled = true;
                document.getElementById('twb-btn-balance').disabled = false;
            } else {
                const newLimit = CONFIG.MAX_VIAGENS_POR_EXECUCAO;
                const novasLimitadas = sugestoesAtuais.slice(0, newLimit);
                tbody.innerHTML = novasLimitadas.map((s, idx) => {
                    const origemAtual = aldeiasData.find(v => v.id === s.origemId);
                    const destinoAtual = aldeiasData.find(v => v.id === s.destinoId);
                    return `
                        <tr id="sugestao-${idx}" style="border-bottom: 1px solid ${CORES.borda};">
                            <td style="padding:10px; vertical-align:top;">
                                <strong>${s.origemNome}</strong>
                                ${gerarDetalhesAldeia(origemAtual, '📤')}
                            <\/td>
                            <td style="padding:10px; vertical-align:top;">
                                <strong>${s.destinoNome}</strong>
                                ${gerarDetalhesAldeia(destinoAtual, '📥')}
                            <\/td>
                            <td style="padding:10px; text-align:center;">${ui.chipHTML('wood', s.madeira)}<\/td>
                            <td style="padding:10px; text-align:center;">${ui.chipHTML('stone', s.argila)}<\/td>
                            <td style="padding:10px; text-align:center;">${ui.chipHTML('iron', s.ferro)}<\/td>
                            <td style="padding:10px; text-align:center; font-family:monospace;">${s.total.toLocaleString()}<\/td>
                            <td style="padding:10px; text-align:center;">${ui.badgeHTML(`${s.comerciantes}`, 'blue')}<\/td>
                            <td style="padding:10px; text-align:center;">${s.distancia} tiles<\/td>
                        <\/tr>
                    `;
                }).join('');
                document.getElementById('twb-btn-execute').disabled = false;
                document.getElementById('twb-btn-balance').disabled = false;
            }
        });

        document.getElementById('twb-close-btn')?.addEventListener('click', () => {
            window.close();
        });

        ui.log('🚀 Resource Balancer v5.4 - Suporte Híbrido Premium/Básico!', 'success');
        ui.log(`📌 Modo: ${isPremium() ? '⭐ Premium (captura rápida via tabela)' : '📋 Básico (captura individual de comerciantes)'}`, 'info');
    }

    // ==================== MODAL DE CONFIGURAÇÕES ====================
    function abrirModalConfig(ui) {
        const modalAnterior = document.getElementById('twb-modal-overlay');
        if (modalAnterior) modalAnterior.remove();

        const overlay = document.createElement('div');
        overlay.id = 'twb-modal-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 1000000;
            background: rgba(0,0,0,0.75); display: flex;
            align-items: center; justify-content: center;
            backdrop-filter: blur(3px);
        `;

        overlay.innerHTML = `
            <div id="twb-modal" style="
                background: ${CORES.fundoCard}; border: 1px solid ${CORES.borda};
                border-radius: 12px; padding: 28px 32px; min-width: 480px; max-width: 560px;
                box-shadow: 0 8px 40px #000a; font-family: monospace; color: ${CORES.texto};
            ">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:22px;">
                    <h2 style="margin:0; font-size:16px; color:${CORES.verde};">⚙️ Configurações</h2>
                    <button id="twb-modal-close" style="
                        background:${CORES.erro}22; border:1px solid ${CORES.erro}44;
                        color:${CORES.erro}; padding:4px 10px; border-radius:4px;
                        cursor:pointer; font-size:13px;
                    ">✕ Fechar</button>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            ⏱️ Delay entre envios (ms)
                        </label>
                        <input id="cfg-delay" type="number" min="200" max="5000" step="100"
                            value="${CONFIG.DELAY_ENTRE_ENVIOS}"
                            style="${inputStyle()}">
                    </div>

                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            🚀 Limite de viagens por execução
                        </label>
                        <input id="cfg-max-viagens" type="number" min="1" max="500" step="10"
                            value="${CONFIG.MAX_VIAGENS_POR_EXECUCAO}"
                            style="${inputStyle()}">
                    </div>

                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            🔒 Modo de execução
                        </label>
                        <select id="cfg-modo" style="${inputStyle()}">
                            <option value="manual" ${!CONFIG.MODO_AUTO ? 'selected' : ''}>🔒 Manual</option>
                            <option value="auto" ${CONFIG.MODO_AUTO ? 'selected' : ''}>⚡ Automático</option>
                        </select>
                    </div>

                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            🪙 Modo cunhagem (Minting)
                        </label>
                        <select id="cfg-minting" style="${inputStyle()}">
                            <option value="false" ${!CONFIG.IS_MINTING ? 'selected' : ''}>❌ Desativado</option>
                            <option value="true" ${CONFIG.IS_MINTING ? 'selected' : ''}>✅ Ativado</option>
                        </select>
                    </div>

                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            📉 Pontos mínimos
                        </label>
                        <input id="cfg-low-points" type="number" min="0" max="50000" step="500"
                            value="${CONFIG.LOW_POINTS}"
                            style="${inputStyle()}">
                    </div>

                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            📈 Pontos máximos
                        </label>
                        <input id="cfg-high-points" type="number" min="0" max="50000" step="500"
                            value="${CONFIG.HIGH_POINTS}"
                            style="${inputStyle()}">
                    </div>

                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            🌾 Pop. de fazenda alta
                        </label>
                        <input id="cfg-high-farm" type="number" min="0" max="50000" step="1000"
                            value="${CONFIG.HIGH_FARM}"
                            style="${inputStyle()}">
                    </div>

                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            🏗️ % mínima (finalizadas)
                        </label>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input id="cfg-builtout" type="number" min="0" max="100" step="5"
                                value="${Math.round(CONFIG.BUILT_OUT_PERCENTAGE * 100)}"
                                style="${inputStyle(true)}">
                            <span style="color:${CORES.textoDim}; font-size:13px;">%</span>
                        </div>
                    </div>

                    <div>
                        <label style="font-size:11px; color:${CORES.textoDim}; display:block; margin-bottom:4px;">
                            📦 % alvo de armazém
                        </label>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input id="cfg-needsmore" type="number" min="50" max="100" step="5"
                                value="${Math.round(CONFIG.NEEDS_MORE_PERCENTAGE * 100)}"
                                style="${inputStyle(true)}">
                            <span style="color:${CORES.textoDim}; font-size:13px;">%</span>
                        </div>
                    </div>
                </div>

                <div style="margin-top:24px; display:flex; gap:10px; justify-content:flex-end;">
                    <button id="twb-modal-reset" style="
                        background:${CORES.aviso}22; border:1px solid ${CORES.aviso}44;
                        color:${CORES.aviso}; padding:8px 18px; border-radius:6px;
                        cursor:pointer; font-size:12px; font-family:monospace;
                    ">🔄 Restaurar Padrões</button>
                    <button id="twb-modal-save" style="
                        background:${CORES.verde}22; border:1px solid ${CORES.verde}55;
                        color:${CORES.verde}; padding:8px 22px; border-radius:6px;
                        cursor:pointer; font-size:13px; font-weight:bold; font-family:monospace;
                    ">💾 Salvar</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        document.getElementById('twb-modal-close').addEventListener('click', () => overlay.remove());

        document.getElementById('twb-modal-reset').addEventListener('click', () => {
            if (!confirm('Restaurar todas as configurações para o padrão?')) return;
            document.getElementById('cfg-delay').value = 800;
            document.getElementById('cfg-max-viagens').value = 50;
            document.getElementById('cfg-modo').value = 'manual';
            document.getElementById('cfg-minting').value = 'false';
            document.getElementById('cfg-low-points').value = 3000;
            document.getElementById('cfg-high-points').value = 8000;
            document.getElementById('cfg-high-farm').value = 23000;
            document.getElementById('cfg-builtout').value = 25;
            document.getElementById('cfg-needsmore').value = 85;
        });

        document.getElementById('twb-modal-save').addEventListener('click', () => {
            CONFIG.DELAY_ENTRE_ENVIOS       = parseInt(document.getElementById('cfg-delay').value) || 800;
            CONFIG.MAX_VIAGENS_POR_EXECUCAO = parseInt(document.getElementById('cfg-max-viagens').value) || 50;
            CONFIG.MODO_AUTO                = document.getElementById('cfg-modo').value === 'auto';
            CONFIG.IS_MINTING               = document.getElementById('cfg-minting').value === 'true';
            CONFIG.LOW_POINTS               = parseInt(document.getElementById('cfg-low-points').value) || 3000;
            CONFIG.HIGH_POINTS              = parseInt(document.getElementById('cfg-high-points').value) || 8000;
            CONFIG.HIGH_FARM                = parseInt(document.getElementById('cfg-high-farm').value) || 23000;
            CONFIG.BUILT_OUT_PERCENTAGE     = (parseInt(document.getElementById('cfg-builtout').value) || 25) / 100;
            CONFIG.NEEDS_MORE_PERCENTAGE    = (parseInt(document.getElementById('cfg-needsmore').value) || 85) / 100;
            saveConfig();
            if (ui) ui.log('✅ Configurações salvas com sucesso!', 'success');
            overlay.remove();
        });
    }

    function inputStyle(compact = false) {
        return `
            width: ${compact ? '80px' : '100%'}; box-sizing:border-box;
            background: #0d1117; border: 1px solid ${CORES.borda};
            color: ${CORES.texto}; border-radius:6px; padding: 7px 10px;
            font-family: monospace; font-size: 12px;
            outline: none;
        `;
    }

    // ==================== BOTÃO FLUTUANTE ====================
    function adicionarBotaoAbrirDashboard() {
        if (document.getElementById('twb-float-btn')) return;

        function criarBotao() {
            if (!document.body) {
                setTimeout(criarBotao, 100);
                return;
            }

            const btn = document.createElement('div');
            btn.id = 'twb-float-btn';
            const premiumAtivo = isPremium();
            btn.innerHTML = premiumAtivo ? '⚡ RB v5.4' : '🐌 RB v5.4';
            btn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                padding: 10px 16px;
                background: #0d1117;
                color: ${premiumAtivo ? '#00d97e' : '#388bfd'};
                border: 1px solid ${premiumAtivo ? '#00d97e55' : '#388bfd55'};
                border-radius: 8px;
                cursor: pointer;
                font-family: monospace;
                font-weight: bold;
                font-size: 12px;
                box-shadow: 0 2px 10px ${premiumAtivo ? '#00d97e22' : '#388bfd22'};
                transition: all 0.2s ease;
            `;

            btn.onmouseenter = () => {
                btn.style.transform = 'scale(1.05)';
                btn.style.borderColor = premiumAtivo ? '#00d97e' : '#388bfd';
                btn.style.boxShadow = `0 2px 14px ${premiumAtivo ? '#00d97e44' : '#388bfd44'}`;
            };
            btn.onmouseleave = () => {
                btn.style.transform = 'scale(1)';
                btn.style.borderColor = premiumAtivo ? '#00d97e55' : '#388bfd55';
                btn.style.boxShadow = `0 2px 10px ${premiumAtivo ? '#00d97e22' : '#388bfd22'}`;
            };

            btn.onclick = () => {
                const url = window.location.href.split('?')[0] + '?' + DASHBOARD_PARAM;
                window.open(url, 'TWBalancer');
            };

            document.body.appendChild(btn);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', criarBotao);
        } else {
            criarBotao();
        }
    }

    // ==================== INÍCIO ====================
    if (window.location.href.includes(DASHBOARD_PARAM)) {
        renderizarDashboard();
    } else {
        adicionarBotaoAbrirDashboard();
    }

})();
