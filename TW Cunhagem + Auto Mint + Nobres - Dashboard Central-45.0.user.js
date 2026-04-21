// ==UserScript==
// @name         TW Cunhagem + Auto Mint + Nobres - Dashboard Central
// @namespace    http://tampermonkey.net/
// @version      45.0
// @description  Cunhagem automática + Auto Mint + Recrutamento Persistente - Sistema de Moedas com UI Kit
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

    const ui = TWUI.create('twc'); // TW Cunhagem prefix

    // ============================================
    // CONSTANTES E CONFIGURAÇÕES GLOBAIS
    // ============================================
    const DASHBOARD_PARAM = 'twCunhagem=true';

    // CSRF Global - Capturado uma única vez
    let CSRF_TOKEN = null;

    // Configurações de CUNHAGEM
    let ATIVADO = false;
    let QUANTIDADE = 1;
    let CUNHAR_MAXIMO = true;
    let PAUSA_ENTRE_ALDEIAS = 2000;
    let totalCunhado = 0;
    let cicloAtual = 0;
    let rodando = false;
    let cicloAtivo = false;

    // Cache de dados
    let cacheAldeias = [];
    let cacheAldeiasComAcademia = [];
    let cacheNobresInfo = {};
    let cacheLimitesNobres = {};

    // Keys do localStorage
    const STORAGE_LIMITES_KEY = 'twc_limites_nobres_v45';
    const STORAGE_CONFIG_KEY = 'twc_cunhagem_v45';

    // ============================================
    // INICIALIZAÇÃO IMEDIATA
    // ============================================
    function capturarCSRF() {
        try {
            if (typeof window.game_data !== 'undefined' && window.game_data?.csrf) {
                CSRF_TOKEN = window.game_data.csrf;
                return;
            }
            const match = document.body.innerHTML.match(/csrf":"([^"]+)/);
            if (match) {
                CSRF_TOKEN = match[1];
                return;
            }
            const scripts = document.getElementsByTagName('script');
            for (let script of scripts) {
                const content = script.innerHTML;
                const match = content.match(/csrf["']?\s*:\s*["']([^"']+)["']/);
                if (match) {
                    CSRF_TOKEN = match[1];
                    return;
                }
            }
        } catch (err) {
            console.error('Erro ao capturar CSRF:', err);
        }
    }

    function carregarConfiguracoes() {
        const salvo = localStorage.getItem(STORAGE_CONFIG_KEY);
        if (salvo) {
            try {
                const d = JSON.parse(salvo);
                ATIVADO = d.ATIVADO ?? false;
                QUANTIDADE = d.QUANTIDADE ?? 1;
                CUNHAR_MAXIMO = d.CUNHAR_MAXIMO ?? true;
                totalCunhado = d.totalCunhado ?? 0;
                PAUSA_ENTRE_ALDEIAS = d.PAUSA_ENTRE_ALDEIAS ?? 2000;
                cicloAtual = d.cicloAtual ?? 0;
            } catch (e) {}
        }
        const limitesSalvos = localStorage.getItem(STORAGE_LIMITES_KEY);
        if (limitesSalvos) {
            try {
                cacheLimitesNobres = JSON.parse(limitesSalvos);
            } catch (e) {}
        }
    }

    function salvarConfiguracoes() {
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify({
            ATIVADO, QUANTIDADE, CUNHAR_MAXIMO,
            totalCunhado, PAUSA_ENTRE_ALDEIAS, cicloAtual
        }));
    }

    function salvarLimitesNobres() {
        localStorage.setItem(STORAGE_LIMITES_KEY, JSON.stringify(cacheLimitesNobres));
    }

    capturarCSRF();
    carregarConfiguracoes();

    // ============================================
    // FUNÇÕES AUXILIARES
    // ============================================
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function adicionarBotaoAbrirDashboard() {
        ui.injectStyles();
        ui.floatBtn('💰 CUNHAGEM', () => {
            const urlBase = window.location.href.split('?')[0];
            window.open(urlBase + '?' + DASHBOARD_PARAM, 'TWCunhagem');
        }, { top: 90, right: 10 });
    }

    // ============================================
    // LISTA DE ALDEIAS
    // ============================================
    async function obterTodasAldeias() {
        if (cacheAldeias.length > 0) return cacheAldeias;

        try {
            const response = await fetch('/map/village.txt', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Falha ao carregar village.txt');

            const dados = await response.text();
            let meuId = window.game_data?.player?.id;

            if (!meuId) {
                const match = document.body.innerHTML.match(/player_id["']?\s*:\s*(\d+)/);
                meuId = match ? parseInt(match[1]) : null;
            }

            if (!meuId) return [];

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
            console.error('Erro ao obter aldeias:', err);
            return [];
        }
    }

    // ============================================
    // FUNÇÃO CENTRAL - 1 GET = 100% INFORMAÇÃO
    // ============================================
    async function obterInfoCompletaAldeia(villageId) {
        try {
            const url = `/game.php?village=${villageId}&screen=snob`;
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) return null;

            const html = await response.text();

            const temAcademia = html.includes('Academia (Nível');
            if (!temAcademia) {
                return { villageId, temAcademia: false };
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Auto Mint
            const temAutoMint = html.includes('class="running auto-minting-status"') ||
                               html.includes('cancel_auto_minting_session');
            const precisa5Aldeias = html.includes('Você precisa de 5 aldeias para usar a cunhagem automática');

            let statusAutoMint = false;
            if (precisa5Aldeias) {
                statusAutoMint = 'precisa_5';
            } else {
                statusAutoMint = temAutoMint;
            }

            // Fila de nobres
            const linksCancelar = doc.querySelectorAll('a[href*="action=cancel"]');
            const emProducao = linksCancelar.length;

            // Captura de nobres
            let naAldeia = 0;
            let totalGlobal = 0;

            const linhaNobre = doc.querySelector('tr:has(a[data-unit="snob"]), tr:has(img[src*="unit_snob"])');
            if (linhaNobre) {
                const colunas = linhaNobre.querySelectorAll('td');
                if (colunas.length >= 5) {
                    const textoNobres = colunas[4].innerText;
                    const match = textoNobres.match(/(\d+)\s*\/\s*(\d+)/);
                    if (match) {
                        naAldeia = parseInt(match[1]);
                        totalGlobal = parseInt(match[2]);
                    }
                }
            }

            if (totalGlobal === 0) {
                const textoDireto = doc.body.innerText.match(/Nobres que ainda podem ser recrutados:\s*(\d+)\/(\d+)/);
                if (textoDireto) {
                    naAldeia = parseInt(textoDireto[1]);
                    totalGlobal = parseInt(textoDireto[2]);
                }
            }

            if (totalGlobal === 0) {
                const nobresMatch = html.match(/(\d+)\s*\/\s*(\d+)/);
                if (nobresMatch) {
                    naAldeia = parseInt(nobresMatch[1]);
                    totalGlobal = parseInt(nobresMatch[2]);
                }
            }

            // Verifica se pode recrutar
            const botaoRecrutar = doc.querySelector('a[href*="action=train"]');
            const botaoInativo = doc.querySelector('a[href*="action=train"].inactive');
            let podeRecrutar = false;
            let motivoImpedimento = null;

            if (botaoRecrutar && !botaoInativo) {
                podeRecrutar = true;
            } else {
                if (botaoInativo) {
                    const cellPai = botaoInativo.closest('td');
                    if (cellPai) {
                        const textoCell = cellPai.innerText.toLowerCase();
                        if (textoCell.includes('popula')) motivoImpedimento = 'População insuficiente';
                        else if (textoCell.includes('moeda')) motivoImpedimento = 'Moedas insuficientes';
                        else if (textoCell.includes('recurs')) motivoImpedimento = 'Recursos insuficientes';
                        else motivoImpedimento = 'Condições não atendidas';
                    } else {
                        motivoImpedimento = 'Botão inativo';
                    }
                } else {
                    motivoImpedimento = 'Academia ocupada';
                }
            }

            // Limite máximo do jogo
            let limiteJogo = null;
            const restanteMatch = html.match(/Ainda podem ser produzidos:<\/th><th>(\d+)<\/th>/i);
            if (restanteMatch) {
                limiteJogo = parseInt(restanteMatch[1]);
            }

            return {
                villageId,
                temAcademia: true,
                naAldeia,
                totalGlobal,
                emProducao,
                podeRecrutar,
                motivoImpedimento,
                statusAutoMint,
                limiteJogo,
                timestamp: Date.now()
            };
        } catch (err) {
            console.error(`Erro ao obter info da aldeia ${villageId}:`, err);
            return null;
        }
    }

    // ============================================
    // RECRUTAR NOBRE PERSISTENTE
    // ============================================
    async function recrutarNobre(villageId, nome) {
        if (!CSRF_TOKEN) {
            capturarCSRF();
            if (!CSRF_TOKEN) return false;
        }

        try {
            const url = `/game.php?village=${villageId}&screen=snob&action=train`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                credentials: 'same-origin',
                body: `h=${CSRF_TOKEN}`
            });

            if (response.status === 200 || response.status === 302) {
                const responseHtml = await response.text();
                const hasError = responseHtml.includes('recursos insuficientes') ||
                                responseHtml.includes('população') ||
                                responseHtml.includes('moedas') ||
                                responseHtml.includes('error') ||
                                responseHtml.includes('Não é possível');

                if (hasError) {
                    if (cacheNobresInfo[villageId]) {
                        cacheNobresInfo[villageId].podeRecrutar = false;
                        cacheNobresInfo[villageId].motivoImpedimento = 'Recursos esgotados';
                    }
                    return false;
                }
                return true;
            }
            return false;
        } catch (err) {
            console.error(`Erro ao recrutar em ${nome}:`, err);
            return false;
        }
    }

    // ============================================
    // RECRUTAMENTO PERSISTENTE EM MASSA
    // ============================================
    async function executarRecrutamentoNobres() {
        ui.log('🔄 Sincronizando informações...', 'info');
        await carregarInfoCompletaTodasAldeias();

        let totalRecrutados = 0;
        let totalSolicitados = 0;
        let aldeiasComImpedimento = 0;
        const aldeiasRecrutadas = [];

        for (const aldeia of cacheAldeiasComAcademia) {
            const info = cacheNobresInfo[aldeia.id];
            if (!info || !info.temAcademia) continue;

            const limiteDefinido = cacheLimitesNobres[aldeia.id] || 0;
            if (limiteDefinido === 0) continue;

            const totalAtual = info.totalGlobal;
            const emProducao = info.emProducao || 0;
            const precisa = limiteDefinido - totalAtual - emProducao;

            if (precisa <= 0) continue;

            if (!info.podeRecrutar) {
                aldeiasComImpedimento++;
                continue;
            }

            totalSolicitados += precisa;

            let recrutadosNestaAldeia = 0;
            let botaoAtivo = true;

            for (let i = 0; i < precisa && botaoAtivo; i++) {
                const sucesso = await recrutarNobre(aldeia.id, aldeia.nome);

                if (sucesso) {
                    recrutadosNestaAldeia++;
                    totalRecrutados++;
                    info.totalGlobal++;

                    if (i < precisa - 1) {
                        await delay(PAUSA_ENTRE_ALDEIAS);
                    }
                } else {
                    const infoAtualizada = await obterInfoCompletaAldeia(aldeia.id);
                    if (infoAtualizada) {
                        cacheNobresInfo[aldeia.id] = infoAtualizada;
                        botaoAtivo = infoAtualizada.podeRecrutar;
                    } else {
                        botaoAtivo = false;
                    }
                    break;
                }
            }

            if (recrutadosNestaAldeia > 0) {
                aldeiasRecrutadas.push({
                    nome: aldeia.nome,
                    recrutados: recrutadosNestaAldeia,
                    totalNecessario: precisa
                });
            }
        }

        for (const aldeia of aldeiasRecrutadas) {
            if (aldeia.recrutados === aldeia.totalNecessario) {
                ui.log(`✅ ${aldeia.nome}: +${aldeia.recrutados} nobre(s) recrutado(s)`, 'success');
            } else {
                ui.log(`⚠️ ${aldeia.nome}: +${aldeia.recrutados} de ${aldeia.totalNecessario} (interrompido)`, 'warning');
            }
        }

        if (totalRecrutados > 0) {
            ui.log(`✅ Recrutamento concluído! Total: ${totalRecrutados} nobre(s)`, 'success');
        } else if (aldeiasComImpedimento > 0) {
            ui.log(`⏳ ${aldeiasComImpedimento} aldeia(s) aguardando recursos ou moedas para recrutar.`, 'warning');
        } else if (totalSolicitados === 0) {
            ui.log(`ℹ️ Todas as academias estão dentro do limite definido.`, 'info');
        }

        await carregarInfoCompletaTodasAldeias();
        renderizarTabelaAldeias();
    }

    // ============================================
    // CARREGAR INFORMAÇÕES COMPLETAS
    // ============================================
    async function carregarInfoCompletaTodasAldeias() {
        if (cacheAldeiasComAcademia.length === 0) return;

        ui.log(`📡 Sincronizando ${cacheAldeiasComAcademia.length} aldeia(s)...`, 'info');

        for (const aldeia of cacheAldeiasComAcademia) {
            const info = await obterInfoCompletaAldeia(aldeia.id);
            if (info && info.temAcademia) {
                cacheNobresInfo[aldeia.id] = info;
            }
            await delay(100);
        }

        renderizarTabelaAldeias();
        ui.log(`✅ Sincronização concluída.`, 'success');
    }

    // ============================================
    // CARREGAR ALDEIAS COM ACADEMIA
    // ============================================
    async function carregarAldeiasComAcademia() {
        const todas = await obterTodasAldeias();
        const comAcademia = [];

        ui.log(`📡 Escaneando ${todas.length} aldeias...`, 'info');

        // Barra de progresso
        const btnCarregar = document.getElementById('tw-btn-carregar-aldeias');
        const progressId = 'twc-progress-bar';
        let progressEl = document.getElementById(progressId);
        if (!progressEl) {
            progressEl = document.createElement('div');
            progressEl.id = progressId;
            progressEl.style.cssText = 'margin-top:10px; background:var(--twui-bg); border-radius:6px; height:6px; overflow:hidden;';
            progressEl.innerHTML = `<div id="twc-progress-fill" style="height:100%; width:0%; background:var(--twui-orange); border-radius:6px; transition:width 0.2s;"></div>`;
            btnCarregar?.parentElement?.insertAdjacentElement('beforebegin', progressEl);
        }
        const fill = document.getElementById('twc-progress-fill');

        for (let i = 0; i < todas.length; i++) {
            const aldeia = todas[i];
            const info = await obterInfoCompletaAldeia(aldeia.id);

            if (info && info.temAcademia) {
                comAcademia.push(aldeia);
                cacheNobresInfo[aldeia.id] = info;
            }

            const pct = Math.round(((i + 1) / todas.length) * 100);
            if (fill) fill.style.width = pct + '%';
            if (btnCarregar) btnCarregar.textContent = `⏳ ${pct}% (${i + 1}/${todas.length})`;

            await delay(200);
        }

        setTimeout(() => { if (progressEl) progressEl.remove(); }, 1500);

        cacheAldeiasComAcademia = comAcademia;

        atualizarEstadoBotaoCunhar();

        if (comAcademia.length > 0 && comAcademia.length < 5) {
            ui.log(`⚠️ ATENÇÃO: Você tem ${comAcademia.length} academia(s). O jogo exige 5 para Auto Mint!`, 'warning');
        }

        ui.log(`📊 Total: ${comAcademia.length} academia(s) encontrada(s)`, 'success');

        renderizarTabelaAldeias();
        return comAcademia;
    }

    // ============================================
    // AUTO MINT
    // ============================================
    async function executarAutoMint(villageId, acao) {
        if (!CSRF_TOKEN) {
            capturarCSRF();
            if (!CSRF_TOKEN) return { success: false, reason: 'csrf_nao_encontrado' };
        }

        const actionParam = acao === 'start' ? 'start_auto_minting_session' : 'cancel_auto_minting_session';

        try {
            const url = `/game.php?village=${villageId}&screen=snob&action=${actionParam}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                credentials: 'same-origin',
                body: `h=${CSRF_TOKEN}`
            });

            if (response.status === 200 || response.status === 302) {
                await delay(1500);
                const novaInfo = await obterInfoCompletaAldeia(villageId);
                if (novaInfo && novaInfo.temAcademia) {
                    cacheNobresInfo[villageId] = novaInfo;
                    const sucesso = acao === 'start' ? novaInfo.statusAutoMint === true : novaInfo.statusAutoMint === false;
                    return { success: sucesso, realmenteAtivou: sucesso };
                }
                return { success: false, reason: 'falha_verificacao' };
            }
            return { success: false, reason: `HTTP_${response.status}` };
        } catch (err) {
            return { success: false, reason: err.message };
        }
    }

    async function alternarAutoMint(villageId, nome) {
        const info = cacheNobresInfo[villageId];
        const statusAtual = info?.statusAutoMint === true;
        const acao = statusAtual ? 'cancel' : 'start';

        const resultado = await executarAutoMint(villageId, acao);

        if (resultado.success) {
            ui.log(`✅ ${nome}: Auto Mint ${!statusAtual ? 'ativado' : 'desativado'}`, 'success');
            renderizarTabelaAldeias();
        } else {
            ui.log(`❌ ${nome}: Falha ao alternar Auto Mint`, 'error');
        }
    }

    async function executarAutoMintEmTodas(acao) {
        const acaoNome = acao === 'start' ? 'ATIVAR' : 'DESATIVAR';

        if (acao === 'start' && cacheAldeiasComAcademia.length < 5) {
            ui.log(`⚠️ Não é possível ATIVAR: você tem apenas ${cacheAldeiasComAcademia.length} academia(s). O jogo exige 5 ou mais.`, 'warning');
            return;
        }

        ui.log(`🔄 ${acaoNome} Auto Mint em todas...`, 'info');

        let sucessos = 0, falhas = 0;

        for (const aldeia of cacheAldeiasComAcademia) {
            const info = cacheNobresInfo[aldeia.id];
            const statusAtual = info?.statusAutoMint === true;
            const precisaAcao = (acao === 'start' && !statusAtual) || (acao === 'cancel' && statusAtual);

            if (precisaAcao) {
                const resultado = await executarAutoMint(aldeia.id, acao);
                if (resultado.success) {
                    sucessos++;
                } else {
                    falhas++;
                }
                await delay(500);
            }
        }

        ui.log(`✅ ${acaoNome}: ${sucessos} sucesso(s), ${falhas} falha(s)`, sucessos > 0 ? 'success' : 'warning');
        renderizarTabelaAldeias();
    }

    // ============================================
    // ATUALIZAR LIMITE
    // ============================================
    function atualizarLimiteAldeia(villageId, valor) {
        if (valor === 0) {
            delete cacheLimitesNobres[villageId];
        } else {
            cacheLimitesNobres[villageId] = valor;
        }
        salvarLimitesNobres();
        renderizarTabelaAldeias();
    }

    // ============================================
    // CUNHAGEM
    // ============================================
    async function cunharMoeda(villageId, quantidade) {
        if (!CSRF_TOKEN) {
            capturarCSRF();
            if (!CSRF_TOKEN) return { success: false, reason: 'csrf_nao_encontrado' };
        }

        try {
            const url = `/game.php?village=${villageId}&screen=snob`;
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) return { success: false, reason: 'erro_acesso' };

            const html = await response.text();
            const maxMatch = html.match(/id="coin_mint_fill_max"[^>]*>\((\d+)\)/i);
            const maximo = maxMatch ? parseInt(maxMatch[1]) : 0;
            if (maximo === 0) return { success: false, reason: 'sem_recursos' };

            const quantidadeCunhar = CUNHAR_MAXIMO ? maximo : Math.min(quantidade, maximo);
            if (quantidadeCunhar === 0) return { success: false, reason: 'quantidade_invalida' };

            const postUrl = `/game.php?village=${villageId}&screen=snob&action=coin&h=${CSRF_TOKEN}`;
            const formData = new URLSearchParams();
            formData.set('count', quantidadeCunhar.toString());

            const postResponse = await fetch(postUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });

            if (!postResponse.ok) return { success: false, reason: `HTTP_${postResponse.status}` };
            return { success: true, quantidade: quantidadeCunhar };
        } catch (err) {
            return { success: false, reason: err.message };
        }
    }

    async function escanearECunhar() {
        if (!ATIVADO || cicloAtivo) return;
        cicloAtivo = true;
        cicloAtual++;
        atualizarMetricas();

        try {
            const aldeias = cacheAldeiasComAcademia.length > 0 ? cacheAldeiasComAcademia : await carregarAldeiasComAcademia();
            for (const aldeia of aldeias) {
                if (!ATIVADO) break;
                const resultado = await cunharMoeda(aldeia.id, QUANTIDADE);
                if (resultado.success) {
                    totalCunhado += resultado.quantidade;
                    salvarConfiguracoes();
                    atualizarMetricas();
                    ui.log(`💰 ${aldeia.nome}: +${resultado.quantidade} moeda(s)`, 'success');
                }
                await delay(PAUSA_ENTRE_ALDEIAS);
            }
            if (ATIVADO) ui.log(`🔄 Ciclo ${cicloAtual} concluído. Total: ${totalCunhado} moedas`, 'info');
        } catch (err) {
            ui.log(`❌ Erro na cunhagem: ${err.message}`, 'error');
        }
        cicloAtivo = false;
        if (ATIVADO) setTimeout(() => escanearECunhar(), 30000);
    }

    async function iniciar() {
        if (rodando) return;
        rodando = true;
        ui.log(`🚀 Cunhagem automática iniciada`, 'success');
        await delay(1000);
        escanearECunhar();
    }

    function parar() {
        rodando = false;
        ui.log(`⏹️ Cunhagem automática parada. Total: ${totalCunhado} moedas`, 'warning');
    }

    function toggle() {
        ATIVADO = !ATIVADO;
        if (ATIVADO) iniciar(); else parar();
        atualizarBotao(ATIVADO);
        salvarConfiguracoes();
    }

    function atualizarMetricas() {
        ui.updateStat('twc-met-total', totalCunhado);
        ui.updateStat('twc-met-ciclos', cicloAtual);
        const statusCard = document.getElementById('twc-status-card');
        if (statusCard) statusCard.textContent = ATIVADO ? 'Ativo' : 'Inativo';
    }

    function atualizarEstadoBotaoCunhar() {
        const btn = document.getElementById('twc-botao');
        if (!btn) return;
        const temAldeias = cacheAldeiasComAcademia.length > 0;
        btn.disabled = !temAldeias;
        btn.title = temAldeias ? '' : 'Carregue as aldeias primeiro';
    }

    function atualizarBotao(ativo) {
        const btn = document.getElementById('twc-botao');
        const dot = document.getElementById('twc-dot');
        const stat = document.getElementById('twc-status');
        if (dot) dot.style.background = ativo ? 'var(--twui-orange)' : '#555';
        if (stat) stat.textContent = ativo ? `Rodando • Ciclo ${cicloAtual}` : `Parado • ${totalCunhado.toLocaleString()} moedas`;
        if (btn) {
            btn.innerHTML = ativo ? '⏹ PARAR' : '▶ CUNHAR';
            btn.style.background = ativo ? 'var(--twui-red)' : 'var(--twui-orange)';
        }
        atualizarMetricas();
    }

    // ============================================
    // RENDERIZAÇÃO DA TABELA (com UI Kit)
    // ============================================
    function renderizarTabelaAldeias() {
        const tbody = document.getElementById('twc-tbody');
        if (!tbody) return;

        if (cacheAldeiasComAcademia.length === 0) {
            tbody.innerHTML = ui.emptyRowHTML('🏛️', 'Nenhuma academia encontrada', 'Clique em CARREGAR ALDEIAS para começar', 5);
            return;
        }

        let html = '';
        for (const a of cacheAldeiasComAcademia) {
            const info = cacheNobresInfo[a.id];
            if (!info || !info.temAcademia) continue;

            const limiteDef = cacheLimitesNobres[a.id] || 0;
            const totalComFila = (info.totalGlobal || 0) + (info.emProducao || 0);
            const precisa = limiteDef > 0 && totalComFila < limiteDef && info.podeRecrutar;

            let statusText, statusColor, statusTooltip;
            if (!limiteDef) {
                statusText = '❌ Sem limite';
                statusColor = '#666';
                statusTooltip = 'Defina um limite de nobres';
            } else if (!info.podeRecrutar) {
                statusText = `⛔ ${info.motivoImpedimento?.substring(0, 20) || 'Bloqueado'}`;
                statusColor = 'var(--twui-red)';
                statusTooltip = info.motivoImpedimento;
            } else if (precisa) {
                statusText = '✅ Precisa';
                statusColor = 'var(--twui-green)';
                statusTooltip = `Precisa de ${limiteDef - totalComFila} nobre(s)`;
            } else {
                statusText = '⏸️ OK';
                statusColor = 'var(--twui-yellow)';
                statusTooltip = 'Limite atingido';
            }

            let autoMintText, autoMintColor;
            if (info.statusAutoMint === 'precisa_5') {
                autoMintText = '⚠️ Precisa 5';
                autoMintColor = 'var(--twui-orange)';
            } else if (info.statusAutoMint === true) {
                autoMintText = '🟢 ATIVO';
                autoMintColor = 'var(--twui-green)';
            } else {
                autoMintText = '🔴 INATIVO';
                autoMintColor = 'var(--twui-red)';
            }

            const botaoAutoMintText = info.statusAutoMint === true ? 'Desativar' : 'Ativar';
            const botaoAutoMintBg = info.statusAutoMint === true ? 'var(--twui-red)' : 'var(--twui-green)';
            const botaoDisabled = info.statusAutoMint === 'precisa_5';

            const nobresDisplay = (info.emProducao > 0)
                ? `${info.naAldeia}/${info.totalGlobal} (+${info.emProducao})`
                : `${info.naAldeia}/${info.totalGlobal}`;

            html += `
                <tr>
                    <td style="padding:9px 12px;">
                        <div style="font-weight:600; color:var(--twui-text); font-size:12px;">${a.nome}</div>
                        <div style="font-size:9px; color:var(--twui-orange);">${a.coord}</div>
                    </td>
                    <td style="padding:9px 12px; text-align:center;">
                        <span style="color:var(--twui-text); font-size:12px;" title="${info.emProducao} em produção">${nobresDisplay}</span>
                    </td>
                    <td style="padding:9px 12px;">
                        <div style="display:flex; gap:5px; align-items:center;">
                            <input type="number" id="input-limite-${a.id}" value="${limiteDef}" min="0" max="999" step="1"
                                   style="width:60px; padding:4px; background:var(--twui-bg); border:1px solid var(--twui-border); border-radius:4px; color:var(--twui-text); text-align:center; font-size:11px;">
                            <button class="twc-limite-btn" data-id="${a.id}" style="padding:2px 8px; background:var(--twui-orange); border:none; border-radius:4px; cursor:pointer; font-size:10px; color:#000; font-weight:bold;">OK</button>
                        </div>
                    </td>
                    <td style="padding:9px 12px; color:${statusColor}; font-weight:bold; font-size:11px;" title="${statusTooltip || ''}">
                        ${statusText}
                    </td>
                    <td style="padding:9px 12px;">
                        <span style="color:${autoMintColor}; font-weight:bold; font-size:11px;">${autoMintText}</span>
                        <button class="twc-auto-mint-btn" data-id="${a.id}" data-nome="${a.nome}"
                                style="padding:2px 8px; background:${botaoAutoMintBg}; border:none; border-radius:4px; cursor:pointer; font-weight:bold; color:#fff; font-size:10px; margin-left:6px;"
                                ${botaoDisabled ? 'disabled' : ''}>
                            ${botaoAutoMintText}
                        </button>
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = html;

        // Bind dos botões de limite
        document.querySelectorAll('.twc-limite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const id = parseInt(btn.dataset.id);
                const input = document.getElementById(`input-limite-${id}`);
                const valor = parseInt(input.value) || 0;
                atualizarLimiteAldeia(id, valor);
            });
        });

        // Bind dos botões de Auto Mint
        document.querySelectorAll('.twc-auto-mint-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (btn.disabled) return;
                const id = parseInt(btn.dataset.id);
                const nome = btn.dataset.nome;
                btn.disabled = true;
                btn.textContent = '...';
                await alternarAutoMint(id, nome);
                btn.disabled = false;
                btn.textContent = cacheNobresInfo[id]?.statusAutoMint === true ? 'Desativar' : 'Ativar';
            });
        });
    }

    // ============================================
    // RENDERIZAR DASHBOARD PRINCIPAL (COM UI KIT)
    // ============================================
    async function renderizarDashboard() {
        ui.injectStyles();
        ui.renderApp();
        ui.header('💰 Cunhagem + Auto Mint + Nobres', 'v45.0 - UI Kit');

        // Stats strip
        ui.statsStrip([
            { title: '💰 Moedas', items: [{ icon: '💰', id: 'twc-met-total' }] },
            { title: '🔄 Ciclos', items: [{ icon: '🔄', id: 'twc-met-ciclos' }] },
            { title: '📊 Status', items: [{ icon: '⚙️', id: 'twc-status-card' }] },
            { title: '🏛️ Academias', items: [{ icon: '🏛️', id: 'twc-total-academias' }] }
        ]);

        // Config bar
        ui.configBar([
            { label: 'Modo', id: 'twc-maximo', type: 'checkbox', value: CUNHAR_MAXIMO },
            { label: 'Quantidade', id: 'twc-quantidade', type: 'number', value: QUANTIDADE, min: 1, max: 999 },
            { label: 'Pausa', id: 'twc-pausa-aldeias', type: 'number', value: PAUSA_ENTRE_ALDEIAS, min: 500, step: 100, unit: 'ms' }
        ], (id, val) => {
            if (id === 'twc-maximo') {
                CUNHAR_MAXIMO = val;
                const qtdInput = document.getElementById('twc-quantidade');
                const qtdDiv = document.getElementById('twc-quantidade-div');
                if (qtdInput) {
                    qtdInput.disabled = CUNHAR_MAXIMO;
                    qtdInput.style.opacity = CUNHAR_MAXIMO ? '0.4' : '1';
                    qtdInput.style.cursor = CUNHAR_MAXIMO ? 'not-allowed' : '';
                    qtdInput.title = CUNHAR_MAXIMO ? 'Desativado no modo Máximo' : '';
                }
                if (qtdDiv) qtdDiv.style.display = 'flex';
            }
            if (id === 'twc-quantidade') QUANTIDADE = val;
            if (id === 'twc-pausa-aldeias') PAUSA_ENTRE_ALDEIAS = val;
            salvarConfiguracoes();
        });

        // Toolbar
        ui.toolbar(
            `<button id="twc-botao" class="twc-btn twc-btn-primary" style="background:var(--twui-orange);">▶ CUNHAR</button>
             <button id="twc-reset" class="twc-btn twc-btn-ghost">↺ RESET</button>`,
            `<span id="twc-status" class="twc-muted">Parado • ${totalCunhado.toLocaleString()} moedas</span>
             <div id="twc-dot" style="width:10px;height:10px;border-radius:50%;background:#555;"></div>`
        );

        // Main layout com tabela
        ui.mainLayout(`
            <div style="padding:0 20px 20px 20px;">
                <div style="background:var(--twui-bg-card); border-radius:12px; padding:16px; margin-bottom:20px;">
                    <div style="color:var(--twui-orange); font-weight:600; margin-bottom:12px; font-size:13px;">🏠 Aldeias com Academia</div>
                    <div style="overflow-x:auto; max-height:450px; overflow-y:auto;">
                        ${ui.tableHTML(['Aldeia', 'Nobres', 'Limite', 'Status', 'Auto Mint'], 'twc-tbody')}
                    </div>
                    <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap;">
                        <button id="tw-btn-carregar-aldeias" class="twc-btn twc-btn-secondary" style="flex:1;">🔄 CARREGAR</button>
                        <button id="tw-btn-atualizar-info" class="twc-btn twc-btn-secondary" style="flex:1;">🔄 ATUALIZAR</button>
                        <button id="tw-btn-recrutar-nobres" class="twc-btn twc-btn-primary" style="flex:1; background:var(--twui-blue);">🎯 RECRUTAR</button>
                        <button id="tw-btn-ativar-todas" class="twc-btn twc-btn-success" style="flex:1;">🟢 MINT ON</button>
                        <button id="tw-btn-desativar-todas" class="twc-btn twc-btn-danger" style="flex:1;">🔴 MINT OFF</button>
                    </div>
                </div>
            </div>
        `, '📝 Log de Atividades');

        // Estilos customizados para os botões
        const style = document.createElement('style');
        style.textContent = `
            .twc-btn {
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
            .twc-btn-primary { background: var(--twui-orange); color: #000; }
            .twc-btn-primary:hover { background: var(--twui-orange-light); transform: translateY(-1px); }
            .twc-btn-secondary { background: var(--twui-bg-card); color: var(--twui-text); border: 1px solid var(--twui-border); }
            .twc-btn-secondary:hover { border-color: var(--twui-orange); }
            .twc-btn-success { background: var(--twui-green-dim); color: var(--twui-green); border: 1px solid var(--twui-green-border); }
            .twc-btn-success:hover { background: var(--twui-green); color: #000; }
            .twc-btn-danger { background: var(--twui-red-dim); color: var(--twui-red); border: 1px solid var(--twui-red-dim); }
            .twc-btn-danger:hover { background: var(--twui-red); color: #fff; }
            .twc-btn-ghost { background: transparent; color: var(--twui-text-dim); border: 1px solid var(--twui-border); }
            .twc-btn-ghost:hover { border-color: var(--twui-orange); color: var(--twui-orange); }
            .twc-muted { color: var(--twui-text-dim); font-size: 11px; }
            .twc-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        `;
        document.head.appendChild(style);

        // Eventos
        document.getElementById('tw-btn-carregar-aldeias').onclick = async () => {
            const btn = document.getElementById('tw-btn-carregar-aldeias');
            btn.disabled = true;
            btn.textContent = '⏳ CARREGANDO...';
            await carregarAldeiasComAcademia();
            ui.updateStat('twc-total-academias', cacheAldeiasComAcademia.length);
            btn.disabled = false;
            btn.textContent = '🔄 CARREGAR';
        };

        document.getElementById('tw-btn-atualizar-info').onclick = async () => {
            await carregarInfoCompletaTodasAldeias();
        };

        document.getElementById('tw-btn-recrutar-nobres').onclick = () => {
            if (cacheAldeiasComAcademia.length === 0) {
                ui.log('⚠️ Carregue as aldeias primeiro!', 'warning');
                return;
            }
            executarRecrutamentoNobres();
        };

        document.getElementById('tw-btn-ativar-todas').onclick = () => {
            if (cacheAldeiasComAcademia.length === 0) {
                ui.log('⚠️ Carregue as aldeias primeiro!', 'warning');
                return;
            }
            if (!confirm(`Ativar Auto Mint em todas as ${cacheAldeiasComAcademia.length} aldeias?`)) return;
            executarAutoMintEmTodas('start');
        };

        document.getElementById('tw-btn-desativar-todas').onclick = () => {
            if (cacheAldeiasComAcademia.length === 0) {
                ui.log('⚠️ Carregue as aldeias primeiro!', 'warning');
                return;
            }
            if (!confirm(`Desativar Auto Mint em todas as ${cacheAldeiasComAcademia.length} aldeias?`)) return;
            executarAutoMintEmTodas('cancel');
        };

        document.getElementById('twc-botao').onclick = toggle;
        document.getElementById('twc-reset').onclick = () => {
            if (confirm('Resetar tudo?')) {
                localStorage.removeItem(STORAGE_CONFIG_KEY);
                localStorage.removeItem(STORAGE_LIMITES_KEY);
                location.reload();
            }
        };

        // Inicializar valores
        const qtdInput = document.getElementById('twc-quantidade');
        if (qtdInput) {
            qtdInput.disabled = CUNHAR_MAXIMO;
            qtdInput.style.opacity = CUNHAR_MAXIMO ? '0.4' : '1';
            qtdInput.style.cursor = CUNHAR_MAXIMO ? 'not-allowed' : '';
            qtdInput.title = CUNHAR_MAXIMO ? 'Desativado no modo Máximo' : '';
        }
        const qtdDiv = document.getElementById('twc-quantidade-div');
        if (qtdDiv) qtdDiv.style.display = 'flex';

        atualizarBotao(ATIVADO);
        ui.updateStat('twc-total-academias', cacheAldeiasComAcademia.length);
        ui.log('💰 Dashboard v45.0 - Sistema de Moedas com UI Kit', 'info');
        ui.log('💡 Clique em CARREGAR para começar', 'info');

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