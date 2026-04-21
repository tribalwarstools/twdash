// ==UserScript==
// @name         TW Resource Balancer Dashboard v3.8
// @version      3.8
// @description  Balanceador de recursos com proteção anti-esgotamento, reserva mínima e marcação de origem - CORRIGIDO
// @match        https://*.tribalwars.com.br/game.php*
// @require      https://tribalwarstools.github.io/twscripts/tw-ui-kit.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Verifica se o UI Kit foi carregado
    if (typeof window.TWUI === 'undefined') {
        console.warn('TW UI Kit não carregado, usando fallback manual');
        window.TWUI = {
            colors: {
                primary: '#00d97e',
                success: '#00d97e',
                error: '#f85149',
                warning: '#d29922',
                info: '#388bfd',
                dark: '#080c10',
                darker: '#0d1117',
                text: '#c9d1d9',
                textDim: '#8b949e'
            },
            formatNumber: (n) => n?.toLocaleString() || '0',
            showNotification: (msg, type) => console.log(`[${type}] ${msg}`)
        };
    }

    const TWResourceBalancer = {
        DASHBOARD_PARAM: 'twBalancer=true',
        STORAGE_KEY: 'tw_balancer_v3',

        villagesData: [],
        cacheVillages: [],
        loadingProgress: 0,
        carregando: false,
        enviando: false,

        config: {
            toleranciaPercentual: 5,
            minEnvio: 1000,
            bufferPercentual: 10,
            reservaMinimaPercentual: 30,
            delayEntreLotes: 800,
            maxLogEntries: 250
        },

        totalWood: 0,
        totalStone: 0,
        totalIron: 0,
        mediaWood: 0,
        mediaStone: 0,
        mediaIron: 0,

        usedOriginsInCycle: new Set(),
        usedDestinationsInCycle: new Set(),

        CORES: {
            fundo: '#080c10',
            fundoCard: '#0d1117',
            fundoTabela: '#0b0f14',
            verde: '#00d97e',
            verdeEscuro: '#001a0e',
            verdeClaro: '#33ffaa',
            verdeDim: '#00d97e22',
            texto: '#c9d1d9',
            textoDim: '#8b949e',
            borda: '#21262d',
            bordaVerde: '#00d97e33',
            erro: '#f85149',
            erroDim: '#f8514922',
            aviso: '#d29922',
            avisoDim: '#d2992222',
            info: '#388bfd',
            infoDim: '#388bfd22',
            madeira: '#8b6914',
            pedra: '#607080',
            ferro: '#5a8a9f'
        },

        // ─────────────────────────────────────────────────────────────
        // INICIALIZAÇÃO
        // ─────────────────────────────────────────────────────────────

        init() {
            console.log('⚖️ TW Resource Balancer v3.8 - Inicializando...');
            if (window.location.href.includes(this.DASHBOARD_PARAM)) {
                this.renderizarDashboard();
            } else {
                this.adicionarBotaoAbrirDashboard();
            }
        },

        adicionarBotaoAbrirDashboard() {
            if (!document.body) {
                setTimeout(() => this.adicionarBotaoAbrirDashboard(), 100);
                return;
            }
            if (document.getElementById('tw-balancer-btn')) return;

            const btn = document.createElement('div');
            btn.id = 'tw-balancer-btn';
            btn.innerHTML = '⚖️ Resource Balancer v3.8';
            Object.assign(btn.style, {
                position: 'fixed',
                top: '80px',
                right: '10px',
                zIndex: '999999',
                padding: '7px 13px',
                background: this.CORES.fundo,
                color: this.CORES.verde,
                border: `1px solid ${this.CORES.verde}55`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                fontSize: '11px',
                boxShadow: '0 2px 10px #00d97e15',
                transition: 'all 0.2s ease'
            });
            btn.onmouseenter = () => {
                btn.style.borderColor = this.CORES.verde;
                btn.style.boxShadow = '0 2px 14px #00d97e44';
            };
            btn.onmouseleave = () => {
                btn.style.borderColor = `${this.CORES.verde}55`;
                btn.style.boxShadow = '0 2px 10px #00d97e15';
            };
            btn.onclick = () => {
                const url = window.location.href.split('?')[0] + '?' + this.DASHBOARD_PARAM;
                window.open(url, 'TWBalancer');
            };
            document.body.appendChild(btn);
        },

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        // ─────────────────────────────────────────────────────────────
        // LOG
        // ─────────────────────────────────────────────────────────────

        adicionarLog(msg, tipo) {
            const logArea = document.getElementById('tw-log-area');
            if (!logArea) return;

            const time = new Date().toLocaleTimeString();
            const cores = {
                success: this.CORES.verde,
                error: this.CORES.erro,
                warning: this.CORES.aviso,
                info: this.CORES.info
            };
            const icones = {
                success: '●',
                error: '●',
                warning: '●',
                info: '●'
            };
            const cor = cores[tipo] || this.CORES.textoDim;
            const icone = icones[tipo] || '○';

            const entry = document.createElement('div');
            entry.style.cssText = `
                padding: 5px 0;
                border-bottom: 1px solid ${this.CORES.borda};
                font-size: 11px;
                font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
                display: flex;
                gap: 8px;
                align-items: baseline;
            `;
            entry.innerHTML = `
                <span style="color:${cor}; flex-shrink:0;">${icone}</span>
                <span style="color:${this.CORES.textoDim}; flex-shrink:0;">${time}</span>
                <span style="color:${cor};">${msg}</span>
            `;
            logArea.insertBefore(entry, logArea.firstChild);

            while (logArea.children.length > this.config.maxLogEntries) {
                logArea.removeChild(logArea.lastChild);
            }
        },

        // ─────────────────────────────────────────────────────────────
        // CONFIGURAÇÃO
        // ─────────────────────────────────────────────────────────────

        salvarConfig() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
        },

        carregarConfig() {
            const salvo = localStorage.getItem(this.STORAGE_KEY);
            if (salvo) {
                try {
                    this.config = { ...this.config, ...JSON.parse(salvo) };
                } catch (e) {
                    console.warn('Config inválida no localStorage, usando padrão.');
                }
            }
        },

        // ─────────────────────────────────────────────────────────────
        // OBTÉM ID DO JOGADOR DE MÚLTIPLAS FONTES
        // ─────────────────────────────────────────────────────────────

        async obterIdJogador() {
            // 1. window.game_data (padrão)
            if (window.game_data?.player?.id) {
                return window.game_data.player.id;
            }

            // 2. Variável global do Tribal Wars
            if (window.TribalWars?.getPlayerId) {
                try {
                    return window.TribalWars.getPlayerId();
                } catch(e) {}
            }

            // 3. Busca no HTML da página atual
            try {
                const response = await fetch(window.location.href, { credentials: 'same-origin' });
                const html = await response.text();

                const patterns = [
                    /player_id["']?\s*[=:]\s*["']?(\d+)/i,
                    /"player_id":(\d+)/i,
                    /player=(\d+)/i,
                    /id=(\d+).*?player/i
                ];

                for (const pattern of patterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        return parseInt(match[1]);
                    }
                }
            } catch(e) {}

            // 4. Busca na lista de aldeias primeiro
            try {
                const response = await fetch('/map/village.txt', { credentials: 'same-origin' });
                const dados = await response.text();
                const linhas = dados.trim().split('\n');

                if (linhas.length > 0) {
                    const primeiraAldeia = linhas[0].split(',');
                    if (primeiraAldeia[4]) {
                        return parseInt(primeiraAldeia[4]);
                    }
                }
            } catch(e) {}

            return null;
        },

        // ─────────────────────────────────────────────────────────────
        // OBTER ALDEIAS DO JOGADOR
        // ─────────────────────────────────────────────────────────────

        async obterTodasAldeias(forcarRecarga = false) {
            if (!forcarRecarga && this.cacheVillages.length > 0) {
                return this.cacheVillages;
            }

            const meuId = await this.obterIdJogador();

            if (!meuId) {
                this.adicionarLog('❌ Não foi possível obter o ID do jogador. Você está logado?', 'error');
                return [];
            }

            this.adicionarLog(`✅ ID do jogador detectado: ${meuId}`, 'success');

            try {
                const response = await fetch('/map/village.txt', { credentials: 'same-origin' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const dados = await response.text();

                if (!dados || dados.trim() === '') {
                    this.adicionarLog('❌ Lista de aldeias vazia.', 'error');
                    return [];
                }

                const todasAldeias = dados.trim().split('\n')
                    .map(line => {
                        const [id, name, x, y, player, points] = line.split(',');
                        return {
                            id: parseInt(id),
                            nome: decodeURIComponent(name?.replace(/\+/g, ' ') || 'Desconhecida'),
                            coord: `${x}|${y}`,
                            player: parseInt(player),
                            pontos: parseInt(points) || 0
                        };
                    });

                this.cacheVillages = todasAldeias.filter(v => v.player === meuId);

                if (this.cacheVillages.length === 0) {
                    this.adicionarLog(`⚠️ Nenhuma aldeia encontrada para o jogador ${meuId}.`, 'warning');
                }

                return this.cacheVillages;
            } catch (err) {
                this.adicionarLog(`❌ Erro ao carregar lista de aldeias: ${err.message}`, 'error');
                return [];
            }
        },

        // ─────────────────────────────────────────────────────────────
        // EXTRAÇÃO DE DADOS
        // ─────────────────────────────────────────────────────────────

        extrairRecursosEntrada(htmlString) {
            const incoming = { wood: 0, stone: 0, iron: 0 };

            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlString, 'text/html');
                const allText = doc.body.innerText || '';
                const entradaIndex = allText.indexOf('Entrada:');
                if (entradaIndex === -1) return incoming;

                const afterEntrada = allText.substring(entradaIndex);
                const numeros = afterEntrada.match(/(\d+(?:\.\d+)?)/g) || [];

                const temWood = afterEntrada.toLowerCase().includes('wood') || afterEntrada.includes('🌲');
                const temStone = afterEntrada.toLowerCase().includes('stone') || afterEntrada.includes('🧱');
                const temIron = afterEntrada.toLowerCase().includes('iron') || afterEntrada.includes('⚙️');

                let pos = 0;
                const lerNumero = () => {
                    if (!numeros[pos]) return 0;
                    let valor = numeros[pos].replace(/\./g, '');
                    pos++;
                    if (numeros[pos] && (numeros[pos].length === 3 || numeros[pos] === '000')) {
                        valor += numeros[pos];
                        pos++;
                    }
                    return parseInt(valor) || 0;
                };

                if (temWood) incoming.wood = lerNumero();
                if (temStone) incoming.stone = lerNumero();
                if (temIron) incoming.iron = lerNumero();
            } catch (e) {
                const entradaMatch = htmlString.match(/Entrada:[\s\S]*?<\/th>/i);
                if (entradaMatch) {
                    const blocoEntrada = entradaMatch[0];
                    const limpo = blocoEntrada.replace(/<span class="grey">\.<\/span>/g, '');
                    const temWood = blocoEntrada.includes('wood') || blocoEntrada.includes('🌲');
                    const temStone = blocoEntrada.includes('stone') || blocoEntrada.includes('🧱');
                    const temIron = blocoEntrada.includes('iron') || blocoEntrada.includes('⚙️');
                    const numeros = limpo.match(/(\d+(?:\.\d+)?)/g) || [];
                    let pos = 0;
                    const lerProximo = () => {
                        if (!numeros[pos]) return 0;
                        let valor = numeros[pos].replace(/\./g, '');
                        pos++;
                        if (numeros[pos] && (numeros[pos].length === 3 || numeros[pos] === '000')) {
                            valor += numeros[pos];
                            pos++;
                        }
                        return parseInt(valor) || 0;
                    };
                    if (temWood) incoming.wood = lerProximo();
                    if (temStone) incoming.stone = lerProximo();
                    if (temIron) incoming.iron = lerProximo();
                }
            }

            return incoming;
        },

        extrairCsrfToken(html) {
            const patterns = [
                /TribalWars\.updateGameData\(({.*?})\);/s,
                /var csrf_token = '([a-f0-9]+)'/,
                /name="h" value="([a-f0-9]+)"/i,
                /TribalWars\.initTab\('([a-f0-9]+)'\)/,
                /"csrf":"([a-f0-9]+)"/i
            ];

            for (const pattern of patterns) {
                if (pattern.toString().includes('updateGameData')) {
                    const match = html.match(pattern);
                    if (match) {
                        try {
                            const gameData = JSON.parse(match[1]);
                            if (gameData.csrf) return gameData.csrf;
                        } catch (e) {}
                    }
                } else {
                    const match = html.match(pattern);
                    if (match?.[1]) return match[1];
                }
            }
            return null;
        },

        async obterDadosCompletosAldeia(aldeia) {
            try {
                const url = `/game.php?village=${aldeia.id}&screen=market&mode=send`;
                const response = await fetch(url, { credentials: 'same-origin' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const html = await response.text();

                const parse = (regex) => {
                    const m = html.match(regex);
                    return m ? parseInt(m[1].replace(/\./g, '')) : 0;
                };

                const wood = parse(/id="wood"[^>]*>([\d\.]+)</);
                const stone = parse(/id="stone"[^>]*>([\d\.]+)</);
                const iron = parse(/id="iron"[^>]*>([\d\.]+)</);
                const warehouseCapacity = parse(/id="storage"[^>]*>([\d\.]+)</);

                let merchants = 0;
                const merchantMatch = html.match(/market_merchant_available_count[^>]*>(\d+)</);
                if (merchantMatch) merchants = parseInt(merchantMatch[1]) || 0;

                const incoming = this.extrairRecursosEntrada(html);
                const { wood: woodACaminho, stone: stoneACaminho, iron: ironACaminho } = incoming;

                const csrf = this.extrairCsrfToken(html);

                const recursosAtuais = wood + stone + iron;
                const recursosACaminho = woodACaminho + stoneACaminho + ironACaminho;
                const espacoReal = Math.max(0, warehouseCapacity - recursosAtuais - recursosACaminho);
                const bufferMult = (100 - this.config.bufferPercentual) / 100;
                const espacoUtilizavel = Math.floor(espacoReal * bufferMult);

                return {
                    ...aldeia,
                    wood, stone, iron,
                    merchants,
                    warehouseCapacity,
                    csrf,
                    woodACaminho, stoneACaminho, ironACaminho,
                    recursosACaminho: {
                        wood: woodACaminho,
                        stone: stoneACaminho,
                        iron: ironACaminho,
                        merchants: Math.ceil(recursosACaminho / 1000)
                    },
                    espacoReal,
                    espacoUtilizavel
                };
            } catch (err) {
                console.error(`Erro ao carregar aldeia ${aldeia.id}:`, err);
                return null;
            }
        },

        async carregarDados() {
            if (this.carregando) {
                this.adicionarLog('⏳ Carregamento já em andamento — aguarde.', 'warning');
                return;
            }

            this.carregando = true;
            this.loadingProgress = 0;

            this.cacheVillages = [];

            const btn = document.getElementById('tw-btn-carregar');
            const progressBar = document.getElementById('tw-loading-progress');
            const progressWrap = document.getElementById('tw-progress-container');
            const progressLabel = document.getElementById('tw-progress-label');

            if (btn) { btn.textContent = '⏳ CARREGANDO...'; btn.disabled = true; }
            if (progressWrap) progressWrap.style.display = 'block';

            this.adicionarLog('🚀 Iniciando coleta de dados...', 'info');
            this.adicionarLog(`🛡️ Buffer: ${this.config.bufferPercentual}%`, 'info');
            this.adicionarLog(`🛡️ Reserva Mínima: ${this.config.reservaMinimaPercentual}% da média`, 'info');

            const aldeias = await this.obterTodasAldeias(true);
            const total = aldeias.length;

            if (total === 0) {
                this.adicionarLog('❌ Nenhuma aldeia encontrada. Verifique se você está logado.', 'error');
                this.carregando = false;
                if (btn) { btn.textContent = '🔄 CARREGAR DADOS'; btn.disabled = false; }
                if (progressWrap) progressWrap.style.display = 'none';
                return;
            }

            this.adicionarLog(`📋 ${total} aldeia(s) encontrada(s). Iniciando coleta detalhada...`, 'info');

            const novosDados = [];
            const BATCH_SIZE = 2;

            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = aldeias.slice(i, i + BATCH_SIZE);
                const resultados = await Promise.all(batch.map(a => this.obterDadosCompletosAldeia(a)));

                for (const r of resultados) {
                    if (!r) continue;
                    novosDados.push(r);
                }

                const pct = Math.min(100, Math.floor((i + BATCH_SIZE) / total * 100));
                this.loadingProgress = pct;
                if (progressBar) { progressBar.style.width = `${pct}%`; }
                if (progressLabel) progressLabel.textContent = `${pct}% (${Math.min(i + BATCH_SIZE, total)}/${total})`;

                await this.delay(this.config.delayEntreLotes);
            }

            if (novosDados.length === 0) {
                this.adicionarLog('❌ Falha ao carregar dados das aldeias.', 'error');
                this.carregando = false;
                if (btn) { btn.textContent = '🔄 CARREGAR DADOS'; btn.disabled = false; }
                if (progressWrap) progressWrap.style.display = 'none';
                return;
            }

            this.villagesData = novosDados;
            this.calcularMedias();
            this.atualizarResumo();
            this.renderizarTabela();

            const totalACGlobal = this.villagesData.reduce(
                (s, v) => s + v.woodACaminho + v.stoneACaminho + v.ironACaminho, 0
            );

            this.adicionarLog(`✅ ${this.villagesData.length} aldeias carregadas com sucesso!`, 'success');
            this.adicionarLog(`📊 Médias: 🌲${this.mediaWood.toLocaleString()} 🧱${this.mediaStone.toLocaleString()} ⚙️${this.mediaIron.toLocaleString()}`, 'info');

            if (totalACGlobal > 0) {
                this.adicionarLog(`🚚 Total de recursos a caminho: ${totalACGlobal.toLocaleString()}`, 'info');
            }

            if (progressWrap) setTimeout(() => {
                progressWrap.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';
                if (progressLabel) progressLabel.textContent = '0%';
            }, 2000);

            if (btn) { btn.textContent = '🔄 CARREGAR DADOS'; btn.disabled = false; }
            this.carregando = false;
        },

        calcularMedias() {
            const n = this.villagesData.length;
            if (n === 0) return;

            this.totalWood = this.villagesData.reduce((s, v) => s + v.wood, 0);
            this.totalStone = this.villagesData.reduce((s, v) => s + v.stone, 0);
            this.totalIron = this.villagesData.reduce((s, v) => s + v.iron, 0);

            this.mediaWood = Math.floor(this.totalWood / n);
            this.mediaStone = Math.floor(this.totalStone / n);
            this.mediaIron = Math.floor(this.totalIron / n);
        },

        atualizarResumo() {
            const mapa = {
                'tw-total-wood': this.totalWood,
                'tw-total-stone': this.totalStone,
                'tw-total-iron': this.totalIron,
                'tw-media-wood': this.mediaWood,
                'tw-media-stone': this.mediaStone,
                'tw-media-iron': this.mediaIron
            };
            for (const [id, val] of Object.entries(mapa)) {
                const el = document.getElementById(id);
                if (el) el.textContent = val.toLocaleString();
            }
        },

        // ─────────────────────────────────────────────────────────────
        // BALANCEAMENTO COM GREEDY + RESERVA MÍNIMA + MARCAÇÃO
        // ✅ BUG CORRIGIDO: linha 606 agora usa melhorSugestao.destino.id
        // ─────────────────────────────────────────────────────────────

        getSugestoesBalanceamento() {
            this.usedOriginsInCycle.clear();
            this.usedDestinationsInCycle.clear();

            const tolerancia = this.config.toleranciaPercentual / 100;
            const minEnvio = this.config.minEnvio;
            const reservaFactor = this.config.reservaMinimaPercentual / 100;

            const safeMinWood = this.mediaWood * reservaFactor;
            const safeMinStone = this.mediaStone * reservaFactor;
            const safeMinIron = this.mediaIron * reservaFactor;

            const doadoras = [];
            const receptoras = [];

            for (const v of this.villagesData) {
                const dW = v.wood - this.mediaWood;
                const dS = v.stone - this.mediaStone;
                const dI = v.iron - this.mediaIron;

                const temExcesso = (dW > this.mediaWood * tolerancia && dW > minEnvio) ||
                                  (dS > this.mediaStone * tolerancia && dS > minEnvio) ||
                                  (dI > this.mediaIron * tolerancia && dI > minEnvio);

                const temFalta = dW < -this.mediaWood * tolerancia ||
                                dS < -this.mediaStone * tolerancia ||
                                dI < -this.mediaIron * tolerancia;

                if (temExcesso) doadoras.push(v);
                else if (temFalta) receptoras.push(v);
            }

            doadoras.sort((a, b) => {
                const excessoA = (a.wood - this.mediaWood) + (a.stone - this.mediaStone) + (a.iron - this.mediaIron);
                const excessoB = (b.wood - this.mediaWood) + (b.stone - this.mediaStone) + (b.iron - this.mediaIron);
                return excessoB - excessoA;
            });

            receptoras.sort((a, b) => {
                const faltaA = (this.mediaWood - a.wood) + (this.mediaStone - a.stone) + (this.mediaIron - a.iron);
                const faltaB = (this.mediaWood - b.wood) + (this.mediaStone - b.stone) + (this.mediaIron - b.iron);
                return faltaB - faltaA;
            });

            const sugestoes = [];

            for (const origem of doadoras) {
                if (this.usedOriginsInCycle.has(origem.id)) continue;

                const maxEnvioWood = Math.max(0, origem.wood - safeMinWood);
                const maxEnvioStone = Math.max(0, origem.stone - safeMinStone);
                const maxEnvioIron = Math.max(0, origem.iron - safeMinIron);
                const totalDisponivelSeguro = maxEnvioWood + maxEnvioStone + maxEnvioIron;

                if (totalDisponivelSeguro < minEnvio) continue;

                let melhorSugestao = null;
                let melhorPontuacao = -Infinity;

                for (const destino of receptoras) {
                    if (this.usedDestinationsInCycle.has(destino.id)) continue;
                    if (origem.id === destino.id) continue;

                    let wood = Math.min(maxEnvioWood, Math.max(0, this.mediaWood - destino.wood));
                    let stone = Math.min(maxEnvioStone, Math.max(0, this.mediaStone - destino.stone));
                    let iron = Math.min(maxEnvioIron, Math.max(0, this.mediaIron - destino.iron));

                    wood = Math.floor(wood / 1000) * 1000;
                    stone = Math.floor(stone / 1000) * 1000;
                    iron = Math.floor(iron / 1000) * 1000;

                    const total = wood + stone + iron;
                    if (total < minEnvio) continue;

                    const merchantsNeeded = Math.ceil(total / 1000);
                    if (origem.merchants < merchantsNeeded) continue;
                    if (destino.espacoUtilizavel < total) continue;

                    const eficiencia = total / merchantsNeeded;
                    const urgenciaDestino = (this.mediaWood - destino.wood) +
                                           (this.mediaStone - destino.stone) +
                                           (this.mediaIron - destino.iron);

                    const pontuacao = (total * 2) + (urgenciaDestino * 1.5) + (eficiencia * 0.5);

                    if (pontuacao > melhorPontuacao) {
                        melhorPontuacao = pontuacao;
                        melhorSugestao = { origem, destino, wood, stone, iron, total, merchantsNeeded };
                    }
                }

                if (melhorSugestao) {
                    sugestoes.push(melhorSugestao);
                    this.usedOriginsInCycle.add(origem.id);
                    // ✅ BUG CORRIGIDO AQUI: usando melhorSugestao.destino.id
                    this.usedDestinationsInCycle.add(melhorSugestao.destino.id);
                }
            }

            return sugestoes;
        },

        // ─────────────────────────────────────────────────────────────
        // ENVIO EM DUAS ETAPAS
        // ─────────────────────────────────────────────────────────────

        async enviarRecursos(origemId, destinoId, wood, stone, iron, botaoElement) {
            if (this.enviando) {
                this.adicionarLog('⏳ Já há um envio em andamento — aguarde.', 'warning');
                return;
            }

            const origem = this.villagesData.find(v => v.id === origemId);
            const destino = this.villagesData.find(v => v.id === destinoId);

            if (!origem || !destino) {
                this.adicionarLog('❌ Erro interno: aldeia não encontrada.', 'error');
                return;
            }
            if (!origem.csrf) {
                this.adicionarLog(`❌ ${origem.nome}: token CSRF ausente. Recarregue os dados.`, 'error');
                return;
            }

            const totalRecursos = wood + stone + iron;
            const merchantsNeeded = Math.ceil(totalRecursos / 1000);

            const reservaFactor = this.config.reservaMinimaPercentual / 100;
            const reservaMinWood = this.mediaWood * reservaFactor;
            const reservaMinStone = this.mediaStone * reservaFactor;
            const reservaMinIron = this.mediaIron * reservaFactor;

            if (origem.wood - wood < reservaMinWood) {
                this.adicionarLog(`❌ ${origem.nome}: Envio cancelado - madeira ficaria abaixo da reserva mínima.`, 'error');
                return;
            }
            if (origem.stone - stone < reservaMinStone) {
                this.adicionarLog(`❌ ${origem.nome}: Envio cancelado - pedra ficaria abaixo da reserva mínima.`, 'error');
                return;
            }
            if (origem.iron - iron < reservaMinIron) {
                this.adicionarLog(`❌ ${origem.nome}: Envio cancelado - ferro ficaria abaixo da reserva mínima.`, 'error');
                return;
            }

            if (origem.merchants < merchantsNeeded) {
                this.adicionarLog(`⚠️ ${origem.nome}: comerciantes insuficientes (${origem.merchants}/${merchantsNeeded}).`, 'warning');
                return;
            }
            if (destino.espacoUtilizavel < totalRecursos) {
                this.adicionarLog(`⚠️ ${destino.nome}: espaço insuficiente com buffer.`, 'warning');
                return;
            }

            this.enviando = true;
            if (botaoElement) { botaoElement.disabled = true; botaoElement.textContent = '⏳ Simulando…'; }

            try {
                this.adicionarLog(`📤 [1/2] Simulando: 🌲${wood.toLocaleString()} 🧱${stone.toLocaleString()} ⚙️${iron.toLocaleString()} — ${origem.nome} → ${destino.nome}`, 'info');

                const urlSim = `/game.php?village=${origemId}&screen=market&mode=send&try=confirm_send`;
                const bodySim = new URLSearchParams({
                    wood, stone, iron,
                    target_id: destinoId,
                    h: origem.csrf,
                    x: destino.coord.split('|')[0],
                    y: destino.coord.split('|')[1]
                });

                const resSim = await fetch(urlSim, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: bodySim.toString()
                });

                if (!resSim.ok) throw new Error(`HTTP ${resSim.status} na simulação`);

                const htmlSim = await resSim.text();
                const novoCsrf = this.extrairCsrfToken(htmlSim);
                if (!novoCsrf) throw new Error('Token CSRF de confirmação não encontrado');

                const lerCampo = (regex, fallback) => {
                    const m = htmlSim.match(regex);
                    return m ? parseInt(m[1]) : fallback;
                };

                const woodFinal = lerCampo(/name="wood"\s+value="(\d+)"/i, wood);
                const stoneFinal = lerCampo(/name="stone"\s+value="(\d+)"/i, stone);
                const ironFinal = lerCampo(/name="iron"\s+value="(\d+)"/i, iron);
                let targetId = destinoId;
                const tidMatch = htmlSim.match(/name="target_id"\s+value="(\d+)"/i);
                if (tidMatch) targetId = tidMatch[1];

                if (botaoElement) botaoElement.textContent = '⏳ Confirmando…';
                this.adicionarLog('📤 [2/2] Confirmando envio…', 'info');

                const urlConf = `/game.php?village=${origemId}&screen=market&action=send`;
                const bodyConf = new URLSearchParams({
                    target_id: targetId,
                    wood: woodFinal,
                    stone: stoneFinal,
                    iron: ironFinal,
                    h: novoCsrf
                });

                const resConf = await fetch(urlConf, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: bodyConf.toString()
                });

                const textoConf = await resConf.text();
                const totalFinal = woodFinal + stoneFinal + ironFinal;

                const sucessoEspecifico = textoConf.includes('foram enviados') ||
                                         textoConf.includes('sucesso') ||
                                         textoConf.includes('Enviado com sucesso');
                const sucessoGenerico = textoConf.includes('success') && !textoConf.includes('error');
                const sucesso = sucessoEspecifico || sucessoGenerico;
                const falhaConhecida = textoConf.includes('error') || textoConf.includes('insuficiente');

                if (sucesso) {
                    this.adicionarLog(`✅ SUCESSO: ${merchantsNeeded} comerciante(s) | ${totalFinal.toLocaleString()} recursos | ${origem.nome} → ${destino.nome}`, 'success');

                    origem.wood -= woodFinal;
                    origem.stone -= stoneFinal;
                    origem.iron -= ironFinal;
                    origem.merchants -= merchantsNeeded;

                    destino.wood += woodFinal;
                    destino.stone += stoneFinal;
                    destino.iron += ironFinal;

                    const recAtDest = destino.wood + destino.stone + destino.iron;
                    const recACDest = destino.woodACaminho + destino.stoneACaminho + destino.ironACaminho;
                    destino.espacoReal = Math.max(0, destino.warehouseCapacity - recAtDest - recACDest);
                    destino.espacoUtilizavel = Math.floor(destino.espacoReal * ((100 - this.config.bufferPercentual) / 100));

                    const recAtOrig = origem.wood + origem.stone + origem.iron;
                    const recACOrig = origem.woodACaminho + origem.stoneACaminho + origem.ironACaminho;
                    origem.espacoReal = Math.max(0, origem.warehouseCapacity - recAtOrig - recACOrig);
                    origem.espacoUtilizavel = Math.floor(origem.espacoReal * ((100 - this.config.bufferPercentual) / 100));

                    this.calcularMedias();
                    this.atualizarResumo();
                    this.renderizarTabela();
                } else if (falhaConhecida) {
                    this.adicionarLog(`❌ Falha: recursos insuficientes — ${origem.nome} → ${destino.nome}`, 'error');
                } else {
                    this.adicionarLog(`❌ Resposta inesperada do servidor — ${origem.nome} → ${destino.nome}`, 'error');
                }

            } catch (err) {
                this.adicionarLog(`❌ Erro no envio: ${err.message}`, 'error');
            } finally {
                this.enviando = false;
                if (botaoElement) {
                    setTimeout(() => {
                        botaoElement.disabled = false;
                        botaoElement.textContent = '📦 ENVIAR';
                    }, 1500);
                }
            }
        },

        // ─────────────────────────────────────────────────────────────
        // RENDERIZAÇÃO DA TABELA
        // ─────────────────────────────────────────────────────────────

        renderizarTabela() {
            const tbody = document.getElementById('tw-lista-aldeias');
            if (!tbody) return;

            if (this.villagesData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:${this.CORES.textoDim}; padding:32px 0;">Nenhum dado carregado. Clique em <strong style="color:${this.CORES.verde};">CARREGAR DADOS</strong> para iniciar.</td></tr>`;
                return;
            }

            const sugestoes = this.getSugestoesBalanceamento();

            if (!sugestoes || sugestoes.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:32px 0;"><span style="font-size:22px;">✅</span><br><span style="color:${this.CORES.verde}; font-weight:bold;">Todas as aldeias estão balanceadas!</span><br><span style="font-size:10px; color:${this.CORES.textoDim};">Reserva: ${this.config.reservaMinimaPercentual}% | Tolerância: ${this.config.toleranciaPercentual}% | Mínimo: ${this.config.minEnvio.toLocaleString()}</span></td></tr>`;
                return;
            }

            let html = '';
            for (const s of sugestoes) {
                const { origem, destino } = s;
                const pct = origem.warehouseCapacity > 0 ? Math.min(100, (origem.wood / origem.warehouseCapacity) * 100) : 0;

                const chips = [];
                if (s.wood > 0) chips.push(`<span class="tw-res-chip tw-chip-wood">🌲 ${s.wood.toLocaleString()}</span>`);
                if (s.stone > 0) chips.push(`<span class="tw-res-chip tw-chip-stone">🧱 ${s.stone.toLocaleString()}</span>`);
                if (s.iron > 0) chips.push(`<span class="tw-res-chip tw-chip-iron">⚙️ ${s.iron.toLocaleString()}</span>`);

                const aCaminhoTotal = destino.woodACaminho + destino.stoneACaminho + destino.ironACaminho;
                let aCaminhoTag = '';
                if (aCaminhoTotal > 0) {
                    const partes = [];
                    if (destino.woodACaminho > 0) partes.push(`${destino.woodACaminho.toLocaleString()} 🌲`);
                    if (destino.stoneACaminho > 0) partes.push(`${destino.stoneACaminho.toLocaleString()} 🧱`);
                    if (destino.ironACaminho > 0) partes.push(`${destino.ironACaminho.toLocaleString()} ⚙️`);
                    aCaminhoTag = `<div class="tw-incoming-badge">🚚 ${partes.join(' ')} a caminho</div>`;
                }

                html += `
                    <tr class="tw-row">
                        <td class="tw-td-origin">
                            <div class="tw-village-name">${origem.nome}</div>
                            <div class="tw-village-coord">${origem.coord}</div>
                            <div class="tw-village-meta">📦 ${origem.merchants} comerciante(s)</div>
                            <div class="tw-fill-bar"><div class="tw-fill-inner" style="width:${pct.toFixed(1)}%"></div></div>
                            <div class="tw-village-res">🌲${origem.wood.toLocaleString()} 🧱${origem.stone.toLocaleString()} ⚙️${origem.iron.toLocaleString()}</div>
                        </td>
                        <td class="tw-td-dest">
                            <div class="tw-village-name">${destino.nome}</div>
                            <div class="tw-village-coord">${destino.coord}</div>
                            <div class="tw-village-meta">🏚️ ${destino.espacoUtilizavel.toLocaleString()} livre (com buffer)</div>
                            ${aCaminhoTag}
                            <div class="tw-village-res">🌲${destino.wood.toLocaleString()} 🧱${destino.stone.toLocaleString()} ⚙️${destino.iron.toLocaleString()}</div>
                        </td>
                        <td class="tw-td-suggest">
                            <div class="tw-chips">${chips.join('')}</div>
                            <div class="tw-merchant-count">🚚 ${s.merchantsNeeded} comerciante(s) · 📦 ${s.total.toLocaleString()}</div>
                        </td>
                        <td class="tw-td-action">
                            <button class="tw-send-btn" onclick="TWResourceBalancer.enviarRecursos(${origem.id}, ${destino.id}, ${s.wood}, ${s.stone}, ${s.iron}, this)">📦 ENVIAR</button>
                        </td>
                    </tr>
                `;
            }

            tbody.innerHTML = html;

            const countEl = document.getElementById('tw-sugestoes-count');
            if (countEl) countEl.textContent = `${sugestoes.length} sugestão(ões) (1 por origem/destino)`;
        },

        // ─────────────────────────────────────────────────────────────
        // RENDERIZAÇÃO DO DASHBOARD
        // ─────────────────────────────────────────────────────────────

        renderizarDashboard() {
            document.body.innerHTML = '';
            this.carregarConfig();

            const C = this.CORES;

            document.body.style.cssText = `
                background: ${C.fundo};
                margin: 0;
                padding: 0;
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                color: ${C.texto};
                min-height: 100vh;
            `;

            document.body.innerHTML = `
                <style>
                    * { box-sizing: border-box; }
                    ::-webkit-scrollbar { width: 6px; height: 6px; }
                    ::-webkit-scrollbar-track { background: ${C.fundo}; }
                    ::-webkit-scrollbar-thumb { background: ${C.borda}; border-radius: 3px; }
                    ::-webkit-scrollbar-thumb:hover { background: ${C.verde}44; }

                    #tw-app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
                    #tw-header { background: ${C.fundoCard}; border-bottom: 1px solid ${C.borda}; padding: 12px 20px; display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
                    #tw-header h1 { margin: 0; font-size: 15px; font-weight: 700; color: ${C.verde}; letter-spacing: 0.03em; }
                    #tw-header h1 span { color: ${C.textoDim}; font-weight: 400; font-size: 12px; }
                    #tw-header-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }

                    #tw-config-bar { background: ${C.fundoCard}; border-bottom: 1px solid ${C.borda}; padding: 8px 20px; display: flex; align-items: center; gap: 24px; flex-shrink: 0; flex-wrap: wrap; }
                    .tw-config-group { display: flex; align-items: center; gap: 7px; font-size: 11px; color: ${C.textoDim}; }
                    .tw-config-group label { white-space: nowrap; }
                    .tw-config-group input[type=number] { width: 60px; background: ${C.fundo}; color: ${C.texto}; border: 1px solid ${C.borda}; border-radius: 4px; padding: 3px 6px; font-size: 11px; outline: none; }
                    .tw-config-group input[type=number]:focus { border-color: ${C.verde}66; }

                    #tw-stats-strip { display: flex; gap: 12px; padding: 10px 20px; background: ${C.fundo}; border-bottom: 1px solid ${C.borda}; flex-shrink: 0; flex-wrap: wrap; }
                    .tw-stat-card { background: ${C.fundoCard}; border: 1px solid ${C.borda}; border-radius: 6px; padding: 8px 14px; min-width: 160px; flex: 1; }
                    .tw-stat-card-title { font-size: 10px; color: ${C.textoDim}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }
                    .tw-stat-card-body { font-size: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
                    .tw-res-val { color: ${C.texto}; }
                    .tw-res-val b { color: ${C.verde}; }

                    #tw-progress-container { padding: 0 20px 8px; display: none; flex-shrink: 0; }
                    #tw-progress-track { background: ${C.fundoCard}; border: 1px solid ${C.borda}; border-radius: 6px; height: 22px; overflow: hidden; position: relative; }
                    #tw-loading-progress { height: 100%; width: 0%; background: linear-gradient(90deg, ${C.verdeEscuro}, ${C.verde}); transition: width 0.35s ease; border-radius: 6px; }
                    #tw-progress-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; font-family: monospace; color: ${C.texto}; pointer-events: none; }

                    #tw-main { display: flex; flex: 1; overflow: hidden; gap: 0; }
                    #tw-table-panel { flex: 3; overflow-y: auto; padding: 0; }

                    .tw-table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    .tw-table thead th { background: ${C.fundoCard}; color: ${C.verde}; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 10px 12px; border-bottom: 1px solid ${C.borda}; position: sticky; top: 0; z-index: 10; white-space: nowrap; }
                    .tw-row { border-bottom: 1px solid ${C.borda}; transition: background 0.15s; }
                    .tw-row:hover { background: ${C.verdeDim}; }
                    .tw-row td { padding: 9px 12px; vertical-align: middle; }

                    .tw-village-name { font-weight: 600; color: ${C.texto}; font-size: 12px; }
                    .tw-village-coord { font-size: 9px; color: ${C.verde}66; margin-top: 1px; }
                    .tw-village-meta { font-size: 10px; color: ${C.textoDim}; margin-top: 3px; }
                    .tw-village-res { font-size: 9px; color: ${C.textoDim}; margin-top: 3px; }

                    .tw-fill-bar { background: ${C.fundo}; border-radius: 3px; height: 4px; width: 70px; margin-top: 5px; overflow: hidden; }
                    .tw-fill-inner { height: 100%; background: #e74c3c; border-radius: 3px; transition: width 0.3s; }

                    .tw-incoming-badge { display: inline-block; margin-top: 3px; font-size: 9px; color: ${C.aviso}; background: ${C.avisoDim}; border: 1px solid ${C.aviso}44; border-radius: 3px; padding: 1px 5px; }

                    .tw-chips { display: flex; flex-wrap: wrap; gap: 4px; }
                    .tw-res-chip { display: inline-block; font-size: 10px; font-weight: 600; border-radius: 4px; padding: 2px 7px; border: 1px solid transparent; }
                    .tw-chip-wood { background: #8b691411; border-color: ${C.madeira}44; color: #c9a227; }
                    .tw-chip-stone { background: #60708011; border-color: ${C.pedra}44; color: #8ca0b0; }
                    .tw-chip-iron { background: #5a8a9f11; border-color: ${C.ferro}44; color: ${C.ferro}; }

                    .tw-merchant-count { font-size: 9px; color: ${C.textoDim}; margin-top: 5px; }

                    .tw-send-btn { background: ${C.verde}; color: #000; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; transition: all 0.15s; white-space: nowrap; }
                    .tw-send-btn:hover:not(:disabled) { background: ${C.verdeClaro}; transform: translateY(-1px); box-shadow: 0 3px 10px ${C.verde}44; }
                    .tw-send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }

                    .tw-action-btn { padding: 7px 16px; border: none; border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; transition: all 0.15s; }
                    #tw-btn-carregar { background: #c97c00; color: #fff; }
                    #tw-btn-carregar:hover:not(:disabled) { background: #e8900a; box-shadow: 0 2px 10px #c97c0066; }
                    #tw-btn-carregar:disabled { opacity: 0.5; cursor: not-allowed; }

                    #tw-log-panel { width: 300px; flex-shrink: 0; border-left: 1px solid ${C.borda}; display: flex; flex-direction: column; overflow: hidden; }
                    #tw-log-header { padding: 10px 14px; background: ${C.fundoCard}; border-bottom: 1px solid ${C.borda}; font-size: 11px; color: ${C.verde}; font-weight: 600; flex-shrink: 0; }
                    #tw-log-area { flex: 1; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; }

                    #tw-toolbar { padding: 8px 20px; background: ${C.fundo}; border-bottom: 1px solid ${C.borda}; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
                    #tw-sugestoes-count { font-size: 10px; color: ${C.textoDim}; margin-left: auto; }
                </style>

                <div id="tw-app">
                    <div id="tw-header">
                        <h1>⚖️ TW Resource Balancer <span>v3.8</span></h1>
                        <div id="tw-header-right"></div>
                    </div>

                    <div id="tw-config-bar">
                        <div class="tw-config-group"><label>Tolerância:</label><input type="number" id="tw-tolerancia" value="${this.config.toleranciaPercentual}" min="1" max="50" step="1"><span>%</span></div>
                        <div class="tw-config-group"><label>Envio mínimo:</label><input type="number" id="tw-min-envio" value="${this.config.minEnvio}" min="1000" max="100000" step="1000"></div>
                        <div class="tw-config-group"><label>Buffer:</label><input type="number" id="tw-buffer" value="${this.config.bufferPercentual}" min="0" max="40" step="5"><span>%</span></div>
                        <div class="tw-config-group"><label>Reserva Mínima:</label><input type="number" id="tw-reserva" value="${this.config.reservaMinimaPercentual}" min="10" max="70" step="5"><span>% da média</span></div>
                        <div class="tw-config-group"><label>Delay entre lotes:</label><input type="number" id="tw-delay" value="${this.config.delayEntreLotes}" min="300" max="2000" step="100"><span>ms</span></div>
                    </div>

                    <div id="tw-stats-strip">
                        <div class="tw-stat-card"><div class="tw-stat-card-title">📦 Totais</div><div class="tw-stat-card-body"><span class="tw-res-val">🌲 <b id="tw-total-wood">0</b></span><span class="tw-res-val">🧱 <b id="tw-total-stone">0</b></span><span class="tw-res-val">⚙️ <b id="tw-total-iron">0</b></span></div></div>
                        <div class="tw-stat-card"><div class="tw-stat-card-title">📊 Médias por Aldeia</div><div class="tw-stat-card-body"><span class="tw-res-val">🌲 <b id="tw-media-wood">0</b></span><span class="tw-res-val">🧱 <b id="tw-media-stone">0</b></span><span class="tw-res-val">⚙️ <b id="tw-media-iron">0</b></span></div></div>
                    </div>

                    <div id="tw-progress-container"><div id="tw-progress-track"><div id="tw-loading-progress"></div><div id="tw-progress-label">0%</div></div></div>

                    <div id="tw-toolbar"><button id="tw-btn-carregar" class="tw-action-btn">🔄 CARREGAR DADOS</button><span id="tw-sugestoes-count"></span></div>

                    <div id="tw-main">
                        <div id="tw-table-panel"><table class="tw-table"><thead><tr><th>Origem</th><th>Destino</th><th>Sugestão de Envio</th><th>Ação</th></tr></thead><tbody id="tw-lista-aldeias"><tr><td colspan="4" style="text-align:center; color:${C.textoDim}; padding:40px 0;">Clique em <strong style="color:${C.verde};">CARREGAR DADOS</strong> para iniciar.</td></tr></tbody></table></div>
                        <div id="tw-log-panel"><div id="tw-log-header">📝 Log de Atividades</div><div id="tw-log-area"></div></div>
                    </div>
                </div>
            `;

            this.adicionarLog('⚖️ TW Resource Balancer v3.8 iniciado. BUG DA LINHA 606 CORRIGIDO!', 'info');
            this.adicionarLog('🛡️ Proteção anti-esgotamento ativa: reserva mínima de ' + this.config.reservaMinimaPercentual + '% da média.', 'info');

            const bindConfig = (id, key, parser, updateFn = null) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.onchange = (e) => {
                    const val = parser(e.target.value);
                    this.config[key] = val;
                    this.salvarConfig();
                    if (updateFn) updateFn(val);
                    if (this.villagesData.length > 0) this.renderizarTabela();
                    this.adicionarLog(`⚙️ ${key} → ${val}`, 'info');
                };
            };

            bindConfig('tw-tolerancia', 'toleranciaPercentual', v => Math.max(1, parseInt(v) || 5));
            bindConfig('tw-min-envio', 'minEnvio', v => Math.max(1000, parseInt(v) || 1000));
            bindConfig('tw-buffer', 'bufferPercentual', v => {
                const val = Math.max(0, parseInt(v) || 10);
                if (this.villagesData.length > 0) {
                    const mult = (100 - val) / 100;
                    for (const v of this.villagesData) {
                        v.espacoUtilizavel = Math.floor(v.espacoReal * mult);
                    }
                }
                return val;
            });
            bindConfig('tw-reserva', 'reservaMinimaPercentual', v => Math.max(10, Math.min(70, parseInt(v) || 30)));
            bindConfig('tw-delay', 'delayEntreLotes', v => Math.max(300, Math.min(2000, parseInt(v) || 800)));

            document.getElementById('tw-btn-carregar').onclick = () => this.carregarDados();
            window.TWResourceBalancer = this;
        }
    };

    // Aguarda o DOM estar completamente carregado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TWResourceBalancer.init());
    } else {
        TWResourceBalancer.init();
    }

})();