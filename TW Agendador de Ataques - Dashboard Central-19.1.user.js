// ==UserScript==
// @name         TW Agendador de Ataques - Dashboard Central
// @namespace    http://tampermonkey.net/
// @version      19.1
// @description  Agende ataques com precisão - Dashboard em aba separada
// @match        https://*.tribalwars.com.br/game.php*
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
    // BOTÃO NA ABA DO JOGO
    // ============================================
    function adicionarBotaoAbrirDashboard() {
        const btn = document.createElement('div');
        btn.innerHTML = '⚔️ AGENDADOR';
        btn.style.cssText = `
            position: fixed;
            top: 130px;
            right: 10px;
            z-index: 999999;
            padding: 8px 12px;
            background: #0a0a0a;
            color: #ff6600;
            border: 1px solid #ff6600;
            border-radius: 6px;
            cursor: pointer;
            font-family: monospace;
            font-weight: bold;
            font-size: 11px;
        `;
        btn.onclick = () => {
            window.open(window.location.href.split('?')[0] + '?' + DASHBOARD_PARAM, 'TWAgendador');
        };
        document.body.appendChild(btn);
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
            const dataInput = document.getElementById('data');
            const horaInput = document.getElementById('hora');
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
                const inp = document.getElementById(t);
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
                // Extrai coordenadas
                const coords = linha.match(/(\d{1,4}\|\d{1,4})/g);
                if (!coords || coords.length < 2) continue;

                const origem = coords[0];
                const alvo = coords[1];

                // Extrai data/hora
                const dataMatch = linha.match(/(\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}(?::\d{2})?)/);
                if (!dataMatch) continue;

                let datahora = dataMatch[1];
                if (datahora.split(':').length === 2) datahora += ':00';

                // Extrai tropas da URL
                const urlMatch = linha.match(/\[url=(.*?)\]/);
                const tropas = {};

                if (urlMatch) {
                    const params = new URLSearchParams(urlMatch[1].split('?')[1] || '');
                    TROOP_IDS.forEach(t => {
                        const v = params.get(`att_${t}`);
                        if (v) tropas[t] = parseInt(v);
                    });
                }

                // Verifica se já existe
                const ataques = carregarAtaques();
                const existe = ataques.some(a => a.origem === origem && a.alvo === alvo && a.datahora === datahora);

                if (!modo && existe) {
                    ignorados++;
                    continue;
                }

                // Se não tem tropas na URL, usa AutoFill
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
                adicionarLog(`✅ ${importados} ataques importados!${ignorados > 0 ? ` (${ignorados} ignorados)` : ''}`, 'ok');
            } else if (ignorados > 0) {
                adicionarLog(`ℹ️ ${ignorados} ataques já existentes.`, 'info');
            } else {
                adicionarLog('❌ Nenhum ataque encontrado!', 'err');
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
            if (!ataqueOriginal) { adicionarLog('❌ Ataque não encontrado!', 'err'); return; }

            const hasTroops = TROOP_IDS.some(t => (ataqueOriginal[t] || 0) > 0);
            if (!hasTroops && !ataqueOriginal.autoFill) {
                adicionarLog('❌ Este ataque não possui tropas configuradas!', 'err');
                return;
            }

            adicionarLog(`🚀 Disparando ${quantidade} ataques simultâneos: ${ataqueOriginal.origem} → ${ataqueOriginal.alvo}`, 'warn');

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
                    adicionarLog(`  ✅ Ataque ${r.i}/${quantidade} enviado!`, 'ok');
                } else {
                    adicionarLog(`  ❌ Ataque ${r.i}/${quantidade} falhou: ${r.error || 'motivo desconhecido'}`, 'err');
                }
            });

            if (sucessos === quantidade) {
                adicionarLog(`🎯 NT${quantidade} completo! ${sucessos}/${quantidade} enviados.`, 'ok');
            } else {
                adicionarLog(`📊 NT${quantidade}: ${sucessos} sucessos, ${falhas} falhas.`, 'warn');
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
                const inp = document.getElementById(t);
                if (inp) tropas[t] = parseInt(inp.value) || 0;
            });
            troopTemplates.push({ id: Date.now(), name, tropas });
            saveTemplates();
            renderTemplateList();
            adicionarLog(`✅ Template "${name}" salvo!`, 'ok');
        }

        function loadTemplate(id) {
            const tpl = troopTemplates.find(t => t.id === id);
            if (!tpl) return;
            TROOP_IDS.forEach(t => {
                const inp = document.getElementById(t);
                if (inp && tpl.tropas[t] !== undefined) inp.value = tpl.tropas[t];
            });
            adicionarLog(`✅ Template "${tpl.name}" carregado!`, 'ok');
        }

        function deleteTemplate(id) {
            troopTemplates = troopTemplates.filter(t => t.id !== id);
            saveTemplates();
            renderTemplateList();
            adicionarLog('✅ Template excluído!', 'ok');
        }

        function renderTemplateList() {
            const c = document.getElementById('tws-template-list');
            if (!c) return;
            if (!troopTemplates.length) {
                c.innerHTML = '<div style="color:#666;text-align:center;padding:8px;font-size:11px;">Nenhum template salvo</div>';
                return;
            }
            c.innerHTML = troopTemplates.map(t => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:5px;background:#0a0a0a;border:1px solid #333;margin-bottom:4px;border-radius:4px;">
                    <span style="font-size:11px;color:#ff6600;cursor:pointer;" onclick="window.loadTemplate(${t.id})">📋 ${t.name}</span>
                    <button onclick="window.deleteTemplate(${t.id})" style="background:#990000;color:#fff;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;">✖</button>
                </div>`).join('');
        }

        window.loadTemplate   = loadTemplate;
        window.deleteTemplate = deleteTemplate;

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
                origem: document.getElementById('origem')?.value || '',
                alvo:   document.getElementById('alvo')?.value   || '',
                data:   document.getElementById('data')?.value   || '',
                hora:   document.getElementById('hora')?.value   || '00:00:00'
            };
            TROOP_IDS.forEach(t => {
                const inp = document.getElementById(t);
                if (inp) dados[t] = inp.value;
            });
            localStorage.setItem(STORAGE_KEYS.FORM_DATA, JSON.stringify(dados));
            adicionarLog('✅ Dados do formulário salvos!', 'ok');
        }

        function carregarDadosFormulario() {
            const d = localStorage.getItem(STORAGE_KEYS.FORM_DATA);
            if (!d) return;
            try {
                const f = JSON.parse(d);
                if (f.origem) document.getElementById('origem').value = f.origem;
                if (f.alvo)   document.getElementById('alvo').value   = f.alvo;
                if (f.data)   document.getElementById('data').value   = f.data;
                if (f.hora)   document.getElementById('hora').value   = f.hora;
                TROOP_IDS.forEach(t => {
                    if (f[t] !== undefined) {
                        const inp = document.getElementById(t);
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
                                sucesso ? 'ok' : 'err'
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
                            adicionarLog(`❌ Erro: ${err.message}`, 'err');
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
            const origem = document.getElementById('origem').value.trim();
            const alvo   = document.getElementById('alvo').value.trim();
            const data   = document.getElementById('data').value.trim();
            const hora   = document.getElementById('hora').value.trim();

            if (!origem || !alvo || !data || !hora) {
                adicionarLog('❌ Preencha todos os campos!', 'err');
                return;
            }

            const datahora = `${data} ${hora}`;

            if (!/^\d{1,4}\|\d{1,4}$/.test(origem) || !/^\d{1,4}\|\d{1,4}$/.test(alvo)) {
                adicionarLog('❌ Coordenadas inválidas! Use: 500|500', 'err');
                return;
            }
            if (!/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(datahora)) {
                adicionarLog('❌ Data/hora inválida! Use: DD/MM/AAAA HH:MM:SS', 'err');
                return;
            }

            const [dia, mes, ano]              = data.split('/');
            const [horaNum, minutoNum, segundoNum] = hora.split(':');
            const dataAgendada = new Date(ano, mes - 1, dia, horaNum, minutoNum, segundoNum);
            if (dataAgendada <= getServerDate()) {
                adicionarLog('❌ A data/hora deve ser futura!', 'err');
                return;
            }

            let tropas   = {};
            let autoFill = false;

            const userFilled = hasUserFilledTroops();

            if (!userFilled) {
                const villageId = _villageMap[origem];
                if (!villageId) {
                    adicionarLog('❌ Vila origem não encontrada no mapa!', 'err');
                    return;
                }

                const allTroops = await getAllAvailableTroops(villageId);
                if (!allTroops) {
                    adicionarLog('❌ Não foi possível verificar as tropas disponíveis!', 'err');
                    return;
                }

                const hasAnyTroops = Object.values(allTroops).some(v => v > 0);
                if (!hasAnyTroops) {
                    adicionarLog('❌ Esta vila não possui tropas disponíveis!', 'err');
                    return;
                }

                autoFill = true;
                adicionarLog(`🤖 AutoFill ativado: tropas serão buscadas no momento do envio`, 'info');
            } else {
                TROOP_IDS.forEach(t => {
                    const inp = document.getElementById(t);
                    tropas[t] = parseInt(inp?.value || 0);
                });

                const temTropas = Object.values(tropas).some(v => v > 0);
                if (!temTropas) {
                    adicionarLog('❌ Selecione pelo menos um tipo de tropa ou deixe vazio para AutoFill!', 'err');
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
            adicionarLog(`✅ Ataque agendado para ${datahora}${autoFill ? ' [AutoFill]' : ''}`, 'ok');
        }

        // ============================================
        // RENDERIZAR LISTA
        // ============================================
        function renderizarLista() {
            const container = document.getElementById('listaAtaques');
            if (!container) return;
            const ataques = carregarAtaques();
            const agora   = getServerTimestampSeconds();

            if (!ataques.length) {
                container.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">Nenhum ataque agendado</div>';
                return;
            }

            container.innerHTML = ataques.map((ataque, index) => {
                const [dataPart, horaPart] = ataque.datahora.split(' ');
                const [dia, mes, ano]      = dataPart.split('/');
                const [hora, min, seg = '00'] = horaPart.split(':');
                const dataAgendada = new Date(ano, mes - 1, dia, hora, min, seg).getTime() / 1000;
                const isPast = !ataque.enviado && dataAgendada < agora;

                const corBorda  = ataque.enviado ? (ataque.sucesso ? '#22a55a' : '#e24b4a') : '#ff6600';
                const autoFillBadge = ataque.autoFill
                    ? '<span style="background:#ff6600;color:#000;padding:1px 5px;border-radius:3px;font-size:9px;margin-left:6px;">🤖 AutoFill</span>'
                    : '';
                const statusText = ataque.enviado
                    ? (ataque.sucesso ? '✅ Enviado com sucesso' : `❌ Falhou: ${ataque.erro || 'motivo desconhecido'}`)
                    : (ataque.travado ? '⏳ Enviando...'
                        : (isPast ? '⏰ Atrasado — clique em Enviar agora'
                            : (ataque.autoFill ? '🤖 Aguardando (usará tropas atuais no envio)' : '⏰ Agendado')));

                const corStatus = ataque.enviado
                    ? (ataque.sucesso ? '#22a55a' : '#e24b4a')
                    : (isPast ? '#ff8800' : '#aaa');

                let tropasPreview = '';
                if (!ataque.autoFill) {
                    const list = TROOP_IDS.filter(t => (ataque[t] || 0) > 0);
                    if (list.length) {
                        tropasPreview = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">` +
                            list.map(t => `
                                <span style="background:#0a0a0a;border:1px solid #333;padding:2px 5px;border-radius:3px;font-size:10px;display:inline-flex;align-items:center;gap:3px;">
                                    <img src="${TROOP_ICONS[t]}" style="width:13px;height:13px;" title="${TROOP_NAMES[t]}">
                                    ${number_format(ataque[t], '.')}
                                </span>`).join('') +
                            `</div>`;
                    }
                }

                return `
                    <div style="background:#1a1a1a;border-left:3px solid ${corBorda};border-radius:6px;padding:8px;margin-bottom:8px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div style="font-size:12px;"><strong style="color:#ff6600;">${ataque.origem}</strong> → <strong style="color:#ff6600;">${ataque.alvo}</strong>${autoFillBadge}</div>
                            <div style="font-size:10px;color:#888;">${ataque.datahora}</div>
                        </div>
                        ${tropasPreview}
                        <div style="font-size:10px;margin-top:4px;color:${corStatus};">${statusText}</div>
                        <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">
                            ${!ataque.enviado
                                ? `<button onclick="window.enviarImediato(${index})" style="background:#ff6600;color:#000;border:none;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;">▶ Enviar agora</button>`
                                : ''}
                            ${ataque.enviado && ataque.sucesso
                                ? `<button onclick="window.repetirAtaque(${index})" style="background:#0066cc;color:#fff;border:none;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:10px;">🔄 Repetir</button>`
                                : ''}
                            <button onclick="window.enviarNT(${index},4)" style="background:#b87333;color:#fff;border:none;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;" title="4 ataques simultâneos">⚡ NT4</button>
                            <button onclick="window.enviarNT(${index},5)" style="background:#a0522d;color:#fff;border:none;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;" title="5 ataques simultâneos">🔥 NT5</button>
                            <button onclick="window.removerAtaque(${index})" style="background:#990000;color:#fff;border:none;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:10px;">🗑️ Remover</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ============================================
        // AÇÕES DA LISTA
        // ============================================
        window.enviarImediato = async (index) => {
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
                adicionarLog(sucesso ? '✅ Ataque enviado!' : '❌ Falha no envio', sucesso ? 'ok' : 'err');
            } catch (err) {
                adicionarLog(`❌ Erro: ${err.message}`, 'err');
            }
        };

        window.repetirAtaque = async (index) => {
            const ataques       = carregarAtaques();
            const ataqueOriginal = ataques[index];
            if (!ataqueOriginal) return;
            adicionarLog(`🔄 Repetindo: ${ataqueOriginal.origem} → ${ataqueOriginal.alvo}`, 'info');
            try {
                const sucesso = await executeAttack(ataqueOriginal);
                adicionarLog(sucesso ? '✅ Ataque repetido!' : '❌ Falha', sucesso ? 'ok' : 'err');
            } catch (err) {
                adicionarLog(`❌ Erro: ${err.message}`, 'err');
            }
        };

        window.enviarNT = (index, quantidade) => {
            enviarMultiplosDoAtaque(index, quantidade);
        };

        window.removerAtaque = (index) => {
            const ataques = carregarAtaques();
            const a = ataques[index];
            ataques.splice(index, 1);
            salvarAtaques(ataques);
            adicionarLog(`✅ Ataque ${a?.origem} → ${a?.alvo} removido!`, 'ok');
        };

        function limparTudo() {
            salvarAtaques([]);
            adicionarLog('🗑️ Todos os ataques removidos!', 'warn');
        }

        function limparConcluidos() {
            const ataques      = carregarAtaques();
            const naoConcluidos = ataques.filter(a => !a.enviado);
            salvarAtaques(naoConcluidos);
            adicionarLog(`🧹 Removidos ${ataques.length - naoConcluidos.length} ataques concluídos`, 'ok');
        }

        function destravarAtaques() {
            const ataques = carregarAtaques();
            let n = 0;
            ataques.forEach(a => { if (a.travado && !a.enviado) { a.travado = false; n++; } });
            if (n > 0) { salvarAtaques(ataques); adicionarLog(`✅ ${n} ataques destravados!`, 'ok'); }
            else        { adicionarLog('ℹ️ Nenhum ataque travado encontrado.', 'info'); }
        }

        // ============================================
        // ESTATÍSTICAS
        // ============================================
        function atualizarEstatisticas() {
            const ataques = carregarAtaques();
            const el = id => document.getElementById(id);
            if (el('totalAtaques'))    el('totalAtaques').textContent    = ataques.length;
            if (el('pendentesCount'))  el('pendentesCount').textContent  = ataques.filter(a => !a.enviado).length;
            if (el('sucessosCount'))   el('sucessosCount').textContent   = ataques.filter(a => a.enviado && a.sucesso).length;
            if (el('falhasCount'))     el('falhasCount').textContent     = ataques.filter(a => a.enviado && !a.sucesso).length;
        }

        function atualizarSelectAldeias() {
            const select = document.getElementById('origemSelect');
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
        // LOG
        // ============================================
        let adicionarLog = (msg, tipo) => console.log(`[TWS][${tipo}] ${msg}`);

        // ============================================
        // INICIALIZAÇÃO
        // ============================================
        sincronizarHorarioServidor();
        loadTemplates();

        try {
            await fetchMyVillages();
        } catch (err) {
            console.error('[TWS] fetchMyVillages falhou:', err);
        }

        const tropasGridHtml = TROOP_LIST.map(t => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;padding:5px 8px;border-radius:4px;">
                <span style="font-size:11px;color:#ff6600;display:flex;align-items:center;gap:5px;">
                    <img src="${t.icon}" style="width:16px;height:16px;"> ${t.nome}
                </span>
                <input type="number" id="${t.id}" value="0" min="0" step="1"
                    style="width:70px;padding:3px;background:#0a0a0a;border:1px solid #444;color:#fff;border-radius:3px;text-align:center;">
            </div>
        `).join('');

        document.body.style.cssText = 'background:#0a0a0a; margin:0; padding:20px; font-family:"Segoe UI",Arial,sans-serif;';
        document.body.innerHTML = `
            <div style="display:flex; gap:20px; max-width:1600px; margin:0 auto; min-height:calc(100vh - 40px);">

                <!-- COLUNA PRINCIPAL (ESQUERDA) -->
                <div style="flex:3;">
                    <h1 style="color:#ff6600; margin:0 0 20px; border-bottom:1px solid #ff6600; padding-bottom:10px; font-size:18px;">⚔️ Agendador de Ataques — Dashboard</h1>

                    <!-- Cards de estatísticas -->
                    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px;">
                        <div style="background:#111; border:1px solid #ff660033; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#ff6600;" id="totalAtaques">0</div>
                            <div style="font-size:10px; color:#ff660088; margin-top:2px;">Total</div>
                        </div>
                        <div style="background:#111; border:1px solid #ff660033; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#ff6600;" id="pendentesCount">0</div>
                            <div style="font-size:10px; color:#ff660088; margin-top:2px;">Pendentes</div>
                        </div>
                        <div style="background:#111; border:1px solid #22a55a33; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#22a55a;" id="sucessosCount">0</div>
                            <div style="font-size:10px; color:#22a55a88; margin-top:2px;">Sucessos</div>
                        </div>
                        <div style="background:#111; border:1px solid #e24b4a33; border-radius:10px; padding:12px; text-align:center;">
                            <div style="font-size:24px; font-weight:bold; color:#e24b4a;" id="falhasCount">0</div>
                            <div style="font-size:10px; color:#e24b4a88; margin-top:2px;">Falhas</div>
                        </div>
                    </div>

                    <!-- Formulário -->
                    <div style="background:#111; border:1px solid #333; border-radius:10px; padding:15px; margin-bottom:20px;">
                        <div style="color:#ff6600; font-weight:bold; margin-bottom:12px; font-size:12px;">📝 Novo Ataque</div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">🏠 Vila Origem</label>
                                <select id="origemSelect" style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px; margin-bottom:5px;"></select>
                                <input type="text" id="origem" placeholder="Ou digite coordenadas (ex: 500|500)"
                                    style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px; box-sizing:border-box;">
                            </div>
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">🎯 Vila Alvo</label>
                                <input type="text" id="alvo" placeholder="Ex: 510|510"
                                    style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px; box-sizing:border-box;">
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">📅 Data</label>
                                <input type="text" id="data" placeholder="DD/MM/AAAA"
                                    style="width:100%; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px; box-sizing:border-box;">
                            </div>
                            <div>
                                <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">⏰ Hora</label>
                                <div style="display:flex; gap:5px;">
                                    <input type="text" id="hora" value="00:00:00"
                                        style="flex:1; padding:6px; background:#0a0a0a; border:1px solid #444; color:#fff; border-radius:6px;">
                                    <button id="btnAgora"     style="padding:4px 8px; background:#2980b9; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">Agora</button>
                                    <button id="btnMais1Hora" style="padding:4px 8px; background:#27ae60; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">+1h</button>
                                    <button id="btnMais30Min" style="padding:4px 8px; background:#27ae60; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">+30m</button>
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom:10px;">
                            <label style="display:block; font-size:10px; color:#888; margin-bottom:4px;">⚔️ Tropas <span style="color:#666;">(deixe vazio para AutoFill com todas as tropas disponíveis)</span></label>
                            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; background:#0a0a0a; padding:8px; border-radius:6px; max-height:200px; overflow-y:auto;">
                                ${tropasGridHtml}
                            </div>
                        </div>

                        <!-- Templates -->
                        <div style="margin-bottom:12px; background:#0a0a0a; border:1px solid #333; border-radius:6px; padding:10px;">
                            <div style="color:#ff6600; font-size:11px; font-weight:bold; margin-bottom:8px;">💾 Templates de Tropas</div>
                            <div id="tws-template-list" style="max-height:120px; overflow-y:auto; margin-bottom:8px;"></div>
                            <div style="display:flex; gap:6px;">
                                <input type="text" id="tws-new-template-name" placeholder="Nome do template"
                                    style="flex:1; padding:4px 8px; background:#111; border:1px solid #444; color:#fff; border-radius:4px; font-size:11px;">
                                <button id="btnSalvarTemplate"
                                    style="padding:4px 10px; background:#006600; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px;">
                                    Salvar atual
                                </button>
                            </div>
                        </div>

                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button id="agendarBtn"          style="padding:8px 16px; background:#ff6600; color:#000; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">📅 Agendar</button>
                            <button id="usarTodasTropasBtn"  style="padding:8px 16px; background:#cc6600; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">🎯 Usar TODAS Tropas</button>
                            <button id="importarBtn"         style="padding:8px 16px; background:#2980b9; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">📋 Importar BBCode</button>
                            <button id="salvarDadosBtn"      style="padding:8px 16px; background:#006600; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">💾 Salvar</button>
                            <button id="limparConcluidosBtn" style="padding:8px 16px; background:#884400; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">🧹 Limpar Concluídos</button>
                            <button id="destravarBtn"        style="padding:8px 16px; background:#555500; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">🔓 Destravar</button>
                            <button id="limparTudoBtn"       style="padding:8px 16px; background:#990000; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px;">🗑️ Limpar Tudo</button>
                        </div>
                    </div>

                    <!-- Lista de ataques -->
                    <div style="background:#111; border:1px solid #333; border-radius:10px; padding:15px;">
                        <div style="color:#ff6600; font-weight:bold; margin-bottom:10px; font-size:12px;">📋 Ataques Agendados</div>
                        <div id="listaAtaques" style="max-height:500px; overflow-y:auto;"></div>
                    </div>
                </div>

                <!-- COLUNA DO LOG (DIREITA) -->
                <div style="flex:1; background:#0a0a0a; border-left:1px solid #ff660033; padding-left:20px; min-width:220px;">
                    <h3 style="color:#ff6600; font-size:13px; margin:0 0 12px;">📝 Log de Atividades</h3>
                    <div id="log-area" style="height:calc(100vh - 80px); overflow-y:auto; font-family:monospace;"></div>
                </div>

            </div>
        `;

        adicionarLog = (msg, tipo) => {
            const log = document.getElementById('log-area');
            if (!log) return;
            const t   = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const cores = { ok: '#22a55a', err: '#e24b4a', warn: '#ff8800', info: '#888' };
            const cor   = cores[tipo] || '#888';
            const entry = document.createElement('div');
            entry.style.cssText = 'display:flex;gap:8px;font-size:10px;margin-bottom:2px;';
            entry.innerHTML = `<span style="color:#555;flex-shrink:0;">${t}</span><span style="color:${cor};">${msg}</span>`;
            log.appendChild(entry);
            log.scrollTop = log.scrollHeight;
            while (log.children.length > 200) log.removeChild(log.children[0]);
        };

        atualizarSelectAldeias();
        carregarDadosFormulario();
        preencherDataHoraAutomatica();
        renderizarLista();
        atualizarEstatisticas();
        renderTemplateList();

        const origemSelect = document.getElementById('origemSelect');
        const origemInput  = document.getElementById('origem');
        origemSelect.addEventListener('change', () => { if (origemSelect.value) origemInput.value = origemSelect.value; });
        origemInput.addEventListener('input',   () => { if (origemInput.value)  origemSelect.value = ''; });

        document.getElementById('agendarBtn').onclick          = agendarAtaque;
        document.getElementById('salvarDadosBtn').onclick      = salvarDadosFormulario;
        document.getElementById('limparConcluidosBtn').onclick = limparConcluidos;
        document.getElementById('destravarBtn').onclick        = destravarAtaques;
        document.getElementById('limparTudoBtn').onclick       = limparTudo;
        document.getElementById('importarBtn').onclick         = importarBBCode;

        document.getElementById('btnAgora').onclick = () => {
            preencherDataHoraAutomatica();
            adicionarLog('✅ Horário do servidor inserido!', 'ok');
        };
        document.getElementById('btnMais1Hora').onclick = () => {
            const [d, h] = adicionarMinutos(60).split(' ');
            document.getElementById('data').value = d;
            document.getElementById('hora').value = h;
            adicionarLog('✅ +1 hora adicionada!', 'ok');
        };
        document.getElementById('btnMais30Min').onclick = () => {
            const [d, h] = adicionarMinutos(30).split(' ');
            document.getElementById('data').value = d;
            document.getElementById('hora').value = h;
            adicionarLog('✅ +30 minutos adicionados!', 'ok');
        };

        document.getElementById('usarTodasTropasBtn').onclick = async () => {
            const origem = document.getElementById('origem').value.trim();
            if (!origem) { adicionarLog('❌ Selecione uma vila origem primeiro!', 'err'); return; }
            const villageId = _villageMap[origem];
            if (!villageId) { adicionarLog('❌ Vila não encontrada no mapa!', 'err'); return; }
            adicionarLog('⏳ Buscando tropas disponíveis...', 'info');
            const allTroops = await getAllAvailableTroops(villageId);
            if (allTroops) {
                TROOP_IDS.forEach(t => {
                    const inp = document.getElementById(t);
                    if (inp && allTroops[t] !== undefined) inp.value = allTroops[t];
                });
                const total = Object.values(allTroops).reduce((a, b) => a + b, 0);
                adicionarLog(`✅ Preenchido com ${number_format(total, '.')} tropas disponíveis!`, 'ok');
            } else {
                adicionarLog('❌ Não foi possível obter as tropas!', 'err');
            }
        };

        document.getElementById('btnSalvarTemplate').onclick = () => {
            const name = document.getElementById('tws-new-template-name').value.trim();
            if (name) { saveCurrentAsTemplate(name); document.getElementById('tws-new-template-name').value = ''; }
            else       { adicionarLog('❌ Digite um nome para o template!', 'err'); }
        };

        iniciarScheduler();
        adicionarLog('✅ Dashboard v19.1 inicializado!', 'ok');
        adicionarLog(`📋 ${_myVillages.length} aldeias carregadas`, 'info');
        adicionarLog(`⏱ Offset servidor: ${_serverTimeOffsetMs}ms`, 'info');
    }

})();