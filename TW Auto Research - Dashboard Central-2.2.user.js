// ==UserScript==
// @name         TW Auto Research - Dashboard Central
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Pesquisa automática de unidades individuais em aba separada
// @match        https://*.tribalwars.com.br/game.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const DASHBOARD_PARAM = 'twAutoResearch=true';

    // ============================================
    // UNIDADES INDIVIDUAIS COM ÍCONES OFICIAIS
    // ============================================
    const UNIDADES = {
        spear:    { nome: 'Lanceiro',     icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_spear.png', cor: '#9b59b6', categoria: 'infantaria' },
        sword:    { nome: 'Espadachim',   icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_sword.png', cor: '#9b59b6', categoria: 'infantaria' },
        axe:      { nome: 'Bárbaro',      icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_axe.png', cor: '#9b59b6', categoria: 'infantaria' },
        archer:   { nome: 'Arqueiro',     icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_archer.png', cor: '#9b59b6', categoria: 'infantaria' },
        spy:      { nome: 'Explorador',   icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_spy.png', cor: '#8e44ad', categoria: 'cavalaria' },
        light:    { nome: 'Cavalaria leve', icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_light.png', cor: '#8e44ad', categoria: 'cavalaria' },
        marcher:  { nome: 'Arqueiro a cavalo', icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_marcher.png', cor: '#8e44ad', categoria: 'cavalaria' },
        heavy:    { nome: 'Cavalaria pesada', icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_heavy.png', cor: '#8e44ad', categoria: 'cavalaria' },
        ram:      { nome: 'Aríete',        icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_ram.png', cor: '#7d3c98', categoria: 'cerco' },
        catapult: { nome: 'Catapulta',     icone: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_catapult.png', cor: '#7d3c98', categoria: 'cerco' }
    };

    const UNIDADES_KEYS = Object.keys(UNIDADES);

    // ============================================
    // CONFIGURAÇÕES PADRÃO
    // ============================================
    const DEFAULTS = {
        pausaAldeias:   3000,
        pausaCiclos:    120000,
        totalPesquisado: 0,
        ativado:         false
    };

    const STORAGE_KEY = 'twr_research_v2';

    // ============================================
    // VARIÁVEIS GLOBAIS
    // ============================================
    let ATIVADO             = false;
    let PAUSA_ENTRE_ALDEIAS = DEFAULTS.pausaAldeias;
    let PAUSA_ENTRE_CICLOS  = DEFAULTS.pausaCiclos;
    let totalPesquisado     = DEFAULTS.totalPesquisado;
    let configAldeias       = {};

    let csrfCache  = null;
    let rodando    = false;
    let cicloAtivo = false;
    let cicloAtual = 0;
    let _countdownInterval = null;

    // Cache de aldeias
    let cacheAldeias = [];

    // ============================================
    // PERSISTÊNCIA
    // ============================================
    function salvarEstado() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            pausaAldeias:    PAUSA_ENTRE_ALDEIAS,
            pausaCiclos:     PAUSA_ENTRE_CICLOS,
            totalPesquisado: totalPesquisado,
            configAldeias:   configAldeias,
            cicloAtual:      cicloAtual,
            ativado:         ATIVADO
        }));
    }

    function carregarEstado() {
        const salvo = localStorage.getItem(STORAGE_KEY);
        if (!salvo) return;

        const d = JSON.parse(salvo);
        PAUSA_ENTRE_ALDEIAS = d.pausaAldeias    || DEFAULTS.pausaAldeias;
        PAUSA_ENTRE_CICLOS  = d.pausaCiclos     || DEFAULTS.pausaCiclos;
        totalPesquisado     = d.totalPesquisado || 0;
        configAldeias       = d.configAldeias   || {};
        cicloAtual          = d.cicloAtual      || 0;
        ATIVADO             = d.ativado === true;
    }

    function resetarTudo() {
        ATIVADO = false; rodando = false; cicloAtivo = false;
        PAUSA_ENTRE_ALDEIAS = DEFAULTS.pausaAldeias;
        PAUSA_ENTRE_CICLOS  = DEFAULTS.pausaCiclos;
        totalPesquisado     = 0;
        cicloAtual          = 0;
        configAldeias       = {};
        csrfCache           = null;
        localStorage.removeItem(STORAGE_KEY);

        if (_countdownInterval) clearInterval(_countdownInterval);

        atualizarMetricas();
        atualizarContadorAldeias();
        atualizarBotao(false);
        adicionarLog('✅ Reiniciado.', 'system');

        // Atualiza os inputs do dashboard
        atualizarInputsDashboard();
    }

    // ============================================
    // DETECTA MODO
    // ============================================
    if (window.location.href.includes(DASHBOARD_PARAM)) {
        renderizarDashboard();
    } else {
        adicionarBotaoAbrirDashboard();
    }

    // ============================================
    // BOTÃO NA ABA DO JOGO
    // ============================================
    function adicionarBotaoAbrirDashboard() {
        const btn = document.createElement('div');
        btn.innerHTML = '🔬 AUTO RESEARCH';
        btn.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            z-index: 999999;
            padding: 8px 12px;
            background: #0a0a0a;
            color: #9b59b6;
            border: 1px solid #9b59b6;
            border-radius: 6px;
            cursor: pointer;
            font-family: monospace;
            font-weight: bold;
            font-size: 11px;
        `;
        btn.onclick = () => {
            window.open(window.location.href.split('?')[0] + '?' + DASHBOARD_PARAM, 'TWAutoResearch');
        };
        document.body.appendChild(btn);
    }

    // ============================================
    // FUNÇÕES AUXILIARES
    // ============================================
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function obterCsrf() {
        if (!csrfCache) {
            csrfCache = window.game_data?.csrf || null;
        }
        return csrfCache;
    }

    // ============================================
    // FUNÇÕES DE COLETA
    // ============================================
    async function obterTodasAldeias() {
        if (cacheAldeias.length > 0) {
            return cacheAldeias;
        }

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
    // LÓGICA DE PESQUISA
    // ============================================
    async function obterEstadoFerraria(villageId) {
        try {
            const url = `/game.php?village=${villageId}&screen=smith`;
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) return null;

            const html = await response.text();

            if (!html.includes('BuildingSmith')) return null;

            if (!csrfCache) {
                const m = html.match(/ajaxaction=research&(?:amp;)?h=([a-f0-9]+)/i);
                if (m) csrfCache = m[1];
            }

            const emAndamento = /class="timer"/.test(html);

            const techMatch = html.match(/BuildingSmith\.techs\s*=\s*(\{[\s\S]*?\});\s*[\r\n]/);
            let techs = {};
            if (techMatch) {
                try { techs = JSON.parse(techMatch[1]).available || {}; } catch (e) {
                    console.warn('[Research] Erro ao parsear techs:', e);
                }
            }

            return { techs, emAndamento, csrf: obterCsrf() };

        } catch (err) {
            console.error('[Research] obterEstadoFerraria erro:', err);
            return null;
        }
    }

    async function pesquisarUnidade(villageId, unidade, csrf) {
        try {
            const url = `/game.php?village=${villageId}&screen=smith&ajaxaction=research&h=${csrf}`;

            const postResponse = await fetch(url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: `tech_id=${unidade}&source=${villageId}&h=${csrf}`
            });

            if (!postResponse.ok) return { success: false, reason: `HTTP ${postResponse.status}` };

            const rawText = await postResponse.text();

            let json = null;
            try { json = JSON.parse(rawText); } catch(e) {}

            if (json) {
                if (json?.error) {
                    if (/sess.o|session|expirou|expired/i.test(JSON.stringify(json.error))) {
                        csrfCache = null;
                    }
                    return { success: false, reason: Array.isArray(json.error) ? json.error[0] : json.error };
                }
                if (json?.response?.tech_list) return { success: true };
                if (json?.response) return { success: true };
            }

            if (/recursos insuficientes|not enough/i.test(rawText)) return { success: false, reason: 'Recursos insuficientes' };
            if (/em andamento|already/i.test(rawText)) return { success: false, reason: 'Pesquisa em andamento' };
            if (/fila.*cheia|queue.*full/i.test(rawText)) return { success: false, reason: 'Fila cheia' };

            return { success: true };

        } catch (err) {
            return { success: false, reason: err.message };
        }
    }

    async function processarAldeia(villageId, cfg) {
        const estado = await obterEstadoFerraria(villageId);

        if (!estado) {
            adicionarLog(`⚠️ ${cfg.nome}: sem ferreiro ou erro ao carregar`, 'warning');
            return;
        }

        if (estado.emAndamento) {
            adicionarLog(`⏳ ${cfg.nome}: pesquisa em andamento / fila cheia`, 'warning');
            return;
        }

        // Loop por todas as unidades individuais na ordem definida
        for (const unidadeKey of UNIDADES_KEYS) {
            if (!cfg[unidadeKey]) continue; // Unidade não está ativa para esta aldeia

            const unidade = UNIDADES[unidadeKey];
            const tech = estado.techs[unidadeKey];

            if (!tech) continue;

            const level = parseInt(tech.level) || 0;
            const levelAfter = parseInt(tech.level_after) || 0;
            const canResearch = tech.can_research === true;

            // Verifica se já está pesquisada (level 1 ou mais)
            if (level >= 1) continue;
            if (levelAfter >= 1) continue;
            if (!canResearch) continue;

            // Tenta pesquisar a unidade
            const resultado = await pesquisarUnidade(villageId, unidadeKey, estado.csrf);

            if (resultado.success) {
                totalPesquisado++;
                salvarEstado();
                atualizarMetricas();
                adicionarLog(`🏗️ ${cfg.nome}: pesquisando ${unidade.nome}`, 'success');
                await delay(800);
                return; // Uma pesquisa por ciclo para evitar fila
            } else {
                adicionarLog(`⚠️ ${cfg.nome}: ${unidade.nome} — ${resultado.reason}`, 'error');
            }
        }
    }

    // ============================================
    // CICLO PRINCIPAL
    // ============================================
    function startCountdown(seconds) {
        if (_countdownInterval) clearInterval(_countdownInterval);
        const cardEl = document.getElementById('twr-countdown-card');
        if (!cardEl) return;

        let rem = seconds;
        const updateDisplay = () => {
            cardEl.textContent = rem > 0 ? `${rem}s` : '-';
        };
        updateDisplay();

        _countdownInterval = setInterval(() => {
            rem--;
            if (rem <= 0) {
                clearInterval(_countdownInterval);
                _countdownInterval = null;
                updateDisplay();
            } else {
                updateDisplay();
            }
        }, 1000);
    }

    async function escanearEPesquisar() {
        if (!ATIVADO || cicloAtivo) return;
        cicloAtivo = true;
        cicloAtual++;
        atualizarMetricas();

        const aldeias = Object.entries(configAldeias);

        if (aldeias.length === 0) {
            adicionarLog('⚠️ Nenhuma aldeia configurada.', 'warning');
            cicloAtivo = false;
            return;
        }

        adicionarLog(`🔄 Ciclo ${cicloAtual} — ${aldeias.length} aldeia(s)`, 'system');

        try {
            for (const [id, cfg] of aldeias) {
                if (!ATIVADO) break;
                await processarAldeia(parseInt(id), cfg);
                await delay(PAUSA_ENTRE_ALDEIAS);
            }
            adicionarLog(`✅ Ciclo ${cicloAtual} concluído. Total: ${totalPesquisado}`, 'success');
        } catch (err) {
            adicionarLog(`❌ Erro no ciclo: ${err.message}`, 'error');
        }

        cicloAtivo = false;

        if (ATIVADO) {
            startCountdown(Math.round(PAUSA_ENTRE_CICLOS / 1000));
            await delay(PAUSA_ENTRE_CICLOS);
            if (ATIVADO) escanearEPesquisar();
        }
    }

    // ============================================
    // CONTROLE
    // ============================================
    async function iniciar() {
        if (rodando) return;

        if (Object.keys(configAldeias).length === 0) {
            adicionarLog('⚠️ Configure ao menos uma aldeia antes de iniciar.', 'warning');
            ATIVADO = false;
            atualizarBotao(false);
            return;
        }

        rodando = true;
        adicionarLog(`🚀 Iniciando — ${Object.keys(configAldeias).length} aldeia(s)`, 'success');
        await delay(500);
        escanearEPesquisar();
    }

    function parar() {
        rodando = false;
        if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
        const cardEl = document.getElementById('twr-countdown-card');
        if (cardEl) cardEl.textContent = '-';
        adicionarLog(`⏹️ Parado. Total: ${totalPesquisado} pesquisadas`, 'warning');
    }

    function toggle() {
        ATIVADO = !ATIVADO;
        ATIVADO ? iniciar() : parar();
        atualizarBotao(ATIVADO);
        salvarEstado();
    }

    // ============================================
    // UI
    // ============================================
    function atualizarMetricas() {
        const metT = document.getElementById('twr-met-total');
        const metC = document.getElementById('twr-met-ciclos');
        if (metT) metT.textContent = totalPesquisado;
        if (metC) metC.textContent = cicloAtual;
    }

    function atualizarBotao(ativo) {
        const btn  = document.getElementById('twr-botao');
        const dot  = document.getElementById('twr-dot');
        const stat = document.getElementById('twr-status');
        if (dot)  dot.style.background = ativo ? '#9b59b6' : '#6c3483';
        if (stat) stat.textContent     = ativo ? `Rodando — Ciclo ${cicloAtual}` : `Parado — ${totalPesquisado} pesquisadas`;
        if (btn) {
            btn.innerHTML        = ativo ? '⏹ Parar' : '▶ Pesquisar';
            btn.style.background = ativo ? '#6c3483' : '#9b59b6';
        }
        atualizarMetricas();
    }

    function atualizarContadorAldeias() {
        const el = document.getElementById('twr-aldeias-config');
        if (!el) return;
        const total = Object.keys(configAldeias).length;
        el.textContent = total === 0 ? 'Nenhuma aldeia configurada' : `${total} aldeia(s) configurada(s)`;
        el.style.color = total === 0 ? '#9b59b6' : '#7d3c98';

        const elCard = document.getElementById('twr-aldeias-config-count');
        if (elCard) elCard.textContent = total;
    }

    function atualizarInputsDashboard() {
        const inpAldeias = document.getElementById('twr-pausa-aldeias');
        const inpCiclos = document.getElementById('twr-pausa-ciclos');

        if (inpAldeias) inpAldeias.value = PAUSA_ENTRE_ALDEIAS;
        if (inpCiclos) inpCiclos.value = PAUSA_ENTRE_CICLOS / 1000;
    }

    // ============================================
    // LOG COM BOLINHAS E ORDEM INVERSA
    // ============================================
    function adicionarLog(msg, tipo) {
        const log = document.getElementById('twr-log');
        if (!log) return;

        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

        // Configurações por tipo
        const configs = {
            success: { cor: '#2ecc71', icone: '🟢' },  // Verde - Sucesso
            warning: { cor: '#f1c40f', icone: '🟡' },  // Amarelo - Aviso
            error:   { cor: '#e74c3c', icone: '🔴' },  // Vermelho - Erro
            system:  { cor: '#9b59b6', icone: '🟣' }   // Roxo - Sistema
        };

        const cfg = configs[tipo] || configs.system;

        // Remove placeholder se existir
        if (log.children.length === 1 && log.children[0].dataset?.placeholder) {
            log.innerHTML = '';
        }

        // Cria a entrada de log com bolinha
        const entry = document.createElement('div');
        entry.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            margin-bottom: 4px;
            background: #0d0d0d;
            border-left: 3px solid ${cfg.cor};
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 10px;
        `;

        // Bolinha colorida
        const dot = document.createElement('span');
        dot.style.cssText = `
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: ${cfg.cor};
            flex-shrink: 0;
            box-shadow: 0 0 2px ${cfg.cor};
        `;

        // Timestamp
        const timeSpan = document.createElement('span');
        timeSpan.style.cssText = 'color: #555; flex-shrink: 0;';
        timeSpan.textContent = `[${timestamp}]`;

        // Mensagem
        const msgSpan = document.createElement('span');
        msgSpan.style.cssText = `color: ${cfg.cor}; flex: 1;`;
        msgSpan.textContent = msg;

        entry.appendChild(dot);
        entry.appendChild(timeSpan);
        entry.appendChild(msgSpan);

        // Insere no TOPO (ordem inversa)
        if (log.children.length > 0) {
            log.insertBefore(entry, log.firstChild);
        } else {
            log.appendChild(entry);
        }

        // Limita a 100 entradas (remove as mais antigas, que estão no final)
        while (log.children.length > 100) {
            log.removeChild(log.lastChild);
        }
    }

    // ============================================
    // FUNÇÕES PARA RENDERIZAR ÍCONES
    // ============================================
    function getIconeHTML(unidadeKey, size = '18px') {
        const unidade = UNIDADES[unidadeKey];
        return `<img src="${unidade.icone}" alt="${unidade.nome}" title="${unidade.nome}" style="width: ${size}; height: ${size}; vertical-align: middle;">`;
    }

    // ============================================
    // MODAL ALDEIAS (COM UNIDADES INDIVIDUAIS)
    // ============================================
    let modalAldeias = null;

    async function abrirModalAldeias() {
        if (modalAldeias) { modalAldeias.style.display = 'flex'; return; }

        modalAldeias = document.createElement('div');
        modalAldeias.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:1000000;display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Arial,sans-serif;';

        const container = document.createElement('div');
        container.style.cssText = 'background:#000000;border:1px solid #9b59b6;border-radius:14px;width:950px;max-width:95vw;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;color:#e0e0e0;font-size:13px;';

        // Agrupa unidades por categoria para a legenda
        const infantariaUnidades = UNIDADES_KEYS.filter(k => UNIDADES[k].categoria === 'infantaria');
        const cavalariaUnidades = UNIDADES_KEYS.filter(k => UNIDADES[k].categoria === 'cavalaria');
        const cercoUnidades = UNIDADES_KEYS.filter(k => UNIDADES[k].categoria === 'cerco');

        container.innerHTML = `
            <div style="background:#1a1a1a;padding:12px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #9b59b6;flex-shrink:0;">
                <span style="font-weight:bold;color:#9b59b6;font-size:14px;">⚙ Configurar Pesquisa por Aldeia</span>
                <button id="twr-mal-fechar" style="background:#3a3a3a;border:none;color:#ccc;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>

            <div style="padding:10px 18px;border-bottom:1px solid #9b59b633;flex-shrink:0;font-size:11px;line-height:1.7;display:flex;gap:20px;flex-wrap:wrap;">
                <span style="color:#9b59b6;">⚔️ Infantaria:</span>
                <span>${infantariaUnidades.map(k => `<img src="${UNIDADES[k].icone}" title="${UNIDADES[k].nome}" style="width:18px;height:18px;vertical-align:middle;">`).join(' ')}</span>
                <span style="color:#8e44ad;">🐴 Cavalaria:</span>
                <span>${cavalariaUnidades.map(k => `<img src="${UNIDADES[k].icone}" title="${UNIDADES[k].nome}" style="width:18px;height:18px;vertical-align:middle;">`).join(' ')}</span>
                <span style="color:#7d3c98;">🪨 Cerco:</span>
                <span>${cercoUnidades.map(k => `<img src="${UNIDADES[k].icone}" title="${UNIDADES[k].nome}" style="width:18px;height:18px;vertical-align:middle;">`).join(' ')}</span>
            </div>

            <div style="padding:10px 18px;border-bottom:1px solid #222;flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="font-size:11px;color:#9b59b6;">Ações rápidas:</span>
                <button data-all-units="true" style="padding:4px 10px;border:1px solid #9b59b6;border-radius:6px;background:#1a1a1a;color:#9b59b6;font-size:11px;cursor:pointer;">✓ Todas unidades</button>
                <button data-none-units="true" style="padding:4px 10px;border:1px solid #333;border-radius:6px;background:#111;color:#9b59b688;font-size:11px;cursor:pointer;">✕ Nenhuma</button>
                <div style="width:1px;height:20px;background:#333;margin:0 4px;"></div>
                <button data-cat="infantaria" style="padding:4px 10px;border:1px solid #9b59b6;border-radius:6px;background:#9b59b618;color:#9b59b6;font-size:11px;cursor:pointer;">⚔️ Infantaria</button>
                <button data-cat="cavalaria" style="padding:4px 10px;border:1px solid #8e44ad;border-radius:6px;background:#8e44ad18;color:#8e44ad;font-size:11px;cursor:pointer;">🐴 Cavalaria</button>
                <button data-cat="cerco" style="padding:4px 10px;border:1px solid #7d3c98;border-radius:6px;background:#7d3c9818;color:#7d3c98;font-size:11px;cursor:pointer;">🪨 Cerco</button>
                <button id="twr-mal-reload" style="margin-left:auto;padding:5px 14px;border:1px solid #9b59b6;border-radius:6px;background:#0a0a0a;color:#9b59b6;font-size:11px;font-weight:bold;cursor:pointer;">↻ Recarregar</button>
            </div>

            <div id="twr-mal-lista" style="overflow-y:auto;flex:1;padding:14px 18px;display:flex;flex-direction:column;gap:8px;">
                <div style="color:#888;font-size:12px;text-align:center;padding:20px 0;">Carregando...</div>
            </div>

            <div style="padding:12px 18px;border-top:1px solid #222;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
                <button id="twr-mal-cancelar" style="padding:8px 18px;border:1px solid #444;border-radius:8px;background:#0a0a0a;color:#ccc;font-size:12px;cursor:pointer;">Cancelar</button>
                <button id="twr-mal-salvar"   style="padding:8px 18px;border:none;border-radius:8px;background:#9b59b6;color:#000;font-size:12px;font-weight:bold;cursor:pointer;">Salvar</button>
            </div>
        `;

        modalAldeias.appendChild(container);
        document.body.appendChild(modalAldeias);

        modalAldeias.addEventListener('click', e => { if (e.target === modalAldeias) fecharModalAldeias(); });
        document.getElementById('twr-mal-fechar').addEventListener('click', fecharModalAldeias);
        document.getElementById('twr-mal-cancelar').addEventListener('click', fecharModalAldeias);
        document.getElementById('twr-mal-salvar').addEventListener('click', salvarConfigAldeias);
        document.getElementById('twr-mal-reload').addEventListener('click', async () => {
            const btn = document.getElementById('twr-mal-reload');
            btn.textContent = '⏳'; btn.disabled = true;
            await carregarAldeiasModal();
            btn.textContent = '↻ Recarregar'; btn.disabled = false;
        });

        // Botões de ação em massa
        container.querySelectorAll('[data-all-units]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#twr-mal-lista [data-village-id]').forEach(row => {
                    UNIDADES_KEYS.forEach(unidadeKey => {
                        const cb = row.querySelector(`[data-unit="${unidadeKey}"]`);
                        if (cb) cb.checked = true;
                    });
                    atualizarBadgesRow(row);
                });
            });
        });

        container.querySelectorAll('[data-none-units]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#twr-mal-lista [data-village-id]').forEach(row => {
                    UNIDADES_KEYS.forEach(unidadeKey => {
                        const cb = row.querySelector(`[data-unit="${unidadeKey}"]`);
                        if (cb) cb.checked = false;
                    });
                    atualizarBadgesRow(row);
                });
            });
        });

        container.querySelectorAll('[data-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                const categoria = btn.dataset.cat;
                document.querySelectorAll('#twr-mal-lista [data-village-id]').forEach(row => {
                    UNIDADES_KEYS.forEach(unidadeKey => {
                        if (UNIDADES[unidadeKey].categoria === categoria) {
                            const cb = row.querySelector(`[data-unit="${unidadeKey}"]`);
                            if (cb) cb.checked = true;
                        }
                    });
                    atualizarBadgesRow(row);
                });
            });
        });

        await carregarAldeiasModal();
    }

    function fecharModalAldeias() { if (modalAldeias) modalAldeias.style.display = 'none'; }

    function atualizarBadgesRow(row) {
        const badgeDiv = row.querySelector('.twr-badges');
        if (!badgeDiv) return;
        const ativas = [];
        UNIDADES_KEYS.forEach(unidadeKey => {
            const cb = row.querySelector(`[data-unit="${unidadeKey}"]`);
            if (cb?.checked) {
                const unidade = UNIDADES[unidadeKey];
                ativas.push(`<img src="${unidade.icone}" title="${unidade.nome}" style="width:14px;height:14px;vertical-align:middle;">`);
            }
        });
        badgeDiv.innerHTML = ativas.length > 0 ? ativas.join(' ') : '<span style="color:#555;font-size:10px;">—</span>';
    }

    function construirRowAldeia(aldeia) {
        const cfg = configAldeias[aldeia.id] || {};

        const row = document.createElement('div');
        row.dataset.villageId = aldeia.id;
        row.style.cssText = 'background:#0a0a0a;border:1px solid #222;border-radius:8px;padding:10px 14px;margin-bottom:6px;';

        // Info da aldeia
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
        infoDiv.innerHTML = `
            <div style="font-weight:bold;font-size:12px;color:#9b59b6;">${aldeia.nome}</div>
            <div style="font-size:10px;color:#555;">${aldeia.coord}</div>
        `;
        row.appendChild(infoDiv);

        // Checkboxes das unidades com ícones oficiais
        const unidadesDiv = document.createElement('div');
        unidadesDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px;';

        UNIDADES_KEYS.forEach(unidadeKey => {
            const unidade = UNIDADES[unidadeKey];
            const label = document.createElement('label');
            label.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;min-width:40px;`;
            label.title = unidade.nome;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.unit = unidadeKey;
            cb.checked = !!cfg[unidadeKey];
            cb.style.cssText = `width:14px;height:14px;cursor:pointer;accent-color:${unidade.cor}`;
            cb.addEventListener('change', () => atualizarBadgesRow(row));

            const iconImg = document.createElement('img');
            iconImg.src = unidade.icone;
            iconImg.alt = unidade.nome;
            iconImg.title = unidade.nome;
            iconImg.style.cssText = `width:18px;height:18px;vertical-align:middle;`;

            label.appendChild(cb);
            label.appendChild(iconImg);
            unidadesDiv.appendChild(label);
        });
        row.appendChild(unidadesDiv);

        // Badge de resumo
        const badges = document.createElement('div');
        badges.className = 'twr-badges';
        badges.style.cssText = 'text-align:right;border-top:1px solid #222;padding-top:6px;margin-top:4px;';
        row.appendChild(badges);
        atualizarBadgesRow(row);

        return row;
    }

    async function carregarAldeiasModal() {
        const lista = document.getElementById('twr-mal-lista');
        if (!lista) return;
        lista.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;padding:20px 0;">Carregando...</div>';
        try {
            const aldeias = await obterTodasAldeias();
            lista.innerHTML = '';

            // Cabeçalho
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;justify-content:space-between;padding:0 0 8px 0;border-bottom:1px solid #222;margin-bottom:8px;font-size:10px;color:#9b59b6;';
            header.innerHTML = `
                <div>🏠 Aldeia</div>
                <div style="display:flex;gap:12px;">
                    ${UNIDADES_KEYS.map(key => `<div style="width:40px;text-align:center;"><img src="${UNIDADES[key].icone}" title="${UNIDADES[key].nome}" style="width:16px;height:16px;"></div>`).join('')}
                </div>
            `;
            lista.appendChild(header);

            aldeias.forEach(aldeia => lista.appendChild(construirRowAldeia(aldeia)));

        } catch(err) {
            lista.innerHTML = `<div style="color:#e24b4a;font-size:12px;text-align:center;padding:20px 0;">❌ Erro: ${err.message}</div>`;
        }
    }

    function salvarConfigAldeias() {
        const lista = document.getElementById('twr-mal-lista');
        if (!lista) return;
        const nova = {};

        lista.querySelectorAll('[data-village-id]').forEach(row => {
            const villageId = parseInt(row.dataset.villageId);
            const nomeDiv = row.querySelector('div[style*="font-weight"]');
            const nome = nomeDiv ? nomeDiv.textContent.trim() : `Aldeia ${villageId}`;

            const entry = { nome };
            let temAlguma = false;

            UNIDADES_KEYS.forEach(unidadeKey => {
                const cb = row.querySelector(`[data-unit="${unidadeKey}"]`);
                entry[unidadeKey] = cb?.checked || false;
                if (entry[unidadeKey]) temAlguma = true;
            });

            if (temAlguma) nova[villageId] = entry;
        });

        configAldeias = nova;
        salvarEstado();
        atualizarContadorAldeias();
        fecharModalAldeias();
        adicionarLog(`✅ ${Object.keys(configAldeias).length} aldeia(s) configurada(s).`, 'success');
    }

    // ============================================
    // RENDERIZA O DASHBOARD
    // ============================================
    function renderizarDashboard() {
        carregarEstado();

        document.body.innerHTML = '';
        document.body.style.cssText = 'background:#0a0a0a; margin:0; padding:20px; font-family:"Segoe UI",Arial,sans-serif;';

        document.body.innerHTML = `
            <div style="display:flex; gap:20px; max-width:1600px; margin:0 auto; min-height:calc(100vh - 40px);">

                <!-- COLUNA PRINCIPAL (ESQUERDA) -->
                <div style="flex:3;">
                    <h1 style="color:#9b59b6; margin-bottom:20px; border-bottom:1px solid #9b59b6; padding-bottom:10px;">🔬 Auto Research - Dashboard v2.2</h1>

                    <!-- Cards de estatísticas -->
                    <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:20px;">
                        <div style="background:#111; border:1px solid #9b59b633; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#9b59b6;" id="twr-met-total">${totalPesquisado}</div>
                            <div style="font-size:10px; color:#9b59b688;">Pesquisadas</div>
                        </div>
                        <div style="background:#111; border:1px solid #9b59b633; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#9b59b6;" id="twr-met-ciclos">${cicloAtual}</div>
                            <div style="font-size:10px; color:#9b59b688;">Ciclos</div>
                        </div>
                        <div style="background:#111; border:1px solid #9b59b633; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#9b59b6;" id="twr-aldeias-config-count">${Object.keys(configAldeias).length}</div>
                            <div style="font-size:10px; color:#9b59b688;">Aldeias config.</div>
                        </div>
                        <div style="background:#111; border:1px solid #9b59b633; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#9b59b6;" id="twr-unidades-count">0</div>
                            <div style="font-size:10px; color:#9b59b688;">Unidades ativas</div>
                        </div>
                        <div style="background:#111; border:1px solid #9b59b633; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:20px; font-weight:bold; color:#9b59b6;" id="twr-countdown-card">-</div>
                            <div style="font-size:10px; color:#9b59b688;">Próximo ciclo</div>
                        </div>
                    </div>

                    <!-- Status -->
                    <div style="background:#111; border:1px solid #9b59b633; border-radius:10px; padding:12px; margin-bottom:20px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div id="twr-dot" style="width:10px;height:10px;border-radius:50%;background:#6c3483;"></div>
                            <span id="twr-status" style="font-weight:bold; font-size:13px; color:#9b59b6;">Parado</span>
                        </div>
                    </div>

                    <!-- Configurações -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px;">
                        <div style="background:#111; border:1px solid #333; border-radius:10px; padding:12px;">
                            <div style="color:#9b59b6; font-weight:bold; margin-bottom:8px; font-size:12px;">⚙ Aldeias</div>
                            <div id="twr-aldeias-config" style="font-size:11px; margin-bottom:8px; color:${Object.keys(configAldeias).length === 0 ? '#9b59b6' : '#7d3c98'}">
                                ${Object.keys(configAldeias).length === 0 ? 'Nenhuma aldeia configurada' : `${Object.keys(configAldeias).length} aldeia(s) configurada(s)`}
                            </div>
                            <button id="twr-btn-aldeias" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #9b59b6; color:#9b59b6; border-radius:6px; cursor:pointer; font-size:11px; font-weight:bold;">📋 Configurar Aldeias</button>
                        </div>

                        <div style="background:#111; border:1px solid #333; border-radius:10px; padding:12px;">
                            <div style="color:#9b59b6; font-weight:bold; margin-bottom:8px; font-size:12px;">🔬 Unidades</div>
                            <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:10px;">
                                ${UNIDADES_KEYS.map(key => `<span style="color:${UNIDADES[key].cor};" title="${UNIDADES[key].nome}"><img src="${UNIDADES[key].icone}" style="width:16px;height:16px;vertical-align:middle;"> ${UNIDADES[key].nome.substring(0,8)}</span>`).join(' ')}
                            </div>
                            <div style="font-size:10px; color:#555; margin-top:6px;">Selecione por aldeia quais unidades pesquisar</div>
                        </div>
                    </div>

                    <!-- Intervalos -->
                    <div style="background:#111; border:1px solid #333; border-radius:10px; padding:12px; margin-bottom:20px;">
                        <div style="color:#9b59b6; font-weight:bold; margin-bottom:8px; font-size:12px;">⏱️ Intervalos</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">Entre aldeias (ms)</label>
                                <input type="number" id="twr-pausa-aldeias" value="${PAUSA_ENTRE_ALDEIAS}" min="500" max="30000" step="100" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#e0e0e0; border-radius:6px; font-size:11px;">
                                <span id="twr-err-aldeias" style="display:none; font-size:9px; color:#e24b4a;">Mín. 500 ms</span>
                            </div>
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">Entre ciclos (s)</label>
                                <input type="number" id="twr-pausa-ciclos" value="${PAUSA_ENTRE_CICLOS / 1000}" min="10" max="3600" step="1" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#e0e0e0; border-radius:6px; font-size:11px;">
                                <span id="twr-err-ciclos" style="display:none; font-size:9px; color:#e24b4a;">Mín. 10 s</span>
                            </div>
                        </div>
                    </div>

                    <!-- Botões de ação -->
                    <div style="display:flex; gap:10px; margin-bottom:20px;">
                        <button id="twr-botao" style="flex:1; padding:10px; background:#9b59b6; border:none; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer; color:#fff;">▶ Pesquisar</button>
                        <button id="twr-reset" style="padding:10px 15px; background:#0a0a0a; border:1px solid #e24b4a; color:#e24b4a; border-radius:8px; cursor:pointer; font-weight:bold; font-size:12px;">↺ Reiniciar</button>
                    </div>
                </div>

                <!-- COLUNA DO LOG (DIREITA) -->
                <div style="flex:1; background:#0a0a0a; border-left:1px solid #9b59b633; padding-left:20px;">
                    <h3 style="color:#9b59b6; font-size:14px; margin-bottom:15px;">📝 Log de Atividades</h3>
                    <div id="twr-log" style="height:calc(100vh - 100px); overflow-y:auto; display:flex; flex-direction:column;">
                        <div data-placeholder="true" style="color:#888; padding:8px 0;">🔬 Dashboard Auto Research v2.2 iniciado</div>
                    </div>
                </div>

            </div>
        `;

        // Configurar eventos
        document.getElementById('twr-btn-aldeias').onclick = abrirModalAldeias;
        document.getElementById('twr-botao').onclick = toggle;
        document.getElementById('twr-reset').onclick = () => { if (confirm('Reiniciar tudo? Isso vai parar a pesquisa, zerar contadores e apagar as configurações.')) resetarTudo(); };

        const inpAldeias = document.getElementById('twr-pausa-aldeias');
        const inpCiclos = document.getElementById('twr-pausa-ciclos');

        // Persistência imediata ao alterar inputs
        inpAldeias.addEventListener('input', () => {
            const v = parseInt(inpAldeias.value);
            if (!isNaN(v) && v >= 500) {
                PAUSA_ENTRE_ALDEIAS = v;
                salvarEstado();
                document.getElementById('twr-err-aldeias').style.display = 'none';
                inpAldeias.style.borderColor = '#444';
            } else {
                document.getElementById('twr-err-aldeias').style.display = 'block';
                inpAldeias.style.borderColor = '#e24b4a';
            }
        });

        inpCiclos.addEventListener('input', () => {
            const v = parseInt(inpCiclos.value);
            if (!isNaN(v) && v >= 10) {
                PAUSA_ENTRE_CICLOS = v * 1000;
                salvarEstado();
                document.getElementById('twr-err-ciclos').style.display = 'none';
                inpCiclos.style.borderColor = '#444';
            } else {
                document.getElementById('twr-err-ciclos').style.display = 'block';
                inpCiclos.style.borderColor = '#e24b4a';
            }
        });

        // Mensagens iniciais do log
        const logContainer = document.getElementById('twr-log');
        if (logContainer) {
            logContainer.innerHTML = '';
            adicionarLog('🔬 Dashboard Auto Research v2.2 iniciado', 'system');
            adicionarLog('💡 Configure as aldeias e unidades, depois clique em "Pesquisar"', 'system');
            adicionarLog('🎯 Agora com ícones oficiais do Tribal Wars!', 'system');
            adicionarLog('🟢 Log com indicadores visuais e ordem inversa!', 'system');
        }

        // Se estava ativado, reinicia
        if (ATIVADO && !rodando) {
            iniciar();
        }
    }

})();