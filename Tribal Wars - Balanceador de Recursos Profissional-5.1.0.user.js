// ==UserScript==
// @name         Tribal Wars - Balanceador de Recursos Profissional
// @namespace    https://github.com/tribalwarstools
// @version      5.1.0
// @description   Balanceia recursos usando a fórmula ORIGINAL do Shinko to Kuma - Com ordenação por distância
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
        IS_MINTING: false
    };

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

    // ==================== FUNÇÃO PARA GERAR DETALHES ====================
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

    // ==================== ORDENAR SUGESTÕES POR DISTÂNCIA ====================
    function ordenarSugestoesPorDistancia(sugestoes) {
        return [...sugestoes].sort((a, b) => a.distancia - b.distancia);
    }

    // ==================== EXTRAÇÃO DE DADOS ====================
    async function extrairDadosAldeias(ui) {
        if (ui) ui.log('📡 Buscando dados das aldeias...', 'info');

        function isPremium() {
            if (typeof premium !== 'undefined' && premium === true) return true;
            if (window.game_data?.features?.Premium?.active === true) return true;
            if (document.body?.classList?.contains('has-pa')) return true;
            return false;
        }

        const premiumAtivo = isPremium();
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

                let comerciantesDisp = 0, comerciantesTotal = 0;
                if (celulas[offset + 4]) {
                    const comerText = celulas[offset + 4].innerText.trim();
                    const comerMatch = comerText.match(/(\d+)\/(\d+)/);
                    if (comerMatch) {
                        comerciantesDisp = parseInt(comerMatch[1]);
                        comerciantesTotal = parseInt(comerMatch[2]);
                    }
                }

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

            if (ui) ui.log(`✅ Extraídas ${aldeias.length} aldeias`, 'success');
            return aldeias;

        } catch (err) {
            if (ui) ui.log(`❌ Erro na extração: ${err.message}`, 'error');
            return [];
        }
    }

    // ==================== BUSCAR RECURSOS EM TRÂNSITO ====================
    async function buscarRecursosEmTransito(ui) {
        if (ui) ui.log('📡 Buscando recursos em trânsito...', 'info');

        const incomingRes = {};
        let url;

        if (window.game_data?.player?.sitter > 0) {
            url = `game.php?t=${window.game_data.player.id}&screen=overview_villages&mode=trader&type=inc&page=-1&type=inc`;
        } else {
            url = "game.php?&screen=overview_villages&mode=trader&type=inc&page=-1&type=inc";
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
            const isMobile = !!document.getElementById('mobileHeader');

            for (let i = 0; i < linhas.length; i++) {
                const linha = linhas[i];
                let villageId = null;
                let wood = 0, stone = 0, iron = 0;

                if (isMobile) {
                    const linkElem = linha.querySelector('a[href*="village"]');
                    if (linkElem) {
                        const match = linkElem.href.match(/id=(\d+)/);
                        villageId = match ? match[1] : null;
                    }

                    const resourceDiv = linha.children[5]?.children[1];
                    if (resourceDiv) {
                        for (const child of resourceDiv.children) {
                            const classNames = child.querySelector('.icon.mheader')?.className || '';
                            const amount = parseInt(child.textContent.replace(/[^\d]/g, '')) || 0;
                            if (classNames.includes('wood')) wood += amount;
                            else if (classNames.includes('stone')) stone += amount;
                            else if (classNames.includes('iron')) iron += amount;
                        }
                    }
                } else {
                    const destinoLink = linha.children[4]?.querySelector('a[href*="info_village"]');
                    if (destinoLink) {
                        const match = destinoLink.href.match(/id=(\d+)/);
                        villageId = match ? match[1] : null;
                    }

                    const resourceCell = linha.children[8];
                    if (resourceCell && villageId) {
                        for (const child of resourceCell.children) {
                            const className = child.className || '';
                            const amount = parseInt(child.textContent.replace(/\./g, '')) || 0;

                            if (className.includes('wood')) wood += amount;
                            else if (className.includes('stone')) stone += amount;
                            else if (className.includes('iron')) iron += amount;
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

    // ==================== CÁLCULO DE BALANCEAMENTO ====================
    function calcularBalanceamento(aldeias, config, incomingRes = {}) {
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

            const farmPct = a.farmSpaceTotal > 0 ? (a.farmSpaceUsed / a.farmSpaceTotal) * 100 : 0;
            if (farmPct > highFarm || a.pontos > highPoints) {
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
                const coords = aldeias[p].nome.match(/(\d+)\|(\d+)/);
                const x = coords ? parseInt(coords[1]) : 0;
                const y = coords ? parseInt(coords[2]) : 0;

                if (merchantsNeeded <= aldeias[p].comerciantesDisp) {
                    merchantOrders.push({
                        villageID: aldeias[p].id,
                        x: x, y: y,
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
                        x: x, y: y,
                        wood: Math.floor(percWood * aldeias[p].comerciantesDisp),
                        stone: Math.floor(percStone * aldeias[p].comerciantesDisp),
                        iron: Math.floor(percIron * aldeias[p].comerciantesDisp)
                    });
                }
            }
        }

        const distancia = (x1, y1, x2, y2) => Math.round(Math.hypot(x1 - x2, y1 - y2));
        const links = [];

        for (let tipo = 0; tipo < 3; tipo++) {
            for (let q = faltas.length - 1; q >= 0; q--) {
                let falta = 0;
                if (tipo === 0) falta = faltas[q][0]?.wood || 0;
                else if (tipo === 1) falta = faltas[q][1]?.stone || 0;
                else falta = faltas[q][2]?.iron || 0;

                if (falta <= 0) continue;

                const coords = aldeias[q].nome.match(/(\d+)\|(\d+)/);
                const targetX = coords ? parseInt(coords[1]) : 0;
                const targetY = coords ? parseInt(coords[2]) : 0;

                for (const order of merchantOrders) {
                    order.distance = distancia(order.x, order.y, targetX, targetY);
                }
                merchantOrders.sort((a, b) => a.distance - b.distance);

                while (falta > 0) {
                    let totalDisponivel = 0;
                    for (let m = 0; m < merchantOrders.length; m++) {
                        let disponivel = 0;
                        if (tipo === 0) disponivel = merchantOrders[m].wood;
                        else if (tipo === 1) disponivel = merchantOrders[m].stone;
                        else disponivel = merchantOrders[m].iron;

                        totalDisponivel += disponivel;

                        if (disponivel > 0) {
                            if (falta <= disponivel * 1000) {
                                const envio = {};
                                envio.source = merchantOrders[m].villageID;
                                envio.target = aldeias[q].id;
                                if (tipo === 0) envio.wood = falta;
                                else if (tipo === 1) envio.stone = falta;
                                else envio.iron = falta;
                                links.push(envio);

                                if (tipo === 0) merchantOrders[m].wood -= falta / 1000;
                                else if (tipo === 1) merchantOrders[m].stone -= falta / 1000;
                                else merchantOrders[m].iron -= falta / 1000;
                                falta = 0;
                            } else {
                                const envio = {};
                                envio.source = merchantOrders[m].villageID;
                                envio.target = aldeias[q].id;
                                if (tipo === 0) envio.wood = disponivel * 1000;
                                else if (tipo === 1) envio.stone = disponivel * 1000;
                                else envio.iron = disponivel * 1000;
                                links.push(envio);

                                falta -= disponivel * 1000;
                                if (tipo === 0) merchantOrders[m].wood = 0;
                                else if (tipo === 1) merchantOrders[m].stone = 0;
                                else merchantOrders[m].iron = 0;
                            }
                        }
                        if (falta <= 0) break;
                    }
                    if (totalDisponivel === 0) break;
                }
            }
        }

        for (let i = 0; i < links.length; i++) {
            for (let j = 0; j < links.length; j++) {
                if (i !== j && links[i] && links[j] &&
                    links[i].source === links[j].source &&
                    links[i].target === links[j].target) {
                    links[i].wood = (links[i].wood || 0) + (links[j].wood || 0);
                    links[i].stone = (links[i].stone || 0) + (links[j].stone || 0);
                    links[i].iron = (links[i].iron || 0) + (links[j].iron || 0);
                    links[j] = null;
                }
            }
        }

        const sugestoes = [];
        for (const link of links) {
            if (!link) continue;
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

        ui.header('⚖️ Resource Balancer', 'v5.1 - Ordenado por Distância',
            `<span id="twb-status" style="display:inline-block;font-size:10px;font-weight:600;border-radius:3px;padding:4px 10px;background:${CORES.info}22;border:1px solid ${CORES.info}44;color:${CORES.info}">● Pronto</span>
             <button id="twb-close-btn" style="background:${CORES.erro}22;border:1px solid ${CORES.erro}44;color:${CORES.erro};padding:4px 10px;border-radius:4px;cursor:pointer;margin-left:10px;">✕ Fechar</button>`
        );

        ui.configBar([
            { label: 'Delay (ms)', id: 'twb-delay', type: 'number', value: CONFIG.DELAY_ENTRE_ENVIOS, min: 200, max: 5000, step: 100, unit: 'ms' },
            { label: 'Limite Viagens', id: 'twb-max-viagens', type: 'number', value: CONFIG.MAX_VIAGENS_POR_EXECUCAO, min: 1, max: 500, step: 10, unit: 'viagens' },
            { label: 'Modo', id: 'twb-modo', type: 'select', value: CONFIG.MODO_AUTO ? 'auto' : 'manual',
              options: [{value:'manual', label:'🔒 Manual'}, {value:'auto', label:'⚡ Automático'}] },
            { label: 'Low Points', id: 'twb-low-points', type: 'number', value: CONFIG.LOW_POINTS, min: 0, max: 50000, step: 500, unit: 'pts' },
            { label: 'High Points', id: 'twb-high-points', type: 'number', value: CONFIG.HIGH_POINTS, min: 0, max: 50000, step: 500, unit: 'pts' },
            { label: 'High Farm', id: 'twb-high-farm', type: 'number', value: CONFIG.HIGH_FARM, min: 0, max: 50000, step: 1000, unit: 'pop' },
            { label: 'BuiltOut %', id: 'twb-builtout', type: 'number', value: Math.round(CONFIG.BUILT_OUT_PERCENTAGE * 100), min: 0, max: 100, step: 5, unit: '%' },
            { label: 'NeedsMore %', id: 'twb-needsmore', type: 'number', value: Math.round(CONFIG.NEEDS_MORE_PERCENTAGE * 100), min: 50, max: 100, step: 5, unit: '%' }
        ], (id, val) => {
            if (id === 'twb-delay') CONFIG.DELAY_ENTRE_ENVIOS = val;
            if (id === 'twb-max-viagens') CONFIG.MAX_VIAGENS_POR_EXECUCAO = val;
            if (id === 'twb-modo') CONFIG.MODO_AUTO = val === 'auto';
            if (id === 'twb-low-points') CONFIG.LOW_POINTS = val;
            if (id === 'twb-high-points') CONFIG.HIGH_POINTS = val;
            if (id === 'twb-high-farm') CONFIG.HIGH_FARM = val;
            if (id === 'twb-builtout') CONFIG.BUILT_OUT_PERCENTAGE = val / 100;
            if (id === 'twb-needsmore') CONFIG.NEEDS_MORE_PERCENTAGE = val / 100;
            saveConfig();
            ui.log(`⚙️ Config alterada: ${id} = ${val}`, 'info');
        });

        ui.statsStrip([
            { title: '🌲 MADEIRA', items: [{ icon: '📦 Total:', id: 'twb-total-wood' }, { icon: '📊 Média:', id: 'twb-media-wood' }] },
            { title: '🧱 ARGILA', items: [{ icon: '📦 Total:', id: 'twb-total-stone' }, { icon: '📊 Média:', id: 'twb-media-stone' }] },
            { title: '⚙️ FERRO', items: [{ icon: '📦 Total:', id: 'twb-total-iron' }, { icon: '📊 Média:', id: 'twb-media-iron' }] },
            { title: '📊 IMPÉRIO', items: [{ icon: '🏠 Aldeias:', id: 'twb-village-count' }, { icon: '📊 Média %:', id: 'twb-media-percent' }] }
        ]);

        ui.progressBar();

        ui.toolbar(`
            <button id="twb-btn-load" class="twb-btn twb-btn-primary">📡 CARREGAR DADOS</button>
            <button id="twb-btn-inc" class="twb-btn twb-btn-secondary" disabled style="display:none;">🚚 INC</button>
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

        document.getElementById('twb-btn-load')?.addEventListener('click', async () => {
            ui.btnLoading('twb-btn-load', '⏳ CARREGANDO...');
            aldeiasData = await extrairDadosAldeias(ui);
            if (aldeiasData.length > 0) {
                atualizarStats();
                ui.log(`📊 Média de ocupação: ${getMediaPercentual()}%`, 'info');
                document.getElementById('twb-btn-inc').style.display = 'inline-block';
                document.getElementById('twb-btn-inc').disabled = false;
            }
            ui.btnRestore('twb-btn-load', '📡 CARREGAR DADOS');
        });

        document.getElementById('twb-btn-inc')?.addEventListener('click', async () => {
            ui.btnLoading('twb-btn-inc', '⏳ BUSCANDO INC...');
            incomingData = await buscarRecursosEmTransito(ui);
            ui.btnRestore('twb-btn-inc', `🚚 INC (${Object.keys(incomingData).length})`);
            document.getElementById('twb-btn-balance').disabled = false;
        });

        document.getElementById('twb-btn-balance')?.addEventListener('click', () => {
            if (aldeiasData.length === 0) {
                ui.log('⚠️ Carregue os dados primeiro!', 'warning');
                return;
            }
            ui.btnLoading('twb-btn-balance', '⏳ CALCULANDO...');

            sugestoesAtuais = calcularBalanceamento(aldeiasData, CONFIG, incomingData);

            // 🔴 CORREÇÃO: Ordenar por distância (menor para maior)
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
                            </tr>
                            <td style="padding:10px; vertical-align:top;">
                                <strong>${s.destinoNome}</strong>
                                ${gerarDetalhesAldeia(destinoAtual, '📥')}
                            </td>
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
                document.getElementById('twb-stats-summary').innerHTML = `📦 Total: ${totalUnidades.toLocaleString()} unidades | 🚀 ${sugestoesAtuais.length} viagens | 📍 Ordenado por distância (menor → maior)`;
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
                    ui.log('❌ Cancelado', 'warning');
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
            ui.log(`📊 Finalizado: ${sucessos} sucessos, ${falhas} falhas`, sucessos > 0 ? 'success' : 'error');

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

        ui.log('🚀 Resource Balancer v5.1 - Ordenado por distância!', 'success');
        ui.log('📌 Configure "Low Points" para priorizar aldeias pequenas e "High Points" para aldeias finalizadas', 'info');
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
            btn.innerHTML = '⚖️ RB v5.1';
            btn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 999999;
                padding: 10px 16px;
                background: #0d1117;
                color: #00d97e;
                border: 1px solid #00d97e55;
                border-radius: 8px;
                cursor: pointer;
                font-family: monospace;
                font-weight: bold;
                font-size: 12px;
                box-shadow: 0 2px 10px #00d97e22;
                transition: all 0.2s ease;
            `;

            btn.onmouseenter = () => {
                btn.style.transform = 'scale(1.05)';
                btn.style.borderColor = '#00d97e';
                btn.style.boxShadow = '0 2px 14px #00d97e44';
            };
            btn.onmouseleave = () => {
                btn.style.transform = 'scale(1)';
                btn.style.borderColor = '#00d97e55';
                btn.style.boxShadow = '0 2px 10px #00d97e22';
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
