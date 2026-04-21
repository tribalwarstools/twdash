// ==UserScript==
// @name         TW Agendador de Ataques - Dashboard Central
// @namespace    http://tampermonkey.net/
// @version      20.0
// @description  Agende ataques com precisão - Dashboard com TW UI Kit
// @match        https://*.tribalwars.com.br/game.php*
// @require      https://tribalwarstools.github.io/twscripts/tw-ui-kit.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const DASHBOARD_PARAM = 'twAgendador=true';

    // ============================================
    // DETECTA MODO
    // ============================================
    if (window.location.href.includes(DASHBOARD_PARAM)) {
        renderizarDashboard();
    } else {
        const isAnyDashboard = window.location.href.includes('twDashboard=true') ||
                               window.location.href.includes('twAutoBuilder=true') ||
                               window.location.href.includes('twCunhagem=true') ||
                               window.location.href.includes('twAgendador=true');
        if (!isAnyDashboard) {
            adicionarBotaoAbrirDashboard();
        }
    }

    // ============================================
    // BOTÃO NA ABA DO JOGO (com TW UI Kit)
    // ============================================
    function adicionarBotaoAbrirDashboard() {
        // Aguarda TWUI estar disponível
        if (typeof TWUI === 'undefined') {
            setTimeout(adicionarBotaoAbrirDashboard, 100);
            return;
        }

        const ui = TWUI.create('agendador-float');
        ui.injectStyles();
        ui.floatBtn('⚔️ AGENDADOR', () => {
            window.open(window.location.href.split('?')[0] + '?' + DASHBOARD_PARAM, 'TWAgendador');
        }, { top: 130, right: 10 });
    }

    // ============================================
    // FUNÇÃO DE DELAY
    // ============================================
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================
    // DASHBOARD PRINCIPAL
    // ============================================
    async function renderizarDashboard() {

        // Aguarda TWUI estar disponível
        if (typeof TWUI === 'undefined') {
            setTimeout(renderizarDashboard, 100);
            return;
        }

        // Inicializa UI Kit com prefixo único
        const ui = TWUI.create('agendador');
        ui.injectStyles();

        // ============================================
        // CONSTANTES
        // ============================================
        const TROOP_LIST = [
            { id: 'spear',    nome: 'Lanceiro',           icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_spear.png' },
            { id: 'sword',    nome: 'Espadachim',          icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_sword.png' },
            { id: 'axe',      nome: 'Bárbaro',             icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_axe.png' },
            { id: 'archer',   nome: 'Arqueiro',            icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_archer.png' },
            { id: 'spy',      nome: 'Explorador',          icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_spy.png' },
            { id: 'light',    nome: 'Cavalaria leve',      icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_light.png' },
            { id: 'marcher',  nome: 'Arqueiro a cavalo',   icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_marcher.png' },
            { id: 'heavy',    nome: 'Cavalaria pesada',    icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_heavy.png' },
            { id: 'ram',      nome: 'Aríete',              icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_ram.png' },
            { id: 'catapult', nome: 'Catapulta',           icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_catapult.png' },
            { id: 'knight',   nome: 'Paladino',            icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_knight.png' },
            { id: 'snob',     nome: 'Nobre',               icon: 'https://dsgvo.tribalwars.com.br/graphic/unit/unit_snob.png' }
        ];
        const TROOP_IDS   = TROOP_LIST.map(t => t.id);
        const TROOP_ICONS = Object.fromEntries(TROOP_LIST.map(t => [t.id, t.icon]));
        const TROOP_NAMES = Object.fromEntries(TROOP_LIST.map(t => [t.id, t.nome]));

        const STORAGE_KEYS = {
            FORM_DATA:  'tws_form_data_v6',
            ATTACKS:    'tws_ataques_v8',
            TEMPLATES:  'tws_templates_v3'
        };

        let _villageMap  = {};
        let _myVillages  = [];
        let troopTemplates = [];
        const executando = new Set();

        let _serverTimeOffsetMs = 0;

        // Cache para tropas
        const troopCache   = new Map();
        let lastCacheClear = Date.now();

        // Referência para o log do UI Kit
        let uiLog = null;

        // ============================================
        // SINCRONIZAÇÃO DE HORÁRIO DO SERVIDOR
        // ============================================
        function sincronizarHorarioServidor() {
            try {
                const serverUnix = window.game_data?.time;
                if (serverUnix && typeof serverUnix === 'number') {
                    _serverTimeOffsetMs = (serverUnix * 1000) - Date.now();
                    console.log(`[TWS] Offset servidor: ${_serverTimeOffsetMs}ms`);
                    return;
                }
            } catch (_) {}
            _serverTimeOffsetMs = 0;
            console.warn('[TWS] game_data.time não disponível — usando horário local como aproximação.');
        }

        function getServerTimestampSeconds() {
            return (Date.now() + _serverTimeOffsetMs) / 1000;
        }

        function getServerDate() {
            return new Date(Date.now() + _serverTimeOffsetMs);
        }

        function formatDateToString(date) {
            const pad = n => String(n).padStart(2, '0');
            return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
                   `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        }

        function preencherDataHoraAutomatica() {
            const dataInput = document.getElementById('agendador-data');
            const horaInput = document.getElementById('agendador-hora');
            if (!dataInput || !horaInput) return;
            const now = getServerDate();
            const pad = n => String(n).padStart(2, '0');
            dataInput.value = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
            horaInput.value = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        }

        function adicionarMinutos(minutos) {
            const now = getServerDate();
            now.setMinutes(now.getMinutes() + minutos);
            return formatDateToString(now);
        }

        function number_format(n, sep) {
            return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
        }

        // ============================================
        // LOG (usando UI Kit)
        // ============================================
        function adicionarLog(msg, tipo = 'info') {
            if (uiLog) {
                uiLog(msg, tipo);
            } else {
                console.log(`[TWS][${tipo}] ${msg}`);
            }
        }

        // ============================================
        // BUSCAR SUAS ALDEIAS
        // ============================================
        async function fetchMyVillages() {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);
                const response = await fetch('/map/village.txt', {
                    credentials: 'same-origin',
                    signal: controller.signal
                });
                clearTimeout(timeout);
                if (!response.ok) throw new Error('Falha ao carregar village.txt');

                const data = await response.text();
                const allVillages = data.trim().split('\n').map(line => {
                    const [id, name, x, y, player, points] = line.split(',');
                    return {
                        id:     id,
                        name:   decodeURIComponent(name.replace(/\+/g, ' ')),
                        coord:  `${x}|${y}`,
                        x:      parseInt(x),
                        y:      parseInt(y),
                        player: parseInt(player),
                        points: parseInt(points)
                    };
                });

                const meuId = window.game_data?.player?.id;
                if (!meuId) return [];

                _myVillages = allVillages.filter(v => v.player === meuId);
                _myVillages.sort((a, b) => a.name.localeCompare(b.name));

                _villageMap = {};
                _myVillages.forEach(v => { _villageMap[v.coord] = v.id; });

                return _myVillages;
            } catch (err) {
                console.error('[TWS] Erro ao buscar aldeias:', err);
                return [];
            }
        }

        // ============================================
        // TROPAS DISPONÍVEIS
        // ============================================
        async function getVillageTroops(villageId, forceRefresh = false) {
            if (Date.now() - lastCacheClear > 30000) {
                troopCache.clear();
                lastCacheClear = Date.now();
            }

            if (!forceRefresh && troopCache.has(villageId)) {
                return troopCache.get(villageId);
            }

            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);

                const url = `/game.php?village=${villageId}&screen=place`;
                const res = await fetch(url, {
                    credentials: 'same-origin',
                    signal: controller.signal
                });
                clearTimeout(timeout);

                if (!res.ok) throw new Error('Falha ao carregar /place');
                const html = await res.text();
                const doc  = new DOMParser().parseFromString(html, 'text/html');
                const troops = {};
                TROOP_IDS.forEach(u => {
                    const el  = doc.querySelector(`#units_entry_all_${u}`) ||
                                doc.querySelector(`#units_home_${u}`);
                    const txt = el ? (el.textContent || '').replace(/\./g, '').replace(/,/g, '').trim() : '0';
                    const m   = txt.match(/(\d+)/g);
                    troops[u] = m ? parseInt(m.join(''), 10) : 0;
                });
                troopCache.set(villageId, troops);
                return troops;
            } catch (err) {
                console.error('[TWS] Erro getVillageTroops:', err);
                return null;
            }
        }

        async function getAllAvailableTroops(villageId) {
            try {
                const available = await getVillageTroops(villageId);
                if (!available) return null;
                const allTroops = {};
                TROOP_IDS.forEach(t => {
                    allTroops[t] = (t !== 'spy' && t !== 'snob') ? (available[t] || 0) : 0;
                });
                return allTroops;
            } catch (err) {
                return null;
            }
        }

        function hasUserFilledTroops() {
            for (const t of TROOP_IDS) {
                const inp = document.getElementById(`agendador-${t}`);
                if (inp && parseInt(inp.value) > 0) return true;
            }
            return false;
        }

        // ============================================
        // IMPORTAÇÃO BBCODE
        // ============================================
        function importarBBCode() {
            const texto = prompt('Cole o BBCode dos ataques:');
            if (!texto) return;

            const modo = confirm('Adicionar mesmo se já existirem?\nOK = sim | Cancelar = ignorar duplicatas');
            const linhas = texto.split('[*]').filter(l => l.trim());
            let importados = 0, ignorados = 0;

            for (const linha of linhas) {
                const coords = linha.match(/(\d{1,4}\|\d{1,4})/g);
                if (!coords || coords.length < 2) continue;

                const origem = coords[0];
                const alvo = coords[1];

                const dataMatch = linha.match(/(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}(?::\d{2})?)/);
                if (!dataMatch) continue;

                let datahora = dataMatch[1];
                if (datahora.split(':').length === 2) datahora += ':00';

                const urlMatch = linha.match(/\[url=(.*?)\]/);
                const tropas = {};

                if (urlMatch) {
                    const params = new URLSearchParams(urlMatch[1].split('?')[1] || '');
                    TROOP_IDS.forEach(t => {
                        const v = params.get(`att_${t}`);
                        if (v) tropas[t] = parseInt(v);
                    });
                }

                const ataques = carregarAtaques();
                const existe = ataques.some(a => a.origem === origem && a.alvo === alvo && a.datahora === datahora);

                if (!modo && existe) {
                    ignorados++;
                    continue;
                }

                const temTropas = Object.values(tropas).some(v => v > 0);
                const autoFill = !temTropas;

                const novoAtaque = {
                    id: Date.now() + Math.random() + importados,
                    origem,
                    alvo,
                    datahora,
                    ...(autoFill ? {} : tropas),
                    enviado: false,
                    travado: false,
                    sucesso: null,
                    autoFill: autoFill
                };

                const ataquesAtuais = carregarAtaques();
                ataquesAtuais.push(novoAtaque);
                salvarAtaques(ataquesAtuais);
                importados++;
            }

            if (importados > 0) {
                adicionarLog(`✅ ${importados} ataques importados!${ignorados > 0 ? ` (${ignorados} ignorados)` : ''}`, 'success');
            } else if (ignorados > 0) {
                adicionarLog(`ℹ️ ${ignorados} ataques já existentes.`, 'info');
            } else {
                adicionarLog('❌ Nenhum ataque encontrado!', 'error');
            }
        }

        // ============================================
        // EXECUTAR ATAQUE
        // ============================================
        async function executeAttack(cfg) {
            try {
                const origemId = _villageMap[cfg.origem];
                if (!origemId) throw new Error(`Vila origem ${cfg.origem} não encontrada`);

                const [x, y] = (cfg.alvo || '').split('|');
                if (!x || !y) throw new Error(`Alvo inválido: ${cfg.alvo}`);

                let tropasParaEnviar = { ...cfg };

                if (cfg.autoFill) {
                    const availableTroops = await getVillageTroops(origemId, true);
                    if (availableTroops) {
                        TROOP_IDS.forEach(t => {
                            if (t !== 'spy' && t !== 'snob') {
                                tropasParaEnviar[t] = availableTroops[t] || 0;
                            }
                        });
                    }
                }

                const temTropas = TROOP_IDS.some(t => (tropasParaEnviar[t] || 0) > 0);
                if (!temTropas) throw new Error('Nenhuma tropa disponível para enviar!');

                const makeController = () => {
                    const c = new AbortController();
                    const t = setTimeout(() => c.abort(), 10000);
                    return { signal: c.signal, clear: () => clearTimeout(t) };
                };

                const placeUrl = `/game.php?village=${origemId}&screen=place`;

                let ctrl = makeController();
                const getRes = await fetch(placeUrl, { credentials: 'same-origin', signal: ctrl.signal });
                ctrl.clear();
                if (!getRes.ok) throw new Error(`GET /place falhou: ${getRes.status}`);

                const html = await getRes.text();
                const doc  = new DOMParser().parseFromString(html, 'text/html');

                let form = doc.querySelector('#command-data-form') ||
                           doc.querySelector('form[action*="screen=place"]') ||
                           doc.forms[0];
                if (!form) throw new Error('Formulário não encontrado');

                const payload = {};
                form.querySelectorAll('input, select, textarea').forEach(inp => {
                    if (!inp.name) return;
                    if (inp.type === 'checkbox' || inp.type === 'radio') {
                        if (inp.checked) payload[inp.name] = inp.value || 'on';
                    } else {
                        payload[inp.name] = inp.value || '';
                    }
                });

                payload.x = String(x);
                payload.y = String(y);
                TROOP_IDS.forEach(u => {
                    payload[u] = String(tropasParaEnviar[u] !== undefined ? tropasParaEnviar[u] : 0);
                });
                payload.attack = 'Ataque';

                let postUrl = form.getAttribute('action') || placeUrl;

                ctrl = makeController();
                const postRes = await fetch(postUrl, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: new URLSearchParams(payload).toString(),
                    signal: ctrl.signal
                });
                ctrl.clear();

                if (!postRes.ok && postRes.status !== 302)
                    throw new Error(`POST inicial falhou: ${postRes.status}`);

                const postText = await postRes.text();

                if (postText.includes('try=confirm') || postText.includes('confirmation')) {
                    const postDoc   = new DOMParser().parseFromString(postText, 'text/html');
                    const confirmForm = postDoc.querySelector('form[action*="try=confirm"]') ||
                                       postDoc.querySelector('#command-data-form');

                    if (confirmForm) {
                        const confirmPayload = {};
                        confirmForm.querySelectorAll('input, select, textarea').forEach(inp => {
                            if (!inp.name) return;
                            if (inp.type === 'checkbox' || inp.type === 'radio') {
                                if (inp.checked) confirmPayload[inp.name] = inp.value || 'on';
                            } else {
                                confirmPayload[inp.name] = inp.value || '';
                            }
                        });

                        let confirmUrl = confirmForm.getAttribute('action') || postRes.url || placeUrl;

                        ctrl = makeController();
                        const confirmRes = await fetch(confirmUrl, {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                            body: new URLSearchParams(confirmPayload).toString(),
                            signal: ctrl.signal
                        });
                        ctrl.clear();

                        const finalText = await confirmRes.text();
                        return /class="command-row"/i.test(finalText);
                    }
                }

                return /class="command-row"/i.test(postText);

            } catch (err) {
                console.error('[TWS] executeAttack error:', err);
                throw err;
            }
        }

        // ============================================
        // NT4 / NT5 — envio simultâneo
        // ============================================
        async function enviarMultiplosDoAtaque(index, quantidade) {
            const ataques = carregarAtaques();
            const ataqueOriginal = ataques[index];
            if (!ataqueOriginal) { adicionarLog('❌ Ataque não encontrado!', 'error'); return; }

            const hasTroops = TROOP_IDS.some(t => (ataqueOriginal[t] || 0) > 0);
            if (!hasTroops && !ataqueOriginal.autoFill) {
                adicionarLog('❌ Este ataque não possui tropas configuradas!', 'error');
                return;
            }

            adicionarLog(`🚀 Disparando ${quantidade} ataques simultâneos: ${ataqueOriginal.origem} → ${ataqueOriginal.alvo}`, 'warning');

            const promises = Array.from({ length: quantidade }, (_, i) =>
                executeAttack(ataqueOriginal)
                    .then(sucesso => ({ i: i + 1, sucesso }))
                    .catch(err   => ({ i: i + 1, sucesso: false, error: err.message }))
            );

            const results = await Promise.all(promises);
            const sucessos = results.filter(r => r.sucesso).length;
            const falhas   = results.filter(r => !r.sucesso).length;

            results.forEach(r => {
                if (r.sucesso) {
                    adicionarLog(`  ✅ Ataque ${r.i}/${quantidade} enviado!`, 'success');
                } else {
                    adicionarLog(`  ❌ Ataque ${r.i}/${quantidade} falhou: ${r.error || 'motivo desconhecido'}`, 'error');
                }
            });

            if (sucessos === quantidade) {
                adicionarLog(`🎯 NT${quantidade} completo! ${sucessos}/${quantidade} enviados.`, 'success');
            } else {
                adicionarLog(`📊 NT${quantidade}: ${sucessos} sucessos, ${falhas} falhas.`, 'warning');
            }
        }

        // ============================================
        // TEMPLATES
        // ============================================
        function loadTemplates() {
            const s = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
            if (s) troopTemplates = JSON.parse(s);
        }

        function saveTemplates() {
            localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(troopTemplates));
        }

        function saveCurrentAsTemplate(name) {
            const tropas = {};
            TROOP_IDS.forEach(t => {
                const inp = document.getElementById(`agendador-${t}`);
                if (inp) tropas[t] = parseInt(inp.value) || 0;
            });
            troopTemplates.push({ id: Date.now(), name, tropas });
            saveTemplates();
            renderTemplateList();
            adicionarLog(`✅ Template "${name}" salvo!`, 'success');
        }

        function loadTemplate(id) {
            const tpl = troopTemplates.find(t => t.id === id);
            if (!tpl) return;
            TROOP_IDS.forEach(t => {
                const inp = document.getElementById(`agendador-${t}`);
                if (inp && tpl.tropas[t] !== undefined) inp.value = tpl.tropas[t];
            });
            adicionarLog(`✅ Template "${tpl.name}" carregado!`, 'success');
        }

        function deleteTemplate(id) {
            troopTemplates = troopTemplates.filter(t => t.id !== id);
            saveTemplates();
            renderTemplateList();
            adicionarLog('✅ Template excluído!', 'success');
        }

        function renderTemplateList() {
            const c = document.getElementById('agendador-template-list');
            if (!c) return;
            if (!troopTemplates.length) {
                c.innerHTML = '<div style="color:#8b949e;text-align:center;padding:8px;font-size:11px;">Nenhum template salvo</div>';
                return;
            }
            c.innerHTML = troopTemplates.map(t => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:5px;background:#0d1117;border:1px solid #21262d;margin-bottom:4px;border-radius:4px;">
                    <span style="font-size:11px;color:#00d97e;cursor:pointer;" onclick="window.agendadorLoadTemplate(${t.id})">📋 ${t.name}</span>
                    <button onclick="window.agendadorDeleteTemplate(${t.id})" style="background:#f8514922;color:#f85149;border:1px solid #f8514933;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">✖</button>
                </div>`).join('');
        }

        window.agendadorLoadTemplate = loadTemplate;
        window.agendadorDeleteTemplate = deleteTemplate;

        // ============================================
        // ARMAZENAMENTO
        // ============================================
        function salvarAtaques(ataques) {
            localStorage.setItem(STORAGE_KEYS.ATTACKS, JSON.stringify(ataques));
            renderizarLista();
            atualizarEstatisticas();
        }

        function carregarAtaques() {
            const d = localStorage.getItem(STORAGE_KEYS.ATTACKS);
            return d ? JSON.parse(d) : [];
        }

        function salvarDadosFormulario() {
            const dados = {
                origem: document.getElementById('agendador-origem')?.value || '',
                alvo:   document.getElementById('agendador-alvo')?.value   || '',
                data:   document.getElementById('agendador-data')?.value   || '',
                hora:   document.getElementById('agendador-hora')?.value   || '00:00:00'
            };
            TROOP_IDS.forEach(t => {
                const inp = document.getElementById(`agendador-${t}`);
                if (inp) dados[t] = inp.value;
            });
            localStorage.setItem(STORAGE_KEYS.FORM_DATA, JSON.stringify(dados));
            adicionarLog('✅ Dados do formulário salvos!', 'success');
        }

        function carregarDadosFormulario() {
            const d = localStorage.getItem(STORAGE_KEYS.FORM_DATA);
            if (!d) return;
            try {
                const f = JSON.parse(d);
                if (f.origem) document.getElementById('agendador-origem').value = f.origem;
                if (f.alvo)   document.getElementById('agendador-alvo').value   = f.alvo;
                if (f.data)   document.getElementById('agendador-data').value   = f.data;
                if (f.hora)   document.getElementById('agendador-hora').value   = f.hora;
                TROOP_IDS.forEach(t => {
                    if (f[t] !== undefined) {
                        const inp = document.getElementById(`agendador-${t}`);
                        if (inp) inp.value = f[t];
                    }
                });
            } catch (e) { console.error('[TWS] Erro ao carregar dados:', e); }
        }

        // ============================================
        // SCHEDULER
        // ============================================
        let schedulerInterval = null;

        function iniciarScheduler() {
            if (schedulerInterval) clearInterval(schedulerInterval);
            schedulerInterval = setInterval(verificarAtaques, 1000);
        }

        async function verificarAtaques() {
            const ataques = carregarAtaques();
            const agora   = getServerTimestampSeconds();

            for (let i = 0; i < ataques.length; i++) {
                const ataque = ataques[i];
                if (ataque.enviado || executando.has(ataque.id)) continue;

                const [dataPart, horaPart] = ataque.datahora.split(' ');
                const [dia, mes, ano]      = dataPart.split('/');
                const [hora, minuto, segundo = '00'] = horaPart.split(':');
                const dataAgendada = new Date(ano, mes - 1, dia, hora, minuto, segundo).getTime() / 1000;

                if (Math.abs(dataAgendada - agora) <= 1) {
                    executando.add(ataque.id);
                    ataques[i].travado = true;
                    localStorage.setItem(STORAGE_KEYS.ATTACKS, JSON.stringify(ataques));

                    (async (ataqueRef) => {
                        try {
                            const sucesso = await executeAttack(ataqueRef);
                            const atual = carregarAtaques();
                            const idx   = atual.findIndex(a => a.id === ataqueRef.id);
                            if (idx !== -1) {
                                atual[idx].enviado   = true;
                                atual[idx].sucesso   = sucesso;
                                atual[idx].travado   = false;
                                atual[idx].dataEnvio = new Date().toISOString();
                                salvarAtaques(atual);
                            }
                            adicionarLog(
                                sucesso
                                    ? `✅ Ataque ${ataqueRef.origem} → ${ataqueRef.alvo} enviado!`
                                    : `❌ Falha no ataque ${ataqueRef.origem} → ${ataqueRef.alvo}`,
                                sucesso ? 'success' : 'error'
                            );
                        } catch (err) {
                            const atual = carregarAtaques();
                            const idx   = atual.findIndex(a => a.id === ataqueRef.id);
                            if (idx !== -1) {
                                atual[idx].enviado = true;
                                atual[idx].sucesso = false;
                                atual[idx].travado = false;
                                atual[idx].erro    = err.message;
                                salvarAtaques(atual);
                            }
                            adicionarLog(`❌ Erro: ${err.message}`, 'error');
                        } finally {
                            executando.delete(ataqueRef.id);
                        }
                    })(ataque);
                }
            }
        }

        // ============================================
        // AGENDAR ATAQUE
        // ============================================
        async function agendarAtaque() {
            const origem = document.getElementById('agendador-origem').value.trim();
            const alvo   = document.getElementById('agendador-alvo').value.trim();
            const data   = document.getElementById('agendador-data').value.trim();
            const hora   = document.getElementById('agendador-hora').value.trim();

            if (!origem || !alvo || !data || !hora) {
                adicionarLog('❌ Preencha todos os campos!', 'error');
                return;
            }

            const datahora = `${data} ${hora}`;

            if (!/^\d{1,4}\|\d{1,4}$/.test(origem) || !/^\d{1,4}\|\d{1,4}$/.test(alvo)) {
                adicionarLog('❌ Coordenadas inválidas! Use: 500|500', 'error');
                return;
            }
            if (!/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(datahora)) {
                adicionarLog('❌ Data/hora inválida! Use: DD/MM/AAAA HH:MM:SS', 'error');
                return;
            }

            const [dia, mes, ano]              = data.split('/');
            const [horaNum, minutoNum, segundoNum] = hora.split(':');
            const dataAgendada = new Date(ano, mes - 1, dia, horaNum, minutoNum, segundoNum);
            if (dataAgendada <= getServerDate()) {
                adicionarLog('❌ A data/hora deve ser futura!', 'error');
                return;
            }

            let tropas   = {};
            let autoFill = false;

            const userFilled = hasUserFilledTroops();

            if (!userFilled) {
                const villageId = _villageMap[origem];
                if (!villageId) {
                    adicionarLog('❌ Vila origem não encontrada no mapa!', 'error');
                    return;
                }

                const allTroops = await getAllAvailableTroops(villageId);
                if (!allTroops) {
                    adicionarLog('❌ Não foi possível verificar as tropas disponíveis!', 'error');
                    return;
                }

                const hasAnyTroops = Object.values(allTroops).some(v => v > 0);
                if (!hasAnyTroops) {
                    adicionarLog('❌ Esta vila não possui tropas disponíveis!', 'error');
                    return;
                }

                autoFill = true;
                adicionarLog(`🤖 AutoFill ativado: tropas serão buscadas no momento do envio`, 'info');
            } else {
                TROOP_IDS.forEach(t => {
                    const inp = document.getElementById(`agendador-${t}`);
                    tropas[t] = parseInt(inp?.value || 0);
                });

                const temTropas = Object.values(tropas).some(v => v > 0);
                if (!temTropas) {
                    adicionarLog('❌ Selecione pelo menos um tipo de tropa ou deixe vazio para AutoFill!', 'error');
                    return;
                }
            }

            const novoAtaque = {
                id:       Date.now() + Math.random(),
                origem,
                alvo,
                datahora,
                ...(autoFill ? {} : tropas),
                enviado:  false,
                travado:  false,
                sucesso:  null,
                autoFill: autoFill
            };

            const ataques = carregarAtaques();
            ataques.push(novoAtaque);
            salvarAtaques(ataques);
            adicionarLog(`✅ Ataque agendado para ${datahora}${autoFill ? ' [AutoFill]' : ''}`, 'success');
        }

        // ============================================
        // RENDERIZAR LISTA (com UI Kit)
        // ============================================
        function renderizarLista() {
            const container = document.getElementById('agendador-lista-ataques');
            if (!container) return;
            const ataques = carregarAtaques();
            const agora   = getServerTimestampSeconds();

            if (!ataques.length) {
                container.innerHTML = ui.emptyRowHTML('📭', 'Nenhum ataque agendado', 'Clique em "Agendar" para criar um novo ataque', 5);
                return;
            }

            container.innerHTML = ataques.map((ataque, index) => {
                const [dataPart, horaPart] = ataque.datahora.split(' ');
                const [dia, mes, ano]      = dataPart.split('/');
                const [hora, min, seg = '00'] = horaPart.split(':');
                const dataAgendada = new Date(ano, mes - 1, dia, hora, min, seg).getTime() / 1000;
                const isPast = !ataque.enviado && dataAgendada < agora;

                const autoFillBadge = ataque.autoFill
                    ? `<span class="agendador-badge agendador-badge-blue" style="margin-left:6px;">🤖 AutoFill</span>`
                    : '';

                let statusText = '';
                let statusClass = '';
                if (ataque.enviado) {
                    if (ataque.sucesso) {
                        statusText = '✅ Enviado com sucesso';
                        statusClass = 'agendador-badge-green';
                    } else {
                        statusText = `❌ Falhou: ${ataque.erro || 'motivo desconhecido'}`;
                        statusClass = 'agendador-badge-red';
                    }
                } else if (ataque.travado) {
                    statusText = '⏳ Enviando...';
                    statusClass = 'agendador-badge-blue';
                } else if (isPast) {
                    statusText = '⏰ Atrasado — clique em Enviar agora';
                    statusClass = 'agendador-badge-yellow';
                } else if (ataque.autoFill) {
                    statusText = '🤖 Aguardando (usará tropas atuais no envio)';
                    statusClass = 'agendador-badge-blue';
                } else {
                    statusText = '⏰ Agendado';
                    statusClass = 'agendador-badge-green';
                }

                let tropasPreview = '';
                if (!ataque.autoFill) {
                    const list = TROOP_IDS.filter(t => (ataque[t] || 0) > 0);
                    if (list.length) {
                        tropasPreview = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">` +
                            list.map(t => `
                                <span style="background:#0d1117;border:1px solid #21262d;padding:2px 6px;border-radius:4px;font-size:10px;display:inline-flex;align-items:center;gap:4px;">
                                    <img src="${TROOP_ICONS[t]}" style="width:14px;height:14px;" title="${TROOP_NAMES[t]}">
                                    ${number_format(ataque[t], '.')}
                                </span>`).join('') +
                            `</div>`;
                    }
                }

                return `
                    <div style="background:#0d1117;border-left:3px solid ${ataque.enviado ? (ataque.sucesso ? '#00d97e' : '#f85149') : '#d29922'};border-radius:6px;padding:10px;margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                            <div style="font-size:13px;">
                                <strong style="color:#00d97e;">${ataque.origem}</strong>
                                <span style="color:#8b949e;">→</span>
                                <strong style="color:#00d97e;">${ataque.alvo}</strong>
                                ${autoFillBadge}
                            </div>
                            <div style="font-size:11px;color:#8b949e;font-family:monospace;">${ataque.datahora}</div>
                        </div>
                        ${tropasPreview}
                        <div style="margin-top:6px;">
                            <span class="${statusClass}" style="font-size:10px;padding:2px 6px;">${statusText}</span>
                        </div>
                        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                            ${!ataque.enviado
                                ? `<button onclick="window.agendadorEnviarImediato(${index})" class="agendador-btn agendador-btn-warning" style="padding:4px 10px;font-size:10px;">▶ Enviar agora</button>`
                                : ''}
                            ${ataque.enviado && ataque.sucesso
                                ? `<button onclick="window.agendadorRepetirAtaque(${index})" class="agendador-btn agendador-btn-primary" style="padding:4px 10px;font-size:10px;">🔄 Repetir</button>`
                                : ''}
                            <button onclick="window.agendadorEnviarNT(${index},4)" class="agendador-btn agendador-btn-primary" style="padding:4px 10px;font-size:10px;background:#b87333;">⚡ NT4</button>
                            <button onclick="window.agendadorEnviarNT(${index},5)" class="agendador-btn agendador-btn-primary" style="padding:4px 10px;font-size:10px;background:#a0522d;">🔥 NT5</button>
                            <button onclick="window.agendadorRemoverAtaque(${index})" class="agendador-btn agendador-btn-danger" style="padding:4px 10px;font-size:10px;">🗑️ Remover</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ============================================
        // AÇÕES DA LISTA (globais)
        // ============================================
        window.agendadorEnviarImediato = async (index) => {
            const ataques = carregarAtaques();
            const ataque  = ataques[index];
            if (!ataque) return;
            adicionarLog(`▶ Enviando imediatamente: ${ataque.origem} → ${ataque.alvo}`, 'info');
            try {
                const sucesso = await executeAttack(ataque);
                ataques[index].enviado   = true;
                ataques[index].sucesso   = sucesso;
                ataques[index].dataEnvio = new Date().toISOString();
                salvarAtaques(ataques);
                adicionarLog(sucesso ? '✅ Ataque enviado!' : '❌ Falha no envio', sucesso ? 'success' : 'error');
            } catch (err) {
                adicionarLog(`❌ Erro: ${err.message}`, 'error');
            }
        };

        window.agendadorRepetirAtaque = async (index) => {
            const ataques       = carregarAtaques();
            const ataqueOriginal = ataques[index];
            if (!ataqueOriginal) return;
            adicionarLog(`🔄 Repetindo: ${ataqueOriginal.origem} → ${ataqueOriginal.alvo}`, 'info');
            try {
                const sucesso = await executeAttack(ataqueOriginal);
                adicionarLog(sucesso ? '✅ Ataque repetido!' : '❌ Falha', sucesso ? 'success' : 'error');
            } catch (err) {
                adicionarLog(`❌ Erro: ${err.message}`, 'error');
            }
        };

        window.agendadorEnviarNT = (index, quantidade) => {
            enviarMultiplosDoAtaque(index, quantidade);
        };

        window.agendadorRemoverAtaque = (index) => {
            const ataques = carregarAtaques();
            const a = ataques[index];
            ataques.splice(index, 1);
            salvarAtaques(ataques);
            adicionarLog(`✅ Ataque ${a?.origem} → ${a?.alvo} removido!`, 'success');
        };

        function limparTudo() {
            if (confirm('⚠️ Tem certeza que deseja remover TODOS os ataques?')) {
                salvarAtaques([]);
                adicionarLog('🗑️ Todos os ataques removidos!', 'warning');
            }
        }

        function limparConcluidos() {
            const ataques      = carregarAtaques();
            const naoConcluidos = ataques.filter(a => !a.enviado);
            const removidos = ataques.length - naoConcluidos.length;
            if (removidos === 0) {
                adicionarLog('ℹ️ Nenhum ataque concluído para remover.', 'info');
                return;
            }
            salvarAtaques(naoConcluidos);
            adicionarLog(`🧹 Removidos ${removidos} ataques concluídos`, 'success');
        }

        function destravarAtaques() {
            const ataques = carregarAtaques();
            let n = 0;
            ataques.forEach(a => { if (a.travado && !a.enviado) { a.travado = false; n++; } });
            if (n > 0) { salvarAtaques(ataques); adicionarLog(`✅ ${n} ataques destravados!`, 'success'); }
            else        { adicionarLog('ℹ️ Nenhum ataque travado encontrado.', 'info'); }
        }

        // ============================================
        // ESTATÍSTICAS
        // ============================================
        function atualizarEstatisticas() {
            const ataques = carregarAtaques();
            const total = ataques.length;
            const pendentes = ataques.filter(a => !a.enviado).length;
            const sucessos = ataques.filter(a => a.enviado && a.sucesso).length;
            const falhas = ataques.filter(a => a.enviado && !a.sucesso).length;

            ui.updateStat('agendador-total', total);
            ui.updateStat('agendador-pendentes', pendentes);
            ui.updateStat('agendador-sucessos', sucessos);
            ui.updateStat('agendador-falhas', falhas);
        }

        function atualizarSelectAldeias() {
            const select = document.getElementById('agendador-origem-select');
            if (!select) return;
            if (_myVillages.length === 0) {
                select.innerHTML = '<option value="">Nenhuma aldeia encontrada</option>';
                return;
            }
            select.innerHTML = '<option value="">Selecione uma aldeia...</option>';
            _myVillages.forEach(village => {
                const option = document.createElement('option');
                option.value       = village.coord;
                option.textContent = `${village.name} (${village.coord}) — ${number_format(village.points, '.')} pts`;
                select.appendChild(option);
            });
        }

        // ============================================
        // CONSTRUÇÃO DO DASHBOARD COM UI KIT
        // ============================================

        // 1. Renderiza o app
        ui.renderApp();

        // 2. Header
        ui.header('⚔️ Agendador de Ataques', 'v20.0', '<span style="font-size:10px;color:#8b949e;">Dashboard Central</span>');

        // 3. Stats Strip
        ui.statsStrip([
            { title: '📊 Total de Ataques', items: [{ icon: '🎯', id: 'agendador-total' }] },
            { title: '⏳ Pendentes', items: [{ icon: '📋', id: 'agendador-pendentes' }] },
            { title: '✅ Sucessos', items: [{ icon: '🏆', id: 'agendador-sucessos' }] },
            { title: '❌ Falhas', items: [{ icon: '⚠️', id: 'agendador-falhas' }] }
        ]);

        // 4. Progress Bar
        ui.progressBar();

        // 5. Toolbar
        ui.toolbar(
            `<button id="agendador-agendar-btn" class="agendador-btn agendador-btn-primary">📅 Agendar</button>
             <button id="agendador-usar-todas-btn" class="agendador-btn agendador-btn-warning">🎯 Usar TODAS Tropas</button>
             <button id="agendador-importar-btn" class="agendador-btn agendador-btn-primary">📋 Importar BBCode</button>
             <button id="agendador-salvar-dados-btn" class="agendador-btn agendador-btn-primary">💾 Salvar</button>
             <button id="agendador-limpar-concluidos-btn" class="agendador-btn agendador-btn-primary">🧹 Limpar Concluídos</button>
             <button id="agendador-destravar-btn" class="agendador-btn agendador-btn-primary">🔓 Destravar</button>
             <button id="agendador-limpar-tudo-btn" class="agendador-btn agendador-btn-danger">🗑️ Limpar Tudo</button>`,
            `<span id="agendador-status" style="font-size:10px;color:#8b949e;"></span>`
        );

        // 6. Main Layout com conteúdo personalizado
        const contentHTML = `
            <div style="padding:0 20px 20px 20px;">
                <!-- Formulário -->
                <div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:16px;margin-bottom:20px;">
                    <div style="color:#00d97e;font-weight:bold;margin-bottom:12px;font-size:12px;">📝 Novo Ataque</div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                        <div>
                            <label style="display:block;font-size:10px;color:#8b949e;margin-bottom:4px;">🏠 Vila Origem</label>
                            <select id="agendador-origem-select" style="width:100%;padding:6px;background:#080c10;border:1px solid #21262d;color:#c9d1d9;border-radius:6px;margin-bottom:5px;"></select>
                            <input type="text" id="agendador-origem" placeholder="Ou digite coordenadas (ex: 500|500)"
                                style="width:100%;padding:6px;background:#080c10;border:1px solid #21262d;color:#c9d1d9;border-radius:6px;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="display:block;font-size:10px;color:#8b949e;margin-bottom:4px;">🎯 Vila Alvo</label>
                            <input type="text" id="agendador-alvo" placeholder="Ex: 510|510"
                                style="width:100%;padding:6px;background:#080c10;border:1px solid #21262d;color:#c9d1d9;border-radius:6px;box-sizing:border-box;">
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                        <div>
                            <label style="display:block;font-size:10px;color:#8b949e;margin-bottom:4px;">📅 Data</label>
                            <input type="text" id="agendador-data" placeholder="DD/MM/AAAA"
                                style="width:100%;padding:6px;background:#080c10;border:1px solid #21262d;color:#c9d1d9;border-radius:6px;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="display:block;font-size:10px;color:#8b949e;margin-bottom:4px;">⏰ Hora</label>
                            <div style="display:flex;gap:6px;">
                                <input type="text" id="agendador-hora" value="00:00:00"
                                    style="flex:1;padding:6px;background:#080c10;border:1px solid #21262d;color:#c9d1d9;border-radius:6px;">
                                <button id="agendador-btn-agora" style="padding:4px 8px;background:#388bfd22;color:#388bfd;border:1px solid #388bfd33;border-radius:4px;cursor:pointer;font-size:10px;">Agora</button>
                                <button id="agendador-btn-mais1h" style="padding:4px 8px;background:#00d97e22;color:#00d97e;border:1px solid #00d97e33;border-radius:4px;cursor:pointer;font-size:10px;">+1h</button>
                                <button id="agendador-btn-mais30m" style="padding:4px 8px;background:#00d97e22;color:#00d97e;border:1px solid #00d97e33;border-radius:4px;cursor:pointer;font-size:10px;">+30m</button>
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom:12px;">
                        <label style="display:block;font-size:10px;color:#8b949e;margin-bottom:4px;">⚔️ Tropas <span style="color:#666;">(deixe vazio para AutoFill)</span></label>
                        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#080c10;padding:8px;border-radius:6px;max-height:200px;overflow-y:auto;">
                            ${TROOP_LIST.map(t => `
                                <div style="display:flex;justify-content:space-between;align-items:center;background:#0d1117;padding:4px 8px;border-radius:4px;border:1px solid #21262d;">
                                    <span style="font-size:11px;color:#00d97e;display:flex;align-items:center;gap:5px;">
                                        <img src="${t.icon}" style="width:16px;height:16px;"> ${t.nome}
                                    </span>
                                    <input type="number" id="agendador-${t.id}" value="0" min="0" step="1"
                                        style="width:65px;padding:3px;background:#080c10;border:1px solid #21262d;color:#c9d1d9;border-radius:4px;text-align:center;">
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Templates -->
                    <div style="margin-bottom:12px;background:#080c10;border:1px solid #21262d;border-radius:6px;padding:10px;">
                        <div style="color:#00d97e;font-size:11px;font-weight:bold;margin-bottom:8px;">💾 Templates de Tropas</div>
                        <div id="agendador-template-list" style="max-height:120px;overflow-y:auto;margin-bottom:8px;"></div>
                        <div style="display:flex;gap:6px;">
                            <input type="text" id="agendador-template-name" placeholder="Nome do template"
                                style="flex:1;padding:4px 8px;background:#080c10;border:1px solid #21262d;color:#c9d1d9;border-radius:4px;font-size:11px;">
                            <button id="agendador-salvar-template-btn"
                                style="padding:4px 10px;background:#00d97e22;color:#00d97e;border:1px solid #00d97e33;border-radius:4px;cursor:pointer;font-size:11px;">
                                Salvar atual
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Lista de ataques -->
                <div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:16px;">
                    <div style="color:#00d97e;font-weight:bold;margin-bottom:12px;font-size:12px;">📋 Ataques Agendados</div>
                    <div id="agendador-lista-ataques"></div>
                </div>
            </div>
        `;

        ui.mainLayout(contentHTML, '📝 Log de Atividades');

        // Guarda referência para o log
        uiLog = ui.log.bind(ui);

        // Adiciona estilos personalizados para os botões e badges
        const style = document.createElement('style');
        style.textContent = `
            .agendador-btn {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 6px 14px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 700;
                transition: all 0.15s;
                font-family: inherit;
            }
            .agendador-btn-primary {
                background: #00d97e;
                color: #000;
            }
            .agendador-btn-primary:hover {
                background: #33ffaa;
                transform: translateY(-1px);
            }
            .agendador-btn-warning {
                background: #c97c00;
                color: #fff;
            }
            .agendador-btn-warning:hover {
                background: #e8900a;
                transform: translateY(-1px);
            }
            .agendador-btn-danger {
                background: #f8514922;
                color: #f85149;
                border: 1px solid #f8514933;
            }
            .agendador-btn-danger:hover {
                background: #f85149;
                color: #fff;
                transform: translateY(-1px);
            }
            .agendador-badge {
                display: inline-block;
                font-size: 9px;
                font-weight: 600;
                border-radius: 3px;
                padding: 2px 6px;
                border: 1px solid transparent;
            }
            .agendador-badge-green {
                background: #00d97e22;
                border-color: #00d97e33;
                color: #00d97e;
            }
            .agendador-badge-red {
                background: #f8514922;
                border-color: #f8514933;
                color: #f85149;
            }
            .agendador-badge-yellow {
                background: #d2992222;
                border-color: #d2992233;
                color: #d29922;
            }
            .agendador-badge-blue {
                background: #388bfd22;
                border-color: #388bfd33;
                color: #388bfd;
            }
        `;
        document.head.appendChild(style);

        // ============================================
        // EVENTOS
        // ============================================
        document.getElementById('agendador-agendar-btn')?.addEventListener('click', agendarAtaque);
        document.getElementById('agendador-salvar-dados-btn')?.addEventListener('click', salvarDadosFormulario);
        document.getElementById('agendador-limpar-concluidos-btn')?.addEventListener('click', limparConcluidos);
        document.getElementById('agendador-destravar-btn')?.addEventListener('click', destravarAtaques);
        document.getElementById('agendador-limpar-tudo-btn')?.addEventListener('click', limparTudo);
        document.getElementById('agendador-importar-btn')?.addEventListener('click', importarBBCode);
        document.getElementById('agendador-usar-todas-btn')?.addEventListener('click', async () => {
            const origem = document.getElementById('agendador-origem').value.trim();
            if (!origem) { adicionarLog('❌ Selecione uma vila origem primeiro!', 'error'); return; }
            const villageId = _villageMap[origem];
            if (!villageId) { adicionarLog('❌ Vila não encontrada no mapa!', 'error'); return; }
            adicionarLog('⏳ Buscando tropas disponíveis...', 'info');
            const allTroops = await getAllAvailableTroops(villageId);
            if (allTroops) {
                TROOP_IDS.forEach(t => {
                    const inp = document.getElementById(`agendador-${t}`);
                    if (inp && allTroops[t] !== undefined) inp.value = allTroops[t];
                });
                const total = Object.values(allTroops).reduce((a, b) => a + b, 0);
                adicionarLog(`✅ Preenchido com ${number_format(total, '.')} tropas disponíveis!`, 'success');
            } else {
                adicionarLog('❌ Não foi possível obter as tropas!', 'error');
            }
        });

        document.getElementById('agendador-salvar-template-btn')?.addEventListener('click', () => {
            const name = document.getElementById('agendador-template-name')?.value.trim();
            if (name) { saveCurrentAsTemplate(name); document.getElementById('agendador-template-name').value = ''; }
            else { adicionarLog('❌ Digite um nome para o template!', 'error'); }
        });

        document.getElementById('agendador-btn-agora')?.addEventListener('click', () => {
            preencherDataHoraAutomatica();
            adicionarLog('✅ Horário do servidor inserido!', 'success');
        });

        document.getElementById('agendador-btn-mais1h')?.addEventListener('click', () => {
            const [d, h] = adicionarMinutos(60).split(' ');
            const dataInput = document.getElementById('agendador-data');
            const horaInput = document.getElementById('agendador-hora');
            if (dataInput) dataInput.value = d;
            if (horaInput) horaInput.value = h;
            adicionarLog('✅ +1 hora adicionada!', 'success');
        });

        document.getElementById('agendador-btn-mais30m')?.addEventListener('click', () => {
            const [d, h] = adicionarMinutos(30).split(' ');
            const dataInput = document.getElementById('agendador-data');
            const horaInput = document.getElementById('agendador-hora');
            if (dataInput) dataInput.value = d;
            if (horaInput) horaInput.value = h;
            adicionarLog('✅ +30 minutos adicionados!', 'success');
        });

        const origemSelect = document.getElementById('agendador-origem-select');
        const origemInput  = document.getElementById('agendador-origem');
        if (origemSelect && origemInput) {
            origemSelect.addEventListener('change', () => { if (origemSelect.value) origemInput.value = origemSelect.value; });
            origemInput.addEventListener('input',   () => { if (origemInput.value)  origemSelect.value = ''; });
        }

        // ============================================
        // INICIALIZAÇÃO
        // ============================================
        sincronizarHorarioServidor();
        loadTemplates();

        try {
            await fetchMyVillages();
            atualizarSelectAldeias();
        } catch (err) {
            console.error('[TWS] fetchMyVillages falhou:', err);
        }

        carregarDadosFormulario();
        preencherDataHoraAutomatica();
        renderizarLista();
        atualizarEstatisticas();
        renderTemplateList();

        iniciarScheduler();

        adicionarLog('✅ Dashboard v20.0 inicializado com TW UI Kit!', 'success');
        adicionarLog(`📋 ${_myVillages.length} aldeias carregadas`, 'info');
        adicionarLog(`⏱ Offset servidor: ${_serverTimeOffsetMs}ms`, 'info');
    }

})();
