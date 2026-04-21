// ==UserScript==
// @name         TW Recruit Dashboard
// @version      12.0
// @description  Dashboard com especialização de aldeias e recrutamento proporcional - COM SALDO LÍQUIDO NA FILA
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

    const ui = TWUI.create('twrd'); // TW Recruit Dashboard prefix

    const TWRecruitDashboard = {
        DASHBOARD_PARAM: 'twRecruit=true',
        STORAGE_KEY: 'tw_recruit_v12',

        configAldeias: {},
        cacheAldeias: [],
        dadosAldeias: [],
        recrutamentoAtivo: false,
        cicloAtual: 0,
        totalRecrutados: 0,
        dadosCarregados: false,
        carregando: false,
        pauseBetweenVillages: 1500,
        pauseBetweenCycles: 60000,
        cicloTimeout: null,
        loadingProgress: 0,
        unidadesGlobais: null,

        PRESETS: {
            ATAQUE: [
                { unidade: 'axe', quantidade: 6000, nome: 'Bárbaro' },
                { unidade: 'light', quantidade: 3000, nome: 'Cav. Leve' },
                { unidade: 'ram', quantidade: 300, nome: 'Aríete' }
            ],
            DEFESA: [
                { unidade: 'spear', quantidade: 6000, nome: 'Lanceiro' },
                { unidade: 'sword', quantidade: 6000, nome: 'Espadachim' },
                { unidade: 'heavy', quantidade: 1200, nome: 'Cav. Pesada' }
            ]
        },

        UNIDADES: {
            spear: { nome: 'Lanceiro', tela: 'barracks', icone: 'spear', populacao: 1, patterns: ['Lanceiro', 'lanceiro'] },
            sword: { nome: 'Espadachim', tela: 'barracks', icone: 'sword', populacao: 1, patterns: ['Espadachim', 'espadachim'] },
            axe: { nome: 'Bárbaro', tela: 'barracks', icone: 'axe', populacao: 1, patterns: ['Bárbaro', 'bárbaro', 'Barbaro', 'barbaro'] },
            archer: { nome: 'Arqueiro', tela: 'barracks', icone: 'archer', populacao: 1, patterns: ['Arqueiro', 'arqueiro'] },
            spy: { nome: 'Explorador', tela: 'stable', icone: 'spy', populacao: 2, patterns: ['Explorador', 'explorador'] },
            light: { nome: 'Cav. Leve', tela: 'stable', icone: 'light', populacao: 4, patterns: ['Cavalaria leve', 'Cav. Leve', 'light'] },
            marcher: { nome: 'Cav. Arqueira', tela: 'stable', icone: 'marcher', populacao: 5, patterns: ['Arqueiro a cavalo', 'Cav. Arqueira', 'marcher'] },
            heavy: { nome: 'Cav. Pesada', tela: 'stable', icone: 'heavy', populacao: 6, patterns: ['Cavalaria pesada', 'Cav. Pesada', 'heavy'] },
            ram: { nome: 'Aríete', tela: 'garage', icone: 'ram', populacao: 5, patterns: ['Aríete', 'ariete', 'Ram', 'ram'] },
            catapult: { nome: 'Catapulta', tela: 'garage', icone: 'catapult', populacao: 8, patterns: ['Catapulta', 'catapulta'] }
        },

        init() {
            ui.injectStyles();

            if (window.location.href.includes(this.DASHBOARD_PARAM)) {
                this.renderizarDashboard();
            } else {
                this.adicionarBotaoAbrirDashboard();
            }
        },

        adicionarBotaoAbrirDashboard() {
            ui.floatBtn('🎮 TW Recruit v12.0', () => {
                window.open(window.location.href.split('?')[0] + '?' + this.DASHBOARD_PARAM, 'TWRecruitDashboard');
            });
        },

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        adicionarLog(msg, tipo) {
            ui.log(msg, tipo);
        },

        salvarEstado() {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                configAldeias: this.configAldeias,
                totalRecrutados: this.totalRecrutados,
                cicloAtual: this.cicloAtual,
                recrutamentoAtivo: this.recrutamentoAtivo,
                pauseBetweenVillages: this.pauseBetweenVillages,
                pauseBetweenCycles: this.pauseBetweenCycles
            }));
        },

        carregarEstado() {
            const salvo = localStorage.getItem(this.STORAGE_KEY);
            if (salvo) {
                const d = JSON.parse(salvo);
                this.configAldeias = d.configAldeias || {};
                this.totalRecrutados = d.totalRecrutados || 0;
                this.cicloAtual = d.cicloAtual || 0;
                this.recrutamentoAtivo = d.recrutamentoAtivo || false;
                this.pauseBetweenVillages = d.pauseBetweenVillages || 1500;
                this.pauseBetweenCycles = d.pauseBetweenCycles || 60000;
            }
        },

        resetGeral() {
            if (!confirm('⚠️ ATENÇÃO: Isso irá resetar TODAS as configurações. A página será recarregada.')) return;
            if (this.recrutamentoAtivo) this.pararRecrutamento();
            localStorage.removeItem(this.STORAGE_KEY);
            this.configAldeias = {};
            this.totalRecrutados = 0;
            this.cicloAtual = 0;
            this.recrutamentoAtivo = false;
            this.dadosCarregados = false;
            this.dadosAldeias = [];
            this.cacheAldeias = [];
            this.unidadesGlobais = null;
            this.adicionarLog('🔄 Reset geral executado! Recarregando página...', 'warning');
            setTimeout(() => location.reload(), 1500);
        },

        async obterTodasAldeias() {
            if (this.cacheAldeias.length > 0) return this.cacheAldeias;
            const meuId = window.game_data?.player?.id;
            if (!meuId) return [];
            try {
                const response = await fetch('/map/village.txt', { credentials: 'same-origin' });
                if (!response.ok) throw new Error('Falha ao carregar village.txt');
                const dados = await response.text();
                this.cacheAldeias = dados.trim().split('\n')
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
                return this.cacheAldeias;
            } catch (err) {
                console.error('Erro ao carregar aldeias:', err);
                return [];
            }
        },

        async detectarUnidadesGlobais() {
            if (this.unidadesGlobais) return this.unidadesGlobais;

            const aldeias = await this.obterTodasAldeias();
            if (aldeias.length === 0) return [];

            try {
                const url = `/game.php?village=${aldeias[0].id}&screen=train`;
                const response = await fetch(url, { credentials: 'same-origin' });
                if (!response.ok) return [];

                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const unidades = [];
                const linhas = doc.querySelectorAll('tr.row_a, tr.row_b');

                for (const row of linhas) {
                    const nomeUnidade = row.querySelector('td:first-child')?.textContent || '';
                    for (const [key, info] of Object.entries(this.UNIDADES)) {
                        if (nomeUnidade.includes(info.nome) ||
                            info.patterns.some(p => nomeUnidade.includes(p))) {
                            unidades.push(key);
                            break;
                        }
                    }
                }

                this.unidadesGlobais = unidades;
                this.adicionarLog(`🌍 Unidades detectadas: ${unidades.join(', ')}`, 'info');
                return unidades;
            } catch (err) {
                console.error('Erro ao detectar unidades:', err);
                return Object.keys(this.UNIDADES);
            }
        },

        async carregarDadosCompletosAldeia(aldeia) {
            try {
                const url = `/game.php?village=${aldeia.id}&screen=train`;
                const response = await fetch(url, { credentials: 'same-origin' });
                if (!response.ok) return null;

                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Detectar unidades disponíveis nesta página
                const unidadesNaPagina = [];
                const rows = doc.querySelectorAll('tr.row_a, tr.row_b');

                for (const row of rows) {
                    const nomeUnidade = row.querySelector('td:first-child')?.textContent || '';
                    for (const [key, info] of Object.entries(this.UNIDADES)) {
                        if (nomeUnidade.includes(info.nome) ||
                            info.patterns.some(p => nomeUnidade.includes(p))) {
                            unidadesNaPagina.push(key);
                            break;
                        }
                    }
                }

                // ========== 1. POPULAÇÃO ==========
                let pop = { atual: 0, maximo: 0, disponivel: 0 };
                const popAtualElem = doc.getElementById('pop_current_label');
                const popMaxElem = doc.getElementById('pop_max_label');

                if (popAtualElem && popMaxElem) {
                    const atual = parseInt(popAtualElem.textContent?.trim() || '0');
                    const maximo = parseInt(popMaxElem.textContent?.trim() || '0');
                    if (!isNaN(atual) && !isNaN(maximo) && maximo > 0) {
                        pop = { atual, maximo, disponivel: Math.max(0, maximo - atual) };
                    }
                }

                // ========== 2. TROPAS ==========
                const tropas = {};

                // Inicializar apenas unidades disponíveis
                for (const unidade of unidadesNaPagina) {
                    tropas[unidade] = { naAldeia: 0, emProducao: 0, naFila: 0, total: 0 };
                }

                // Extrair quantidades das linhas da tabela
                rows.forEach((row, idx) => {
                    if (idx < unidadesNaPagina.length) {
                        const unidade = unidadesNaPagina[idx];
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 3) {
                            const qtdMatch = cells[2].textContent?.match(/(\d+)/);
                            if (qtdMatch) {
                                tropas[unidade].naAldeia = parseInt(qtdMatch[1]) || 0;
                            }
                        }
                    }
                });

                // ========== 3. TROPAS EM PRODUÇÃO/DISPENSA (COM SALDO LÍQUIDO) ==========
                const litRows = doc.querySelectorAll('tr.lit');
                for (const row of litRows) {
                    const text = row.textContent || '';
                    for (const unidade of unidadesNaPagina) {
                        const info = this.UNIDADES[unidade];
                        if (text.includes(info.nome) || info.patterns.some(p => text.includes(p))) {
                            const qtdMatch = text.match(/(-?\d+)/);  // Pega números negativos também
                            if (qtdMatch) {
                                const quantidade = parseInt(qtdMatch[1]);
                                tropas[unidade].emProducao += quantidade;  // Pode ser negativo (dispensa)
                            }
                            break;
                        }
                    }
                }

                // ========== 4. TROPAS NA FILA (COM SALDO LÍQUIDO) ==========
                const queueRows = doc.querySelectorAll('tr[id^="trainorder_"]');
                for (const row of queueRows) {
                    const text = row.textContent || '';
                    for (const unidade of unidadesNaPagina) {
                        const info = this.UNIDADES[unidade];
                        if (text.includes(info.nome) || info.patterns.some(p => text.includes(p))) {
                            const qtdMatch = text.match(/(-?\d+)/);
                            if (qtdMatch) {
                                const quantidade = parseInt(qtdMatch[1]);
                                tropas[unidade].naFila += quantidade;  // Pode ser negativo
                            }
                            break;
                        }
                    }
                }

                // ========== 5. CALCULAR TOTAIS ==========
                for (const unidade of unidadesNaPagina) {
                    tropas[unidade].total = tropas[unidade].naAldeia +
                                            tropas[unidade].emProducao +
                                            tropas[unidade].naFila;
                }

                const config = this.configAldeias[aldeia.id] || { tipo: 'OFF' };

                return {
                    ...aldeia,
                    pop: pop,
                    tropas: tropas,
                    unidadesDisponiveis: unidadesNaPagina,
                    tipo: config.tipo || 'OFF'
                };
            } catch (err) {
                console.error(`Erro ao carregar dados da aldeia ${aldeia.id}:`, err);
                return {
                    ...aldeia,
                    pop: { atual: 0, maximo: 0, disponivel: 0 },
                    tropas: {},
                    unidadesDisponiveis: [],
                    tipo: this.configAldeias[aldeia.id]?.tipo || 'OFF'
                };
            }
        },

        async carregarDadosAldeias() {
            if (this.carregando) {
                this.adicionarLog('⏳ Já está carregando... aguarde', 'info');
                return;
            }

            this.carregando = true;
            this.loadingProgress = 0;

            ui.btnLoading('twrd-btn-carregar', '⏳ CARREGANDO...');
            ui.setProgress(0, '0%');

            this.adicionarLog('🚀 Iniciando coleta de dados (UMA requisição por aldeia)...', 'info');

            const aldeias = await this.obterTodasAldeias();
            const novosDados = [];
            const BATCH_SIZE = 3;
            const totalAldeias = aldeias.length;

            for (let i = 0; i < totalAldeias; i += BATCH_SIZE) {
                const batch = aldeias.slice(i, i + BATCH_SIZE);
                const resultados = await Promise.all(batch.map(aldeia => this.carregarDadosCompletosAldeia(aldeia)));
                for (const resultado of resultados) {
                    if (resultado) novosDados.push(resultado);
                }
                this.loadingProgress = Math.min(100, Math.floor((i + BATCH_SIZE) / totalAldeias * 100));
                ui.setProgress(this.loadingProgress, `${this.loadingProgress}% (${Math.min(i + BATCH_SIZE, totalAldeias)}/${totalAldeias})`);
                await this.delay(500);
            }

            this.dadosAldeias = novosDados;
            this.dadosCarregados = true;
            this.dadosAldeias.sort((a, b) => (b.pop.disponivel || 0) - (a.pop.disponivel || 0));

            const totalPop = this.dadosAldeias.reduce((sum, a) => sum + (a.pop.disponivel || 0), 0);
            ui.updateStat('twrd-total-aldeias', this.dadosAldeias.length);
            ui.updateStat('twrd-total-pop', totalPop);
            ui.updateStat('twrd-total-recruits', this.totalRecrutados);
            ui.updateStat('twrd-ciclo-atual', this.cicloAtual);

            this.renderizarTabela();
            this.adicionarLog(`✅ Dados carregados: ${this.dadosAldeias.length} aldeias, ${totalPop.toLocaleString()} espaços livres`, 'success');

            setTimeout(() => ui.hideProgress(1000), 1500);
            ui.btnRestore('twrd-btn-carregar', '🔄 CARREGAR DADOS');
            this.carregando = false;
        },

        async obterMaximoRecrutavel(villageId, unidade) {
            try {
                const tela = this.UNIDADES[unidade].tela;
                const url = `/game.php?village=${villageId}&screen=${tela}`;
                const response = await fetch(url, { credentials: 'same-origin' });
                if (!response.ok) return 0;
                const html = await response.text();
                const regex = new RegExp(`<a id="${unidade}_\\d+_a"[^>]*>\\((\\d+)\\)</a>`, 'i');
                const match = html.match(regex);
                return match ? parseInt(match[1]) : 0;
            } catch (err) {
                console.error(`Erro ao obter máximo para ${unidade}:`, err);
                return 0;
            }
        },

        async recrutarUnidade(villageId, unidade, quantidadeDesejada, espacoDisponivel) {
            const unidadeInfo = this.UNIDADES[unidade];
            if (!unidadeInfo) return { success: false, reason: 'Unidade inválida', recrutado: 0 };
            const maximoRecrutavel = await this.obterMaximoRecrutavel(villageId, unidade);
            if (maximoRecrutavel === 0) return { success: false, reason: 'Recursos insuficientes', recrutado: 0 };
            let quantidadeReal = Math.min(quantidadeDesejada, maximoRecrutavel, espacoDisponivel);
            if (quantidadeReal <= 0) return { success: false, reason: 'Quantidade inválida', recrutado: 0 };
            try {
                const tela = unidadeInfo.tela;
                const url = `/game.php?village=${villageId}&screen=${tela}`;
                const response = await fetch(url, { credentials: 'same-origin' });
                if (!response.ok) return { success: false, reason: `HTTP ${response.status}`, recrutado: 0 };
                const html = await response.text();
                const csrfMatch = html.match(/"csrf":"([a-f0-9]+)"/i) || html.match(/name="h" value="([^"]+)"/);
                const csrf = csrfMatch ? csrfMatch[1] : '';
                if (!csrf) return { success: false, reason: 'CSRF não encontrado', recrutado: 0 };
                const postUrl = `/game.php?village=${villageId}&screen=${tela}&action=train&h=${csrf}`;
                const formData = new URLSearchParams();
                formData.set(unidade, quantidadeReal.toString());
                formData.set('h', csrf);
                const postResponse = await fetch(postUrl, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
                    body: formData.toString()
                });
                if (!postResponse.ok) return { success: false, reason: `HTTP ${postResponse.status}`, recrutado: 0 };
                const texto = await postResponse.text();
                if (/recursos insuficientes|resources needed/i.test(texto)) return { success: false, reason: 'Recursos insuficientes', recrutado: 0 };
                return { success: true, recrutado: quantidadeReal };
            } catch (err) {
                return { success: false, reason: err.message, recrutado: 0 };
            }
        },

        async recrutarProporcional(aldeia, preset, tipo) {
            if (!this.recrutamentoAtivo) return { recrutado: 0, concluida: false };
            let recrutadoTotal = 0;
            let todasConcluidas = true;

            if (aldeia.pop.disponivel <= 0) {
                this.adicionarLog(`⚠️ ${aldeia.nome}: Sem espaço na fazenda`, 'warning');
                return { recrutado: 0, concluida: false };
            }

            const presetValido = preset.filter(target =>
                aldeia.unidadesDisponiveis?.includes(target.unidade)
            );

            if (presetValido.length === 0) {
                this.adicionarLog(`⚠️ ${aldeia.nome}: Nenhuma unidade do preset ${tipo} disponível neste mundo`, 'warning');
                return { recrutado: 0, concluida: false };
            }

            const necessidades = [];
            for (const target of presetValido) {
                const tropaAtual = aldeia.tropas[target.unidade] || { total: 0 };
                const falta = Math.max(0, target.quantidade - tropaAtual.total);
                necessidades.push({ ...target, falta, totalAtual: tropaAtual.total });
                if (falta > 0) todasConcluidas = false;
            }

            if (todasConcluidas) {
                this.adicionarLog(`✅ ${aldeia.nome}: ${tipo} COMPLETO!`, 'success');
                return { recrutado: 0, concluida: true };
            }

            const populacaoTotalNecessaria = necessidades.reduce((sum, req) => sum + (req.falta * (this.UNIDADES[req.unidade]?.populacao || 1)), 0);
            if (populacaoTotalNecessaria === 0) return { recrutado: 0, concluida: todasConcluidas };

            const recrutarAgora = [];
            let populacaoRestante = aldeia.pop.disponivel;

            for (const req of necessidades) {
                if (req.falta <= 0 || populacaoRestante <= 0) {
                    recrutarAgora.push({ ...req, recrutar: 0 });
                    continue;
                }
                const popUnidade = this.UNIDADES[req.unidade].populacao;
                const proporcao = (req.falta * popUnidade) / populacaoTotalNecessaria;
                const quantidadeProporcional = Math.floor(populacaoRestante * proporcao / popUnidade);
                const quantidade = Math.min(quantidadeProporcional, req.falta, Math.floor(populacaoRestante / popUnidade));
                recrutarAgora.push({ ...req, recrutar: Math.max(1, quantidade) });
                populacaoRestante -= quantidade * popUnidade;
            }

            for (const item of recrutarAgora) {
                if (!this.recrutamentoAtivo) break;
                if (item.recrutar <= 0) continue;

                const resultado = await this.recrutarUnidade(aldeia.id, item.unidade, item.recrutar, aldeia.pop.disponivel);
                if (resultado.success) {
                    recrutadoTotal += resultado.recrutado;
                    this.totalRecrutados += resultado.recrutado;
                    aldeia.pop.disponivel -= resultado.recrutado * (this.UNIDADES[item.unidade].populacao || 1);
                    aldeia.pop.atual = aldeia.pop.maximo - aldeia.pop.disponivel;
                    if (aldeia.tropas && aldeia.tropas[item.unidade]) {
                        aldeia.tropas[item.unidade].naFila += resultado.recrutado;
                        aldeia.tropas[item.unidade].total += resultado.recrutado;
                    }
                    this.adicionarLog(`📦 ${aldeia.nome}: +${resultado.recrutado} ${item.nome} (${aldeia.pop.disponivel.toLocaleString()} pop livre)`, 'success');
                    this.salvarEstado();
                    ui.updateStat('twrd-total-recruits', this.totalRecrutados);
                    this.renderizarTabela();
                    await this.delay(this.pauseBetweenVillages);
                } else {
                    this.adicionarLog(`❌ ${aldeia.nome}: ${item.nome} - ${resultado.reason}`, 'error');
                }
            }

            let agoraConcluida = true;
            for (const target of presetValido) {
                const tropaAtual = aldeia.tropas[target.unidade] || { total: 0 };
                if (tropaAtual.total < target.quantidade) {
                    agoraConcluida = false;
                    break;
                }
            }

            return { recrutado: recrutadoTotal, concluida: agoraConcluida };
        },

        getIconeUnidade(unidade) {
            return `<img src="https://dsgvo.tribalwars.com.br/graphic/unit/unit_${unidade}.png" style="width:18px; height:18px; vertical-align:middle;">`;
        },

        atualizarTipoAldeia(villageId, tipo) {
            this.configAldeias[villageId] = { tipo: tipo };
            this.salvarEstado();
            const idx = this.dadosAldeias.findIndex(a => a.id === villageId);
            if (idx !== -1) {
                this.dadosAldeias[idx].tipo = tipo;
                this.renderizarTabela();
            }
            this.adicionarLog(`🏷️ Aldeia ${this.dadosAldeias.find(a => a.id === villageId)?.nome} definida como ${tipo}`, 'info');
        },

        verificarStatusConclusao(aldeia) {
            if (aldeia.tipo === 'OFF') return null;
            const preset = this.PRESETS[aldeia.tipo];
            if (!preset) return null;

            const presetFiltrado = preset.filter(target =>
                aldeia.unidadesDisponiveis?.includes(target.unidade)
            );

            if (presetFiltrado.length === 0) return null;

            let todasCompletas = true;
            let percentualTotal = 0;
            for (const target of presetFiltrado) {
                const tropaAtual = aldeia.tropas[target.unidade] || { total: 0 };
                const percentual = Math.min(100, Math.floor((tropaAtual.total / target.quantidade) * 100));
                percentualTotal += percentual;
                if (tropaAtual.total < target.quantidade) todasCompletas = false;
            }
            return { completo: todasCompletas, percentual: Math.floor(percentualTotal / presetFiltrado.length) };
        },

        renderizarTabela() {
            const tbody = document.getElementById('twrd-tbody');
            if (!tbody) return;

            if (!this.dadosCarregados || this.dadosAldeias.length === 0) {
                tbody.innerHTML = ui.emptyRowHTML('📭', 'Nenhum dado carregado', 'Clique em "CARREGAR DADOS" primeiro', 3);
                return;
            }

            let html = '';
            for (const a of this.dadosAldeias) {
                const percentualPop = a.pop.maximo > 0 ? (a.pop.atual / a.pop.maximo) * 100 : 0;
                const status = this.verificarStatusConclusao(a);
                let tipoCor = '#7f8c8d';
                let tipoBg = 'transparent';
                if (a.tipo === 'ATAQUE') { tipoCor = '#e74c3c'; tipoBg = '#e74c3c10'; }
                else if (a.tipo === 'DEFESA') { tipoCor = '#3498db'; tipoBg = '#3498db10'; }

                const statusHtml = status ? `
                    <div style="margin-top:6px;">
                        <div style="background:#1a1a1a; border-radius:4px; height:4px; width:60px; overflow:hidden;">
                            <div style="background:${status.completo ? '#00d97e' : '#d29922'}; width:${status.percentual}%; height:4px; border-radius:4px;"></div>
                        </div>
                        <span style="font-size:9px; color:${status.completo ? '#00d97e' : '#d29922'};">${status.completo ? '✅ COMPLETO' : status.percentual + '%'}</span>
                    </div>
                ` : '';

                // ========== EXIBIÇÃO COM SALDO LÍQUIDO ==========
                const tropasHtml = Object.entries(a.tropas || {})
                    .filter(([_, data]) => data.naAldeia > 0 || data.emProducao !== 0 || data.naFila !== 0)
                    .map(([unidade, data]) => {
                        const saldoFila = data.emProducao + data.naFila;

                        let filaHtml = '';
                        if (saldoFila > 0) {
                            filaHtml = `<span style="color:#00d97e; font-size:9px;"> (+${saldoFila.toLocaleString()})</span>`;
                        } else if (saldoFila < 0) {
                            filaHtml = `<span style="color:#e74c3c; font-size:9px;"> (${saldoFila.toLocaleString()})</span>`;
                        }

                        return `<div style="display:inline-block; margin-right:8px; margin-bottom:2px;">
                                    ${this.getIconeUnidade(unidade)}
                                    <span style="color:#c9d1d9;">${data.naAldeia.toLocaleString()}${filaHtml}</span>
                                </div>`;
                    }).join('');

                html += `
                    <tr style="background:${tipoBg}; border-left: 3px solid ${tipoCor};">
                        <td style="padding:9px 12px;">
                            <div style="font-weight:600; color:#c9d1d9; font-size:12px;">${a.nome}</div>
                            <div style="font-size:9px; color:#00d97e55;">${a.coord}</div>
                            <div style="margin-top:6px;">
                                <button class="twrd-tipo-btn" onclick="window.TWRecruitDashboard.atualizarTipoAldeia(${a.id}, 'ATAQUE')" style="padding:2px 8px; border-radius:4px; cursor:pointer; font-size:10px; margin:0 2px; font-weight:bold; border:1px solid transparent; background:${a.tipo === 'ATAQUE' ? '#e74c3c' : '#1a1a1a'}; color:${a.tipo === 'ATAQUE' ? '#fff' : '#c9d1d9'};">⚔️ ATQ</button>
                                <button class="twrd-tipo-btn" onclick="window.TWRecruitDashboard.atualizarTipoAldeia(${a.id}, 'DEFESA')" style="padding:2px 8px; border-radius:4px; cursor:pointer; font-size:10px; margin:0 2px; font-weight:bold; border:1px solid transparent; background:${a.tipo === 'DEFESA' ? '#3498db' : '#1a1a1a'}; color:${a.tipo === 'DEFESA' ? '#fff' : '#c9d1d9'};">🛡️ DEF</button>
                                <button class="twrd-tipo-btn" onclick="window.TWRecruitDashboard.atualizarTipoAldeia(${a.id}, 'OFF')" style="padding:2px 8px; border-radius:4px; cursor:pointer; font-size:10px; margin:0 2px; font-weight:bold; border:1px solid transparent; background:${a.tipo === 'OFF' ? '#7f8c8d' : '#1a1a1a'}; color:${a.tipo === 'OFF' ? '#fff' : '#c9d1d9'};">⚫ OFF</button>
                            </div>
                            ${statusHtml}
                        </td>
                        <td style="padding:9px 12px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div style="background:#000000; border-radius:4px; height:16px; width:100px; overflow:hidden;">
                                    <div style="background:#00d97e; height:100%; width:${percentualPop}%; transition:width 0.3s;"></div>
                                </div>
                            </div>
                            <div><strong style="color:#c9d1d9;">${a.pop.atual?.toLocaleString() || 0} / ${a.pop.maximo?.toLocaleString() || 0}</strong></div>
                            <div style="font-size:9px; color:#00d97e;">Livre: ${(a.pop.disponivel || 0).toLocaleString()}</div>
                        </td>
                        <td style="padding:9px 12px;">
                            ${tropasHtml || '<span style="color:#8b949e;">Nenhuma tropa</span>'}
                        </td>
                    </tr>
                `;
            }
            tbody.innerHTML = html;
        },

        async executarCicloRecrutamento() {
            if (!this.recrutamentoAtivo) return;
            if (!this.dadosCarregados || this.dadosAldeias.length === 0) {
                this.adicionarLog('⚠️ Nenhum dado carregado.', 'warning');
                this.pararRecrutamento();
                return;
            }

            this.cicloAtual++;
            let recrutadosNesteCiclo = 0;
            this.adicionarLog(`🔄 Iniciando ciclo ${this.cicloAtual}`, 'info');

            for (const aldeia of this.dadosAldeias) {
                if (aldeia.tipo === 'OFF') continue;
                const dadosAtualizados = await this.carregarDadosCompletosAldeia(aldeia);
                if (dadosAtualizados) {
                    aldeia.pop = dadosAtualizados.pop;
                    aldeia.tropas = dadosAtualizados.tropas;
                    aldeia.unidadesDisponiveis = dadosAtualizados.unidadesDisponiveis;
                }
                await this.delay(300);
            }

            const aldeiasParaRecrutar = [...this.dadosAldeias].filter(a => a.tipo !== 'OFF' && a.pop.disponivel > 0).sort((a, b) => (b.pop.disponivel || 0) - (a.pop.disponivel || 0));

            if (aldeiasParaRecrutar.length === 0) {
                this.adicionarLog('📋 Nenhuma aldeia com espaço disponível', 'info');
                if (this.recrutamentoAtivo) this.cicloTimeout = setTimeout(() => this.executarCicloRecrutamento(), this.pauseBetweenCycles);
                return;
            }

            for (const aldeia of aldeiasParaRecrutar) {
                if (!this.recrutamentoAtivo) break;
                const preset = this.PRESETS[aldeia.tipo];
                if (!preset) continue;

                const resultado = await this.recrutarProporcional(aldeia, preset, aldeia.tipo);
                recrutadosNesteCiclo += resultado.recrutado;
                if (resultado.concluida) this.adicionarLog(`🏆 ${aldeia.nome} (${aldeia.tipo}) - MISSÃO COMPLETA!`, 'success');

                this.salvarEstado();
                ui.updateStat('twrd-total-recruits', this.totalRecrutados);
                ui.updateStat('twrd-ciclo-atual', this.cicloAtual);
                this.renderizarTabela();
            }

            this.adicionarLog(`✅ Ciclo ${this.cicloAtual} concluído. Recrutados: ${recrutadosNesteCiclo} | Total: ${this.totalRecrutados}`, 'success');

            if (this.recrutamentoAtivo) this.cicloTimeout = setTimeout(() => this.executarCicloRecrutamento(), this.pauseBetweenCycles);
        },

        iniciarRecrutamento() {
            if (!this.dadosCarregados || this.dadosAldeias.length === 0) {
                this.adicionarLog('⚠️ Carregue os dados primeiro.', 'warning');
                return;
            }

            const aldeiasComTipo = this.dadosAldeias.filter(a => a.tipo !== 'OFF');
            if (aldeiasComTipo.length === 0) {
                this.adicionarLog('⚠️ Nenhuma aldeia configurada como ATAQUE ou DEFESA.', 'warning');
                return;
            }

            if (this.recrutamentoAtivo) return;

            this.recrutamentoAtivo = true;
            this.salvarEstado();

            const btnAtivar = document.getElementById('twrd-btn-ativar');
            if (btnAtivar) {
                btnAtivar.style.background = '#c97c00';
                btnAtivar.textContent = '▶ RECRUTANDO...';
            }

            this.adicionarLog(`🚀 Recrutamento iniciado para ${aldeiasComTipo.length} aldeias!`, 'success');
            this.executarCicloRecrutamento();
        },

        pararRecrutamento() {
            if (this.cicloTimeout) clearTimeout(this.cicloTimeout);
            this.recrutamentoAtivo = false;
            this.salvarEstado();

            const btnAtivar = document.getElementById('twrd-btn-ativar');
            if (btnAtivar) {
                btnAtivar.style.background = '#00d97e';
                btnAtivar.textContent = '▶ ATIVAR RECRUTAMENTO';
            }

            this.adicionarLog('⏹️ Recrutamento automático parado.', 'warning');
        },

        renderizarDashboard() {
            this.carregarEstado();

            ui.renderApp();
            ui.header('🎮 TW Recruit Dashboard', 'v12.0 - Saldo Líquido');

            ui.configBar([
                { label: 'Pausa entre aldeias', id: 'twrd-pause-village', type: 'number', value: this.pauseBetweenVillages, min: 500, max: 5000, step: 100, unit: 'ms' },
                { label: 'Pausa entre ciclos', id: 'twrd-pause-cycle', type: 'number', value: this.pauseBetweenCycles, min: 10000, max: 300000, step: 5000, unit: 'ms' }
            ], (id, val) => {
                if (id === 'twrd-pause-village') this.pauseBetweenVillages = val;
                if (id === 'twrd-pause-cycle') this.pauseBetweenCycles = val;
                this.salvarEstado();
            });

            ui.statsStrip([
                { title: '🏠 Aldeias', items: [{ icon: '🏠', id: 'twrd-total-aldeias' }] },
                { title: '🌾 População Livre', items: [{ icon: '🌾', id: 'twrd-total-pop' }] },
                { title: '⚔️ Recrutados', items: [{ icon: '⚔️', id: 'twrd-total-recruits' }] },
                { title: '🔄 Ciclo Atual', items: [{ icon: '🔄', id: 'twrd-ciclo-atual' }] }
            ]);

            ui.progressBar();

            ui.toolbar(
                `<button id="twrd-btn-carregar" class="twrd-btn twrd-btn-warning">🔄 CARREGAR DADOS</button>
                 <button id="twrd-btn-ativar" class="twrd-btn twrd-btn-primary" style="background:${this.recrutamentoAtivo ? '#c97c00' : '#00d97e'}">${this.recrutamentoAtivo ? '▶ RECRUTANDO...' : '▶ ATIVAR RECRUTAMENTO'}</button>
                 <button id="twrd-btn-parar" class="twrd-btn twrd-btn-danger">⏹ PARAR</button>
                 <button id="twrd-btn-reset" class="twrd-btn twrd-btn-danger">🔄 RESET GERAL</button>`,
                `<span class="twrd-muted">SALDO LÍQUIDO NA FILA</span>`
            );

            ui.mainLayout(
                `<div style="overflow-x:auto;">
                    ${ui.tableHTML(['Aldeia / Tipo', 'População', 'Tropas Atuais'], 'twrd-tbody')}
                 </div>`,
                '📝 Log de Atividades'
            );

            const style = document.createElement('style');
            style.textContent = `
                .twrd-btn {
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
                .twrd-btn:disabled { opacity: 0.45; cursor: not-allowed; }
                .twrd-btn-primary { background: #00d97e; color: #000; }
                .twrd-btn-primary:hover:not(:disabled) { background: #33ffaa; transform: translateY(-1px); }
                .twrd-btn-warning { background: #c97c00; color: #fff; }
                .twrd-btn-warning:hover:not(:disabled) { background: #e8900a; transform: translateY(-1px); }
                .twrd-btn-danger { background: #f8514922; color: #f85149; border: 1px solid #f8514930; }
                .twrd-btn-danger:hover:not(:disabled) { background: #f85149; color: #fff; transform: translateY(-1px); }
                .twrd-muted { color: #8b949e; font-size: 10px; }
                .twrd-tipo-btn { transition: all 0.2s; }
                .twrd-tipo-btn:hover { transform: scale(1.02); filter: brightness(1.1); }
            `;
            document.head.appendChild(style);

            document.getElementById('twrd-btn-carregar').onclick = () => this.carregarDadosAldeias();
            document.getElementById('twrd-btn-ativar').onclick = () => this.iniciarRecrutamento();
            document.getElementById('twrd-btn-parar').onclick = () => this.pararRecrutamento();
            document.getElementById('twrd-btn-reset').onclick = () => this.resetGeral();

            window.TWRecruitDashboard = this;

            this.adicionarLog('📊 TW Recruit Dashboard v12.0 iniciado', 'info');
            this.adicionarLog('💡 Detecção automática de unidades por mundo', 'info');
            this.adicionarLog('💰 Saldo líquido na fila: positivo (verde) / negativo (vermelho)', 'info');

            if (this.recrutamentoAtivo && this.dadosCarregados) {
                this.adicionarLog('🔄 Retomando recrutamento...', 'info');
                this.executarCicloRecrutamento();
            } else if (this.recrutamentoAtivo && !this.dadosCarregados) {
                this.adicionarLog('⚠️ Recrutamento estava ativo, mas dados não carregados.', 'warning');
                this.recrutamentoAtivo = false;
                this.salvarEstado();
            }
        }
    };

    TWRecruitDashboard.init();
})();