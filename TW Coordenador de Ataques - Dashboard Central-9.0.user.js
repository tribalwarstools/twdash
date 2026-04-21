// ==UserScript==
// @name         TW Coordenador de Ataques - Dashboard Central
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  Coordene ataques múltiplos ou emparelhados 1:1 com VELOCIDADES REAIS DA API - Dashboard em aba separada
// @match        https://*.tribalwars.com.br/game.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const DASHBOARD_PARAM = 'twCoordenador=true';

    // ============================================
    // DETECTA MODO
    // ============================================
    if (window.location.href.includes(DASHBOARD_PARAM)) {
        renderizarDashboard();
    } else {
        const isAnyDashboard = window.location.href.includes('twDashboard=true') ||
                               window.location.href.includes('twAutoBuilder=true') ||
                               window.location.href.includes('twCunhagem=true') ||
                               window.location.href.includes('twAgendador=true') ||
                               window.location.href.includes('twCoordenador=true');
        if (!isAnyDashboard) {
            adicionarBotaoAbrirDashboard();
        }
    }

    // ============================================
    // BOTÃO NA ABA DO JOGO
    // ============================================
    function adicionarBotaoAbrirDashboard() {
        const btn = document.createElement('div');
        btn.innerHTML = '🗺️ COORDENADOR';
        btn.style.cssText = `
            position: fixed;
            top: 170px;
            right: 10px;
            z-index: 999999;
            padding: 8px 12px;
            background: #0a0a0a;
            color: #2980b9;
            border: 1px solid #2980b9;
            border-radius: 6px;
            cursor: pointer;
            font-family: monospace;
            font-weight: bold;
            font-size: 11px;
        `;
        btn.onclick = () => {
            window.open(window.location.href.split('?')[0] + '?' + DASHBOARD_PARAM, 'TWCoordenador');
        };
        document.body.appendChild(btn);
    }

    // ============================================
    // DASHBOARD PRINCIPAL
    // ============================================
    async function renderizarDashboard() {
        document.body.innerHTML = '';
        document.body.style.cssText = 'background:#0a0a0a; margin:0; padding:20px; font-family:"Segoe UI",Arial,sans-serif;';

        // ============================================
        // VELOCITY MANAGER - BUSCA VELOCIDADES REAIS DA API
        // ============================================

        const VelocityManager = {
            _cachedSpeeds: null,
            _worldInfo: null,
            _lastUpdate: null,

            async fetchRealSpeeds() {
                const world = location.hostname.split('.')[0];
                const apiUrl = `https://${world}.tribalwars.com.br/interface.php?func=get_unit_info`;

                try {
                    console.log(`[Velocity] 🔍 Buscando velocidades da API: ${apiUrl}`);

                    const response = await fetch(apiUrl, { credentials: 'same-origin' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const xmlText = await response.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

                    if (xmlDoc.querySelector('parsererror')) {
                        throw new Error('Erro ao parsear XML');
                    }

                    const speeds = {};
                    const units = ['spear', 'sword', 'axe', 'archer', 'spy',
                                  'light', 'marcher', 'heavy', 'ram', 'catapult',
                                  'knight', 'snob'];

                    units.forEach(unit => {
                        const unitElem = xmlDoc.querySelector(unit);
                        if (unitElem) {
                            const speedElem = unitElem.querySelector('speed');
                            if (speedElem) {
                                speeds[unit] = parseFloat(speedElem.textContent);
                            }
                        }
                    });

                    if (Object.keys(speeds).length === 0) {
                        throw new Error('Nenhuma velocidade encontrada no XML');
                    }

                    console.log(`[Velocity] ✅ Velocidades obtidas da API (${Object.keys(speeds).length} unidades)`);

                    this._cachedSpeeds = speeds;
                    this._worldInfo = {
                        world: world,
                        speeds: speeds,
                        lastUpdate: Date.now(),
                        source: 'API'
                    };
                    this._lastUpdate = Date.now();

                    this.saveToLocalStorage(speeds, world);
                    return speeds;

                } catch (error) {
                    console.error('[Velocity] ❌ Erro ao buscar da API:', error);

                    const cached = this.loadFromLocalStorage(world);
                    if (cached) {
                        console.log('[Velocity] 📦 Usando cache do localStorage');
                        this._cachedSpeeds = cached;
                        this._worldInfo = {
                            world: world,
                            speeds: cached,
                            lastUpdate: this._lastUpdate,
                            source: 'CACHE'
                        };
                        return cached;
                    }

                    console.log('[Velocity] ⚠️ Usando velocidades padrão (fallback)');
                    return this.getFallbackSpeeds();
                }
            },

            saveToLocalStorage(speeds, world) {
                try {
                    const cache = {
                        world: world,
                        speeds: speeds,
                        timestamp: Date.now()
                    };
                    localStorage.setItem('twc_velocity_cache', JSON.stringify(cache));
                } catch (e) {
                    console.warn('[Velocity] Erro ao salvar cache:', e);
                }
            },

            loadFromLocalStorage(world) {
                try {
                    const saved = localStorage.getItem('twc_velocity_cache');
                    if (saved) {
                        const cache = JSON.parse(saved);
                        if (cache.world === world && (Date.now() - cache.timestamp) < 86400000) {
                            return cache.speeds;
                        }
                    }
                } catch (e) {
                    console.warn('[Velocity] Erro ao carregar cache:', e);
                }
                return null;
            },

            getFallbackSpeeds() {
                return {
                    spear: 18, sword: 22, axe: 18, archer: 18, spy: 9,
                    light: 10, marcher: 10, heavy: 11, ram: 30, catapult: 30,
                    knight: 10, snob: 35
                };
            },

            async getVelocidades() {
                if (this._cachedSpeeds && this._lastUpdate && (Date.now() - this._lastUpdate) < 3600000) {
                    return this._cachedSpeeds;
                }
                return await this.fetchRealSpeeds();
            },

            getWorldInfo() {
                return this._worldInfo;
            },

            async forceRefresh() {
                this._cachedSpeeds = null;
                this._lastUpdate = null;
                return await this.fetchRealSpeeds();
            },

            getUnitSpeed(unit) {
                if (this._cachedSpeeds && this._cachedSpeeds[unit]) {
                    return this._cachedSpeeds[unit];
                }
                return this.getFallbackSpeeds()[unit] || 18;
            }
        };

        // ============================================
        // CONSTANTES
        // ============================================
        const UNIDADES = {
            spear: { nome: 'Lanceiro', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_spear.png' },
            sword: { nome: 'Espadachim', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_sword.png' },
            axe: { nome: 'Bárbaro', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_axe.png' },
            archer: { nome: 'Arqueiro', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_archer.png' },
            spy: { nome: 'Explorador', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_spy.png' },
            light: { nome: 'Cavalaria leve', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_light.png' },
            marcher: { nome: 'Arqueiro a cavalo', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_marcher.png' },
            heavy: { nome: 'Cavalaria pesada', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_heavy.png' },
            ram: { nome: 'Aríete', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_ram.png' },
            catapult: { nome: 'Catapulta', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_catapult.png' },
            knight: { nome: 'Paladino', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_knight.png' },
            snob: { nome: 'Nobre', icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_snob.png' }
        };
        const UNIDADES_IDS = Object.keys(UNIDADES);

        let velocidadesUnidades = {};
        let villageMap = {};
        let popupVelocidadesAtivo = false;

        // ============================================
        // FUNÇÕES AUXILIARES
        // ============================================
        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/[&<>]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
        }

        function validarCoordenada(coord) {
            const coordSanitizada = coord.replace(/\s+/g, '');
            return /^\d{1,3}\|\d{1,3}$/.test(coordSanitizada);
        }

        function sanitizarCoordenada(coord) {
            const coordSanitizada = coord.replace(/\s+/g, '');
            if (!validarCoordenada(coordSanitizada)) {
                throw new Error(`Coordenada inválida: ${coord}`);
            }
            return coordSanitizada;
        }

        function validarDataHora(dataHoraStr) {
            return /^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}:\d{2}$/.test(dataHoraStr);
        }

        function parseDataHora(dataHoraStr) {
            if (!validarDataHora(dataHoraStr)) {
                throw new Error(`Formato de data inválido: ${dataHoraStr}`);
            }
            const [data, tempo] = dataHoraStr.split(' ');
            const [dia, mes, ano] = data.split('/').map(Number);
            const [hora, minuto, segundo] = tempo.split(':').map(Number);
            const date = new Date(ano, mes - 1, dia, hora, minuto, segundo);
            if (isNaN(date.getTime())) {
                throw new Error(`Data inválida: ${dataHoraStr}`);
            }
            return date;
        }

        function formatarDataHora(data) {
            const dia = String(data.getDate()).padStart(2, '0');
            const mes = String(data.getMonth() + 1).padStart(2, '0');
            const ano = data.getFullYear();
            const hora = String(data.getHours()).padStart(2, '0');
            const minuto = String(data.getMinutes()).padStart(2, '0');
            const segundo = String(data.getSeconds()).padStart(2, '0');
            return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
        }

        function calcularDistancia(coord1, coord2) {
            const [x1, y1] = coord1.split('|').map(Number);
            const [x2, y2] = coord2.split('|').map(Number);
            const deltaX = Math.abs(x1 - x2);
            const deltaY = Math.abs(y1 - y2);
            return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        }

        function getUnidadeMaisLenta(tropas) {
            let unidadeMaisLenta = null;
            let maiorVelocidade = -1;

            for (const [unidade, quantidade] of Object.entries(tropas)) {
                if (quantidade > 0) {
                    const velocidade = velocidadesUnidades[unidade];
                    if (velocidade > maiorVelocidade) {
                        maiorVelocidade = velocidade;
                        unidadeMaisLenta = unidade;
                    }
                }
            }
            return unidadeMaisLenta;
        }

        function calcularTempoViagem(origem, destino, unidade, bonusSinal = 0) {
            const distancia = calcularDistancia(origem, destino);
            const velocidadeBase = velocidadesUnidades[unidade];
            const fatorBonus = 1 + (bonusSinal / 100);
            const tempoMinutos = distancia * velocidadeBase / fatorBonus;
            return tempoMinutos * 60000;
        }

        function calcularHorarioLancamento(origem, destino, horaChegada, tropas, bonusSinal = 0) {
            const unidadeMaisLenta = getUnidadeMaisLenta(tropas);
            if (!unidadeMaisLenta) return null;
            const tempoViagem = calcularTempoViagem(origem, destino, unidadeMaisLenta, bonusSinal);
            const chegadaDate = parseDataHora(horaChegada);
            const lancamentoDate = new Date(chegadaDate.getTime() - tempoViagem);
            return formatarDataHora(lancamentoDate);
        }

        function calcularHorarioChegada(origem, destino, horaLancamento, tropas, bonusSinal = 0) {
            const unidadeMaisLenta = getUnidadeMaisLenta(tropas);
            if (!unidadeMaisLenta) return null;
            const tempoViagem = calcularTempoViagem(origem, destino, unidadeMaisLenta, bonusSinal);
            const lancamentoDate = parseDataHora(horaLancamento);
            const chegadaDate = new Date(lancamentoDate.getTime() + tempoViagem);
            return formatarDataHora(chegadaDate);
        }

        function getTropas() {
            const tropas = {};
            UNIDADES_IDS.forEach(id => {
                const input = document.getElementById(`tropas_${id}`);
                tropas[id] = parseInt(input?.value || 0);
            });
            return tropas;
        }

        // ============================================
        // CARREGAR VILLAGE.TXT
        // ============================================
        async function loadVillageTxt() {
            try {
                const res = await fetch('/map/village.txt');
                if (!res.ok) throw new Error('Falha ao buscar village.txt');
                const text = await res.text();
                const map = {};
                for (const line of text.trim().split('\n')) {
                    const [id, name, x, y, playerId] = line.split(',');
                    map[`${x}|${y}`] = id;
                }
                villageMap = map;
                adicionarLog(`📋 Village.txt carregado: ${Object.keys(map).length} vilas`, 'info');
                return map;
            } catch (err) {
                adicionarLog(`❌ Erro ao carregar village.txt: ${err.message}`, 'err');
                return {};
            }
        }

        // ============================================
        // CONFIGURAÇÕES (localStorage)
        // ============================================
        const STORAGE_KEY = 'twc_coordenador_config';

        function salvarConfiguracao(config) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
            } catch (e) {
                console.error('[TWC] Erro ao salvar:', e);
            }
        }

        function carregarConfiguracao() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) return JSON.parse(saved);
            } catch (e) {
                console.error('[TWC] Erro ao carregar:', e);
            }
            return null;
        }

        // ============================================
        // GERAÇÃO DE BBCODE
        // ============================================

        // MODO MÚLTIPLO: Produto cartesiano (todas combinações)
        async function gerarBBCodeMultiplo() {
            try {
                const destinosRaw = document.getElementById('twc_destinos').value.trim();
                const origensRaw = document.getElementById('twc_origens').value.trim();
                const tipoCalculo = document.getElementById('twc_tipoCalculo').value;
                const bonusSinal = parseInt(document.getElementById('twc_bonusSinal').value) || 0;
                const incrementarSegundos = document.getElementById('twc_incrementarSegundos').checked;
                const valorIncremento = parseInt(document.getElementById('twc_valorIncremento').value) || 5;
                const ordenacao = document.getElementById('twc_ordenacao').value;
                const tropas = getTropas();

                if (!destinosRaw || !origensRaw) {
                    adicionarLog('❌ Informe origens e destinos!', 'err');
                    return;
                }

                const destinos = destinosRaw.split(/\s+/).map(sanitizarCoordenada).filter(Boolean);
                const origens = origensRaw.split(/\s+/).map(sanitizarCoordenada).filter(Boolean);

                const unidadeMaisLenta = getUnidadeMaisLenta(tropas);
                if (!unidadeMaisLenta) {
                    adicionarLog('❌ Selecione pelo menos uma tropa!', 'err');
                    return;
                }

                let horaBase = tipoCalculo === 'chegada'
                    ? document.getElementById('twc_horaChegada').value.trim()
                    : document.getElementById('twc_horaLancamento').value.trim();

                if (!horaBase || !validarDataHora(horaBase)) {
                    adicionarLog('❌ Informe uma data/hora válida!', 'err');
                    return;
                }

                const combinacoes = [];
                for (const o of origens) {
                    const vid = villageMap[o];
                    if (!vid) continue;
                    const [x, y] = o.split('|');

                    for (const d of destinos) {
                        let horaLancamento, horaChegada;

                        if (tipoCalculo === 'chegada') {
                            horaLancamento = calcularHorarioLancamento(o, d, horaBase, tropas, bonusSinal);
                            horaChegada = horaBase;
                        } else {
                            horaLancamento = horaBase;
                            horaChegada = calcularHorarioChegada(o, d, horaBase, tropas, bonusSinal);
                        }

                        combinacoes.push({
                            origem: o, destino: d, horaLancamento, horaChegada,
                            distancia: calcularDistancia(o, d),
                            timestampLancamento: parseDataHora(horaLancamento).getTime(),
                            timestampChegada: parseDataHora(horaChegada).getTime(),
                            vid, x, y
                        });
                    }
                }

                if (combinacoes.length === 0) {
                    adicionarLog('❌ Nenhuma combinação válida!', 'err');
                    return;
                }

                switch(ordenacao) {
                    case 'lancamento': combinacoes.sort((a, b) => a.timestampLancamento - b.timestampLancamento); break;
                    case 'chegada': combinacoes.sort((a, b) => a.timestampChegada - b.timestampChegada); break;
                    case 'distancia': combinacoes.sort((a, b) => a.distancia - b.distancia); break;
                }

                if (incrementarSegundos) {
                    let segundoIncremento = 0;
                    combinacoes.forEach((comb, index) => {
                        if (index > 0) {
                            segundoIncremento += valorIncremento;
                            const lancamentoDate = parseDataHora(comb.horaLancamento);
                            const chegadaDate = parseDataHora(comb.horaChegada);
                            lancamentoDate.setSeconds(lancamentoDate.getSeconds() + segundoIncremento);
                            chegadaDate.setSeconds(chegadaDate.getSeconds() + segundoIncremento);
                            comb.horaLancamento = formatarDataHora(lancamentoDate);
                            comb.horaChegada = formatarDataHora(chegadaDate);
                        }
                    });
                }

                let out = `[table][**]Unidade[||]Origem[||]Destino[||]Lançamento[||]Chegada[||]Enviar[/**]\n`;
                for (const comb of combinacoes) {
                    const qs = UNIDADES_IDS.map(id => `att_${id}=${tropas[id] || 0}`).join('&');
                    const link = `https://${location.host}/game.php?village=${comb.vid}&screen=place&x=${comb.x}&y=${comb.y}&${qs}`;
                    out += `[*][unit]${unidadeMaisLenta}[/unit] [|] ${comb.origem} [|] ${comb.destino} [|] ${comb.horaLancamento} [|] ${comb.horaChegada} [|] [url=${link}]ENVIAR[/url]\n`;
                }
                out += `[/table]`;

                document.getElementById('twc_saida').value = out;
                adicionarLog(`✅ ${combinacoes.length} ataque(s) gerado(s) (Modo Múltiplo)!`, 'ok');

            } catch (error) {
                adicionarLog(`❌ Erro: ${error.message}`, 'err');
            }
        }

        // MODO SIMPLES: Emparelhamento 1:1
        async function gerarBBCodeSimples() {
            try {
                const destinosRaw = document.getElementById('twc_destinos').value.trim();
                const origensRaw = document.getElementById('twc_origens').value.trim();
                const tipoCalculo = document.getElementById('twc_tipoCalculo').value;
                const bonusSinal = parseInt(document.getElementById('twc_bonusSinal').value) || 0;
                const incrementarSegundos = document.getElementById('twc_incrementarSegundos').checked;
                const valorIncremento = parseInt(document.getElementById('twc_valorIncremento').value) || 5;
                const tropas = getTropas();

                if (!destinosRaw || !origensRaw) {
                    adicionarLog('❌ Informe origens e destinos!', 'err');
                    return;
                }

                const origens = origensRaw.split(/\s+/).map(sanitizarCoordenada).filter(Boolean);
                const destinos = destinosRaw.split(/\s+/).map(sanitizarCoordenada).filter(Boolean);

                if (origens.length === 0 || destinos.length === 0) {
                    adicionarLog('❌ Nenhuma coordenada válida!', 'err');
                    return;
                }

                const unidadeMaisLenta = getUnidadeMaisLenta(tropas);
                if (!unidadeMaisLenta) {
                    adicionarLog('❌ Selecione pelo menos uma tropa!', 'err');
                    return;
                }

                let horaBase = tipoCalculo === 'chegada'
                    ? document.getElementById('twc_horaChegada').value.trim()
                    : document.getElementById('twc_horaLancamento').value.trim();

                if (!horaBase || !validarDataHora(horaBase)) {
                    adicionarLog('❌ Informe uma data/hora válida!', 'err');
                    return;
                }

                const quantidadePares = Math.min(origens.length, destinos.length);
                const combinacoes = [];

                for (let i = 0; i < quantidadePares; i++) {
                    const origem = origens[i];
                    const destino = destinos[i];

                    const vid = villageMap[origem];
                    if (!vid) {
                        adicionarLog(`⚠️ Vila origem ${origem} não encontrada no village.txt`, 'warn');
                        continue;
                    }
                    const [x, y] = origem.split('|');

                    let horaLancamento, horaChegada;

                    if (tipoCalculo === 'chegada') {
                        horaLancamento = calcularHorarioLancamento(origem, destino, horaBase, tropas, bonusSinal);
                        horaChegada = horaBase;
                    } else {
                        horaLancamento = horaBase;
                        horaChegada = calcularHorarioChegada(origem, destino, horaBase, tropas, bonusSinal);
                    }

                    combinacoes.push({
                        origem, destino, horaLancamento, horaChegada,
                        distancia: calcularDistancia(origem, destino),
                        vid, x, y
                    });
                }

                if (combinacoes.length === 0) {
                    adicionarLog('❌ Nenhum par válido!', 'err');
                    return;
                }

                if (incrementarSegundos) {
                    let segundoIncremento = 0;
                    combinacoes.forEach((comb, index) => {
                        if (index > 0) {
                            segundoIncremento += valorIncremento;
                            const lancamentoDate = parseDataHora(comb.horaLancamento);
                            const chegadaDate = parseDataHora(comb.horaChegada);
                            lancamentoDate.setSeconds(lancamentoDate.getSeconds() + segundoIncremento);
                            chegadaDate.setSeconds(chegadaDate.getSeconds() + segundoIncremento);
                            comb.horaLancamento = formatarDataHora(lancamentoDate);
                            comb.horaChegada = formatarDataHora(chegadaDate);
                        }
                    });
                }

                let out = `[table][**]Unidade[||]Origem[||]Destino[||]Lançamento[||]Chegada[||]Enviar[/**]\n`;
                for (const comb of combinacoes) {
                    const qs = UNIDADES_IDS.map(id => `att_${id}=${tropas[id] || 0}`).join('&');
                    const link = `https://${location.host}/game.php?village=${comb.vid}&screen=place&x=${comb.x}&y=${comb.y}&${qs}`;
                    out += `[*][unit]${unidadeMaisLenta}[/unit] [|] ${comb.origem} [|] ${comb.destino} [|] ${comb.horaLancamento} [|] ${comb.horaChegada} [|] [url=${link}]ENVIAR[/url]\n`;
                }
                out += `[/table]`;

                document.getElementById('twc_saida').value = out;
                adicionarLog(`✅ ${combinacoes.length} ataque(s) gerado(s) (Modo Simples - emparelhamento 1:1)!`, 'ok');

            } catch (error) {
                adicionarLog(`❌ Erro: ${error.message}`, 'err');
            }
        }

        // ============================================
        // POPUP DE VELOCIDADES
        // ============================================
        function mostrarPopupVelocidades() {
            if (popupVelocidadesAtivo) return;

            const worldInfo = VelocityManager.getWorldInfo();
            const mundo = worldInfo ? worldInfo.world : (location.hostname.split('.')[0] || 'desconhecido');
            const fonte = worldInfo ? (worldInfo.source === 'API' ? '✅ API DO JOGO' : '📦 CACHE LOCAL') : '⚙️ PADRÃO';
            const ultimaAtualizacao = worldInfo && worldInfo.lastUpdate ? new Date(worldInfo.lastUpdate).toLocaleString() : 'nunca';

            const fader = document.createElement('div');
            fader.id = 'twc-velocidades-fader';
            fader.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.85);
                z-index: 1000000;
                display: flex;
                justify-content: center;
                align-items: center;
            `;

            const popup = document.createElement('div');
            popup.style.cssText = `
                background: #1e1e1e;
                border: 2px solid #2980b9;
                border-radius: 10px;
                width: 450px;
                max-width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 5px 25px rgba(0,0,0,0.5);
            `;

            let velocidadesHtml = '';
            for (const [id, data] of Object.entries(UNIDADES)) {
                const velocidade = velocidadesUnidades[id] || '?';
                velocidadesHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #333;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <img src="${data.icon}" style="width: 24px; height: 24px;">
                            <span style="color: #2980b9; font-weight: bold;">${data.nome}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: #fff; font-weight: bold; min-width: 50px; text-align: center;">${velocidade}</span>
                            <span style="color: #aaa; font-size: 11px;">min/campo</span>
                        </div>
                    </div>
                `;
            }

            popup.innerHTML = `
                <div style="padding: 15px; border-bottom: 1px solid #2980b9; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #2980b9;">⚙️ Velocidades das Unidades</h3>
                    <button id="twc-fechar-velocidades" style="background: #990000; color: white; border: none; padding: 5px 12px; border-radius: 5px; cursor: pointer;">✕</button>
                </div>
                <div style="padding: 10px; background: #252525; margin: 10px; border-radius: 5px;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px;">
                        <span>🌍 Mundo: <strong>${mundo}</strong></span>
                        <span>📡 Fonte: ${fonte}</span>
                    </div>
                    <div style="font-size: 10px; color: #666; margin-top: 5px;">
                        🕐 Última atualização: ${ultimaAtualizacao}
                    </div>
                </div>
                <div style="padding: 10px;">
                    ${velocidadesHtml}
                </div>
                <div style="padding: 15px; border-top: 1px solid #333; display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="twc-vel-detectar" style="background: #2980b9; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer;">🔍 Buscar do Jogo</button>
                    <button id="twc-vel-fechar" style="background: #2980b9; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold;">Fechar</button>
                </div>
            `;

            fader.appendChild(popup);
            document.body.appendChild(fader);
            popupVelocidadesAtivo = true;

            fader.addEventListener('click', (e) => {
                if (e.target === fader) fecharPopupVelocidades();
            });

            document.getElementById('twc-fechar-velocidades').addEventListener('click', fecharPopupVelocidades);
            document.getElementById('twc-vel-fechar').addEventListener('click', fecharPopupVelocidades);

            document.getElementById('twc-vel-detectar').addEventListener('click', async () => {
                adicionarLog('🔍 Buscando velocidades do jogo...', 'info');
                const novasVelocidades = await VelocityManager.forceRefresh();
                if (novasVelocidades) {
                    for (const [id, vel] of Object.entries(novasVelocidades)) {
                        if (velocidadesUnidades[id] !== undefined) {
                            velocidadesUnidades[id] = vel;
                        }
                    }
                    adicionarLog(`✅ Velocidades atualizadas do mundo ${mundo}!`, 'ok');
                    fecharPopupVelocidades();
                    setTimeout(() => mostrarPopupVelocidades(), 100);
                } else {
                    adicionarLog('❌ Não foi possível buscar velocidades do jogo', 'err');
                }
            });
        }

        function fecharPopupVelocidades() {
            const fader = document.getElementById('twc-velocidades-fader');
            if (fader) fader.remove();
            popupVelocidadesAtivo = false;
        }

        // ============================================
        // CONFIGURAÇÕES SALVAS
        // ============================================
        function salvarConfiguracoesAtuais() {
            const config = {
                destinos: document.getElementById('twc_destinos').value,
                origens: document.getElementById('twc_origens').value,
                tipoCalculo: document.getElementById('twc_tipoCalculo').value,
                bonusSinal: document.getElementById('twc_bonusSinal').value,
                ordenacao: document.getElementById('twc_ordenacao').value,
                horaChegada: document.getElementById('twc_horaChegada').value,
                horaLancamento: document.getElementById('twc_horaLancamento').value,
                incrementarSegundos: document.getElementById('twc_incrementarSegundos').checked,
                valorIncremento: document.getElementById('twc_valorIncremento').value,
                tropas: getTropas()
            };
            salvarConfiguracao(config);
            adicionarLog('✅ Configurações salvas!', 'ok');
        }

        function carregarConfiguracoesSalvas() {
            const config = carregarConfiguracao();
            if (!config) return;

            if (config.destinos) document.getElementById('twc_destinos').value = config.destinos;
            if (config.origens) document.getElementById('twc_origens').value = config.origens;
            if (config.tipoCalculo) document.getElementById('twc_tipoCalculo').value = config.tipoCalculo;
            if (config.bonusSinal) document.getElementById('twc_bonusSinal').value = config.bonusSinal;
            if (config.ordenacao) document.getElementById('twc_ordenacao').value = config.ordenacao;
            if (config.horaChegada) document.getElementById('twc_horaChegada').value = config.horaChegada;
            if (config.horaLancamento) document.getElementById('twc_horaLancamento').value = config.horaLancamento;
            if (config.incrementarSegundos !== undefined) {
                document.getElementById('twc_incrementarSegundos').checked = config.incrementarSegundos;
            }
            if (config.valorIncremento) document.getElementById('twc_valorIncremento').value = config.valorIncremento;

            if (config.tropas) {
                for (const [id, valor] of Object.entries(config.tropas)) {
                    const input = document.getElementById(`tropas_${id}`);
                    if (input) input.value = valor;
                }
            }

            document.getElementById('twc_tipoCalculo').dispatchEvent(new Event('change'));
            adicionarLog('📂 Configurações carregadas!', 'info');
        }

        // ============================================
        // LOG
        // ============================================
        let adicionarLog = (msg, tipo) => console.log(`[TWC][${tipo}] ${msg}`);

        // ============================================
        // RENDERIZA O DASHBOARD
        // ============================================

        // Inicializar Velocity Manager
        adicionarLog = (msg, tipo) => console.log(`[TWC][${tipo}] ${msg}`);
        adicionarLog('🔍 Buscando velocidades do mundo...', 'info');

        const velocidadesReais = await VelocityManager.getVelocidades();
        if (velocidadesReais) {
            for (const [id, vel] of Object.entries(velocidadesReais)) {
                if (UNIDADES[id]) {
                    velocidadesUnidades[id] = vel;
                }
            }
            const worldInfo = VelocityManager.getWorldInfo();
            adicionarLog(`✅ Velocidades carregadas do mundo ${worldInfo.world}! (${worldInfo.source})`, 'ok');
        } else {
            for (const [id, data] of Object.entries(UNIDADES)) {
                velocidadesUnidades[id] = 18;
            }
            adicionarLog('⚠️ Usando velocidades padrão (fallback)', 'warn');
        }

        await loadVillageTxt();

        const tropasGridHtml = UNIDADES_IDS.map(id => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;padding:5px 8px;border-radius:4px;">
                <span style="font-size:11px;color:#2980b9;display:flex;align-items:center;gap:5px;">
                    <img src="${UNIDADES[id].icon}" style="width:16px;height:16px;"> ${UNIDADES[id].nome}
                </span>
                <input type="number" id="tropas_${id}" value="0" min="0" step="1" style="width:70px;padding:3px;background:#0a0a0a;border:1px solid #444;color:#fff;border-radius:3px;text-align:center;">
            </div>
        `).join('');

        document.body.innerHTML = `
            <div style="display:flex; gap:20px; max-width:1600px; margin:0 auto; min-height:calc(100vh - 40px);">

                <!-- COLUNA PRINCIPAL (ESQUERDA) -->
                <div style="flex:3;">
                    <h1 style="color:#2980b9; margin:0 0 20px; border-bottom:1px solid #2980b9; padding-bottom:10px;">🗺️ Coordenador de Ataques — Dashboard</h1>

                    <!-- Cards de estatísticas -->
                    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px;">
                        <div style="background:#111; border:1px solid #2980b933; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#2980b9;" id="totalCombinacoes">0</div>
                            <div style="font-size:10px; color:#2980b988;">Combinações</div>
                        </div>
                        <div style="background:#111; border:1px solid #2980b933; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:20px; font-weight:bold; color:#2980b9;" id="unidadeMaisLenta">-</div>
                            <div style="font-size:10px; color:#2980b988;">Unidade mais lenta</div>
                        </div>
                        <div style="background:#111; border:1px solid #2980b933; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:20px; font-weight:bold; color:#2980b9;" id="fonteVelocidades">${VelocityManager.getWorldInfo()?.source || 'API'}</div>
                            <div style="font-size:10px; color:#2980b988;">Fonte velocidades</div>
                        </div>
                        <div style="background:#111; border:1px solid #2980b933; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:20px; font-weight:bold; color:#2980b9;" id="vilasCount">${Object.keys(villageMap).length}</div>
                            <div style="font-size:10px; color:#2980b988;">Vilas no mapa</div>
                        </div>
                    </div>

                    <!-- Formulário -->
                    <div style="background:#111; border:1px solid #333; border-radius:10px; padding:15px; margin-bottom:20px;">
                        <div style="color:#2980b9; font-weight:bold; margin-bottom:12px; font-size:12px;">📝 Configuração dos Ataques</div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">🏠 Vilas Origem</label>
                                <input type="text" id="twc_origens" placeholder="Ex: 500|500 501|501" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                                <div style="font-size:9px; color:#555; margin-top:3px;">Coordenadas separadas por espaço</div>
                            </div>
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">🎯 Vilas Destino</label>
                                <input type="text" id="twc_destinos" placeholder="Ex: 510|510 511|511" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                                <div style="font-size:9px; color:#555; margin-top:3px;">Coordenadas separadas por espaço</div>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">📅 Tipo de Cálculo</label>
                                <select id="twc_tipoCalculo" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                                    <option value="chegada">Por Hora de Chegada</option>
                                    <option value="lancamento">Por Hora de Lançamento</option>
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">📈 Bônus Sinal (%)</label>
                                <input type="number" id="twc_bonusSinal" value="0" min="0" max="100" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                            </div>
                        </div>

                        <div id="twc_campoChegada" style="margin-bottom:10px;">
                            <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">⏰ Hora de Chegada</label>
                            <input type="text" id="twc_horaChegada" placeholder="DD/MM/AAAA HH:MM:SS" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                        </div>

                        <div id="twc_campoLancamento" style="display:none; margin-bottom:10px;">
                            <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">🚀 Hora de Lançamento</label>
                            <input type="text" id="twc_horaLancamento" placeholder="DD/MM/AAAA HH:MM:SS" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">🔀 Ordenação (Múltiplo)</label>
                                <select id="twc_ordenacao" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                                    <option value="digitacao">Por Ordem de Digitação</option>
                                    <option value="lancamento">Por Horário de Lançamento</option>
                                    <option value="chegada">Por Horário de Chegada</option>
                                    <option value="distancia">Por Distância</option>
                                </select>
                            </div>
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">⏱️ Incrementar por ataque</label>
                                <div style="display:flex; gap:5px;">
                                    <input type="checkbox" id="twc_incrementarSegundos" style="width:20px;">
                                    <input type="number" id="twc_valorIncremento" value="5" min="1" max="60" style="flex:1; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                                    <span style="font-size:11px; color:#888;">segundos</span>
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom:10px;">
                            <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">⚔️ Tropas</label>
                            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; background:#0a0a0a; padding:8px; border-radius:6px; max-height:200px; overflow-y:auto;">
                                ${tropasGridHtml}
                            </div>
                        </div>

                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                            <button id="twc_limparTropas" style="padding:6px 12px; background:#990000; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:11px;">🗑️ Limpar Tropas</button>
                            <button id="twc_velocidadesBtn" style="padding:6px 12px; background:#2980b9; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:11px;">⚙️ Velocidades</button>
                        </div>

                        <hr style="border-color:#333; margin:10px 0;">

                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                            <button id="twc_gerarMultiploBtn" style="padding:8px 16px; background:#2980b9; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">🌐 Gerar BBCode (Múltiplo)</button>
                            <button id="twc_gerarSimplesBtn" style="padding:8px 16px; background:#27ae60; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">🎯 Gerar BBCode (Simples 1:1)</button>
                            <button id="twc_copiarBtn" style="padding:8px 16px; background:#f39c12; color:#000; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">📄 Copiar</button>
                            <button id="twc_salvarBtn" style="padding:8px 16px; background:#8e44ad; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">💾 Salvar Config</button>
                        </div>

                        <div>
                            <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">📊 Resultado (BBCode)</label>
                            <textarea id="twc_saida" rows="8" placeholder="O BBCode gerado aparecerá aqui..." style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px; font-family:monospace; font-size:11px; resize:vertical;"></textarea>
                        </div>
                    </div>
                </div>

                <!-- COLUNA DO LOG (DIREITA) -->
                <div style="flex:1; background:#0a0a0a; border-left:1px solid #2980b933; padding-left:20px; min-width:220px;">
                    <h3 style="color:#2980b9; font-size:13px; margin:0 0 12px;">📝 Log de Atividades</h3>
                    <div id="log-area" style="height:calc(100vh - 80px); overflow-y:auto; font-family:monospace;"></div>
                </div>

            </div>
        `;

        // Sobrescrever adicionarLog
        adicionarLog = (msg, tipo) => {
            const log = document.getElementById('log-area');
            if (!log) return;
            const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const cores = { ok: '#22a55a', err: '#e24b4a', warn: '#ff8800', info: '#888' };
            const cor = cores[tipo] || '#888';
            if (log.children.length === 1 && log.children[0].innerText?.includes('Coordenador')) log.innerHTML = '';
            const entry = document.createElement('div');
            entry.style.cssText = 'display:flex;gap:8px;font-size:10px;margin-bottom:2px;';
            entry.innerHTML = `<span style="color:#555;flex-shrink:0;">${t}</span><span style="color:${cor};">${msg}</span>`;
            log.appendChild(entry);
            log.scrollTop = log.scrollHeight;
            while (log.children.length > 200) log.removeChild(log.children[0]);
        };

        // Atualizar card da unidade mais lenta
        function atualizarUnidadeMaisLenta() {
            const tropas = getTropas();
            const unidade = getUnidadeMaisLenta(tropas);
            const el = document.getElementById('unidadeMaisLenta');
            if (el && unidade && UNIDADES[unidade]) {
                el.textContent = UNIDADES[unidade].nome;
                el.style.color = '#ff9900';
            } else if (el) {
                el.textContent = 'Nenhuma';
            }
        }

        // Adicionar event listeners para tropas
        UNIDADES_IDS.forEach(id => {
            const input = document.getElementById(`tropas_${id}`);
            if (input) {
                input.addEventListener('input', atualizarUnidadeMaisLenta);
            }
        });

        // Eventos
        document.getElementById('twc_tipoCalculo').addEventListener('change', (e) => {
            const isChegada = e.target.value === 'chegada';
            document.getElementById('twc_campoChegada').style.display = isChegada ? 'block' : 'none';
            document.getElementById('twc_campoLancamento').style.display = isChegada ? 'none' : 'block';
        });

        document.getElementById('twc_limparTropas').addEventListener('click', () => {
            UNIDADES_IDS.forEach(id => {
                const input = document.getElementById(`tropas_${id}`);
                if (input) input.value = '0';
            });
            atualizarUnidadeMaisLenta();
            adicionarLog('✅ Tropas limpas!', 'ok');
        });

        document.getElementById('twc_velocidadesBtn').addEventListener('click', mostrarPopupVelocidades);
        document.getElementById('twc_gerarMultiploBtn').addEventListener('click', gerarBBCodeMultiplo);
        document.getElementById('twc_gerarSimplesBtn').addEventListener('click', gerarBBCodeSimples);
        document.getElementById('twc_copiarBtn').addEventListener('click', () => {
            const saida = document.getElementById('twc_saida');
            if (!saida.value.trim()) {
                adicionarLog('❌ Nada para copiar!', 'err');
                return;
            }
            saida.select();
            navigator.clipboard.writeText(saida.value).then(() => {
                adicionarLog('✅ BBCode copiado!', 'ok');
            }).catch(() => {
                document.execCommand('copy');
                adicionarLog('✅ BBCode copiado!', 'ok');
            });
        });
        document.getElementById('twc_salvarBtn').addEventListener('click', salvarConfiguracoesAtuais);

        // Carregar configurações salvas
        carregarConfiguracoesSalvas();
        atualizarUnidadeMaisLenta();

        // Atualizar vilas count
        const vilasCountEl = document.getElementById('vilasCount');
        if (vilasCountEl) vilasCountEl.textContent = Object.keys(villageMap).length;

        // Atualizar fonte velocidades
        const fonteEl = document.getElementById('fonteVelocidades');
        if (fonteEl) {
            const worldInfo = VelocityManager.getWorldInfo();
            fonteEl.textContent = worldInfo?.source === 'API' ? '✅ API' : (worldInfo?.source === 'CACHE' ? '📦 CACHE' : '⚙️ PADRÃO');
        }

        adicionarLog('✅ Dashboard Coordenador inicializado!', 'ok');
        adicionarLog(`📋 ${Object.keys(villageMap).length} vilas carregadas`, 'info');
        adicionarLog(`⚙️ Velocidades: ${VelocityManager.getWorldInfo()?.source || 'API'}`, 'info');
    }
})();