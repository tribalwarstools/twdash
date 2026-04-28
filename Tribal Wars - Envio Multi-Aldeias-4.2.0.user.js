// ==UserScript==
// @name         Tribal Wars - Envio Multi-Aldeias
// @namespace    https://github.com/tribalwarstools
// @version      5.0.0
// @description  Envio de recursos para suas aldeias e aldeias de outros jogadores via village.txt/player.txt
// @author       DeepSeek
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

    const DASHBOARD_PARAM = 'twMultiSend=true';
    const STORAGE_KEY     = 'TW_MULTI_SEND_CONFIG_V5';
    const MAX_POR_MERCADOR = 1000;
    const FETCH_TIMEOUT_MS = 15000;

    // ==================== CONFIG ====================
    const CONFIG = {
        DELAY_ENTRE_ENVIOS: 800,
        PERCENTUAL_ARMAZEM_DESTINO: 80,
        PRIORIDADE_RECURSOS: ['madeira', 'argila', 'ferro'],
        ARMAZEM_PADRAO_EXTERNO: 30000   // usado quando armazém do destino externo é desconhecido
    };

    function saveConfig() {
        GM_setValue(STORAGE_KEY, JSON.stringify(CONFIG));
    }

    try {
        const saved = GM_getValue(STORAGE_KEY);
        if (saved) Object.assign(CONFIG, JSON.parse(saved));
    } catch(e) {
        console.warn('[TW Multi-Aldeias] Config inválida, usando padrões.', e);
    }

    // ==================== CORES ====================
    const CORES = {
        fundo: '#080c10', fundoCard: '#0d1117',
        verde: '#00d97e', texto: '#c9d1d9', textoDim: '#8b949e',
        borda: '#21262d', erro: '#f85149', aviso: '#d29922',
        info: '#388bfd', madeira: '#d4a72c', argila: '#7e8c8d', ferro: '#8b9dc3'
    };

    // ==================== UTILITÁRIOS ====================
    function isPremium() {
        if (typeof premium !== 'undefined' && premium === true) return true;
        if (window.game_data?.features?.Premium?.active === true) return true;
        if (document.body?.classList?.contains('has-pa')) return true;
        return false;
    }

    function getWorldUrl() {
        // Extrai base da URL do mundo atual ex: https://br95.tribalwars.com.br
        return window.location.origin;
    }

    async function fetchComTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            return response;
        } finally {
            clearTimeout(timer);
        }
    }

    // ==================== MAPA PÚBLICO (village.txt / player.txt) ====================
    // Cache em memória durante a sessão
    let _mapaAldeias = null;   // Map: coord -> { id, nome, x, y, playerId, pontos }
    let _mapaJogadores = null; // Map: playerId -> nomeJogador

    async function carregarMapaPublico(ui) {
        if (_mapaAldeias) return true; // já carregado

        try {
            if (ui) ui.log('🌐 Carregando mapa público (village.txt)...', 'info');

            const base = getWorldUrl();
            // village.txt: id,nome,x,y,player_id,pontos,rank
            const [resVillage, resPlayer] = await Promise.all([
                fetchComTimeout(base + '/map/village.txt'),
                fetchComTimeout(base + '/map/player.txt')
            ]);

            const txtVillage = await resVillage.text();
            const txtPlayer  = await resPlayer.text();

            // Montar mapa de jogadores: id -> nome
            _mapaJogadores = new Map();
            for (const linha of txtPlayer.split('\n')) {
                const p = linha.trim().split(',');
                if (p.length >= 2) {
                    _mapaJogadores.set(p[0], decodeURIComponent(p[1].replace(/\+/g, ' ')));
                }
            }

            // Montar mapa de aldeias: "x|y" -> objeto
            _mapaAldeias = new Map();
            for (const linha of txtVillage.split('\n')) {
                const v = linha.trim().split(',');
                if (v.length >= 6) {
                    const x = parseInt(v[2]);
                    const y = parseInt(v[3]);
                    const coord = x + '|' + y;
                    _mapaAldeias.set(coord, {
                        id:       parseInt(v[0]),
                        nome:     decodeURIComponent(v[1].replace(/\+/g, ' ')),
                        x, y,
                        playerId: v[4],
                        pontos:   parseInt(v[5]) || 0,
                        jogador:  _mapaJogadores.get(v[4]) || '—'
                    });
                }
            }

            if (ui) ui.log('✅ Mapa carregado: ' + _mapaAldeias.size + ' aldeias', 'success');
            return true;

        } catch(err) {
            const msg = err.name === 'AbortError' ? 'Timeout ao carregar mapa' : err.message;
            if (ui) ui.log('❌ Falha ao carregar mapa: ' + msg, 'error');
            return false;
        }
    }

    // Busca uma aldeia no mapa público pelo coord
    function buscarAldeiaNoMapa(coord) {
        if (!_mapaAldeias) return null;
        return _mapaAldeias.get(coord) || null;
    }

    // ==================== EXTRAIR MINHAS ALDEIAS ====================
    async function extrairMinhasAldeias(ui) {
        if (ui) ui.log('📡 Buscando suas aldeias...', 'info');

        const premiumAtivo = isPremium();
        const url = '/game.php?screen=overview_villages&mode=prod&group=0&page=-1';

        try {
            const response = await fetchComTimeout(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const tabela = doc.getElementById('production_table');
            if (!tabela) throw new Error('Tabela de produção não encontrada');

            const linhas = Array.from(tabela.querySelectorAll('tr')).filter(tr =>
                tr.querySelector('a[href*="screen=overview"]') && !tr.querySelector('th')
            );

            const offset = premiumAtivo ? 1 : 0;
            const aldeias = [];

            for (const linha of linhas) {
                const linkVila = linha.querySelector('a[href*="screen=overview"]');
                if (!linkVila) continue;

                const celulas = linha.cells;
                const textoAldeia = (celulas[offset]?.textContent || '').trim();
                const coordsMatch = textoAldeia.match(/(\d+)\|(\d+)/);
                const x = coordsMatch ? parseInt(coordsMatch[1]) : 0;
                const y = coordsMatch ? parseInt(coordsMatch[2]) : 0;
                const coord = x + '|' + y;
                const nome = textoAldeia.split('(')[0].trim();
                const pontos = parseInt((celulas[offset + 1]?.textContent || '0').replace(/\./g, ''));

                const resTexto = (celulas[offset + 2]?.textContent || '').replace(/\./g, '');
                const resNums = resTexto.match(/\d+/g) || [0, 0, 0];
                const madeira = parseInt(resNums[0] || 0);
                const argila  = parseInt(resNums[1] || 0);
                const ferro   = parseInt(resNums[2] || 0);
                const armazem = parseInt((celulas[offset + 3]?.textContent || '0').replace(/\./g, ''));

                let comerciantesDisp = 0, comerciantesTotal = 0;
                if (premiumAtivo && celulas[offset + 4]) {
                    const comerMatch = (celulas[offset + 4].textContent || '').trim().match(/(\d+)\/(\d+)/);
                    if (comerMatch) {
                        comerciantesDisp = parseInt(comerMatch[1]);
                        comerciantesTotal = parseInt(comerMatch[2]);
                    }
                }

                const idMatch = linkVila.href.match(/village=(\d+)/);
                const id = idMatch ? parseInt(idMatch[1]) : 0;

                if (id > 0) {
                    aldeias.push({
                        id, nome, coord, x, y, pontos,
                        madeira, argila, ferro, armazem,
                        comerciantesDisp, comerciantesTotal,
                        proprio: true
                    });
                }
            }

            // Não-premium: buscar comerciantes individualmente
            if (!premiumAtivo && aldeias.length > 0) {
                if (ui) ui.log('🐌 Buscando comerciantes (sem premium)...', 'info');
                for (const aldeia of aldeias) {
                    const c = await buscarComerciantesPorAldeia(aldeia.id);
                    aldeia.comerciantesDisp  = c.disp;
                    aldeia.comerciantesTotal = c.total;
                    await new Promise(r => setTimeout(r, 60));
                }
            }

            if (ui) ui.log('✅ ' + aldeias.length + ' aldeias suas carregadas', 'success');
            return aldeias;

        } catch(err) {
            const msg = err.name === 'AbortError' ? 'Timeout' : err.message;
            if (ui) ui.log('❌ Erro ao carregar aldeias: ' + msg, 'error');
            return [];
        }
    }

    async function buscarComerciantesPorAldeia(villageId) {
        try {
            const url = '/game.php?village=' + villageId + '&screen=market';
            const response = await fetchComTimeout(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const availableSpan = doc.getElementById('market_merchant_available_count');
            const totalSpan     = doc.getElementById('market_merchant_total_count');

            if (availableSpan && totalSpan) {
                return {
                    disp:  parseInt((availableSpan.textContent || '').trim()) || 0,
                    total: parseInt((totalSpan.textContent || '').trim()) || 0
                };
            }
            return { disp: 0, total: 0 };
        } catch(err) {
            return { disp: 0, total: 0 };
        }
    }

    // ==================== RESOLVER DESTINO ====================
    // Resolve um coord para { id, nome, jogador, proprio, armazem, ... }
    // Usa mapa público para qualquer aldeia; busca armazém só das próprias.
    function resolverDestino(coord, minhasAldeias, armazemManual) {
        // 1. Verificar se é uma aldeia própria
        const propria = minhasAldeias.find(a => a.coord === coord);
        if (propria) {
            return {
                coord,
                id:       propria.id,
                nome:     propria.nome,
                jogador:  'Você',
                proprio:  true,
                armazem:  propria.armazem,
                madeira:  propria.madeira,
                argila:   propria.argila,
                ferro:    propria.ferro,
                encontrado: true
            };
        }

        // 2. Buscar no mapa público
        const mapInfo = buscarAldeiaNoMapa(coord);
        if (!mapInfo) {
            return { coord, encontrado: false, motivo: 'Coordenada não encontrada no mapa' };
        }

        // Armazém: usa manual se informado, senão usa padrão configurado
        const armazem = (armazemManual && armazemManual > 0)
            ? armazemManual
            : CONFIG.ARMAZEM_PADRAO_EXTERNO;

        return {
            coord,
            id:        mapInfo.id,
            nome:      mapInfo.nome,
            jogador:   mapInfo.jogador,
            proprio:   false,
            armazem,
            armazemEstimado: !(armazemManual && armazemManual > 0),
            madeira:   0,
            argila:    0,
            ferro:     0,
            encontrado: true
        };
    }

    // ==================== CALCULAR DISTRIBUIÇÃO ====================
    function calcularDistribuicao(origensSelecionadas, destinos, ui) {
        let origensViaveis = origensSelecionadas.filter(o =>
            (o.madeira > 0 || o.argila > 0 || o.ferro > 0) && o.comerciantesDisp > 0
        );

        if (origensViaveis.length === 0) {
            ui.log('❌ Nenhuma origem com recursos e mercadores disponíveis', 'error');
            return [];
        }

        origensViaveis = origensViaveis.map(o => ({ ...o }));
        const envios = [];
        const perc   = CONFIG.PERCENTUAL_ARMAZEM_DESTINO / 100;

        for (const destino of destinos) {
            if (!destino.encontrado) {
                ui.log('⚠️ Destino ' + destino.coord + ' não encontrado: ' + (destino.motivo || ''), 'warning');
                continue;
            }

            const meta = Math.floor(destino.armazem * perc);
            let necMadeira = Math.max(0, meta - destino.madeira);
            let necArgila  = Math.max(0, meta - destino.argila);
            let necFerro   = Math.max(0, meta - destino.ferro);

            if (necMadeira + necArgila + necFerro === 0) {
                ui.log('ℹ️ ' + destino.coord + ' já está no alvo', 'info');
                continue;
            }

            // Avisar sobre armazém estimado
            if (destino.armazemEstimado) {
                ui.log('⚠️ ' + destino.coord + ' (' + destino.jogador + '): armazém estimado em ' + destino.armazem.toLocaleString() + '. Informe o real para precisão.', 'warning');
            }

            // Checar se há algum recurso acima de 1 mercador
            const necArred =
                Math.floor(necMadeira / MAX_POR_MERCADOR) * MAX_POR_MERCADOR +
                Math.floor(necArgila  / MAX_POR_MERCADOR) * MAX_POR_MERCADOR +
                Math.floor(necFerro   / MAX_POR_MERCADOR) * MAX_POR_MERCADOR;
            if (necArred === 0) {
                ui.log('ℹ️ ' + destino.coord + ': necessidade < 1 mercador — ignorado', 'info');
                continue;
            }

            ui.log('📦 ' + destino.coord + ' (' + destino.jogador + '): 🌲+' + necMadeira.toLocaleString() + ' 🧱+' + necArgila.toLocaleString() + ' ⚙️+' + necFerro.toLocaleString(), 'info');

            for (const origem of origensViaveis) {
                if (necMadeira <= 0 && necArgila <= 0 && necFerro <= 0) break;
                if (origem.comerciantesDisp <= 0) continue;
                // Não enviar de origem para ela mesma
                if (origem.coord === destino.coord) continue;

                let mercadoresUsados = 0;
                const nec      = { madeira: necMadeira, argila: necArgila, ferro: necFerro };
                const estoque  = { madeira: origem.madeira, argila: origem.argila, ferro: origem.ferro };
                const enviados = { madeira: 0, argila: 0, ferro: 0 };

                for (const recurso of CONFIG.PRIORIDADE_RECURSOS) {
                    if (mercadoresUsados >= origem.comerciantesDisp) break;
                    if (nec[recurso] <= 0 || estoque[recurso] <= 0) continue;

                    let qtd = Math.min(nec[recurso], estoque[recurso]);
                    qtd = Math.floor(qtd / MAX_POR_MERCADOR) * MAX_POR_MERCADOR;
                    let mercs = qtd / MAX_POR_MERCADOR;
                    const mercsLivres = origem.comerciantesDisp - mercadoresUsados;

                    if (mercs > mercsLivres) {
                        mercs = mercsLivres;
                        qtd   = mercs * MAX_POR_MERCADOR;
                    }

                    if (qtd > 0) {
                        enviados[recurso]  = qtd;
                        mercadoresUsados  += mercs;
                        nec[recurso]      -= qtd;
                        estoque[recurso]  -= qtd;
                    }
                }

                // Propagar de volta
                necMadeira    = nec.madeira;
                necArgila     = nec.argila;
                necFerro      = nec.ferro;
                origem.madeira = estoque.madeira;
                origem.argila  = estoque.argila;
                origem.ferro   = estoque.ferro;
                origem.comerciantesDisp -= mercadoresUsados;

                if (enviados.madeira > 0 || enviados.argila > 0 || enviados.ferro > 0) {
                    envios.push({
                        origemId:    origem.id,
                        origemNome:  origem.nome,
                        origemCoord: origem.coord,
                        destinoId:   destino.id,
                        destinoNome: destino.nome,
                        destinoCoord: destino.coord,
                        destinoJogador: destino.jogador,
                        destinoProprio: destino.proprio,
                        madeira:  enviados.madeira,
                        argila:   enviados.argila,
                        ferro:    enviados.ferro,
                        total:    enviados.madeira + enviados.argila + enviados.ferro,
                        mercadores: mercadoresUsados
                    });
                }
            }
        }

        return envios;
    }

    // ==================== ENVIAR RECURSOS ====================
    function enviarRecursos(sourceID, targetID, wood, stone, iron, ui, tentativa = 1) {
        return new Promise((resolve) => {
            if (wood + stone + iron === 0) { resolve(false); return; }

            if (typeof TribalWars === 'undefined' || !TribalWars.post) {
                ui.log('⚠️ API TribalWars não disponível', 'warning');
                resolve(false);
                return;
            }

            TribalWars.post('market', {
                ajaxaction: 'map_send',
                village: sourceID
            }, {
                target_id: targetID,
                wood: wood, stone: stone, iron: iron
            }, function(response) {
                if (response?.error) {
                    ui.log('❌ ' + response.error, 'error');
                    resolve(false);
                } else {
                    ui.log('✅ Enviado: 🌲' + wood.toLocaleString() + ' 🧱' + stone.toLocaleString() + ' ⚙️' + iron.toLocaleString(), 'success');
                    resolve(true);
                }
            }, function(error) {
                if (tentativa < 2) {
                    ui.log('⚠️ Falha temporária, tentando novamente...', 'warning');
                    setTimeout(() => {
                        enviarRecursos(sourceID, targetID, wood, stone, iron, ui, tentativa + 1).then(resolve);
                    }, 1500);
                } else {
                    ui.log('❌ Erro após ' + tentativa + ' tentativas: ' + error, 'error');
                    resolve(false);
                }
            });
        });
    }

    // ==================== DASHBOARD ====================
    function renderizarDashboard() {
        document.body.innerHTML = '';
        document.body.style.cssText = 'background:' + CORES.fundo + ';margin:0;padding:0;overflow:auto;height:100vh;font-family:monospace;';

        const ui = TWUI.create('twb');
        ui.injectStyles();
        ui.renderApp();

        ui.header('📤 Envio Multi-Aldeias v5.0',
            'Suporta aldeias próprias, aliadas e inimigas via mapa público',
            '<button id="twb-close-btn" style="background:' + CORES.erro + '22;border:1px solid ' + CORES.erro + '44;color:' + CORES.erro + ';padding:4px 10px;border-radius:4px;cursor:pointer;">✕ Fechar</button>'
        );

        ui.progressBar();

        ui.mainLayout(`
            <div style="display:flex;gap:20px;padding:0 0 20px 0;flex-wrap:wrap;">

                <!-- ORIGENS -->
                <div style="flex:2;min-width:400px;">
                    <div style="background:${CORES.fundoCard};border-radius:12px;border:1px solid ${CORES.borda};overflow:hidden;">
                        <div style="padding:12px 16px;background:${CORES.fundo};border-bottom:1px solid ${CORES.borda};">
                            <h3 style="margin:0;color:${CORES.verde};">✅ Aldeias de Origem (suas)</h3>
                        </div>
                        <div style="padding:12px;">
                            <button id="twb-btn-load" class="twb-btn twb-btn-primary" style="margin-bottom:12px;">📡 CARREGAR ALDEIAS</button>
                            <div id="twb-origens-list" style="max-height:450px;overflow-y:auto;scrollbar-width:thin;">
                                <div style="color:${CORES.textoDim};text-align:center;padding:20px;">Clique em "CARREGAR ALDEIAS"</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- DESTINOS + CONFIG -->
                <div style="flex:1;min-width:350px;display:flex;flex-direction:column;gap:20px;">

                    <!-- DESTINOS -->
                    <div style="background:${CORES.fundoCard};border-radius:12px;border:1px solid ${CORES.borda};overflow:hidden;">
                        <div style="padding:12px 16px;background:${CORES.fundo};border-bottom:1px solid ${CORES.borda};">
                            <h3 style="margin:0;color:${CORES.verde};">🎯 Destinos</h3>
                        </div>
                        <div style="padding:12px;">
                            <label style="color:${CORES.textoDim};font-size:11px;">Coordenadas (uma por linha) — qualquer aldeia do mapa</label>
                            <textarea id="twb-destinos-text" rows="6" style="width:100%;box-sizing:border-box;background:${CORES.fundo};border:1px solid ${CORES.borda};color:${CORES.texto};border-radius:6px;padding:8px;font-family:monospace;font-size:12px;resize:vertical;margin-top:4px;" placeholder="123|456&#10;789|012&#10;555|777"></textarea>

                            <div style="margin-top:10px;">
                                <label style="color:${CORES.textoDim};font-size:11px;">📦 Armazém dos destinos externos (opcional)</label>
                                <div style="font-size:10px;color:${CORES.textoDim};margin-bottom:4px;">Se não informar, usa o padrão configurado em ⚙️</div>
                                <input type="number" id="twb-armazem-manual" step="1000" min="0"
                                    placeholder="Ex: 30000"
                                    style="width:100%;box-sizing:border-box;background:${CORES.fundo};border:1px solid ${CORES.borda};color:${CORES.texto};border-radius:6px;padding:8px;font-family:monospace;font-size:12px;">
                            </div>

                            <button id="twb-consultar" class="twb-btn twb-btn-secondary" style="margin-top:12px;width:100%;">🔍 CONSULTAR DESTINOS</button>
                            <div id="twb-destinos-info" style="margin-top:12px;font-size:11px;max-height:250px;overflow-y:auto;scrollbar-width:thin;"></div>
                        </div>
                    </div>

                    <!-- CONFIG -->
                    <div style="background:${CORES.fundoCard};border-radius:12px;border:1px solid ${CORES.borda};overflow:hidden;">
                        <div style="padding:12px 16px;background:${CORES.fundo};border-bottom:1px solid ${CORES.borda};">
                            <h3 style="margin:0;color:${CORES.verde};">⚙️ Configurações</h3>
                        </div>
                        <div style="padding:12px;display:flex;flex-direction:column;gap:10px;">

                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                                <span>📦 % armazém destino:</span>
                                <input type="number" id="twb-percentual" value="${CONFIG.PERCENTUAL_ARMAZEM_DESTINO}" min="10" max="100" step="5"
                                    style="width:60px;background:${CORES.fundo};border:1px solid ${CORES.borda};color:${CORES.texto};border-radius:4px;padding:4px;text-align:center;">
                                <span>%</span>
                            </label>

                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                                <span>⏱️ Delay entre envios:</span>
                                <input type="number" id="twb-delay" value="${CONFIG.DELAY_ENTRE_ENVIOS}" min="200" max="5000" step="100"
                                    style="width:80px;background:${CORES.fundo};border:1px solid ${CORES.borda};color:${CORES.texto};border-radius:4px;padding:4px;text-align:center;">
                                <span>ms</span>
                            </label>

                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                                <span>🏠 Armazém padrão externo:</span>
                                <input type="number" id="twb-armazem-padrao" value="${CONFIG.ARMAZEM_PADRAO_EXTERNO}" min="1000" max="400000" step="1000"
                                    style="width:90px;background:${CORES.fundo};border:1px solid ${CORES.borda};color:${CORES.texto};border-radius:4px;padding:4px;text-align:center;">
                            </label>

                            <div>
                                <div style="font-size:11px;color:${CORES.textoDim};margin-bottom:6px;">🎯 Prioridade de recursos (arraste):</div>
                                <div id="twb-prioridade-list" style="display:flex;flex-direction:column;gap:4px;">
                                    ${(function() {
                                        const INFO = {
                                            madeira: { icon: '🌲', label: 'Madeira', cor: CORES.madeira },
                                            argila:  { icon: '🧱', label: 'Argila',  cor: CORES.argila  },
                                            ferro:   { icon: '⚙️', label: 'Ferro',   cor: CORES.ferro   }
                                        };
                                        return CONFIG.PRIORIDADE_RECURSOS.map(function(r, i) {
                                            var inf = INFO[r];
                                            return '<div draggable="true" data-recurso="' + r + '" style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:' + CORES.fundo + ';border:1px solid ' + CORES.borda + ';border-radius:5px;cursor:grab;font-size:11px;">'
                                                + '<span style="color:' + CORES.textoDim + ';font-size:10px;">' + (i + 1) + 'º</span>'
                                                + '<span>' + inf.icon + ' <span style="color:' + inf.cor + ';">' + inf.label + '</span></span>'
                                                + '<span style="margin-left:auto;color:' + CORES.textoDim + ';font-size:10px;">☰</span>'
                                                + '</div>';
                                        }).join('');
                                    }())}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RESULTADO -->
            <div style="background:${CORES.fundoCard};border-radius:12px;border:1px solid ${CORES.borda};overflow:hidden;margin-top:4px;">
                <div style="padding:12px 16px;background:${CORES.fundo};border-bottom:1px solid ${CORES.borda};">
                    <h3 style="margin:0;color:${CORES.verde};">📊 Resultado dos Envios</h3>
                </div>
                <div style="padding:12px;">
                    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
                        <button id="twb-calcular" class="twb-btn twb-btn-warning" disabled>📊 CALCULAR ENVIOS</button>
                        <button id="twb-executar" class="twb-btn twb-btn-danger"  disabled>🚀 EXECUTAR ENVIOS</button>
                    </div>
                    <div id="twb-resultado" style="background:${CORES.fundo};border-radius:8px;padding:12px;font-size:12px;max-height:300px;overflow-y:auto;font-family:monospace;"></div>
                </div>
            </div>
        `, '📝 Log de Atividades');

        // Estado local
        let minhasAldeias       = [];
        let destinosResolvidos  = [];
        let enviosCalculados    = [];

        // ---- CARREGAR ALDEIAS ----
        document.getElementById('twb-btn-load').addEventListener('click', async () => {
            ui.btnLoading('twb-btn-load', '⏳ CARREGANDO...');

            // Carregar mapa público e minhas aldeias em paralelo
            const [_, aldeias] = await Promise.all([
                carregarMapaPublico(ui),
                extrairMinhasAldeias(ui)
            ]);
            minhasAldeias = aldeias;

            if (minhasAldeias.length > 0) {
                const listDiv = document.getElementById('twb-origens-list');
                listDiv.innerHTML =
                    '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer;">'
                    + '<input type="checkbox" id="twb-select-all" checked>'
                    + '<strong>Selecionar Todas (' + minhasAldeias.length + ' aldeias)</strong>'
                    + '</label>'
                    + minhasAldeias.map(function(a) {
                        return '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px;border-bottom:1px solid ' + CORES.borda + '44;cursor:pointer;">'
                            + '<input type="checkbox" class="twb-origem" value="' + a.id + '" data-coord="' + a.coord + '" checked>'
                            + '<div style="flex:1;">'
                            + '<div><strong>' + a.nome + '</strong> <span style="color:' + CORES.textoDim + ';">(' + a.coord + ')</span>'
                            + ' <span style="color:' + CORES.info + ';margin-left:8px;">🚚' + a.comerciantesDisp + '</span></div>'
                            + '<div style="font-size:10px;margin-top:4px;">🌲 ' + a.madeira.toLocaleString() + ' 🧱 ' + a.argila.toLocaleString() + ' ⚙️ ' + a.ferro.toLocaleString() + ' <span style="color:' + CORES.textoDim + ';margin-left:8px;">📦 ' + a.armazem.toLocaleString() + '</span></div>'
                            + '</div></label>';
                    }).join('');

                document.getElementById('twb-select-all').addEventListener('change', function(e) {
                    document.querySelectorAll('.twb-origem').forEach(function(cb) { cb.checked = e.target.checked; });
                });
            }

            ui.btnRestore('twb-btn-load', '📡 CARREGAR ALDEIAS');
        });

        // ---- CONSULTAR DESTINOS ----
        document.getElementById('twb-consultar').addEventListener('click', async () => {
            if (minhasAldeias.length === 0) {
                ui.log('⚠️ Carregue suas aldeias primeiro', 'warning');
                return;
            }

            // Garantir mapa carregado
            const mapaOk = await carregarMapaPublico(ui);
            if (!mapaOk) {
                ui.log('❌ Não foi possível carregar o mapa público', 'error');
                return;
            }

            const texto = document.getElementById('twb-destinos-text').value;
            const coords = texto.split(/[\s\n,;]+/).map(function(c) { return c.trim(); }).filter(function(c) { return /^\d+\|\d+$/.test(c); });

            if (coords.length === 0) {
                ui.log('⚠️ Informe pelo menos uma coordenada no formato 123|456', 'warning');
                return;
            }

            const armazemManual = parseInt(document.getElementById('twb-armazem-manual').value) || 0;

            ui.btnLoading('twb-consultar', '⏳ CONSULTANDO...');
            ui.log('🔍 Resolvendo ' + coords.length + ' destino(s)...', 'info');

            destinosResolvidos = coords.map(function(coord) {
                return resolverDestino(coord, minhasAldeias, armazemManual);
            });

            // Renderizar resultado
            const infoDiv = document.getElementById('twb-destinos-info');
            const perc    = CONFIG.PERCENTUAL_ARMAZEM_DESTINO;
            infoDiv.innerHTML = destinosResolvidos.map(function(d) {
                if (!d.encontrado) {
                    return '<div style="padding:6px;color:' + CORES.erro + ';">❌ ' + d.coord + ' — ' + (d.motivo || 'não encontrado') + '</div>';
                }
                const meta   = Math.floor(d.armazem * perc / 100);
                const tag    = d.proprio ? '🏠 sua' : '👤 ' + d.jogador;
                const aviso  = d.armazemEstimado ? ' <span style="color:' + CORES.aviso + ';">(armazém estimado)</span>' : '';
                return '<div style="padding:8px;border-bottom:1px solid ' + CORES.borda + '44;">'
                    + '<strong style="color:' + CORES.verde + ';">✅ ' + d.coord + '</strong>'
                    + ' <span style="color:' + CORES.textoDim + ';">' + tag + '</span>'
                    + ' <span style="color:' + CORES.textoDim + ';">' + d.nome + '</span>'
                    + aviso + '<br>'
                    + '📦 ' + d.armazem.toLocaleString() + ' → alvo ' + perc + '% = ' + meta.toLocaleString() + ' cada<br>'
                    + (d.proprio
                        ? '🌲 ' + d.madeira.toLocaleString() + ' 🧱 ' + d.argila.toLocaleString() + ' ⚙️ ' + d.ferro.toLocaleString()
                        : '<span style="color:' + CORES.textoDim + ';">recursos atuais desconhecidos — enviará até o armazém</span>')
                    + '</div>';
            }).join('');

            const validos = destinosResolvidos.filter(function(d) { return d.encontrado; });
            if (validos.length > 0) {
                document.getElementById('twb-calcular').disabled = false;
                ui.log('✅ ' + validos.length + ' de ' + coords.length + ' destinos resolvidos', 'success');
            } else {
                ui.log('❌ Nenhum destino válido encontrado', 'error');
            }

            ui.btnRestore('twb-consultar', '🔍 CONSULTAR DESTINOS');
        });

        // ---- CONFIGS ----
        document.getElementById('twb-percentual').addEventListener('change', function(e) {
            CONFIG.PERCENTUAL_ARMAZEM_DESTINO = Math.max(10, Math.min(100, parseInt(e.target.value) || 80));
            e.target.value = CONFIG.PERCENTUAL_ARMAZEM_DESTINO;
            saveConfig();
        });

        document.getElementById('twb-delay').addEventListener('change', function(e) {
            CONFIG.DELAY_ENTRE_ENVIOS = Math.max(200, Math.min(5000, parseInt(e.target.value) || 800));
            e.target.value = CONFIG.DELAY_ENTRE_ENVIOS;
            saveConfig();
        });

        document.getElementById('twb-armazem-padrao').addEventListener('change', function(e) {
            CONFIG.ARMAZEM_PADRAO_EXTERNO = Math.max(1000, parseInt(e.target.value) || 30000);
            e.target.value = CONFIG.ARMAZEM_PADRAO_EXTERNO;
            saveConfig();
        });

        // ---- DRAG-AND-DROP PRIORIDADE ----
        (function() {
            const list = document.getElementById('twb-prioridade-list');
            if (!list) return;
            let dragging = null;

            list.addEventListener('dragstart', function(e) {
                dragging = e.target.closest('[draggable]');
                if (dragging) dragging.style.opacity = '0.4';
            });
            list.addEventListener('dragend', function() {
                if (dragging) dragging.style.opacity = '1';
                dragging = null;
                const itens = list.querySelectorAll('[data-recurso]');
                CONFIG.PRIORIDADE_RECURSOS = Array.from(itens).map(function(el) { return el.dataset.recurso; });
                itens.forEach(function(el, i) {
                    const num = el.querySelector('span:first-child');
                    if (num) num.textContent = (i + 1) + 'º';
                });
                saveConfig();
                ui.log('🎯 Prioridade: ' + CONFIG.PRIORIDADE_RECURSOS.join(' → '), 'info');
            });
            list.addEventListener('dragover', function(e) {
                e.preventDefault();
                const target = e.target.closest('[draggable]');
                if (target && target !== dragging) {
                    const rect  = target.getBoundingClientRect();
                    const after = e.clientY > rect.top + rect.height / 2;
                    list.insertBefore(dragging, after ? target.nextSibling : target);
                }
            });
        })();

        // ---- CALCULAR ----
        document.getElementById('twb-calcular').addEventListener('click', function() {
            const checkboxes = document.querySelectorAll('.twb-origem:checked');
            if (checkboxes.length === 0) {
                ui.log('⚠️ Selecione pelo menos uma aldeia de origem', 'warning');
                return;
            }

            const destinosValidos = destinosResolvidos.filter(function(d) { return d.encontrado; });
            if (destinosValidos.length === 0) {
                ui.log('⚠️ Nenhum destino válido', 'warning');
                return;
            }

            let origens = [];
            checkboxes.forEach(function(cb) {
                const a = minhasAldeias.find(function(x) { return x.id == cb.value; });
                if (a) origens.push(Object.assign({}, a));
            });

            // Remover origens que são destinos
            const destCoords = destinosValidos.map(function(d) { return d.coord; });
            const removidas  = [];
            origens = origens.filter(function(o) {
                if (destCoords.indexOf(o.coord) >= 0) { removidas.push(o.coord); return false; }
                return true;
            });

            if (removidas.length > 0) {
                ui.log('⚠️ Removidas origens que são destinos: ' + removidas.join(', '), 'warning');
                removidas.forEach(function(coord) {
                    const cb = document.querySelector('.twb-origem[data-coord="' + coord + '"]');
                    if (cb) { cb.checked = false; }
                });
            }

            if (origens.length === 0) {
                ui.log('❌ Nenhuma origem válida restante', 'error');
                return;
            }

            ui.log('📊 Calculando: ' + origens.length + ' origens → ' + destinosValidos.length + ' destinos...', 'info');
            enviosCalculados = calcularDistribuicao(origens, destinosValidos, ui);

            const resultDiv = document.getElementById('twb-resultado');
            if (enviosCalculados.length === 0) {
                resultDiv.innerHTML = '<span style="color:' + CORES.erro + ';">❌ Nenhum envio possível com os recursos e mercadores disponíveis</span>';
                document.getElementById('twb-executar').disabled = true;
            } else {
                const totMad  = enviosCalculados.reduce(function(s, e) { return s + e.madeira; }, 0);
                const totArg  = enviosCalculados.reduce(function(s, e) { return s + e.argila;  }, 0);
                const totFer  = enviosCalculados.reduce(function(s, e) { return s + e.ferro;   }, 0);
                const totMerc = enviosCalculados.reduce(function(s, e) { return s + e.mercadores; }, 0);

                resultDiv.innerHTML =
                    '<div style="color:' + CORES.verde + ';margin-bottom:12px;">✅ ' + enviosCalculados.length + ' envios planejados</div>'
                    + '<div style="display:flex;gap:20px;margin-bottom:16px;flex-wrap:wrap;">'
                    + '<div style="color:' + CORES.madeira + ';">🌲 ' + totMad.toLocaleString() + '</div>'
                    + '<div style="color:' + CORES.argila  + ';">🧱 ' + totArg.toLocaleString() + '</div>'
                    + '<div style="color:' + CORES.ferro   + ';">⚙️ ' + totFer.toLocaleString() + '</div>'
                    + '<div>📦 Total: ' + (totMad + totArg + totFer).toLocaleString() + '</div>'
                    + '<div>🚚 Mercadores: ' + totMerc + '</div>'
                    + '</div>'
                    + '<hr style="border-color:' + CORES.borda + ';margin:12px 0;">'
                    + '<div style="font-size:11px;">'
                    + enviosCalculados.map(function(e) {
                        const tagDest = e.destinoProprio ? '🏠' : '👤';
                        return '<div style="padding:8px 0;border-bottom:1px solid ' + CORES.borda + '44;">'
                            + '<strong>📤 ' + e.origemCoord + ' → ' + tagDest + ' ' + e.destinoCoord + '</strong>'
                            + ' <span style="color:' + CORES.textoDim + ';">(' + e.destinoJogador + ')</span><br>'
                            + '🌲 ' + e.madeira.toLocaleString()
                            + ' 🧱 ' + e.argila.toLocaleString()
                            + ' ⚙️ ' + e.ferro.toLocaleString()
                            + ' | 🚚 ' + e.mercadores + ' mercs'
                            + '</div>';
                    }).join('')
                    + '</div>';

                document.getElementById('twb-executar').disabled = false;
                ui.log('✅ ' + enviosCalculados.length + ' envios calculados', 'success');
            }
        });

        // ---- EXECUTAR ----
        document.getElementById('twb-executar').addEventListener('click', async () => {
            if (enviosCalculados.length === 0) {
                ui.log('⚠️ Calcule os envios primeiro', 'warning');
                return;
            }

            const total = enviosCalculados.reduce(function(s, e) { return s + e.total; }, 0);
            if (!confirm('Executar ' + enviosCalculados.length + ' envios?\n📦 Total: ' + total.toLocaleString() + ' recursos')) {
                ui.log('❌ Cancelado pelo usuário', 'warning');
                return;
            }

            ui.btnLoading('twb-executar', '⏳ ENVIANDO...');
            ui.btnLoading('twb-calcular', '⏳ Aguarde…');
            ui.setProgress(0, '0 / ' + enviosCalculados.length + ' envios');

            let sucessos = 0;
            for (let i = 0; i < enviosCalculados.length; i++) {
                const e = enviosCalculados[i];
                const tagDest = e.destinoProprio ? '🏠' : '👤';
                ui.log('[' + (i + 1) + '/' + enviosCalculados.length + '] ' + e.origemCoord + ' → ' + tagDest + ' ' + e.destinoCoord + ' (' + e.destinoJogador + ')', 'info');

                const pct = ((i + 1) / enviosCalculados.length) * 100;
                ui.setProgress(pct, (i + 1) + ' / ' + enviosCalculados.length + ' — ' + sucessos + ' ✅');

                const ok = await enviarRecursos(e.origemId, e.destinoId, e.madeira, e.argila, e.ferro, ui);
                if (ok) sucessos++;

                if (i < enviosCalculados.length - 1) {
                    await new Promise(function(r) { setTimeout(r, CONFIG.DELAY_ENTRE_ENVIOS); });
                }
            }

            ui.setProgress(100, '✅ ' + sucessos + ' / ' + enviosCalculados.length + ' enviados');
            ui.log('✅ Finalizado: ' + sucessos + '/' + enviosCalculados.length + ' sucessos', sucessos > 0 ? 'success' : 'error');
            ui.hideProgress(4000);

            ui.btnRestore('twb-executar', '🚀 EXECUTAR ENVIOS');
            ui.btnRestore('twb-calcular', '📊 CALCULAR ENVIOS');
        });

        document.getElementById('twb-close-btn').addEventListener('click', function() { window.close(); });

        ui.log('📤 Envio Multi-Aldeias v5.0 — suporte a aldeias externas via mapa público', 'success');
        ui.log('💡 Dica: informe o armazém real dos destinos externos para maior precisão', 'info');
    }

    // ==================== BOTÃO FLUTUANTE ====================
    function adicionarBotao() {
        if (document.getElementById('twb-multi-float')) return;
        const btn = document.createElement('div');
        btn.id = 'twb-multi-float';
        btn.innerHTML = '📤 Envio v5';
        btn.style.cssText =
            'position:fixed;bottom:20px;right:20px;z-index:999999;'
            + 'padding:10px 16px;background:#0d1117;color:#00d97e;'
            + 'border:1px solid #00d97e55;border-radius:8px;cursor:pointer;'
            + 'font-family:monospace;font-weight:bold;font-size:12px;';
        btn.onclick = function() {
            const url = window.location.href.split('?')[0] + '?' + DASHBOARD_PARAM;
            window.open(url, 'TWMultiSend');
        };
        document.body.appendChild(btn);
    }

    if (window.location.href.includes(DASHBOARD_PARAM)) {
        renderizarDashboard();
    } else {
        adicionarBotao();
    }

})();
