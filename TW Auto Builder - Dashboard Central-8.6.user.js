// ==UserScript==
// @name         TW Auto Builder - Dashboard Central
// @namespace    http://tampermonkey.net/
// @version      8.6
// @description  Construção automática de edifícios com dashboard TWUI Kit
// @match        https://*.tribalwars.com.br/game.php*
// @grant        none
// @require      https://tribalwarstools.github.io/twscripts/tw-ui-kit.js
// ==/UserScript==

(function() {
    'use strict';

    // Aguardar TWUI estar disponível
    if (typeof TWUI === 'undefined') {
        console.error('TWUI Kit não encontrado!');
        return;
    }

    const ui = TWUI.create('twb'); // TW Builder prefix

    // ============================================
    // CONSTANTES
    // ============================================
    const DASHBOARD_PARAM = 'twAutoBuilder=true';

    const EDIFICIOS = {
        'main':       'Edifício principal',
        'barracks':   'Quartel',
        'stable':     'Estábulo',
        'garage':     'Oficina',
        'church':     'Igreja',
        'watchtower': 'Torre de vigia',
        'snob':       'Academia',
        'smith':      'Ferreiro',
        'place':      'Praça de reunião',
        'statue':     'Estátua',
        'market':     'Mercado',
        'wood':       'Bosque',
        'stone':      'Poço de argila',
        'iron':       'Mina de ferro',
        'farm':       'Fazenda',
        'storage':    'Armazém',
        'hide':       'Esconderijo',
        'wall':       'Muralha'
    };

    const NOMES_CURTOS = {
        'Edifício principal': 'Principal',
        'Poço de argila':     'Argila',
        'Mina de ferro':      'Ferro',
        'Torre de vigia':     'Torre',
        'Praça de reunião':   'Reunião',
        'Esconderijo':        'Esconderijo',
        'Fazenda':            'Fazenda',
        'Armazém':            'Armazém',
        'Bosque':             'Bosque',
        'Mercado':            'Mercado',
        'Quartel':            'Quartel',
        'Estábulo':           'Estábulo',
        'Oficina':            'Oficina',
        'Igreja':             'Igreja',
        'Academia':           'Academia',
        'Ferreiro':           'Ferreiro',
        'Estátua':            'Estátua',
        'Muralha':            'Muralha'
    };

    const NOMES_EDIFICIOS = Object.values(EDIFICIOS).map(n => n.toLowerCase());

    const ORDEM_ORIGINAL = [
        'main','barracks','stable','garage','church','watchtower',
        'snob','smith','place','statue','market','wood','stone',
        'iron','farm','storage','hide','wall'
    ];

    const DEFAULTS = {
        pausaAldeias:    3000,
        pausaCiclos:     60000,
        totalConstruido: 0,
        maxQueueSlots:   2,
        ativado:         false
    };

    const STORAGE_KEY = 'twb_builder_v8';

    // ============================================
    // VARIÁVEIS GLOBAIS
    // ============================================
    let ATIVADO             = false;
    let PAUSA_ENTRE_ALDEIAS = DEFAULTS.pausaAldeias;
    let PAUSA_ENTRE_CICLOS  = DEFAULTS.pausaCiclos;
    let totalConstruido     = DEFAULTS.totalConstruido;
    let maxQueueSlots       = DEFAULTS.maxQueueSlots;
    let priorityBuildings   = [...ORDEM_ORIGINAL];
    let enabledBuildings    = {};
    let maxLevels           = {};
    let configAldeias       = {};
    let csrfCache           = (typeof window.game_data !== 'undefined' && window.game_data.csrf) ? window.game_data.csrf : null;

    let rodando             = false;
    let cicloAtivo          = false;
    let cicloAtual          = 0;
    let _countdownInterval  = null;
    let _autoUpdateInterval = null;

    let cacheAldeias = [];

    // ============================================
    // FUNÇÕES AUXILIARES
    // ============================================
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    function simplificarNome(nome) {
        if (!nome) return nome;
        for (const [longo, curto] of Object.entries(NOMES_CURTOS)) {
            if (nome.includes(longo)) return curto;
        }
        return nome;
    }

    function obterCsrf() {
        if (!csrfCache) {
            csrfCache = (typeof window.game_data !== 'undefined' && window.game_data.csrf) ? window.game_data.csrf : null;
        }
        return csrfCache;
    }

    // ============================================
    // PERSISTÊNCIA
    // ============================================
    function getDefaultMaxLevels() {
        const l = {};
        Object.keys(EDIFICIOS).forEach(k => {
            if (['main','farm','storage','wood','stone','iron'].includes(k)) l[k] = 30;
            else if (['barracks','market'].includes(k)) l[k] = 25;
            else if (['stable','smith','wall','watchtower'].includes(k)) l[k] = 20;
            else if (k === 'garage') l[k] = 15;
            else if (k === 'hide') l[k] = 10;
            else if (k === 'church') l[k] = 3;
            else l[k] = 1;
        });
        return l;
    }

    function salvarEstado() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            pausaAldeias: PAUSA_ENTRE_ALDEIAS,
            pausaCiclos:  PAUSA_ENTRE_CICLOS,
            totalConstruido, maxQueueSlots,
            priorityBuildings, enabledBuildings, maxLevels,
            configAldeias, cicloAtual,
            ativado: ATIVADO
        }));
    }

    function carregarEstado() {
        const salvo = localStorage.getItem(STORAGE_KEY);
        if (!salvo) {
            Object.keys(EDIFICIOS).forEach(k => { enabledBuildings[k] = true; });
            Object.assign(maxLevels, getDefaultMaxLevels());
            return;
        }
        const d = JSON.parse(salvo);
        PAUSA_ENTRE_ALDEIAS = d.pausaAldeias    || DEFAULTS.pausaAldeias;
        PAUSA_ENTRE_CICLOS  = d.pausaCiclos     || DEFAULTS.pausaCiclos;
        totalConstruido     = d.totalConstruido || 0;
        maxQueueSlots       = d.maxQueueSlots   || DEFAULTS.maxQueueSlots;
        priorityBuildings   = d.priorityBuildings || [...ORDEM_ORIGINAL];
        enabledBuildings    = d.enabledBuildings  || {};
        maxLevels           = d.maxLevels         || {};
        configAldeias       = d.configAldeias     || {};
        cicloAtual          = d.cicloAtual        || 0;
        ATIVADO             = d.ativado === true;

        const def = getDefaultMaxLevels();
        Object.keys(EDIFICIOS).forEach(k => {
            if (enabledBuildings[k] === undefined) enabledBuildings[k] = true;
            if (!maxLevels[k]) maxLevels[k] = def[k];
        });
    }

    carregarEstado();

    // ============================================
    // BOTÃO FLUTUANTE
    // ============================================
    function adicionarBotaoAbrirDashboard() {
        ui.injectStyles();
        ui.floatBtn('🏗️ BUILDER', () => {
            const urlBase = window.location.href.split('?')[0];
            window.open(urlBase + '?' + DASHBOARD_PARAM, 'TWAutoBuilder');
        }, { top: 130, right: 10 });
    }

    // ============================================
    // COLETA DE ALDEIAS
    // ============================================
    async function obterTodasAldeias() {
        if (cacheAldeias.length > 0) return cacheAldeias;
        try {
            const response = await fetch('/map/village.txt', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Falha ao carregar village.txt');
            const dados = await response.text();
            const meuId = window.game_data?.player?.id;
            if (!meuId) throw new Error('ID do jogador não encontrado');
            cacheAldeias = dados.trim().split('\n')
                .map(line => {
                    const [id, name, x, y, player, points] = line.split(',');
                    return {
                        id: parseInt(id),
                        nome: decodeURIComponent(name?.replace(/\+/g, ' ') || 'Desconhecida'),
                        coord: `${x}|${y}`,
                        player: parseInt(player),
                        pontos: parseInt(points) || 0
                    };
                })
                .filter(v => v.player === meuId)
                .sort((a, b) => a.nome.localeCompare(b.nome));
            return cacheAldeias;
        } catch (err) {
            console.error('Erro ao carregar aldeias:', err);
            return [];
        }
    }

    // ============================================
    // LÓGICA DE CONSTRUÇÃO
    // ============================================
    function extrairBuildings(source) {
        const searchStr = 'BuildingMain.buildings = ';
        const startIdx = source.indexOf(searchStr);
        if (startIdx === -1) return null;
        const objectStart = source.indexOf('{', startIdx + searchStr.length);
        if (objectStart === -1) return null;
        let depth = 0, inString = false, stringChar = '', escaped = false;
        for (let i = objectStart; i < source.length; i++) {
            const c = source[i];
            if (escaped) { escaped = false; continue; }
            if (c === '\\' && inString) { escaped = true; continue; }
            if (!inString && (c === '"' || c === "'")) { inString = true; stringChar = c; continue; }
            if (inString && c === stringChar) { inString = false; continue; }
            if (!inString) {
                if (c === '{') depth++;
                else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(source.substring(objectStart, i + 1)); } catch(e) { return null; } } }
            }
        }
        return null;
    }

    function extrairOrderCount(source) {
        const match = source.match(/BuildingMain\.order_count\s*=\s*(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }

    async function fetchVillageData(villageId) {
        try {
            const url = `/game.php?village=${villageId}&screen=main`;
            const res = await fetch(url, { credentials: 'same-origin' });
            if (!res.ok) return null;
            const text = await res.text();
            const buildings = extrairBuildings(text);
            if (!buildings) return null;
            const orderCount = extrairOrderCount(text);
            const upgradeLinkMatch = text.match(/upgrade_building_link\s*=\s*'([^']+)'/);
            const upgradeLink = upgradeLinkMatch ? upgradeLinkMatch[1] : null;
            const csrfMatch = text.match(/"csrf"\s*:\s*"([a-f0-9]+)"/);
            if (csrfMatch) csrfCache = csrfMatch[1];
            return { buildings, orderCount, upgradeLink };
        } catch(err) {
            console.error('[Builder] fetchVillageData:', err);
            return null;
        }
    }

    function podeConstruir(b) {
        if (!b) return { pode: false, motivo: 'inexistente' };
        if (!enabledBuildings[b.id]) return { pode: false, motivo: 'desativado' };
        if ((parseInt(b.level) || 0) >= (maxLevels[b.id] || 30)) return { pode: false, motivo: 'nível_máximo' };
        if (b.order != null) return { pode: false, motivo: 'na_fila' };
        if (!b.can_build) return { pode: false, motivo: 'requisitos_não_atendidos' };
        if (b.error) {
            if (/recursos dispon/i.test(b.error)) return { pode: false, motivo: 'recursos_futuros' };
            if (/fazenda.*pequena|armazém.*pequeno/i.test(b.error)) return { pode: false, motivo: 'bloqueado' };
            return { pode: false, motivo: 'erro' };
        }
        return { pode: true };
    }

    function escolherEdificio(buildings) {
        for (const id of priorityBuildings) {
            const b = buildings[id];
            const check = podeConstruir(b);
            if (check.pode) return b;
        }
        return null;
    }

    async function construir(villageId, building, upgradeLink) {
        try {
            if (!upgradeLink) return { sucesso: false, motivo: 'upgrade_building_link não encontrado' };
            const csrf = obterCsrf();
            const url = `${upgradeLink}&id=${building.id}`;
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: csrf ? `csrf=${encodeURIComponent(csrf)}` : null
            });
            if (!res.ok) return { sucesso: false, motivo: `HTTP ${res.status}` };
            const text = await res.text();
            let json = null;
            try { json = JSON.parse(text); } catch(e) {}
            if (json?.response?.success) {
                if (json.game_data?.csrf) csrfCache = json.game_data.csrf;
                return { sucesso: true };
            }
            if (json?.response?.error) return { sucesso: false, motivo: json.response.error };
            if (json?.error) {
                const msg = Array.isArray(json.error) ? json.error[0] : json.error;
                if (/sess/i.test(msg)) csrfCache = null;
                return { sucesso: false, motivo: msg };
            }
            if (/BuildingMain\.buildings/.test(text)) return { sucesso: true };
            return { sucesso: false, motivo: 'Resposta não reconhecida' };
        } catch(err) {
            return { sucesso: false, motivo: err.message };
        }
    }

    // ============================================
    // PROCESSAMENTO POR ALDEIA
    // ============================================
    async function processarAldeia(villageId) {
        const cfg = configAldeias[villageId];
        if (!cfg) return;
        const dados = await fetchVillageData(villageId);
        if (!dados) return;
        const { buildings, orderCount, upgradeLink } = dados;

        // Atualizar cache de buildings
        configAldeias[villageId].buildingsCache = buildings || {};
        configAldeias[villageId].orderCount = orderCount || 0;
        salvarEstado();

        const slotsDisponiveis = maxQueueSlots - orderCount;
        if (slotsDisponiveis <= 0) {
            ui.log(`🏠 ${cfg.nome} : fila cheia (${orderCount}/${maxQueueSlots})`, 'warning');
            return;
        }

        const edificio = escolherEdificio(buildings);
        if (!edificio) return;

        const resultado = await construir(villageId, edificio, upgradeLink);
        if (resultado.sucesso) {
            totalConstruido++;
            // Atualiza o nível no cache para refletir na lista sem novo fetch
            if (configAldeias[villageId].buildingsCache) {
                configAldeias[villageId].buildingsCache[edificio.id] = {
                    ...edificio,
                    level: (parseInt(edificio.level) || 0) + 1
                };
            }
            salvarEstado();
            atualizarMetricas();
            renderizarListaAldeiasDoCache(); // atualiza UI sem fetch
            const nome = simplificarNome(edificio.name);
            const nivel = (parseInt(edificio.level) || 0) + 1;
            ui.log(`✅ ${cfg.nome} — Construindo: ${nome} ${nivel}`, 'success');
        }
    }

    // ============================================
    // CICLO PRINCIPAL COM BARRA DE PROGRESSO NATIVA
    // ============================================
    function startCountdown(seconds) {
        if (_countdownInterval) clearInterval(_countdownInterval);
        const cardEl = document.getElementById('twb-countdown-card');
        const statEl = document.getElementById('twb-status');
        let rem = seconds;

        const update = () => {
            if (cardEl) cardEl.textContent = rem > 0 ? `${rem}s` : '-';
            if (statEl && ATIVADO) statEl.textContent = rem > 0 ? `Rodando • Próximo ciclo em ${rem}s` : `Rodando • Ciclo ${cicloAtual}`;
        };
        update();
        _countdownInterval = setInterval(() => {
            rem--;
            if (rem <= 0) clearInterval(_countdownInterval);
            update();
        }, 1000);
    }

    async function escanearEConstruir() {
        if (!ATIVADO || cicloAtivo) return;
        cicloAtivo = true;
        cicloAtual++;
        atualizarMetricas();

        const aldeias = Object.entries(configAldeias);
        const totalAldeias = aldeias.length;

        // Criar e mostrar barra de progresso nativa do TWUI
        ui.progressBar();
        ui.setProgress(0, `🚀 Iniciando — ${totalAldeias} aldeia(s) configurada(s)`);

        try {
            let processadas = 0;
            for (const [id] of aldeias) {
                if (!ATIVADO) break;

                processadas++;
                const percentual = (processadas / totalAldeias) * 100;
                ui.setProgress(percentual, `🏗️ Processando ${processadas}/${totalAldeias} aldeias...`);

                await processarAldeia(parseInt(id));
                await delay(PAUSA_ENTRE_ALDEIAS);
            }

            // Esconder barra de progresso após concluir
            ui.hideProgress(1000);

        } catch(err) {
            ui.log(`❌ Erro: ${err.message}`, 'error');
            ui.hideProgress(500);
        }

        cicloAtivo = false;
        if (ATIVADO) {
            startCountdown(Math.round(PAUSA_ENTRE_CICLOS / 1000));
            await delay(PAUSA_ENTRE_CICLOS);
            if (ATIVADO) escanearEConstruir();
        }
    }

    async function iniciar() {
        if (rodando) return;
        if (Object.keys(configAldeias).length === 0) {
            ui.log('⚠️ Configure ao menos uma aldeia antes de iniciar.', 'warning');
            ATIVADO = false;
            atualizarBotao(false);
            return;
        }
        rodando = true;
        ui.log(`🚀 Iniciando — ${Object.keys(configAldeias).length} aldeia(s) configurada(s)`, 'success');
        await delay(500);
        escanearEConstruir();
    }

    function parar() {
        rodando = false;
        if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
        ui.hideProgress(0);
        const cardEl = document.getElementById('twb-countdown-card');
        if (cardEl) cardEl.textContent = '-';
        ui.log(`⏹️ Parado. Total: ${totalConstruido} construídos`, 'warning');
    }

    // Expor limpeza para uso externo (ex: navegação de aba)
    window.addEventListener('beforeunload', () => {
        pararAutoUpdateLista();
        if (_countdownInterval) clearInterval(_countdownInterval);
    });

    function toggle() {
        ATIVADO = !ATIVADO;
        ATIVADO ? iniciar() : parar();
        atualizarBotao(ATIVADO);
        salvarEstado();
    }

    function resetarTudo() {
        ATIVADO = false; rodando = false; cicloAtivo = false;
        PAUSA_ENTRE_ALDEIAS = DEFAULTS.pausaAldeias;
        PAUSA_ENTRE_CICLOS  = DEFAULTS.pausaCiclos;
        totalConstruido     = 0;
        maxQueueSlots       = DEFAULTS.maxQueueSlots;
        cicloAtual          = 0;
        priorityBuildings   = [...ORDEM_ORIGINAL];
        Object.keys(EDIFICIOS).forEach(k => { enabledBuildings[k] = true; });
        Object.assign(maxLevels, getDefaultMaxLevels());
        configAldeias = {};
        localStorage.removeItem(STORAGE_KEY);
        atualizarMetricas();
        atualizarBotao(false);
        atualizarContadorAldeias();
        atualizarResumoEdificios();
        renderizarListaAldeiasDoCache();
        ui.log('↺ Sistema reiniciado.', 'info');
        if (modalAldeias && modalAldeias.style.display === 'flex') carregarAldeiasModal();
    }

    // ============================================
    // UI — MÉTRICAS E BOTÃO
    // ============================================
    function atualizarMetricas() {
        ui.updateStat('twb-met-total', totalConstruido);
        ui.updateStat('twb-met-ciclos', cicloAtual);
        ui.updateStat('twb-countdown-card', '-');
        const statusCard = document.getElementById('twb-status-card');
        if (statusCard) statusCard.textContent = ATIVADO ? 'Ativo' : 'Inativo';
    }

    function atualizarBotao(ativo) {
        const btn  = document.getElementById('twb-botao');
        const dot  = document.getElementById('twb-dot');
        const stat = document.getElementById('twb-status');
        if (dot)  dot.style.background  = ativo ? 'var(--twui-orange)' : '#555';
        if (stat) stat.textContent       = ativo ? `Rodando • Ciclo ${cicloAtual}` : `Parado • ${totalConstruido} construídos`;
        if (btn) {
            btn.innerHTML        = ativo ? '⏹ PARAR' : '▶ CONSTRUIR';
            btn.style.background = ativo ? 'var(--twui-red)' : 'var(--twui-orange)';
        }
        atualizarMetricas();
    }

    function atualizarContadorAldeias() {
        const total  = Object.keys(configAldeias).length;
        ui.updateStat('twb-aldeias-count', total);
        const el = document.getElementById('twb-aldeias-status');
        if (el) {
            el.textContent = total === 0 ? 'Nenhuma configurada' : `${total} aldeia(s) ativa(s)`;
            el.style.color = total === 0 ? 'var(--twui-red)' : 'var(--twui-green)';
        }
    }

    function atualizarResumoEdificios() {
        const total = Object.keys(EDIFICIOS).length;
        const ativos = Object.values(enabledBuildings).filter(Boolean).length;
        ui.updateStat('twb-edificios-count', `${ativos}/${total}`);
    }

    // ============================================
    // LISTA DE ALDEIAS — renderização rápida do cache (sem fetch e sem fila)
    // ============================================
    function renderizarListaAldeiasDoCache() {
        const container = document.getElementById('twb-lista-aldeias');
        if (!container) return;

        const aldeiasAtivas = Object.entries(configAldeias);

        if (aldeiasAtivas.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--twui-text-dim);">⚠️ Nenhuma aldeia configurada. Clique em "Selecionar Aldeias" para adicionar.</div>';
            return;
        }

        container.innerHTML = '';

        for (const [id, cfg] of aldeiasAtivas) {
            const card = document.createElement('div');
            card.style.cssText = 'background:var(--twui-bg);border:1px solid var(--twui-border);border-radius:8px;padding:12px;margin-bottom:8px;transition:all 0.2s;';
            card.onmouseenter = () => card.style.borderColor = 'var(--twui-orange)';
            card.onmouseleave = () => card.style.borderColor = 'var(--twui-border)';

            // Montar tabela de níveis a partir do cache de buildings
            const buildings = cfg.buildingsCache || {};
            const buildingRows = priorityBuildings
                .filter(k => enabledBuildings[k] !== false)
                .slice(0, 6) // mostrar os 6 primeiros ativos por prioridade
                .map(k => {
                    const b = buildings[k];
                    const nivel = b ? parseInt(b.level) || 0 : '?';
                    const max = maxLevels[k] || 30;
                    const atingido = nivel !== '?' && nivel >= max;
                    const cor = atingido ? 'var(--twui-text-dim)' : 'var(--twui-text)';
                    return `<span style="color:${cor};font-size:10px;background:var(--twui-bg-card);border:1px solid var(--twui-border);border-radius:4px;padding:1px 5px;">${NOMES_CURTOS[EDIFICIOS[k]] || EDIFICIOS[k]} <b>${nivel}</b>/<span style="color:var(--twui-text-dim)">${max}</span></span>`;
                }).join('');

            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                    <div>
                        <span style="font-weight:bold;color:var(--twui-orange);">🏠 ${cfg.nome}</span>
                        <span style="font-size:11px;color:var(--twui-text-dim);margin-left:8px;">📍 ${cfg.coord || '?'}</span>
                    </div>
                    <span style="font-size:10px;background:var(--twui-orange);color:#000;padding:2px 6px;border-radius:10px;">🟢 Ativo</span>
                </div>
                ${buildingRows ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${buildingRows}</div>` : ''}
            `;
            container.appendChild(card);
        }
    }

    // ============================================
    // LISTA DE ALDEIAS — fetch completo (atualiza cache e re-renderiza)
    // ============================================
    async function atualizarListaAldeias() {
        const container = document.getElementById('twb-lista-aldeias');
        if (!container) return;

        if (Object.keys(configAldeias).length === 0) {
            renderizarListaAldeiasDoCache();
            return;
        }

        for (const [id, cfg] of Object.entries(configAldeias)) {
            try {
                const dados = await fetchVillageData(parseInt(id));
                if (dados) {
                    configAldeias[id].buildingsCache = dados.buildings || {};
                }
            } catch(err) {
                console.error(`[Builder] Erro ao atualizar aldeia ${cfg.nome}:`, err);
            }
            await delay(300);
        }

        salvarEstado();
        renderizarListaAldeiasDoCache();
    }

    function iniciarAutoUpdateLista() {
        if (_autoUpdateInterval) clearInterval(_autoUpdateInterval);
        _autoUpdateInterval = setInterval(() => {
            // Só atualiza se o dashboard ainda estiver na página
            if (!document.getElementById('twb-lista-aldeias')) {
                clearInterval(_autoUpdateInterval);
                _autoUpdateInterval = null;
                return;
            }
            atualizarListaAldeias();
        }, 30000);
    }

    function pararAutoUpdateLista() {
        if (_autoUpdateInterval) {
            clearInterval(_autoUpdateInterval);
            _autoUpdateInterval = null;
        }
    }

    // ============================================
    // MODAL ALDEIAS (APENAS PARA MARCAR ALDEIAS)
    // ============================================
    let modalAldeias = null;

    async function abrirModalAldeias() {
        if (modalAldeias) { modalAldeias.style.display = 'flex'; await carregarAldeiasModal(); return; }

        modalAldeias = document.createElement('div');
        modalAldeias.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000000;display:flex;align-items:center;justify-content:center;font-family:inherit;';

        const container = document.createElement('div');
        container.style.cssText = 'background:var(--twui-bg);border:1px solid var(--twui-border);border-radius:14px;width:600px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;color:var(--twui-text);font-size:13px;';

        container.innerHTML = `
            <div style="background:var(--twui-bg-card);padding:12px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--twui-border);flex-shrink:0;">
                <span style="font-weight:700;color:var(--twui-orange);font-size:14px;">⚙️ Selecionar Aldeias para Construção</span>
                <button id="twb-mal-fechar" style="background:var(--twui-bg);border:1px solid var(--twui-border);color:var(--twui-text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px;">✕</button>
            </div>
            <div style="padding:10px 18px;border-bottom:1px solid var(--twui-border);flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <button id="twb-mal-all"    class="twb-btn twb-btn-secondary">✓ Selecionar Todas</button>
                <button id="twb-mal-none"   class="twb-btn twb-btn-ghost">✕ Limpar Seleção</button>
                <button id="twb-mal-reload" class="twb-btn twb-btn-secondary" style="margin-left:auto;">↻ Recarregar</button>
            </div>
            <div style="padding:8px 18px;border-bottom:1px solid var(--twui-border);flex-shrink:0;display:grid;grid-template-columns:30px 2fr 1fr 1fr;gap:8px;font-size:10px;color:var(--twui-orange);font-weight:700;">
                <div></div><div>🏠 Aldeia</div><div>📍 Coordenada</div><div>📊 Pontos</div>
            </div>
            <div id="twb-mal-lista" style="overflow-y:auto;flex:1;padding:10px 18px;display:flex;flex-direction:column;gap:6px;">
                <div style="color:var(--twui-text-dim);font-size:12px;text-align:center;padding:20px 0;">Carregando...</div>
            </div>
            <div style="padding:12px 18px;border-top:1px solid var(--twui-border);display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
                <button id="twb-mal-cancelar" class="twb-btn twb-btn-ghost">Cancelar</button>
                <button id="twb-mal-salvar"   class="twb-btn twb-btn-primary">Salvar Seleção</button>
            </div>
        `;

        modalAldeias.appendChild(container);
        document.body.appendChild(modalAldeias);

        modalAldeias.addEventListener('click', e => { if (e.target === modalAldeias) fecharModalAldeias(); });
        document.getElementById('twb-mal-fechar').addEventListener('click', fecharModalAldeias);
        document.getElementById('twb-mal-cancelar').addEventListener('click', fecharModalAldeias);
        document.getElementById('twb-mal-salvar').addEventListener('click', salvarConfigAldeias);
        document.getElementById('twb-mal-all').addEventListener('click', () =>
            document.querySelectorAll('#twb-mal-lista .twb-vc').forEach(cb => cb.checked = true));
        document.getElementById('twb-mal-none').addEventListener('click', () =>
            document.querySelectorAll('#twb-mal-lista .twb-vc').forEach(cb => cb.checked = false));
        document.getElementById('twb-mal-reload').addEventListener('click', async () => {
            const btn = document.getElementById('twb-mal-reload');
            btn.textContent = '⏳'; btn.disabled = true;
            cacheAldeias = [];
            await carregarAldeiasModal();
            btn.textContent = '↻ Recarregar'; btn.disabled = false;
        });

        await carregarAldeiasModal();
    }

    function fecharModalAldeias() {
        if (modalAldeias) modalAldeias.style.display = 'none';
    }

    async function carregarAldeiasModal() {
        const lista = document.getElementById('twb-mal-lista');
        if (!lista) return;
        lista.innerHTML = '<div style="color:var(--twui-text-dim);font-size:12px;text-align:center;padding:20px 0;">Carregando...</div>';

        try {
            const aldeias = await obterTodasAldeias();
            lista.innerHTML = '';

            for (const a of aldeias) {
                const isSelected = !!configAldeias[a.id];
                const row = document.createElement('div');
                row.dataset.villageId = a.id;
                row.style.cssText = 'background:var(--twui-bg-card);border:1px solid var(--twui-border);border-radius:6px;padding:8px 12px;display:grid;grid-template-columns:30px 2fr 1fr 1fr;gap:8px;align-items:center;';

                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.className = 'twb-vc';
                cb.checked = isSelected;
                cb.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:var(--twui-orange);';

                const nome = document.createElement('div');
                nome.style.cssText = 'font-weight:600;font-size:12px;color:var(--twui-orange);';
                nome.textContent = a.nome;

                const coord = document.createElement('div');
                coord.style.cssText = 'font-size:11px;color:var(--twui-text-dim);';
                coord.textContent = a.coord;

                const pontos = document.createElement('div');
                pontos.style.cssText = 'font-size:11px;color:var(--twui-text-dim);text-align:right;';
                pontos.textContent = a.pontos.toLocaleString();

                row.appendChild(cb);
                row.appendChild(nome);
                row.appendChild(coord);
                row.appendChild(pontos);
                lista.appendChild(row);
            }
        } catch(err) {
            lista.innerHTML = `<div style="color:var(--twui-red);font-size:12px;text-align:center;padding:20px 0;">❌ Erro: ${err.message}</div>`;
        }
    }

    function salvarConfigAldeias() {
        const lista = document.getElementById('twb-mal-lista');
        if (!lista) return;

        const nova = {};
        const linhas = Array.from(lista.children).filter(child => child.dataset?.villageId);

        for (const row of linhas) {
            const id = parseInt(row.dataset.villageId);
            const cb = row.querySelector('.twb-vc');
            if (cb?.checked) {
                const aldeiaOriginal = cacheAldeias.find(a => a.id === id);
                const existing = configAldeias[id] || {};
                nova[id] = {
                    nome:           aldeiaOriginal?.nome  || `Aldeia ${id}`,
                    coord:          aldeiaOriginal?.coord || '?',
                    pontos:         aldeiaOriginal?.pontos || 0,
                    enabled:        true,
                    buildingsCache: existing.buildingsCache || {}
                };
            }
        }

        configAldeias = nova;
        salvarEstado();
        atualizarContadorAldeias();
        renderizarListaAldeiasDoCache();
        fecharModalAldeias();
        ui.log(`✅ ${Object.keys(configAldeias).length} aldeia(s) selecionada(s) para construção.`, 'success');
    }

    // ============================================
    // MODAL EDIFÍCIOS
    // ============================================
    let modalEdificios = null;

    function abrirModalEdificios() {
        if (modalEdificios) { modalEdificios.style.display = 'flex'; return; }

        modalEdificios = document.createElement('div');
        modalEdificios.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000001;display:flex;align-items:center;justify-content:center;font-family:inherit;';

        const container = document.createElement('div');
        container.style.cssText = 'background:var(--twui-bg);border:1px solid var(--twui-border);border-radius:14px;width:520px;max-width:95vw;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;color:var(--twui-text);font-size:13px;';

        container.innerHTML = `
            <div style="background:var(--twui-bg-card);padding:12px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--twui-border);flex-shrink:0;">
                <span style="font-weight:700;color:var(--twui-orange);font-size:14px;">🏛️ Configurar Edifícios</span>
                <button id="twb-med-fechar" style="background:var(--twui-bg);border:1px solid var(--twui-border);color:var(--twui-text-dim);width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:16px;">✕</button>
            </div>
            <div style="padding:10px 18px;border-bottom:1px solid var(--twui-border);flex-shrink:0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <button id="twb-med-all"    class="twb-btn twb-btn-secondary">✓ Todos</button>
                <button id="twb-med-none"   class="twb-btn twb-btn-ghost">✕ Nenhum</button>
                <button id="twb-med-ordem"  class="twb-btn twb-btn-secondary">↺ Ordem original</button>
                <button id="twb-med-padrao" class="twb-btn twb-btn-secondary">↺ Níveis padrão</button>
            </div>
            <div style="padding:6px 18px;border-bottom:1px solid var(--twui-border);flex-shrink:0;display:grid;grid-template-columns:24px 1fr 70px 30px;gap:8px;font-size:10px;color:var(--twui-text-dim);text-transform:uppercase;">
                <div></div><div>Edifício</div><div style="text-align:center;">Nível máx.</div><div></div>
            </div>
            <div id="twb-med-lista" style="overflow-y:auto;flex:1;padding:10px 18px;display:flex;flex-direction:column;gap:4px;"></div>
            <div style="padding:12px 18px;border-top:1px solid var(--twui-border);display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
                <button id="twb-med-cancelar" class="twb-btn twb-btn-ghost">Cancelar</button>
                <button id="twb-med-salvar"   class="twb-btn twb-btn-primary">Salvar</button>
            </div>
        `;

        modalEdificios.appendChild(container);
        document.body.appendChild(modalEdificios);

        modalEdificios.addEventListener('click', e => { if (e.target === modalEdificios) fecharModalEdificios(); });
        document.getElementById('twb-med-fechar').addEventListener('click', fecharModalEdificios);
        document.getElementById('twb-med-cancelar').addEventListener('click', fecharModalEdificios);
        document.getElementById('twb-med-salvar').addEventListener('click', salvarConfigEdificios);
        document.getElementById('twb-med-all').addEventListener('click', () => {
            document.querySelectorAll('#twb-med-lista .twb-ec').forEach(cb => { cb.checked = true; enabledBuildings[cb.dataset.id] = true; });
            atualizarResumoEdificios();
        });
        document.getElementById('twb-med-none').addEventListener('click', () => {
            document.querySelectorAll('#twb-med-lista .twb-ec').forEach(cb => { cb.checked = false; enabledBuildings[cb.dataset.id] = false; });
            atualizarResumoEdificios();
        });
        document.getElementById('twb-med-ordem').addEventListener('click', () => {
            priorityBuildings = [...ORDEM_ORIGINAL];
            carregarEdificiosModal();
            ui.log('↺ Ordem original restaurada.', 'info');
        });
        document.getElementById('twb-med-padrao').addEventListener('click', () => {
            Object.assign(maxLevels, getDefaultMaxLevels());
            document.querySelectorAll('#twb-med-lista input[type="number"]').forEach(inp => {
                inp.value = maxLevels[inp.dataset.id] || 1;
            });
        });

        carregarEdificiosModal();
    }

    function fecharModalEdificios() { if (modalEdificios) modalEdificios.style.display = 'none'; }

    function carregarEdificiosModal() {
        const lista = document.getElementById('twb-med-lista');
        if (!lista) return;
        lista.innerHTML = '';
        let dragSrc = null;

        priorityBuildings.forEach(id => {
            const row = document.createElement('div');
            row.draggable = true;
            row.dataset.id = id;
            row.style.cssText = 'background:var(--twui-bg-card);border:1px solid var(--twui-border);border-radius:6px;padding:7px 10px;display:grid;grid-template-columns:24px 1fr 70px 30px;gap:8px;align-items:center;cursor:default;';

            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'twb-ec'; cb.dataset.id = id;
            cb.checked = enabledBuildings[id] !== false;
            cb.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:var(--twui-orange);';
            cb.addEventListener('change', () => { enabledBuildings[id] = cb.checked; atualizarResumoEdificios(); });

            const nome = document.createElement('span');
            nome.style.cssText = 'font-size:12px;color:var(--twui-text);';
            nome.textContent = EDIFICIOS[id];

            const inp = document.createElement('input');
            inp.type = 'number'; inp.dataset.id = id;
            inp.value = maxLevels[id] || 1; inp.min = 0; inp.max = 30;
            inp.style.cssText = 'width:100%;padding:3px 5px;background:var(--twui-bg);border:1px solid var(--twui-orange);color:var(--twui-orange);border-radius:4px;text-align:center;font-size:11px;';
            inp.addEventListener('change', () => { maxLevels[id] = Math.min(30, Math.max(0, parseInt(inp.value)||0)); });

            const handle = document.createElement('span');
            handle.textContent = '⋮⋮';
            handle.style.cssText = 'color:var(--twui-orange);cursor:grab;font-size:14px;text-align:center;';

            row.appendChild(cb); row.appendChild(nome); row.appendChild(inp); row.appendChild(handle);

            row.addEventListener('dragstart', e => { dragSrc = id; e.dataTransfer.effectAllowed = 'move'; row.style.opacity = '0.4'; });
            row.addEventListener('dragend',   () => { row.style.opacity = '1'; });
            row.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.style.background = 'var(--twui-bg)'; });
            row.addEventListener('dragleave', () => { row.style.background = 'var(--twui-bg-card)'; });
            row.addEventListener('drop', e => {
                e.preventDefault();
                row.style.background = 'var(--twui-bg-card)';
                if (!dragSrc || dragSrc === id) return;
                document.querySelectorAll('#twb-med-lista input[type="number"]').forEach(i => { maxLevels[i.dataset.id] = parseInt(i.value)||0; });
                document.querySelectorAll('#twb-med-lista .twb-ec').forEach(c => { enabledBuildings[c.dataset.id] = c.checked; });
                const fi = priorityBuildings.indexOf(dragSrc);
                const ti = priorityBuildings.indexOf(id);
                if (fi !== -1 && ti !== -1) { priorityBuildings.splice(fi, 1); priorityBuildings.splice(ti, 0, dragSrc); }
                carregarEdificiosModal();
            });

            lista.appendChild(row);
        });
    }

    function salvarConfigEdificios() {
        document.querySelectorAll('#twb-med-lista input[type="number"]').forEach(i => { maxLevels[i.dataset.id] = parseInt(i.value)||0; });
        document.querySelectorAll('#twb-med-lista .twb-ec').forEach(c => { enabledBuildings[c.dataset.id] = c.checked; });
        salvarEstado();
        atualizarResumoEdificios();
        fecharModalEdificios();
        ui.log('✅ Edifícios configurados.', 'success');
    }

    // ============================================
    // RENDERIZAR DASHBOARD (TWUI KIT)
    // ============================================
    async function renderizarDashboard() {
        ui.injectStyles();
        ui.renderApp();
        ui.header('🏗️ Auto Builder', 'v8.6 - UI Kit');

        // Stats strip
        ui.statsStrip([
            { title: '🔨 Construídos', items: [{ icon: '🔨', id: 'twb-met-total' }] },
            { title: '🔄 Ciclos',      items: [{ icon: '🔄', id: 'twb-met-ciclos' }] },
            { title: '🏠 Aldeias',     items: [{ icon: '🏠', id: 'twb-aldeias-count' }] },
            { title: '🏛️ Edifícios',  items: [{ icon: '🏛️', id: 'twb-edificios-count' }] },
            { title: '⏱️ Próx. ciclo', items: [{ icon: '⏱️', id: 'twb-countdown-card' }] }
        ]);

        // Config bar
        ui.configBar([
            { label: 'Slots fila',      id: 'twb-max-slots',      type: 'number', value: maxQueueSlots,       min: 1, max: 5 },
            { label: 'Pausa aldeias',   id: 'twb-pausa-aldeias',  type: 'number', value: PAUSA_ENTRE_ALDEIAS, min: 500, step: 100, unit: 'ms' },
            { label: 'Pausa ciclos',    id: 'twb-pausa-ciclos',   type: 'number', value: PAUSA_ENTRE_CICLOS / 1000, min: 10, step: 1, unit: 's' }
        ], (id, val) => {
            if (id === 'twb-max-slots')     maxQueueSlots       = val;
            if (id === 'twb-pausa-aldeias') PAUSA_ENTRE_ALDEIAS = val;
            if (id === 'twb-pausa-ciclos')  PAUSA_ENTRE_CICLOS  = val * 1000;
            salvarEstado();
        });

        // Toolbar
        ui.toolbar(
            `<button id="twb-botao" class="twb-btn twb-btn-primary" style="background:var(--twui-orange);">▶ CONSTRUIR</button>
             <button id="twb-reset" class="twb-btn twb-btn-ghost">↺ RESET</button>`,
            `<span id="twb-status" class="twb-muted">Parado • ${totalConstruido} construídos</span>
             <div id="twb-dot" style="width:10px;height:10px;border-radius:50%;background:#555;"></div>`
        );

        // Main layout com lista de aldeias frontal
        ui.mainLayout(`
            <div style="padding:0 20px 20px 20px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">

                    <div style="background:var(--twui-bg-card);border-radius:12px;padding:16px;">
                        <div style="color:var(--twui-orange);font-weight:600;margin-bottom:10px;font-size:13px;">⚙️ Aldeias</div>
                        <div id="twb-aldeias-status" style="font-size:11px;margin-bottom:10px;color:var(--twui-text-dim);">
                            ${Object.keys(configAldeias).length === 0 ? 'Nenhuma selecionada' : `${Object.keys(configAldeias).length} aldeia(s) selecionada(s)`}
                        </div>
                        <button id="twb-btn-aldeias" class="twb-btn twb-btn-secondary" style="width:100%;">📋 Selecionar Aldeias</button>
                    </div>

                    <div style="background:var(--twui-bg-card);border-radius:12px;padding:16px;">
                        <div style="color:var(--twui-orange);font-weight:600;margin-bottom:10px;font-size:13px;">🏛️ Edifícios</div>
                        <div style="font-size:11px;margin-bottom:10px;color:var(--twui-text-dim);">
                            ${Object.values(enabledBuildings).filter(Boolean).length}/${Object.keys(EDIFICIOS).length} edifícios ativos
                        </div>
                        <button id="twb-btn-edificios" class="twb-btn twb-btn-secondary" style="width:100%;">🔧 Configurar Edifícios</button>
                    </div>

                </div>

                <div style="background:var(--twui-bg-card);border-radius:12px;padding:16px;margin-top:10px;">
                    <div style="color:var(--twui-orange);font-weight:600;margin-bottom:12px;font-size:13px;display:flex;align-items:center;justify-content:space-between;">
                        <span>📋 Aldeias Selecionadas</span>
                        <button id="twb-btn-atualizar-lista" class="twb-btn twb-btn-ghost" style="padding:4px 8px;font-size:10px;">↻ Atualizar</button>
                    </div>
                    <div id="twb-lista-aldeias" style="max-height:400px;overflow-y:auto;">
                        <div style="text-align:center;padding:20px;color:var(--twui-text-dim);">Carregando...</div>
                    </div>
                </div>
            </div>
        `, '📝 Log de Atividades');

        // Estilos dos botões
        const style = document.createElement('style');
        style.textContent = `
            .twb-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                padding: 8px 16px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.15s;
            }
            .twb-btn-primary  { background: var(--twui-orange); color: #000; }
            .twb-btn-primary:hover  { background: var(--twui-orange-light); transform: translateY(-1px); }
            .twb-btn-secondary { background: var(--twui-bg-card); color: var(--twui-text); border: 1px solid var(--twui-border); }
            .twb-btn-secondary:hover { border-color: var(--twui-orange); }
            .twb-btn-ghost    { background: transparent; color: var(--twui-text-dim); border: 1px solid var(--twui-border); }
            .twb-btn-ghost:hover { border-color: var(--twui-orange); color: var(--twui-orange); }
            .twb-muted        { color: var(--twui-text-dim); font-size: 11px; }
            .twb-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        `;
        document.head.appendChild(style);

        // Eventos
        document.getElementById('twb-btn-aldeias').onclick   = abrirModalAldeias;
        document.getElementById('twb-btn-edificios').onclick = abrirModalEdificios;
        document.getElementById('twb-botao').onclick         = toggle;
        document.getElementById('twb-reset').onclick         = () => {
            if (confirm('Reiniciar tudo? Isso vai parar o builder, zerar contadores e apagar as configurações.')) resetarTudo();
        };
        document.getElementById('twb-btn-atualizar-lista').onclick = atualizarListaAldeias;

        // Inicializar métricas e lista
        atualizarBotao(ATIVADO);
        atualizarContadorAldeias();
        atualizarResumoEdificios();
        ui.updateStat('twb-met-total', totalConstruido);
        ui.updateStat('twb-met-ciclos', cicloAtual);
        ui.updateStat('twb-countdown-card', '-');

        await atualizarListaAldeias();
        iniciarAutoUpdateLista();

        ui.log('🏗️ Dashboard Auto Builder v8.6 - UI Kit', 'info');
        ui.log('💡 Selecione as aldeias e edifícios, depois clique em CONSTRUIR', 'info');

        if (ATIVADO && !rodando) iniciar();
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    if (window.location.href.includes(DASHBOARD_PARAM)) {
        setTimeout(() => renderizarDashboard(), 100);
    } else {
        adicionarBotaoAbrirDashboard();
    }

})();