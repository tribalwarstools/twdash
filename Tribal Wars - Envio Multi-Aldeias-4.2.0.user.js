// ==UserScript==
// @name         Tribal Wars - Envio Multi-Aldeias
// @namespace    https://github.com/tribalwarstools
// @version      4.2.0
// @description   Com validação: não enviar de uma aldeia para ela mesma
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
    const STORAGE_KEY = 'TW_MULTI_SEND_CONFIG';
    const MAX_POR_MERCADOR = 1000;

    const CONFIG = {
        DELAY_ENTRE_ENVIOS: 800,
        PERCENTUAL_ARMAZEM_DESTINO: 80
    };

    function saveConfig() {
        GM_setValue(STORAGE_KEY, JSON.stringify(CONFIG));
    }

    try {
        const saved = GM_getValue(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(CONFIG, parsed);
        }
    } catch(e) {}

    const CORES = {
        fundo: '#080c10',
        fundoCard: '#0d1117',
        verde: '#00d97e',
        texto: '#c9d1d9',
        textoDim: '#8b949e',
        borda: '#21262d',
        erro: '#f85149',
        aviso: '#d29922',
        info: '#388bfd',
        madeira: '#d4a72c',
        argila: '#7e8c8d',
        ferro: '#8b9dc3'
    };

    function isPremium() {
        if (typeof premium !== 'undefined' && premium === true) return true;
        if (window.game_data?.features?.Premium?.active === true) return true;
        if (document.body?.classList?.contains('has-pa')) return true;
        return false;
    }

    // ==================== EXTRAIR ALDEIAS ====================
    async function extrairAldeias(ui) {
        if (ui) ui.log('📡 Buscando aldeias...', 'info');

        const premiumAtivo = isPremium();
        const url = `/game.php?screen=overview_villages&mode=prod&group=0&page=-1`;

        try {
            const response = await fetch(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const tabela = doc.getElementById('production_table');
            if (!tabela) throw new Error('Tabela não encontrada');

            const linhas = Array.from(tabela.querySelectorAll('tr')).filter(tr =>
                tr.querySelector('a[href*="screen=overview"]') && !tr.querySelector('th')
            );

            const offset = premiumAtivo ? 1 : 0;
            const aldeias = [];

            for (const linha of linhas) {
                const linkVila = linha.querySelector('a[href*="screen=overview"]');
                if (!linkVila) continue;

                const celulas = linha.cells;
                const textoAldeia = celulas[offset].innerText.trim();
                const coordsMatch = textoAldeia.match(/(\d+)\|(\d+)/);
                const x = coordsMatch ? parseInt(coordsMatch[1]) : 0;
                const y = coordsMatch ? parseInt(coordsMatch[2]) : 0;
                const coord = `${x}|${y}`;
                const nome = textoAldeia.split('(')[0].trim();
                const pontos = parseInt(celulas[offset + 1]?.innerText?.replace(/\./g, '') || '0');

                const resTexto = celulas[offset + 2]?.innerText?.replace(/\./g, '') || '0';
                const resNums = resTexto.match(/\d+/g) || [0, 0, 0];
                const madeira = parseInt(resNums[0] || 0);
                const argila = parseInt(resNums[1] || 0);
                const ferro = parseInt(resNums[2] || 0);
                const armazem = parseInt(celulas[offset + 3]?.innerText?.replace(/\./g, '') || '0');

                let comerciantesDisp = 0, comerciantesTotal = 0;
                if (premiumAtivo && celulas[offset + 4]) {
                    const comerMatch = celulas[offset + 4].innerText.trim().match(/(\d+)\/(\d+)/);
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
                        madeira, argila, ferro,
                        armazem,
                        comerciantesDisp, comerciantesTotal
                    });
                }
            }

            if (!premiumAtivo && aldeias.length > 0) {
                if (ui) ui.log('🐌 Buscando comerciantes...', 'info');
                for (const aldeia of aldeias) {
                    const comer = await buscarComerciantesPorAldeia(aldeia.id);
                    aldeia.comerciantesDisp = comer.disp;
                    aldeia.comerciantesTotal = comer.total;
                    await new Promise(r => setTimeout(r, 60));
                }
            }

            if (ui) ui.log(`✅ ${aldeias.length} aldeias encontradas`, 'success');
            return aldeias;

        } catch (err) {
            if (ui) ui.log(`❌ Erro: ${err.message}`, 'error');
            return [];
        }
    }

    async function buscarComerciantesPorAldeia(villageId) {
        try {
            const url = `/game.php?village=${villageId}&screen=market`;
            const response = await fetch(url);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const availableSpan = doc.getElementById('market_merchant_available_count');
            const totalSpan = doc.getElementById('market_merchant_total_count');

            if (availableSpan && totalSpan) {
                return {
                    disp: parseInt(availableSpan.innerText.trim()) || 0,
                    total: parseInt(totalSpan.innerText.trim()) || 0
                };
            }
            return { disp: 0, total: 0 };
        } catch (err) {
            return { disp: 0, total: 0 };
        }
    }

    // ==================== CONSULTAR DESTINO ====================
    async function consultarDestino(coord, minhasAldeias = []) {
        const minhaAldeia = minhasAldeias.find(a => a.coord === coord);
        if (minhaAldeia) {
            return {
                coord,
                id: minhaAldeia.id,
                armazem: minhaAldeia.armazem,
                madeira: minhaAldeia.madeira,
                argila: minhaAldeia.argila,
                ferro: minhaAldeia.ferro,
                encontrado: true
            };
        }

        try {
            const [x, y] = coord.split('|');
            const url = `/game.php?screen=info_village&mode=found&x=${x}&y=${y}`;
            const response = await fetch(url);
            const html = await response.text();

            const idMatch = html.match(/village=(\d+)/);
            if (!idMatch) return { coord, encontrado: false };

            let armazem = 0;
            const warehouseMatch = html.match(/armaz[ée]m[^<]*<\/span>\s*<span[^>]*>([\d.]+)<\/span>/i);
            if (warehouseMatch) {
                armazem = parseInt(warehouseMatch[1].replace(/\./g, '')) || 0;
            }

            return {
                coord,
                id: idMatch[1],
                armazem,
                madeira: 0, argila: 0, ferro: 0,
                encontrado: armazem > 0
            };
        } catch (err) {
            return { coord, encontrado: false };
        }
    }

    // ==================== CALCULAR DISTRIBUIÇÃO ====================
    function calcularDistribuicao(origensSelecionadas, destinos, ui) {
        let origensViaveis = origensSelecionadas.filter(o =>
            (o.madeira > 0 || o.argila > 0 || o.ferro > 0) && o.comerciantesDisp > 0
        );

        if (origensViaveis.length === 0) {
            ui.log('❌ Nenhuma origem disponível', 'error');
            return [];
        }

        origensViaveis = origensViaveis.map(o => ({ ...o }));
        const envios = [];
        const percDestino = CONFIG.PERCENTUAL_ARMAZEM_DESTINO / 100;

        for (const destino of destinos) {
            if (!destino.encontrado || !destino.armazem) {
                ui.log(`⚠️ Destino ${destino.coord} não encontrado`, 'warning');
                continue;
            }

            const capacidadePorRecurso = destino.armazem;
            const metaPorRecurso = Math.floor(capacidadePorRecurso * percDestino);

            let necessidadeMadeira = Math.max(0, metaPorRecurso - destino.madeira);
            let necessidadeArgila = Math.max(0, metaPorRecurso - destino.argila);
            let necessidadeFerro = Math.max(0, metaPorRecurso - destino.ferro);

            if (necessidadeMadeira + necessidadeArgila + necessidadeFerro <= 0) {
                ui.log(`ℹ️ ${destino.coord} já está balanceado`, 'info');
                continue;
            }

            ui.log(`📦 ${destino.coord}: 🌲+${necessidadeMadeira.toLocaleString()} 🧱+${necessidadeArgila.toLocaleString()} ⚙️+${necessidadeFerro.toLocaleString()}`, 'info');

            for (const origem of origensViaveis) {
                if (necessidadeMadeira <= 0 && necessidadeArgila <= 0 && necessidadeFerro <= 0) break;
                if (origem.comerciantesDisp <= 0) continue;

                let madeiraEnvio = 0, argilaEnvio = 0, ferroEnvio = 0;
                let mercadoresUsados = 0;

                // MADEIRA
                if (necessidadeMadeira > 0 && origem.madeira > 0) {
                    let enviar = Math.min(necessidadeMadeira, origem.madeira);
                    enviar = Math.floor(enviar / 1000) * 1000;
                    let mercs = enviar / 1000;
                    if (mercs <= origem.comerciantesDisp) {
                        madeiraEnvio = enviar;
                        mercadoresUsados += mercs;
                        necessidadeMadeira -= enviar;
                        origem.madeira -= enviar;
                    }
                }

                // ARGILA
                if (necessidadeArgila > 0 && origem.argila > 0 && mercadoresUsados < origem.comerciantesDisp) {
                    let enviar = Math.min(necessidadeArgila, origem.argila);
                    enviar = Math.floor(enviar / 1000) * 1000;
                    let mercsRestantes = origem.comerciantesDisp - mercadoresUsados;
                    let mercsNecessarios = enviar / 1000;
                    if (mercsNecessarios <= mercsRestantes) {
                        argilaEnvio = enviar;
                        mercadoresUsados += mercsNecessarios;
                        necessidadeArgila -= enviar;
                        origem.argila -= enviar;
                    }
                }

                // FERRO
                if (necessidadeFerro > 0 && origem.ferro > 0 && mercadoresUsados < origem.comerciantesDisp) {
                    let enviar = Math.min(necessidadeFerro, origem.ferro);
                    enviar = Math.floor(enviar / 1000) * 1000;
                    let mercsRestantes = origem.comerciantesDisp - mercadoresUsados;
                    let mercsNecessarios = enviar / 1000;
                    if (mercsNecessarios <= mercsRestantes) {
                        ferroEnvio = enviar;
                        mercadoresUsados += mercsNecessarios;
                        necessidadeFerro -= enviar;
                        origem.ferro -= enviar;
                    }
                }

                if (madeiraEnvio > 0 || argilaEnvio > 0 || ferroEnvio > 0) {
                    envios.push({
                        origemId: origem.id,
                        origemNome: origem.nome,
                        origemCoord: origem.coord,
                        destinoId: destino.id,
                        destinoCoord: destino.coord,
                        madeira: madeiraEnvio,
                        argila: argilaEnvio,
                        ferro: ferroEnvio,
                        total: madeiraEnvio + argilaEnvio + ferroEnvio,
                        mercadores: mercadoresUsados
                    });
                }

                origem.comerciantesDisp -= mercadoresUsados;
            }
        }

        return envios;
    }

    // ==================== ENVIAR RECURSOS ====================
    function enviarRecursos(sourceID, targetID, wood, stone, iron, ui) {
        return new Promise((resolve) => {
            if (wood + stone + iron === 0) {
                resolve(false);
                return;
            }

            const dados = { target_id: targetID, wood, stone, iron };

            if (typeof TribalWars !== 'undefined' && TribalWars.post) {
                TribalWars.post("market", {
                    ajaxaction: "map_send",
                    village: sourceID
                }, dados, function(response) {
                    if (response?.error) {
                        ui.log(`❌ ${response.error}`, 'error');
                        resolve(false);
                    } else {
                        ui.log(`✅ Enviado: 🌲${wood.toLocaleString()} 🧱${stone.toLocaleString()} ⚙️${iron.toLocaleString()}`, 'success');
                        resolve(true);
                    }
                }, function(error) {
                    ui.log(`❌ Erro: ${error}`, 'error');
                    resolve(false);
                });
            } else {
                ui.log(`⚠️ API não disponível`, 'warning');
                resolve(false);
            }
        });
    }

    // ==================== TELA PRINCIPAL ====================
    function renderizarDashboard() {
        document.body.innerHTML = '';
        document.body.style.cssText = `background: ${CORES.fundo}; margin: 0; padding: 0; overflow: auto; height: 100vh; font-family: monospace;`;

        const ui = TWUI.create('twb');
        ui.injectStyles();
        ui.renderApp();

        ui.header('📤 Envio Multi-Aldeias v4.2', 'Validação: origem não pode ser igual ao destino',
            `<button id="twb-close-btn" style="background:${CORES.erro}22;border:1px solid ${CORES.erro}44;color:${CORES.erro};padding:4px 10px;border-radius:4px;cursor:pointer;">✕ Fechar</button>`
        );

        ui.mainLayout(`
            <div style="display: flex; gap: 20px; padding: 0 0 20px 0; flex-wrap: wrap;">

                <!-- COLUNA ESQUERDA: ORIGENS -->
                <div style="flex: 2; min-width: 400px;">
                    <div style="background: ${CORES.fundoCard}; border-radius: 12px; border: 1px solid ${CORES.borda}; overflow: hidden;">
                        <div style="padding: 12px 16px; background: ${CORES.fundo}; border-bottom: 1px solid ${CORES.borda};">
                            <h3 style="margin: 0; color: ${CORES.verde};">✅ Selecionar Aldeias de ORIGEM</h3>
                        </div>
                        <div style="padding: 12px;">
                            <button id="twb-btn-load" class="twb-btn twb-btn-primary" style="margin-bottom: 12px;">📡 CARREGAR ALDEIAS</button>
                            <div id="twb-origens-list" style="max-height: 450px; overflow-y: auto; scrollbar-width: thin;">
                                <div style="color: ${CORES.textoDim}; text-align: center; padding: 20px;">Clique em "CARREGAR ALDEIAS"</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- COLUNA DIREITA: DESTINOS -->
                <div style="flex: 1; min-width: 350px;">
                    <div style="background: ${CORES.fundoCard}; border-radius: 12px; border: 1px solid ${CORES.borda}; overflow: hidden; margin-bottom: 20px;">
                        <div style="padding: 12px 16px; background: ${CORES.fundo}; border-bottom: 1px solid ${CORES.borda};">
                            <h3 style="margin: 0; color: ${CORES.verde};">🎯 Destinos</h3>
                        </div>
                        <div style="padding: 12px;">
                            <label style="color: ${CORES.textoDim}; font-size: 11px;">Coordenadas (uma por linha)</label>
                            <textarea id="twb-destinos-text" rows="5" style="
                                width: 100%; box-sizing: border-box;
                                background: ${CORES.fundo}; border: 1px solid ${CORES.borda};
                                color: ${CORES.texto}; border-radius: 6px; padding: 8px;
                                font-family: monospace; font-size: 12px;
                                resize: vertical;
                            " placeholder="123|456&#10;789|012"></textarea>

                            <label style="color: ${CORES.textoDim}; font-size: 11px; margin-top: 12px; display: block;">📦 Armazém (se não for sua aldeia)</label>
                            <input type="number" id="twb-armazem-manual" step="1000" min="0"
                                placeholder="Digite o tamanho do armazém"
                                style="width: 100%; box-sizing: border-box;
                                    background: ${CORES.fundo}; border: 1px solid ${CORES.borda};
                                    color: ${CORES.texto}; border-radius: 6px; padding: 8px;
                                    font-family: monospace; font-size: 12px;">

                            <button id="twb-consultar" class="twb-btn twb-btn-secondary" style="margin-top: 12px; width: 100%;">🔍 CONSULTAR DESTINOS</button>
                            <div id="twb-destinos-info" style="margin-top: 12px; font-size: 11px; max-height: 200px; overflow-y: auto; scrollbar-width: thin;"></div>
                        </div>
                    </div>

                    <!-- Configurações -->
                    <div style="background: ${CORES.fundoCard}; border-radius: 12px; border: 1px solid ${CORES.borda}; overflow: hidden;">
                        <div style="padding: 12px 16px; background: ${CORES.fundo}; border-bottom: 1px solid ${CORES.borda};">
                            <h3 style="margin: 0; color: ${CORES.verde};">⚙️ Configurações</h3>
                        </div>
                        <div style="padding: 12px;">
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
                                <span>📦 % uso do armazém (por recurso):</span>
                                <input type="number" id="twb-percentual"
                                    value="${CONFIG.PERCENTUAL_ARMAZEM_DESTINO}"
                                    min="10" max="100" step="5"
                                    style="width: 60px; background: ${CORES.fundo}; border: 1px solid ${CORES.borda};
                                        color: ${CORES.texto}; border-radius: 4px; padding: 4px; text-align: center;">
                                <span>%</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; margin-top: 8px;">
                                <span>⏱️ Delay entre envios (ms):</span>
                                <input type="number" id="twb-delay"
                                    value="${CONFIG.DELAY_ENTRE_ENVIOS}"
                                    min="200" max="5000" step="100"
                                    style="width: 80px; background: ${CORES.fundo}; border: 1px solid ${CORES.borda};
                                        color: ${CORES.texto}; border-radius: 4px; padding: 4px; text-align: center;">
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RESULTADOS -->
            <div style="background: ${CORES.fundoCard}; border-radius: 12px; border: 1px solid ${CORES.borda}; overflow: hidden; margin-top: 20px;">
                <div style="padding: 12px 16px; background: ${CORES.fundo}; border-bottom: 1px solid ${CORES.borda};">
                    <h3 style="margin: 0; color: ${CORES.verde};">📊 Resultado dos Envios</h3>
                </div>
                <div style="padding: 12px;">
                    <div style="display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
                        <button id="twb-calcular" class="twb-btn twb-btn-warning" disabled>📊 CALCULAR ENVIOS</button>
                        <button id="twb-executar" class="twb-btn twb-btn-danger" disabled>🚀 EXECUTAR ENVIOS</button>
                        <span id="twb-status" style="color: ${CORES.textoDim}; font-size: 11px; align-self: center;"></span>
                    </div>
                    <div id="twb-resultado" style="
                        background: ${CORES.fundo}; border-radius: 8px; padding: 12px;
                        font-size: 12px; max-height: 300px; overflow-y: auto;
                        font-family: monospace;
                    "></div>
                    <div id="twb-progresso" style="margin-top: 12px;"></div>
                </div>
            </div>
        `, '📝 Log de Atividades');

        let aldeias = [];
        let destinosConsultados = [];
        let enviosCalculados = [];

        // Carregar aldeias
        document.getElementById('twb-btn-load').addEventListener('click', async () => {
            const btn = document.getElementById('twb-btn-load');
            btn.textContent = '⏳ CARREGANDO...';
            btn.disabled = true;

            aldeias = await extrairAldeias(ui);

            if (aldeias.length > 0) {
                const listDiv = document.getElementById('twb-origens-list');
                listDiv.innerHTML = `
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; cursor: pointer;">
                        <input type="checkbox" id="twb-select-all" checked>
                        <strong>Selecionar Todas (${aldeias.length} aldeias)</strong>
                    </label>
                    ${aldeias.map((a, idx) => `
                        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px; border-bottom: 1px solid ${CORES.borda}44; cursor: pointer;">
                            <input type="checkbox" class="twb-origem" value="${a.id}" data-coord="${a.coord}" checked>
                            <div style="flex:1;">
                                <div>
                                    <strong>${a.nome}</strong>
                                    <span style="color: ${CORES.textoDim};">(${a.coord})</span>
                                    <span style="color: ${CORES.info}; margin-left: 8px;">🚚${a.comerciantesDisp}</span>
                                </div>
                                <div style="font-size: 10px; margin-top: 4px;">
                                    🌲 ${a.madeira.toLocaleString()}
                                    🧱 ${a.argila.toLocaleString()}
                                    ⚙️ ${a.ferro.toLocaleString()}
                                    <span style="color: ${CORES.textoDim}; margin-left: 8px;">📦 ${a.armazem.toLocaleString()}</span>
                                </div>
                            </div>
                        </label>
                    `).join('')}
                `;

                document.getElementById('twb-select-all').addEventListener('change', (e) => {
                    document.querySelectorAll('.twb-origem').forEach(cb => cb.checked = e.target.checked);
                });

                ui.log(`✅ ${aldeias.length} aldeias carregadas`, 'success');
                document.getElementById('twb-calcular').disabled = false;
            }

            btn.textContent = '📡 CARREGAR ALDEIAS';
            btn.disabled = false;
        });

        // Consultar destinos
        document.getElementById('twb-consultar').addEventListener('click', async () => {
            const texto = document.getElementById('twb-destinos-text').value;
            const coords = texto.split(/[\s\n,]+/).filter(c => c.match(/\d+\|\d+/));
            const armazemManual = parseInt(document.getElementById('twb-armazem-manual').value) || null;

            if (coords.length === 0) {
                ui.log('⚠️ Informe pelo menos uma coordenada', 'warning');
                return;
            }

            ui.log(`🔍 Consultando ${coords.length} destino(s)...`, 'info');
            const btn = document.getElementById('twb-consultar');
            btn.disabled = true;
            btn.textContent = '⏳ CONSULTANDO...';

            destinosConsultados = [];
            for (const coord of coords) {
                let info = await consultarDestino(coord, aldeias);
                if (!info.encontrado && armazemManual > 0) {
                    info = { coord, id: null, armazem: armazemManual, madeira: 0, argila: 0, ferro: 0, encontrado: true };
                }
                destinosConsultados.push(info);
                await new Promise(r => setTimeout(r, 150));
            }

            const infoDiv = document.getElementById('twb-destinos-info');
            const meta = CONFIG.PERCENTUAL_ARMAZEM_DESTINO;
            infoDiv.innerHTML = destinosConsultados.map(d => {
                if (d.encontrado) {
                    const alvo = Math.floor(d.armazem * meta / 100);
                    const faltaMadeira = Math.max(0, alvo - d.madeira);
                    const faltaArgila = Math.max(0, alvo - d.argila);
                    const faltaFerro = Math.max(0, alvo - d.ferro);
                    const fonte = aldeias.find(a => a.coord === d.coord) ? '🏠 sua' : '👤 outro';
                    return `
                        <div style="padding: 8px; border-bottom: 1px solid ${CORES.borda}44;">
                            <strong>✅ ${d.coord}</strong> <span style="color: ${CORES.textoDim};">${fonte}</span><br>
                            📦 Armazém: ${d.armazem.toLocaleString()} (${meta}% = ${alvo.toLocaleString()} de cada)<br>
                            🌲 ${d.madeira.toLocaleString()} → +${faltaMadeira.toLocaleString()}<br>
                            🧱 ${d.argila.toLocaleString()} → +${faltaArgila.toLocaleString()}<br>
                            ⚙️ ${d.ferro.toLocaleString()} → +${faltaFerro.toLocaleString()}
                        </div>
                    `;
                }
                return `<div style="padding: 8px; color: ${CORES.erro};">⚠️ ${d.coord} - Não encontrado</div>`;
            }).join('');

            btn.disabled = false;
            btn.textContent = '🔍 CONSULTAR DESTINOS';
            ui.log('✅ Consulta concluída', 'success');
        });

        // Configurações
        document.getElementById('twb-percentual').addEventListener('change', (e) => {
            CONFIG.PERCENTUAL_ARMAZEM_DESTINO = parseInt(e.target.value) || 80;
            saveConfig();
            ui.log(`📦 Percentual ajustado para ${CONFIG.PERCENTUAL_ARMAZEM_DESTINO}%`, 'info');
        });

        document.getElementById('twb-delay').addEventListener('change', (e) => {
            CONFIG.DELAY_ENTRE_ENVIOS = parseInt(e.target.value) || 800;
            saveConfig();
        });

        // Calcular envios (COM VALIDAÇÃO)
        document.getElementById('twb-calcular').addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.twb-origem:checked');
            if (checkboxes.length === 0) {
                ui.log('⚠️ Selecione pelo menos uma origem', 'warning');
                return;
            }

            const destinosViaveis = destinosConsultados.filter(d => d.encontrado && d.armazem > 0);
            if (destinosViaveis.length === 0) {
                ui.log('⚠️ Nenhum destino válido. Consulte os destinos primeiro.', 'warning');
                return;
            }

            let origensSelecionadas = [];
            for (const cb of checkboxes) {
                const aldeia = aldeias.find(a => a.id == cb.value);
                if (aldeia) origensSelecionadas.push({ ...aldeia });
            }

            // ========== VALIDAÇÃO: remover origens que são destinos ==========
            const destinosCoords = destinosViaveis.map(d => d.coord);
            const origensRemovidas = [];
            const origensValidas = origensSelecionadas.filter(origem => {
                if (destinosCoords.includes(origem.coord)) {
                    origensRemovidas.push(origem.coord);
                    return false;
                }
                return true;
            });

            if (origensRemovidas.length > 0) {
                ui.log(`⚠️ ${origensRemovidas.length} aldeia(s) removidas da seleção por serem também destinos: ${origensRemovidas.join(', ')}`, 'warning');

                // Desmarcar os checkboxes correspondentes
                for (const coord of origensRemovidas) {
                    const checkbox = document.querySelector(`.twb-origem[data-coord="${coord}"]`);
                    if (checkbox) {
                        checkbox.checked = false;
                        // Estilizar o label para mostrar que foi desmarcado
                        const label = checkbox.closest('label');
                        if (label) {
                            label.style.opacity = '0.5';
                            setTimeout(() => {
                                label.style.opacity = '1';
                            }, 2000);
                        }
                    }
                }
            }

            if (origensValidas.length === 0) {
                ui.log('❌ Todas as origens selecionadas são também destinos. Nada para enviar.', 'error');
                return;
            }
            // ========== FIM DA VALIDAÇÃO ==========

            ui.log(`📊 Calculando envios de ${origensValidas.length} origens para ${destinosViaveis.length} destinos...`, 'info');
            enviosCalculados = calcularDistribuicao(origensValidas, destinosViaveis, ui);

            const resultDiv = document.getElementById('twb-resultado');
            if (enviosCalculados.length === 0) {
                resultDiv.innerHTML = '<span style="color: #f85149;">❌ Nenhum envio possível</span>';
                document.getElementById('twb-executar').disabled = true;
            } else {
                const totalMadeira = enviosCalculados.reduce((s, e) => s + e.madeira, 0);
                const totalArgila = enviosCalculados.reduce((s, e) => s + e.argila, 0);
                const totalFerro = enviosCalculados.reduce((s, e) => s + e.ferro, 0);
                const totalMercs = enviosCalculados.reduce((s, e) => s + e.mercadores, 0);

                resultDiv.innerHTML = `
                    <div style="color: ${CORES.verde}; margin-bottom: 12px;">✅ ${enviosCalculados.length} envios planejados</div>
                    <div style="display: flex; gap: 20px; margin-bottom: 16px; flex-wrap: wrap;">
                        <div style="color: ${CORES.madeira};">🌲 Madeira: ${totalMadeira.toLocaleString()}</div>
                        <div style="color: ${CORES.argila};">🧱 Argila: ${totalArgila.toLocaleString()}</div>
                        <div style="color: ${CORES.ferro};">⚙️ Ferro: ${totalFerro.toLocaleString()}</div>
                        <div>📦 Total: ${(totalMadeira+totalArgila+totalFerro).toLocaleString()}</div>
                        <div>🚚 Mercadores: ${totalMercs}</div>
                    </div>
                    <hr style="border-color: ${CORES.borda}; margin: 12px 0;">
                    <div style="font-size: 11px;">
                        ${enviosCalculados.map(e => `
                            <div style="padding: 8px 0; border-bottom: 1px solid ${CORES.borda}44;">
                                <strong>📤 ${e.origemCoord} → 📍 ${e.destinoCoord}</strong><br>
                                🌲 ${e.madeira.toLocaleString()} 🧱 ${e.argila.toLocaleString()} ⚙️ ${e.ferro.toLocaleString()} | 🚚 ${e.mercadores} mercs
                            </div>
                        `).join('')}
                    </div>
                `;
                document.getElementById('twb-executar').disabled = false;
                ui.log(`✅ ${enviosCalculados.length} envios calculados`, 'success');
            }
        });

        // Executar envios
        document.getElementById('twb-executar').addEventListener('click', async () => {
            if (enviosCalculados.length === 0) {
                ui.log('⚠️ Calcule os envios primeiro', 'warning');
                return;
            }

            const total = enviosCalculados.reduce((s, e) => s + e.total, 0);
            if (!confirm(`Executar ${enviosCalculados.length} envios?\n📦 Total: ${total.toLocaleString()} recursos`)) {
                ui.log('❌ Cancelado', 'warning');
                return;
            }

            const btnExecutar = document.getElementById('twb-executar');
            const btnCalcular = document.getElementById('twb-calcular');
            btnExecutar.disabled = true;
            btnCalcular.disabled = true;
            btnExecutar.textContent = '⏳ ENVIANDO...';

            const progressDiv = document.getElementById('twb-progresso');
            progressDiv.innerHTML = `
                <div style="background: ${CORES.borda}; border-radius: 4px; height: 8px; width: 100%;">
                    <div id="twb-progress-bar" style="background: ${CORES.verde}; width: 0%; height: 8px; border-radius: 4px; transition: width 0.3s;"></div>
                </div>
                <div id="twb-progress-text" style="font-size: 11px; color: ${CORES.textoDim}; margin-top: 6px; text-align: center;"></div>
            `;

            let sucessos = 0;
            for (let i = 0; i < enviosCalculados.length; i++) {
                const envio = enviosCalculados[i];
                ui.log(`[${i+1}/${enviosCalculados.length}] ${envio.origemCoord} → ${envio.destinoCoord}`, 'info');

                const pct = ((i + 1) / enviosCalculados.length) * 100;
                const progressBar = document.getElementById('twb-progress-bar');
                if (progressBar) progressBar.style.width = `${pct}%`;
                const progressText = document.getElementById('twb-progress-text');
                if (progressText) progressText.innerHTML = `${i+1}/${enviosCalculados.length} (${sucessos} sucessos)`;

                const resultado = await enviarRecursos(envio.origemId, envio.destinoId, envio.madeira, envio.argila, envio.ferro, ui);
                if (resultado) sucessos++;

                if (i < enviosCalculados.length - 1) {
                    await new Promise(r => setTimeout(r, CONFIG.DELAY_ENTRE_ENVIOS));
                }
            }

            const progressText = document.getElementById('twb-progress-text');
            if (progressText) progressText.innerHTML = `✅ Concluído! ${sucessos}/${enviosCalculados.length} sucessos`;
            ui.log(`✅ Finalizado: ${sucessos}/${enviosCalculados.length} sucessos`, sucessos > 0 ? 'success' : 'error');

            btnExecutar.disabled = false;
            btnCalcular.disabled = false;
            btnExecutar.textContent = '🚀 EXECUTAR ENVIOS';
        });

        document.getElementById('twb-close-btn').addEventListener('click', () => window.close());
        ui.log('📤 Envio Multi-Aldeias v4.2 - Com validação origem/destino!', 'success');
        ui.log('💡 Se uma origem também for destino, ela é automaticamente removida', 'info');
    }

    // Botão flutuante
    function adicionarBotao() {
        if (document.getElementById('twb-multi-float')) return;
        const btn = document.createElement('div');
        btn.id = 'twb-multi-float';
        btn.innerHTML = '📤 Envio v4';
        btn.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 999999;
            padding: 10px 16px; background: #0d1117; color: #00d97e;
            border: 1px solid #00d97e55; border-radius: 8px; cursor: pointer;
            font-family: monospace; font-weight: bold; font-size: 12px;
        `;
        btn.onclick = () => {
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