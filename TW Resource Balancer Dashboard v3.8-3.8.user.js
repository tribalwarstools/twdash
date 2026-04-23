// ==UserScript==
// @name         TW Resource Balancer Dashboard v4.1
// @version      4.1
// @description  Balanceador de recursos com extração global (1 fetch), lógica de Crescimento Acelerado por Pontos, limite de 10k/envio para conta básica, detecção automática de Premium e validação inteligente de mercadores
// @match        https://*.tribalwars.com.br/game.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────────
    // FALLBACK UI KIT
    // ─────────────────────────────────────────────────────────────────────────────
    if (typeof window.TWUI === 'undefined') {
        window.TWUI = {
            colors: {
                primary: '#00d97e', success: '#00d97e', error: '#f85149',
                warning: '#d29922', info: '#388bfd', dark: '#080c10',
                darker: '#0d1117', text: '#c9d1d9', textDim: '#8b949e'
            },
            formatNumber: (n) => n?.toLocaleString() || '0',
            showNotification: (msg, type) => console.log(`[${type}] ${msg}`)
        };
    }

    const TWResourceBalancer = {
        DASHBOARD_PARAM: 'twBalancer=true',
        STORAGE_KEY: 'tw_balancer_v4',

        villagesData: [],
        loadingProgress: 0,
        carregando: false,
        enviando: false,
        premiumAtivo: false,

        totalWood: 0, totalStone: 0, totalIron: 0,
        mediaWood: 0, mediaStone: 0, mediaIron: 0,
        mediaPontos: 0,

        usedOriginsInCycle: new Set(),
        usedDestinationsInCycle: new Set(),

        config: {
            estoqueSegurancaDoadora: 30000,
            limiteEnvioPorComando: 10000,
            limiteArmazemReceptora: 90,
            minEnvioIndividual: 1000,
            delayEntreLotes: 800,
            maxLogEntries: 250
        },

        CORES: {
            fundo: '#080c10', fundoCard: '#0d1117', fundoTabela: '#0b0f14',
            verde: '#00d97e', verdeEscuro: '#001a0e', verdeClaro: '#33ffaa',
            verdeDim: '#00d97e22', texto: '#c9d1d9', textoDim: '#8b949e',
            borda: '#21262d', bordaVerde: '#00d97e33',
            erro: '#f85149', erroDim: '#f8514922',
            aviso: '#d29922', avisoDim: '#d2992222',
            info: '#388bfd', infoDim: '#388bfd22',
            madeira: '#8b6914', pedra: '#607080', ferro: '#5a8a9f',
            pontos: '#a78bfa'
        },

        // ─────────────────────────────────────────────────────────────────────────
        // INICIALIZAÇÃO
        // ─────────────────────────────────────────────────────────────────────────

        init() {
            console.log('⚖️ TW Resource Balancer v4.1 - Extração Global + Validação Inteligente');
            if (window.location.href.includes(this.DASHBOARD_PARAM)) {
                this.renderizarDashboard();
            } else {
                this.adicionarBotaoAbrirDashboard();
            }
        },

        adicionarBotaoAbrirDashboard() {
            if (!document.body) { setTimeout(() => this.adicionarBotaoAbrirDashboard(), 100); return; }
            if (document.getElementById('tw-balancer-btn')) return;

            const btn = document.createElement('div');
            btn.id = 'tw-balancer-btn';
            btn.innerHTML = '⚖️ Resource Balancer v4.1';
            Object.assign(btn.style, {
                position: 'fixed', top: '80px', right: '10px', zIndex: '999999',
                padding: '7px 13px', background: this.CORES.fundo,
                color: this.CORES.verde, border: `1px solid ${this.CORES.verde}55`,
                borderRadius: '6px', cursor: 'pointer', fontFamily: 'monospace',
                fontWeight: 'bold', fontSize: '11px', boxShadow: '0 2px 10px #00d97e15',
                transition: 'all 0.2s ease'
            });
            btn.onmouseenter = () => { btn.style.borderColor = this.CORES.verde; btn.style.boxShadow = '0 2px 14px #00d97e44'; };
            btn.onmouseleave = () => { btn.style.borderColor = `${this.CORES.verde}55`; btn.style.boxShadow = '0 2px 10px #00d97e15'; };
            btn.onclick = () => {
                const url = window.location.href.split('?')[0] + '?' + this.DASHBOARD_PARAM;
                window.open(url, 'TWBalancer');
            };
            document.body.appendChild(btn);
        },

        delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },

        adicionarLog(msg, tipo) {
            const logArea = document.getElementById('tw-log-area');
            if (!logArea) return;

            const time = new Date().toLocaleTimeString();
            const cores = { success: this.CORES.verde, error: this.CORES.erro, warning: this.CORES.aviso, info: this.CORES.info };
            const cor = cores[tipo] || this.CORES.textoDim;

            const entry = document.createElement('div');
            entry.style.cssText = `padding:5px 0; border-bottom:1px solid ${this.CORES.borda}; font-size:11px; font-family:'JetBrains Mono','Fira Code',Consolas,monospace; display:flex; gap:8px; align-items:baseline;`;
            entry.innerHTML = `<span style="color:${cor};flex-shrink:0;">●</span><span style="color:${this.CORES.textoDim};flex-shrink:0;">${time}</span><span style="color:${cor};">${msg}</span>`;
            logArea.insertBefore(entry, logArea.firstChild);

            while (logArea.children.length > this.config.maxLogEntries) logArea.removeChild(logArea.lastChild);
        },

        salvarConfig() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config)); },

        carregarConfig() {
            const salvo = localStorage.getItem(this.STORAGE_KEY);
            if (salvo) { try { this.config = { ...this.config, ...JSON.parse(salvo) }; } catch (e) {} }
        },

        detectarPremium() {
            if (typeof premium !== 'undefined' && premium === true) return true;
            if (window.game_data?.features?.Premium?.active === true) return true;
            if (document.body?.classList?.contains('has-pa')) return true;
            return false;
        },

        async extrairDadosGlobais() {
            this.premiumAtivo = this.detectarPremium();
            const tipoContaLabel = this.premiumAtivo ? '⭐ PREMIUM' : '📋 BÁSICA';
            this.adicionarLog(`${tipoContaLabel} detectada — offset da tabela: ${this.premiumAtivo ? 1 : 0}`, 'info');

            const url = `${window.location.origin}/game.php?village=${game_data.village.id}&screen=overview_villages&mode=prod&group=0&page=-1`;

            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) throw new Error(`HTTP ${response.status} ao buscar overview_villages`);

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const tabela = doc.getElementById('production_table');
            if (!tabela) throw new Error('Tabela #production_table não encontrada.');

            const linhas = Array.from(tabela.querySelectorAll('tr')).filter(tr =>
                tr.querySelector('a[href*="screen=overview"]') && !tr.querySelector('th')
            );

            if (linhas.length === 0) throw new Error('Nenhuma aldeia encontrada.');

            const off = this.premiumAtivo ? 1 : 0;

            const aldeias = linhas.map(linha => {
                const c = linha.cells;
                const textoAldeia = c[off]?.innerText?.trim() || '';
                const coord = (textoAldeia.match(/\d{1,3}\|\d{1,3}/) || ['N/A'])[0];
                const nome = textoAldeia.split('(')[0].trim();
                const link = c[off]?.querySelector('a[href*="village="]');
                const idMatch = link?.href?.match(/village=(\d+)/);
                const id = idMatch ? parseInt(idMatch[1]) : 0;
                const pontos = parseInt((c[off + 1]?.innerText || '0').replace(/\./g, '')) || 0;
                const resTexto = (c[off + 2]?.innerText || '').replace(/\./g, '');
                const resNums = resTexto.match(/\d+/g) || [0, 0, 0];
                const madeira = parseInt(resNums[0] || 0);
                const argila  = parseInt(resNums[1] || 0);
                const ferro   = parseInt(resNums[2] || 0);
                const armazem = parseInt((c[off + 3]?.innerText || '0').replace(/\./g, '')) || 0;
                const fazenda = c[off + 4]?.innerText?.trim() || '0/0';

                return {
                    id, nome, coord, pontos,
                    wood: madeira, stone: argila, iron: ferro,
                    warehouseCapacity: armazem,
                    espacoUtilizavel: Math.max(0, Math.floor(armazem * (this.config.limiteArmazemReceptora / 100)) - madeira - argila - ferro),
                    fazenda,
                    woodACaminho: 0, stoneACaminho: 0, ironACaminho: 0,
                    csrf: null,
                    merchants: null,
                    merchantsValidated: false
                };
            });

            return aldeias.filter(a => a.id > 0);
        },

        extrairCsrfToken(html) {
            const gdMatch = html.match(/TribalWars\.updateGameData\(({[\s\S]*?})\);/);
            if (gdMatch) {
                try {
                    const gd = JSON.parse(gdMatch[1]);
                    if (gd.csrf) return gd.csrf;
                } catch(e) {}
            }

            const patterns = [
                /var csrf_token = '([a-f0-9]+)'/,
                /name="h" value="([a-f0-9]+)"/i,
                /TribalWars\.initTab\('([a-f0-9]+)'\)/,
                /"csrf":"([a-f0-9]+)"/i
            ];
            for (const p of patterns) {
                const m = html.match(p);
                if (m?.[1]) return m[1];
            }

            try {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const el = doc.querySelector('input[name="h"]');
                if (el?.value) return el.value;
            } catch(e) {}

            return null;
        },

        async obterDetalhesEnvio(aldeiaId) {
            const url = `/game.php?village=${aldeiaId}&screen=market&mode=send`;
            const response = await fetch(url, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();

            const parse = (regex) => { const m = html.match(regex); return m ? parseInt(m[1].replace(/\./g, '')) : 0; };

            const csrf      = this.extrairCsrfToken(html);
            const merchants = parse(/market_merchant_available_count[^>]*>(\d+)</) || 99;
            const woodNow   = parse(/id="wood"[^>]*>([\d\.]+)</)  || 0;
            const stoneNow  = parse(/id="stone"[^>]*>([\d\.]+)</) || 0;
            const ironNow   = parse(/id="iron"[^>]*>([\d\.]+)</)  || 0;

            return { csrf, merchants, woodNow, stoneNow, ironNow };
        },

        async carregarDados() {
            if (this.carregando) { this.adicionarLog('⏳ Carregamento já em andamento.', 'warning'); return; }
            this.carregando = true;

            const btn          = document.getElementById('tw-btn-carregar');
            const progressBar  = document.getElementById('tw-loading-progress');
            const progressWrap = document.getElementById('tw-progress-container');
            const progressLabel= document.getElementById('tw-progress-label');

            if (btn) { btn.textContent = '⏳ CARREGANDO...'; btn.disabled = true; }
            if (progressWrap) progressWrap.style.display = 'block';
            if (progressBar) progressBar.style.width = '30%';
            if (progressLabel) progressLabel.textContent = 'Buscando dados globais...';

            this.adicionarLog('🚀 Iniciando extração global (1 fetch)...', 'info');

            try {
                const aldeias = await this.extrairDadosGlobais();

                if (aldeias.length === 0) {
                    this.adicionarLog('❌ Nenhuma aldeia encontrada.', 'error');
                    return;
                }

                if (progressBar) progressBar.style.width = '100%';
                if (progressLabel) progressLabel.textContent = `${aldeias.length} aldeias carregadas!`;

                this.villagesData = aldeias;
                this.calcularEstatisticas();
                this.atualizarResumo();
                this.renderizarTabela();

                this.adicionarLog(`✅ ${aldeias.length} aldeias carregadas com sucesso!`, 'success');
                this.adicionarLog(`📊 Média de pontos: ${Math.floor(this.mediaPontos).toLocaleString()} pts`, 'info');
                this.adicionarLog(`🌲 Médias: 🌲${this.mediaWood.toLocaleString()} 🧱${this.mediaStone.toLocaleString()} ⚙️${this.mediaIron.toLocaleString()}`, 'info');
                this.adicionarLog(`🛡️ Estoque de segurança doadora: ${this.config.estoqueSegurancaDoadora.toLocaleString()}`, 'info');
                this.adicionarLog(`📦 Limite por comando: ${this.config.limiteEnvioPorComando.toLocaleString()} (conta ${this.premiumAtivo ? 'Premium' : 'Básica'})`, 'info');

                if (!this.premiumAtivo) {
                    this.adicionarLog('💡 Conta Básica: mercadores serão validados ao clicar em ENVIAR (ícone "?" na tabela)', 'info');
                }

            } catch (err) {
                this.adicionarLog(`❌ Erro na extração global: ${err.message}`, 'error');
                console.error(err);
            } finally {
                this.carregando = false;
                if (btn) { btn.textContent = '🔄 CARREGAR DADOS'; btn.disabled = false; }
                if (progressWrap) setTimeout(() => {
                    progressWrap.style.display = 'none';
                    if (progressBar) progressBar.style.width = '0%';
                    if (progressLabel) progressLabel.textContent = '0%';
                }, 2000);
            }
        },

        calcularEstatisticas() {
            const n = this.villagesData.length;
            if (n === 0) return;

            this.totalWood  = this.villagesData.reduce((s, v) => s + v.wood, 0);
            this.totalStone = this.villagesData.reduce((s, v) => s + v.stone, 0);
            this.totalIron  = this.villagesData.reduce((s, v) => s + v.iron, 0);
            this.mediaWood  = Math.floor(this.totalWood / n);
            this.mediaStone = Math.floor(this.totalStone / n);
            this.mediaIron  = Math.floor(this.totalIron / n);

            const totalPontos = this.villagesData.reduce((s, v) => s + v.pontos, 0);
            this.mediaPontos  = totalPontos / n;
        },

        atualizarResumo() {
            const mapa = {
                'tw-total-wood': this.totalWood,
                'tw-total-stone': this.totalStone,
                'tw-total-iron': this.totalIron,
                'tw-media-wood': this.mediaWood,
                'tw-media-stone': this.mediaStone,
                'tw-media-iron': this.mediaIron,
                'tw-media-pontos': Math.floor(this.mediaPontos)
            };
            for (const [id, val] of Object.entries(mapa)) {
                const el = document.getElementById(id);
                if (el) el.textContent = val.toLocaleString();
            }
            const badge = document.getElementById('tw-premium-badge');
            if (badge) {
                badge.textContent = this.premiumAtivo ? '⭐ Premium' : '📋 Básica';
                badge.style.color = this.premiumAtivo ? this.CORES.aviso : this.CORES.textoDim;
            }
        },

        // ⭐ FUNÇÃO CORRIGIDA - OCULTA ALDEIAS SEM MERCADORES
        getSugestoesBalanceamento() {
            this.usedOriginsInCycle.clear();
            this.usedDestinationsInCycle.clear();

            const seguranca  = this.config.estoqueSegurancaDoadora;
            const limiteCmd  = this.config.limiteEnvioPorComando;
            const minIndiv   = this.config.minEnvioIndividual;
            const pctArm     = this.config.limiteArmazemReceptora / 100;

            // ⭐ FILTRO INTELIGENTE DE DOADORAS:
            // - Premium: todas as aldeias acima da média
            // - Básica: só inclui se tiver mercadores validados > 0 OU ainda não validou
            const doadoras = this.villagesData
                .filter(a => {
                    if (a.pontos < this.mediaPontos) return false;

                    // Conta Premium: sempre considera
                    if (this.premiumAtivo) return true;

                    // Conta Básica: verifica validação de mercadores
                    if (a.merchantsValidated) {
                        // Se já validou, só inclui se tem mercadores > 0
                        return a.merchants > 0;
                    }

                    // Ainda não validou, inclui (vai validar no clique)
                    return true;
                })
                .sort((a, b) => b.pontos - a.pontos);

            const receptoras = this.villagesData
                .filter(a => a.pontos < this.mediaPontos)
                .sort((a, b) => a.pontos - b.pontos);

            const sugestoes = [];

            for (const doadora of doadoras) {
                if (this.usedOriginsInCycle.has(doadora.id)) continue;

                for (const receptora of receptoras) {
                    if (this.usedDestinationsInCycle.has(receptora.id)) continue;
                    if (doadora.id === receptora.id) continue;

                    const limiteArm = Math.floor(receptora.warehouseCapacity * pctArm);

                    const calcEnvio = (disponivel, atual) => {
                        const disp = Math.max(0, disponivel - seguranca);
                        const espaco = Math.max(0, limiteArm - atual);
                        const qtd = Math.min(disp, espaco, limiteCmd);
                        return qtd >= minIndiv ? Math.floor(qtd) : 0;
                    };

                    let enviarWood  = calcEnvio(doadora.wood,  receptora.wood);
                    let enviarStone = calcEnvio(doadora.stone, receptora.stone);
                    let enviarIron  = calcEnvio(doadora.iron,  receptora.iron);

                    const totalEnvio = enviarWood + enviarStone + enviarIron;
                    if (totalEnvio < minIndiv) continue;

                    let wood = enviarWood, stone = enviarStone, iron = enviarIron;
                    if (totalEnvio > limiteCmd) {
                        const fator = limiteCmd / totalEnvio;
                        wood  = Math.floor(wood  * fator);
                        stone = Math.floor(stone * fator);
                        iron  = Math.floor(iron  * fator);
                    }

                    const total = wood + stone + iron;
                    if (total < minIndiv) continue;

                    const merchantsNeeded = Math.ceil(total / 1000);

                    sugestoes.push({
                        origem: doadora,
                        destino: receptora,
                        wood, stone, iron,
                        total,
                        merchantsNeeded,
                        pontosOrigem: doadora.pontos,
                        pontosDestino: receptora.pontos
                    });

                    this.usedOriginsInCycle.add(doadora.id);
                    this.usedDestinationsInCycle.add(receptora.id);

                    doadora.wood  -= wood;
                    doadora.stone -= stone;
                    doadora.iron  -= iron;
                    receptora.wood  += wood;
                    receptora.stone += stone;
                    receptora.iron  += iron;

                    break;
                }
            }

            return sugestoes;
        },

        async enviarRecursos(origemId, destinoId, wood, stone, iron, botaoElement) {
            if (this.enviando) {
                this.adicionarLog('⏳ Já há um envio em andamento.', 'warning');
                return;
            }

            const origem = this.villagesData.find(v => v.id === origemId);
            const destino = this.villagesData.find(v => v.id === destinoId);
            if (!origem || !destino) {
                this.adicionarLog('❌ Aldeia não encontrada internamente.', 'error');
                return;
            }

            this.enviando = true;
            if (botaoElement) {
                botaoElement.disabled = true;
                botaoElement.textContent = '⏳ Verificando…';
            }

            try {
                this.adicionarLog(`🔍 Obtendo detalhes de envio de ${origem.nome}...`, 'info');
                const detalhes = await this.obterDetalhesEnvio(origemId);

                if (!detalhes.csrf) {
                    this.adicionarLog(`❌ ${origem.nome}: token CSRF não encontrado.`, 'error');
                    return;
                }

                const totalRecursos = wood + stone + iron;
                const merchantsNeeded = Math.ceil(totalRecursos / 1000);

                if (detalhes.merchants < merchantsNeeded) {
                    origem.merchants = detalhes.merchants;
                    origem.merchantsValidated = true;

                    this.adicionarLog(`⚠️ ${origem.nome}: mercadores insuficientes (${detalhes.merchants} disponíveis, ${merchantsNeeded} necessários). Envio cancelado.`, 'warning');
                    this.adicionarLog(`💡 Aguarde a reposição de mercadores em ${origem.nome}.`, 'info');

                    this.renderizarTabela();
                    return;
                }

                origem.merchants = detalhes.merchants;
                origem.merchantsValidated = true;

                const seg = this.config.estoqueSegurancaDoadora;
                if (detalhes.woodNow - wood < seg || detalhes.stoneNow - stone < seg || detalhes.ironNow - iron < seg) {
                    this.adicionarLog(`❌ ${origem.nome}: envio violaria o estoque de segurança de ${seg.toLocaleString()}.`, 'error');
                    return;
                }

                if (botaoElement) botaoElement.textContent = '⏳ Simulando…';
                this.adicionarLog(`📤 [1/2] Simulando: 🌲${wood.toLocaleString()} 🧱${stone.toLocaleString()} ⚙️${iron.toLocaleString()} — ${origem.nome} → ${destino.nome}`, 'info');

                const urlSim = `/game.php?village=${origemId}&screen=market&mode=send&try=confirm_send`;
                const [destX, destY] = destino.coord.split('|');
                const bodySim = new URLSearchParams({
                    wood, stone, iron,
                    target_id: destinoId,
                    h: detalhes.csrf,
                    x: destX, y: destY
                });

                const respSim = await fetch(urlSim, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: bodySim.toString()
                });

                if (!respSim.ok) throw new Error(`HTTP ${respSim.status} na simulação`);
                const htmlSim = await respSim.text();

                const merchantsConfirmMatch = htmlSim.match(/market_merchant_available_count[^>]*>(\d+)</);
                if (merchantsConfirmMatch) {
                    const merchantsAposSimulacao = parseInt(merchantsConfirmMatch[1]);
                    if (merchantsAposSimulacao < merchantsNeeded) {
                        origem.merchants = merchantsAposSimulacao;
                        this.adicionarLog(`⚠️ ${origem.nome}: mercadores esgotaram durante a simulação.`, 'warning');
                        this.renderizarTabela();
                        return;
                    }
                }

                const csrfConfirm = this.extrairCsrfToken(htmlSim);

                if (!csrfConfirm) {
                    console.error('[CSRF-CONFIRM] HTML de confirmação:', htmlSim.substring(0, 800));
                    this.adicionarLog(`❌ Página de confirmação sem CSRF.`, 'error');
                    return;
                }

                const lerCampo = (regex, fallback) => { const m = htmlSim.match(regex); return m ? parseInt(m[1]) : fallback; };
                const woodFinal = lerCampo(/name="wood"\s+value="(\d+)"/i, wood);
                const stoneFinal = lerCampo(/name="stone"\s+value="(\d+)"/i, stone);
                const ironFinal = lerCampo(/name="iron"\s+value="(\d+)"/i, iron);
                const tidMatch = htmlSim.match(/name="target_id"\s+value="(\d+)"/i);
                const targetId = tidMatch ? tidMatch[1] : destinoId;
                const totalFinal = woodFinal + stoneFinal + ironFinal;

                if (botaoElement) botaoElement.textContent = '⏳ Confirmando…';
                this.adicionarLog('📤 [2/2] Confirmando envio…', 'info');

                const urlConf = `/game.php?village=${origemId}&screen=market&action=send`;
                const bodyConf = new URLSearchParams({
                    target_id: targetId,
                    wood: woodFinal,
                    stone: stoneFinal,
                    iron: ironFinal,
                    h: csrfConfirm
                });

                const respConf = await fetch(urlConf, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: bodyConf.toString()
                });

                if (!respConf.ok) throw new Error(`HTTP ${respConf.status} na confirmação`);
                const htmlConf = await respConf.text();

                const falhaConhecida = htmlConf.includes('insuficiente') ||
                                       htmlConf.includes('Você não possui recursos suficientes') ||
                                       htmlConf.includes('not enough') ||
                                       htmlConf.includes('zu wenig');

                const sucessoEspecifico = htmlConf.includes('foram enviados') ||
                                          htmlConf.includes('Enviado com sucesso') ||
                                          htmlConf.includes('sucesso');
                const sucesso = !falhaConhecida && (sucessoEspecifico || htmlConf.includes('screen=market') || htmlConf.includes('market'));

                if (sucesso) {
                    this.adicionarLog(`✅ SUCESSO: ${merchantsNeeded} comerciante(s) | ${totalFinal.toLocaleString()} recursos | ${origem.nome} → ${destino.nome}`, 'success');

                    origem.wood -= woodFinal;
                    origem.stone -= stoneFinal;
                    origem.iron -= ironFinal;
                    destino.wood += woodFinal;
                    destino.stone += stoneFinal;
                    destino.iron += ironFinal;

                    if (origem.merchants && origem.merchantsValidated) {
                        origem.merchants -= merchantsNeeded;
                        this.adicionarLog(`📊 ${origem.nome}: agora com ${origem.merchants} mercadores restantes.`, 'info');
                    }

                    const limiteArm = Math.floor(destino.warehouseCapacity * (this.config.limiteArmazemReceptora / 100));
                    destino.espacoUtilizavel = Math.max(0, limiteArm - destino.wood - destino.stone - destino.iron);

                    this.calcularEstatisticas();
                    this.atualizarResumo();
                    this.renderizarTabela();
                } else if (falhaConhecida) {
                    this.adicionarLog(`❌ Falha: recursos insuficientes no jogo — ${origem.nome}`, 'error');
                } else {
                    this.adicionarLog(`❌ Resposta inesperada do servidor — ${origem.nome} → ${destino.nome}`, 'error');
                }

            } catch (err) {
                this.adicionarLog(`❌ Erro no envio: ${err.message}`, 'error');
                console.error(err);
            } finally {
                this.enviando = false;
                if (botaoElement) setTimeout(() => {
                    botaoElement.disabled = false;
                    botaoElement.textContent = '📦 ENVIAR';
                }, 1500);
            }
        },

        escapeHtml(str) {
            if (!str) return '';
            return str.replace(/[&<>]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
        },

        renderizarTabela() {
            const tbody = document.getElementById('tw-lista-aldeias');
            if (!tbody) return;

            if (this.villagesData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:' + this.CORES.textoDim + ';padding:40px 0;">Clique em <strong style="color:' + this.CORES.verde + ';">CARREGAR DADOS</strong> para iniciar.</td></tr>';
                const countEl = document.getElementById('tw-sugestoes-count');
                if (countEl) countEl.textContent = '';
                return;
            }

            const snapshot = JSON.parse(JSON.stringify(this.villagesData));
            const sugestoes = this.getSugestoesBalanceamento();
            this.villagesData = snapshot;

            if (!sugestoes || sugestoes.length === 0) {
                tbody.innerHTML = '<td><td colspan="4" style="text-align:center;padding:32px 0;"><span style="font-size:22px;">✅</span><br><span style="color:' + this.CORES.verde + ';font-weight:bold;">Todas as aldeias estão em equilíbrio!</span><br><span style="font-size:10px;color:' + this.CORES.textoDim + ';">Segurança doadora: ' + this.config.estoqueSegurancaDoadora.toLocaleString() + ' | Limite/cmd: ' + this.config.limiteEnvioPorComando.toLocaleString() + '</span></td></tr>';
                const countEl = document.getElementById('tw-sugestoes-count');
                if (countEl) countEl.textContent = 'Nenhuma sugestão';
                return;
            }

            const C = this.CORES;
            let html = '';

            for (const s of sugestoes) {
                const { origem, destino } = s;

                let mercadoresStatus = '';
                let mercadoresTooltip = '';

                if (!this.premiumAtivo) {
                    if (origem.merchantsValidated && origem.merchants !== null) {
                        mercadoresStatus = ' (' + origem.merchants + ' disp.)';
                        mercadoresTooltip = '';
                    } else {
                        mercadoresStatus = ' (?)';
                        mercadoresTooltip = 'title="⚠️ Conta Básica: mercadores serão validados ao enviar"';
                    }
                }

                const pctArm = origem.warehouseCapacity > 0
                    ? Math.min(100, ((origem.wood + origem.stone + origem.iron) / origem.warehouseCapacity) * 100)
                    : 0;

                const chips = [];
                if (s.wood > 0) chips.push('<span class="tw-res-chip tw-chip-wood">🌲 ' + s.wood.toLocaleString() + '</span>');
                if (s.stone > 0) chips.push('<span class="tw-res-chip tw-chip-stone">🧱 ' + s.stone.toLocaleString() + '</span>');
                if (s.iron > 0) chips.push('<span class="tw-res-chip tw-chip-iron">⚙️ ' + s.iron.toLocaleString() + '</span>');

                const difPontos = origem.pontos - destino.pontos;
                const difLabel = difPontos > 0 ? '+' + difPontos.toLocaleString() + ' pts acima' : difPontos.toLocaleString() + ' pts';

                html += '<tr class="tw-row">';
                html += '<td class="tw-td-origin">';
                html += '<div class="tw-village-name">' + this.escapeHtml(origem.nome) + '</div>';
                html += '<div class="tw-village-coord">' + origem.coord + '</div>';
                html += '<div class="tw-village-pts" style="font-size:10px;color:' + C.pontos + ';margin-top:2px;">🏅 ' + origem.pontos.toLocaleString() + ' pts (DOADORA)</div>';
                html += '<div class="tw-fill-bar"><div class="tw-fill-inner" style="width:' + pctArm.toFixed(1) + '%"></div></div>';
                html += '<div class="tw-village-res">🌲' + origem.wood.toLocaleString() + ' 🧱' + origem.stone.toLocaleString() + ' ⚙️' + origem.iron.toLocaleString() + '</div>';
                html += '<div class="tw-merchant-status" style="font-size:8px;color:' + C.textoDim + ';margin-top:3px;" ' + mercadoresTooltip + '>🚚 Mercadores' + mercadoresStatus + '</div>';
                html += '</td>';

                html += '<td class="tw-td-dest">';
                html += '<div class="tw-village-name">' + this.escapeHtml(destino.nome) + '</div>';
                html += '<div class="tw-village-coord">' + destino.coord + '</div>';
                html += '<div class="tw-village-pts" style="font-size:10px;color:' + C.aviso + ';margin-top:2px;">📈 ' + destino.pontos.toLocaleString() + ' pts (RECEPTORA)</div>';
                html += '<div style="font-size:9px;color:' + C.textoDim + ';margin-top:2px;">↕ Diferença: ' + difLabel + '</div>';
                html += '<div class="tw-village-res">🌲' + destino.wood.toLocaleString() + ' 🧱' + destino.stone.toLocaleString() + ' ⚙️' + destino.iron.toLocaleString() + '</div>';
                html += '<div style="font-size:9px;color:' + C.textoDim + ';margin-top:3px;">🏚️ ' + destino.espacoUtilizavel.toLocaleString() + ' livre (≤' + this.config.limiteArmazemReceptora + '% armazém)</div>';
                html += '</td>';

                html += '<td class="tw-td-suggest">';
                html += '<div class="tw-chips">' + chips.join('') + '</div>';
                html += '<div class="tw-merchant-count">🚚 ' + s.merchantsNeeded + ' comerciante(s) · 📦 ' + s.total.toLocaleString() + ' (limite ' + this.config.limiteEnvioPorComando.toLocaleString() + ')</div>';
                html += '</td>';

                html += '<td class="tw-td-action">';
                html += '<button class="tw-send-btn" onclick="TWResourceBalancer.enviarRecursos(' + origem.id + ', ' + destino.id + ', ' + s.wood + ', ' + s.stone + ', ' + s.iron + ', this)">📦 ENVIAR</button>';
                html += '</td>';
                html += '</tr>';
            }

            tbody.innerHTML = html;

            const countEl = document.getElementById('tw-sugestoes-count');
            if (countEl) countEl.textContent = sugestoes.length + ' sugestão(ões) — Crescimento Acelerado por Pontos';
        },

        renderizarDashboard() {
            document.body.innerHTML = '';
            this.carregarConfig();

            const C = this.CORES;

            document.body.style.cssText = 'background:' + C.fundo + ';margin:0;padding:0;font-family:\'Segoe UI\',system-ui,-apple-system,sans-serif;color:' + C.texto + ';min-height:100vh;';

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
                    #tw-header-right { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 11px; }

                    #tw-config-bar { background: ${C.fundoCard}; border-bottom: 1px solid ${C.borda}; padding: 8px 20px; display: flex; align-items: center; gap: 24px; flex-shrink: 0; flex-wrap: wrap; }
                    .tw-config-group { display: flex; align-items: center; gap: 7px; font-size: 11px; color: ${C.textoDim}; }
                    .tw-config-group label { white-space: nowrap; }
                    .tw-config-group input[type=number] { width: 75px; background: ${C.fundo}; color: ${C.texto}; border: 1px solid ${C.borda}; border-radius: 4px; padding: 3px 6px; font-size: 11px; outline: none; }
                    .tw-config-group input[type=number]:focus { border-color: ${C.verde}66; }

                    #tw-stats-strip { display: flex; gap: 12px; padding: 10px 20px; background: ${C.fundo}; border-bottom: 1px solid ${C.borda}; flex-shrink: 0; flex-wrap: wrap; }
                    .tw-stat-card { background: ${C.fundoCard}; border: 1px solid ${C.borda}; border-radius: 6px; padding: 8px 14px; min-width: 160px; flex: 1; }
                    .tw-stat-card-title { font-size: 10px; color: ${C.textoDim}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }
                    .tw-stat-card-body { font-size: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
                    .tw-res-val { color: ${C.texto}; }
                    .tw-res-val b { color: ${C.verde}; }
                    .tw-pts-val b { color: ${C.pontos}; }

                    #tw-progress-container { padding: 0 20px 8px; display: none; flex-shrink: 0; }
                    #tw-progress-track { background: ${C.fundoCard}; border: 1px solid ${C.borda}; border-radius: 6px; height: 22px; overflow: hidden; position: relative; }
                    #tw-loading-progress { height: 100%; width: 0%; background: linear-gradient(90deg, ${C.verdeEscuro}, ${C.verde}); transition: width 0.35s ease; border-radius: 6px; }
                    #tw-progress-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; font-family: monospace; color: ${C.texto}; pointer-events: none; }

                    #tw-main { display: flex; flex: 1; overflow: hidden; }
                    #tw-table-panel { flex: 3; overflow-y: auto; padding: 0; }

                    .tw-table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    .tw-table thead th { background: ${C.fundoCard}; color: ${C.verde}; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 10px 12px; border-bottom: 1px solid ${C.borda}; position: sticky; top: 0; z-index: 10; white-space: nowrap; }
                    .tw-row { border-bottom: 1px solid ${C.borda}; transition: background 0.15s; }
                    .tw-row:hover { background: ${C.verdeDim}; }
                    .tw-row td { padding: 9px 12px; vertical-align: middle; }

                    .tw-village-name { font-weight: 600; color: ${C.texto}; font-size: 12px; }
                    .tw-village-coord { font-size: 9px; color: ${C.verde}66; margin-top: 1px; }
                    .tw-village-res { font-size: 9px; color: ${C.textoDim}; margin-top: 4px; }

                    .tw-fill-bar { background: ${C.fundo}; border-radius: 3px; height: 4px; width: 70px; margin-top: 5px; overflow: hidden; }
                    .tw-fill-inner { height: 100%; background: #e74c3c; border-radius: 3px; transition: width 0.3s; }

                    .tw-chips { display: flex; flex-wrap: wrap; gap: 4px; }
                    .tw-res-chip { display: inline-block; font-size: 10px; font-weight: 600; border-radius: 4px; padding: 2px 7px; border: 1px solid transparent; }
                    .tw-chip-wood  { background: #8b691411; border-color: ${C.madeira}44; color: #c9a227; }
                    .tw-chip-stone { background: #60708011; border-color: ${C.pedra}44; color: #8ca0b0; }
                    .tw-chip-iron  { background: #5a8a9f11; border-color: ${C.ferro}44; color: ${C.ferro}; }

                    .tw-merchant-count { font-size: 9px; color: ${C.textoDim}; margin-top: 5px; }

                    .tw-send-btn { background: ${C.verde}; color: #000; border: none; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; transition: all 0.15s; white-space: nowrap; }
                    .tw-send-btn:hover:not(:disabled) { background: ${C.verdeClaro}; transform: translateY(-1px); box-shadow: 0 3px 10px ${C.verde}44; }
                    .tw-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

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
                        <h1>⚖️ TW Resource Balancer <span>v4.1 — Crescimento Acelerado + Validação Inteligente</span></h1>
                        <div id="tw-header-right">
                            <span id="tw-premium-badge" style="font-size:11px;color:${C.textoDim};">— conta —</span>
                        </div>
                    </div>

                    <div id="tw-config-bar">
                        <div class="tw-config-group">
                            <label>🛡️ Reserva doadora:</label>
                            <input type="number" id="tw-seguranca" value="${this.config.estoqueSegurancaDoadora}" min="5000" max="200000" step="5000">
                            <span>res.</span>
                        </div>
                        <div class="tw-config-group">
                            <label>📦 Limite/cmd:</label>
                            <input type="number" id="tw-limite-cmd" value="${this.config.limiteEnvioPorComando}" min="1000" max="20000" step="1000">
                            <span>res.</span>
                        </div>
                        <div class="tw-config-group">
                            <label>🏚️ Armazém receptora:</label>
                            <input type="number" id="tw-limite-arm" value="${this.config.limiteArmazemReceptora}" min="50" max="99" step="5">
                            <span>%</span>
                        </div>
                        <div class="tw-config-group">
                            <label>Min. individual:</label>
                            <input type="number" id="tw-min-indiv" value="${this.config.minEnvioIndividual}" min="100" max="10000" step="100">
                        </div>
                    </div>

                    <div id="tw-stats-strip">
                        <div class="tw-stat-card">
                            <div class="tw-stat-card-title">📦 Totais</div>
                            <div class="tw-stat-card-body">
                                <span class="tw-res-val">🌲 <b id="tw-total-wood">0</b></span>
                                <span class="tw-res-val">🧱 <b id="tw-total-stone">0</b></span>
                                <span class="tw-res-val">⚙️ <b id="tw-total-iron">0</b></span>
                            </div>
                        </div>
                        <div class="tw-stat-card">
                            <div class="tw-stat-card-title">📊 Médias por Aldeia</div>
                            <div class="tw-stat-card-body">
                                <span class="tw-res-val">🌲 <b id="tw-media-wood">0</b></span>
                                <span class="tw-res-val">🧱 <b id="tw-media-stone">0</b></span>
                                <span class="tw-res-val">⚙️ <b id="tw-media-iron">0</b></span>
                            </div>
                        </div>
                        <div class="tw-stat-card">
                            <div class="tw-stat-card-title">🏅 Critério: Média de Pontos</div>
                            <div class="tw-stat-card-body">
                                <span class="tw-pts-val">Média: <b id="tw-media-pontos">0</b> pts</span>
                            </div>
                        </div>
                    </div>

                    <div id="tw-progress-container">
                        <div id="tw-progress-track">
                            <div id="tw-loading-progress"></div>
                            <div id="tw-progress-label">0%</div>
                        </div>
                    </div>

                    <div id="tw-toolbar">
                        <button id="tw-btn-carregar" class="tw-action-btn">🔄 CARREGAR DADOS</button>
                        <span id="tw-sugestoes-count"></span>
                    </div>

                    <div id="tw-main">
                        <div id="tw-table-panel">
                            <table class="tw-table">
                                <thead>
                                    <tr><th>🏅 Doadora (acima da média)</th><th>📈 Receptora (abaixo da média)</th><th>Sugestão de Envio</th><th>Ação</th></tr>
                                </thead>
                                <tbody id="tw-lista-aldeias">
                                    <tr><td colspan="4" style="text-align:center;color:${C.textoDim};padding:40px 0;">Clique em <strong style="color:${C.verde};">CARREGAR DADOS</strong> para iniciar.</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="tw-log-panel">
                            <div id="tw-log-header">📝 Log de Atividades</div>
                            <div id="tw-log-area"></div>
                        </div>
                    </div>
                </div>
            `;

            this.adicionarLog('⚖️ TW Resource Balancer v4.1 iniciado.', 'info');
            this.adicionarLog('🚀 Extração global ativa: apenas 1 fetch para todas as aldeias!', 'success');
            this.adicionarLog('🏅 Lógica: Crescimento Acelerado por Pontos de Evolução.', 'info');
            this.adicionarLog('📦 Limite por comando: ' + this.config.limiteEnvioPorComando.toLocaleString() + ' (conta ' + (this.premiumAtivo ? 'Premium' : 'Básica') + ').', 'info');

            if (!this.premiumAtivo) {
                this.adicionarLog('💡 Conta Básica detectada: mercadores serão validados apenas no momento do envio.', 'info');
                this.adicionarLog('🔍 Ícone (?) indica que os mercadores ainda não foram verificados.', 'info');
                this.adicionarLog('✨ Aldeias sem mercadores serão ocultadas automaticamente após validação.', 'info');
            }

            const bindConfig = (id, key, parser) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.onchange = (e) => {
                    this.config[key] = parser(e.target.value);
                    this.salvarConfig();
                    if (this.villagesData.length > 0) this.renderizarTabela();
                    this.adicionarLog('⚙️ ' + key + ' → ' + this.config[key], 'info');
                };
            };

            bindConfig('tw-seguranca',   'estoqueSegurancaDoadora',  v => Math.max(5000, parseInt(v) || 30000));
            bindConfig('tw-limite-cmd',  'limiteEnvioPorComando',    v => Math.max(1000, Math.min(20000, parseInt(v) || 10000)));
            bindConfig('tw-limite-arm',  'limiteArmazemReceptora',   v => Math.max(50,   Math.min(99,    parseInt(v) || 90)));
            bindConfig('tw-min-indiv',   'minEnvioIndividual',       v => Math.max(100,  parseInt(v) || 1000));

            document.getElementById('tw-btn-carregar').onclick = () => this.carregarDados();
            window.TWResourceBalancer = this;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TWResourceBalancer.init());
    } else {
        TWResourceBalancer.init();
    }

})();
