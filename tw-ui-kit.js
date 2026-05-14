// ==UserScript==
// @name         TW UI Kit - Biblioteca de Estilos e Componentes
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  UI Kit completo para scripts do Tribal Wars (estilos, componentes, helpers)
// @match        https://*.tribalwars.com.br/game.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ════════════════════════════════════════════════════════════════════
    // UI KIT - Tribal Wars Style
    // ════════════════════════════════════════════════════════════════════
    
    const TWUI = {
        version: '1.0',
        
        // ────────────────────────────────────────────────────────────────
        // CORES (Sistema de Design TW)
        // ────────────────────────────────────────────────────────────────
        colors: {
            // Cores principais
            primary: '#241407',      // Marrom escuro (header)
            secondary: '#e6c894',    // Bege claro (fundo painel)
            accent: '#dfc495',       // Bege médio (bordas, headers)
            dark: '#3b2311',         // Marrom (background body)
            
            // Estados
            success: '#3a7a30',
            successBg: '#a8dca0',
            danger: '#a00',
            dangerBg: '#e8a0a0',
            warning: '#c8a800',
            warningBg: '#fef0a0',
            info: '#5080b0',
            infoBg: '#c0d8f0',
            
            // Bordas
            border: '#7c4f24',
            borderLight: '#bba882',
            
            // Backgrounds
            bgLight: '#f8f4eb',
            bgHover: '#f0e8d8',
            
            // Texto
            text: '#000000',
            textLight: '#666666',
            textDark: '#241407'
        },
        
        // ────────────────────────────────────────────────────────────────
        // TIPOGRAFIA
        // ────────────────────────────────────────────────────────────────
        typography: {
            fontFamily: 'Verdana, Arial, sans-serif',
            fontMonospace: 'Courier, monospace',
            fontSize: {
                xs: '9px',
                sm: '10px',
                base: '11px',
                md: '12px',
                lg: '14px',
                xl: '16px'
            },
            fontWeight: {
                normal: 'normal',
                bold: 'bold'
            }
        },
        
        // ────────────────────────────────────────────────────────────────
        // ESPAÇAMENTO
        // ────────────────────────────────────────────────────────────────
        spacing: {
            xs: '2px',
            sm: '4px',
            md: '6px',
            lg: '8px',
            xl: '10px',
            xxl: '12px'
        },
        
        // ────────────────────────────────────────────────────────────────
        // SHADOWS
        // ────────────────────────────────────────────────────────────────
        shadows: {
            sm: '1px 1px 2px rgba(0,0,0,0.3)',
            md: '2px 2px 5px rgba(0,0,0,0.5)',
            lg: '3px 3px 15px rgba(0,0,0,0.6)'
        },
        
        // ────────────────────────────────────────────────────────────────
        // BORDAS
        // ────────────────────────────────────────────────────────────────
        borders: {
            radius: '2px',
            radiusMd: '3px',
            style: 'solid',
            width: '1px',
            widthLg: '2px',
            widthXl: '4px'
        },
        
        // ────────────────────────────────────────────────────────────────
        // BREAKPOINTS
        // ────────────────────────────────────────────────────────────────
        breakpoints: {
            sm: 768,
            md: 1024,
            lg: 1280,
            xl: 1500
        },
        
        // ────────────────────────────────────────────────────────────────
        // ESTILOS CSS COMPLETOS
        // ────────────────────────────────────────────────────────────────
        styles: {
            // Reset e base
            base: `
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: Verdana, Arial, sans-serif; }
                body { background-color: #3b2311; color: #000; padding: 10px; font-size: 11px; }
            `,
            
            // Container principal
            container: `
                .tw-container { max-width: 1500px; margin: 0 auto; background: #e6c894; border: 4px double #7c4f24; box-shadow: 3px 3px 15px rgba(0,0,0,.6); border-radius: 3px; }
                .tw-container-sm { max-width: 800px; }
                .tw-container-md { max-width: 1000px; }
                .tw-container-lg { max-width: 1200px; }
                .tw-container-fluid { max-width: 100%; }
            `,
            
            // Header
            header: `
                .tw-header { background: #241407; color: #f0e2d3; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #7c4f24; }
                .tw-header h1, .tw-header h2, .tw-header h3 { font-size: 14px; font-weight: bold; text-shadow: 1px 1px 2px #000; margin: 0; }
                .tw-header-title { display: flex; align-items: center; gap: 8px; }
                .tw-header-actions { display: flex; gap: 8px; align-items: center; }
                .tw-header-clock { font-weight: bold; color: #fff; background: rgba(0,0,0,.4); padding: 3px 8px; border-radius: 3px; border: 1px solid #7c4f24; font-size: 11px; }
            `,
            
            // Tabs
            tabs: `
                .tw-tabs { display: flex; background: #c8a87a; border-bottom: 2px solid #7c4f24; flex-wrap: wrap; }
                .tw-tab { padding: 7px 20px; cursor: pointer; font-weight: bold; font-size: 12px; color: #241407; border-right: 1px solid #7c4f24; background: #c8a87a; transition: background 0.2s; }
                .tw-tab:hover { background: #dfc495; }
                .tw-tab.active { background: #e6c894; border-bottom: 2px solid #e6c894; margin-bottom: -2px; }
                .tw-tab.disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
            `,
            
            // Grids
            grids: `
                .tw-grid { display: grid; gap: 12px; padding: 12px; }
                .tw-grid-2 { grid-template-columns: 1fr 1fr; }
                .tw-grid-3 { grid-template-columns: repeat(3, 1fr); }
                .tw-grid-4 { grid-template-columns: repeat(4, 1fr); }
                .tw-grid-auto { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
                
                @media (max-width: 768px) {
                    .tw-grid-2, .tw-grid-3, .tw-grid-4 { grid-template-columns: 1fr; }
                }
            `,
            
            // Boxes / Cards
            boxes: `
                .tw-box { background: #f4eae1; border: 1px solid #7c4f24; border-radius: 2px; margin-bottom: 12px; }
                .tw-box-header { background: #dfc495; padding: 5px 10px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #7c4f24; color: #241407; display: flex; align-items: center; gap: 5px; }
                .tw-box-header i, .tw-box-header img { width: 16px; height: 16px; }
                .tw-box-title { flex: 1; }
                .tw-box-actions { display: flex; gap: 5px; }
                .tw-box-content { padding: 10px; }
                .tw-box-footer { background: #dfc495; padding: 5px 10px; border-top: 1px solid #7c4f24; font-size: 10px; }
            `,
            
            // Tabelas
            tables: `
                .tw-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px; }
                .tw-table th { background: #d2c29d; padding: 4px 6px; text-align: left; border: 1px solid #7c4f24; font-weight: bold; white-space: nowrap; }
                .tw-table td { padding: 4px 6px; border: 1px solid #7c4f24; background: #f8f4eb; vertical-align: middle; }
                .tw-table tr:hover td { background: #f0e8d8; }
                .tw-table-striped tr:nth-child(even) td { background: #efe5d5; }
                .tw-table-compact th, .tw-table-compact td { padding: 2px 4px; }
                .tw-table-responsive { overflow-x: auto; }
            `,
            
            // Botões
            buttons: `
                .tw-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; color: #000; background: #dfc495; border: 1px solid #7c4f24; font-weight: bold; cursor: pointer; font-size: 11px; font-family: Verdana, Arial, sans-serif; text-decoration: none; transition: all 0.2s; }
                .tw-btn:hover { background: #eed5ae; transform: translateY(-1px); }
                .tw-btn:active { transform: translateY(0); }
                .tw-btn-primary { background: #a8dca0; border-color: #3a7a30; color: #1a4a10; }
                .tw-btn-primary:hover { background: #b8edb0; }
                .tw-btn-danger { background: #e8a0a0; border-color: #a00; color: #700; }
                .tw-btn-danger:hover { background: #f0b0b0; }
                .tw-btn-warning { background: #fef0a0; border-color: #c8a800; color: #604000; }
                .tw-btn-warning:hover { background: #fff5b0; }
                .tw-btn-info { background: #c0d8f0; border-color: #5080b0; color: #003870; }
                .tw-btn-info:hover { background: #d0e8ff; }
                .tw-btn-sm { padding: 2px 6px; font-size: 10px; }
                .tw-btn-lg { padding: 6px 14px; font-size: 12px; }
                .tw-btn-block { display: flex; width: 100%; justify-content: center; }
                .tw-btn-icon { padding: 4px 8px; }
                .tw-btn-group { display: flex; gap: 5px; flex-wrap: wrap; }
            `,
            
            // Formulários
            forms: `
                .tw-form-group { margin-bottom: 10px; }
                .tw-form-label { display: block; font-size: 11px; font-weight: bold; color: #241407; margin-bottom: 3px; }
                .tw-input, .tw-select, .tw-textarea { background: #fff; border: 1px solid #7c4f24; padding: 3px 5px; font-size: 11px; font-family: Verdana, Arial, sans-serif; width: 100%; border-radius: 2px; }
                .tw-input:focus, .tw-select:focus, .tw-textarea:focus { outline: none; border-color: #241407; box-shadow: 0 0 2px #241407; }
                .tw-textarea { height: 65px; font-family: monospace; resize: vertical; }
                .tw-input-sm { padding: 2px 4px; font-size: 10px; }
                .tw-input-lg { padding: 5px 8px; font-size: 12px; }
                .tw-checkbox { display: flex; align-items: center; gap: 5px; }
                .tw-checkbox input { width: auto; margin: 0; }
                .tw-checkbox label { margin: 0; cursor: pointer; }
                .tw-form-help { font-size: 10px; color: #666; margin-top: 2px; }
                .tw-form-row { display: flex; gap: 10px; align-items: flex-end; }
                .tw-form-row .tw-form-group { flex: 1; margin-bottom: 0; }
            `,
            
            // Stats / Cards de métricas
            stats: `
                .tw-stats { display: flex; gap: 0; border-bottom: 1px solid #7c4f24; flex-wrap: wrap; }
                .tw-stat { flex: 1; text-align: center; padding: 5px 4px; background: #dfc495; border-right: 1px solid #7c4f24; min-width: 80px; }
                .tw-stat:last-child { border-right: none; }
                .tw-stat .tw-stat-value { font-size: 16px; font-weight: bold; color: #241407; display: block; line-height: 1.2; }
                .tw-stat .tw-stat-label { font-size: 9px; color: #5a3a1a; display: block; }
                .tw-stat-sm .tw-stat-value { font-size: 14px; }
                .tw-stat-lg .tw-stat-value { font-size: 20px; }
            `,
            
            // Log / Console
            log: `
                .tw-log { background: #fff; border: 1px solid #7c4f24; padding: 5px; font-family: Courier, monospace; font-size: 10px; height: 120px; overflow-y: auto; }
                .tw-log-entry { padding: 2px 0; border-bottom: 1px solid #eee; font-family: monospace; font-size: 10px; }
                .tw-log-info { color: #241407; }
                .tw-log-success { color: #1a5010; font-weight: bold; }
                .tw-log-error { color: #a00; font-weight: bold; }
                .tw-log-warning { color: #804000; }
                .tw-log-debug { color: #666; font-style: italic; }
            `,
            
            // Alertas / Notificações
            alerts: `
                .tw-alert { padding: 8px 12px; margin-bottom: 10px; border: 1px solid; border-radius: 2px; font-size: 11px; display: flex; align-items: center; gap: 8px; }
                .tw-alert-success { background: #d4edda; border-color: #3a7a30; color: #155724; }
                .tw-alert-error { background: #f8d7da; border-color: #a00; color: #721c24; }
                .tw-alert-warning { background: #fff3cd; border-color: #c8a800; color: #856404; }
                .tw-alert-info { background: #d1ecf1; border-color: #5080b0; color: #0c5460; }
                .tw-alert-close { margin-left: auto; cursor: pointer; font-weight: bold; }
            `,
            
            // Modais / Popups
            modals: `
                .tw-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,.7); z-index: 1000000; display: flex; justify-content: center; align-items: center; }
                .tw-modal { background: #e6c894; border: 2px solid #7c4f24; border-radius: 3px; min-width: 300px; max-width: 90vw; max-height: 80vh; overflow: auto; }
                .tw-modal-header { background: #241407; color: #f0e2d3; padding: 7px 12px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 12px; }
                .tw-modal-body { padding: 12px; }
                .tw-modal-footer { padding: 8px 12px; border-top: 1px solid #7c4f24; display: flex; justify-content: flex-end; gap: 8px; }
                .tw-modal-close { cursor: pointer; font-size: 16px; line-height: 1; }
            `,
            
            // Tooltips
            tooltips: `
                .tw-tooltip { position: relative; display: inline-block; cursor: help; }
                .tw-tooltip .tw-tooltip-text { visibility: hidden; background-color: #241407; color: #fff; text-align: center; padding: 4px 8px; border-radius: 2px; position: absolute; z-index: 1; bottom: 125%; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 10px; opacity: 0; transition: opacity 0.3s; }
                .tw-tooltip:hover .tw-tooltip-text { visibility: visible; opacity: 1; }
            `,
            
            // Badges / Tags
            badges: `
                .tw-badge { display: inline-block; padding: 2px 6px; font-size: 9px; font-weight: bold; border-radius: 2px; }
                .tw-badge-success { background: #c8e8c0; color: #1a5010; border: 1px solid #3a7a30; }
                .tw-badge-danger { background: #f0c0c0; color: #700; border: 1px solid #a00; }
                .tw-badge-warning { background: #fef0a0; color: #604000; border: 1px solid #c8a800; }
                .tw-badge-info { background: #c0d8f0; color: #003870; border: 1px solid #5080b0; }
                .tw-badge-auto { background: #d8d0f8; color: #300870; border: 1px solid #7060c0; }
            `,
            
            // Progress bar
            progress: `
                .tw-progress { background: #d2c29d; border: 1px solid #7c4f24; height: 16px; border-radius: 2px; overflow: hidden; }
                .tw-progress-bar { background: #3a7a30; height: 100%; width: 0%; transition: width 0.3s; }
                .tw-progress-text { font-size: 9px; text-align: center; line-height: 16px; color: #fff; text-shadow: 1px 1px 0 #000; }
            `,
            
            // Spinner / Loading
            spinner: `
                .tw-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #7c4f24; border-top-color: #241407; border-radius: 50%; animation: tw-spin 0.6s linear infinite; }
                @keyframes tw-spin { to { transform: rotate(360deg); } }
                .tw-loading { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 20px; color: #666; }
            `,
            
            // Separadores
            dividers: `
                .tw-divider { border-top: 1px solid #7c4f24; margin: 10px 0; }
                .tw-divider-light { border-top: 1px solid #bba882; }
                .tw-divider-text { display: flex; align-items: center; text-align: center; color: #666; font-size: 10px; }
                .tw-divider-text::before, .tw-divider-text::after { content: ''; flex: 1; border-bottom: 1px solid #7c4f24; }
                .tw-divider-text::before { margin-right: 10px; }
                .tw-divider-text::after { margin-left: 10px; }
            `,
            
            // Utilitários
            utilities: `
                .tw-text-center { text-align: center; }
                .tw-text-left { text-align: left; }
                .tw-text-right { text-align: right; }
                .tw-text-bold { font-weight: bold; }
                .tw-text-mono { font-family: monospace; }
                .tw-text-sm { font-size: 10px; }
                .tw-text-xs { font-size: 9px; }
                .tw-text-lg { font-size: 12px; }
                .tw-text-xl { font-size: 14px; }
                .tw-mt-1 { margin-top: 4px; }
                .tw-mt-2 { margin-top: 8px; }
                .tw-mt-3 { margin-top: 12px; }
                .tw-mb-1 { margin-bottom: 4px; }
                .tw-mb-2 { margin-bottom: 8px; }
                .tw-mb-3 { margin-bottom: 12px; }
                .tw-p-1 { padding: 4px; }
                .tw-p-2 { padding: 8px; }
                .tw-p-3 { padding: 12px; }
                .tw-flex { display: flex; }
                .tw-flex-between { display: flex; justify-content: space-between; align-items: center; }
                .tw-flex-center { display: flex; justify-content: center; align-items: center; }
                .tw-gap-1 { gap: 4px; }
                .tw-gap-2 { gap: 8px; }
                .tw-gap-3 { gap: 12px; }
                .tw-w-full { width: 100%; }
                .tw-cursor-pointer { cursor: pointer; }
                .tw-hidden { display: none; }
                .tw-visible { display: block; }
            `,
            
            // Grade de tropas (específico)
            troopGrid: `
                .tw-troop-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; margin-bottom: 8px; }
                .tw-troop-cell { text-align: center; background: #fff; border: 1px solid #7c4f24; padding: 3px 2px; }
                .tw-troop-cell img { display: block; margin: 0 auto 2px; width: 20px; height: 20px; }
                .tw-troop-cell input { width: 100%; text-align: center; font-size: 10px; padding: 2px; border: 1px solid #ccc; border-top: none; border-left: none; border-right: none; }
                .tw-troop-name { font-size: 9px; color: #555; line-height: 1.2; margin-bottom: 2px; }
                
                @media (max-width: 768px) {
                    .tw-troop-grid { grid-template-columns: repeat(6, 1fr); }
                }
                @media (max-width: 480px) {
                    .tw-troop-grid { grid-template-columns: repeat(4, 1fr); }
                }
            `,
            
            // Linhas de ataque
            attackRows: `
                .tw-attack-row { background: #f8f4eb; border: 1px solid #bba882; padding: 6px 8px; margin-bottom: 5px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 11px; }
                .tw-attack-row.sent-ok { border-left: 3px solid #3a7a30; }
                .tw-attack-row.sent-fail { border-left: 3px solid #a00; }
                .tw-attack-row.pending { border-left: 3px solid #c8a800; }
                .tw-attack-coords { font-weight: bold; color: #241407; min-width: 80px; }
                .tw-attack-time { font-family: monospace; color: #555; font-size: 10px; }
                .tw-attack-status { font-size: 10px; padding: 1px 5px; border-radius: 2px; }
            `
        },
        
        // ────────────────────────────────────────────────────────────────
        // HELPERS E UTILITÁRIOS
        // ────────────────────────────────────────────────────────────────
        
        // Injetar todos os estilos no documento
        injectStyles: function() {
            const styleEl = document.createElement('style');
            styleEl.id = 'tw-ui-kit-styles';
            styleEl.textContent = Object.values(this.styles).join('\n');
            if (!document.getElementById('tw-ui-kit-styles')) {
                document.head.appendChild(styleEl);
            }
        },
        
        // Criar container principal
        createContainer: function(options = {}) {
            const container = document.createElement('div');
            container.className = `tw-container ${options.size ? `tw-container-${options.size}` : ''} ${options.className || ''}`;
            if (options.id) container.id = options.id;
            return container;
        },
        
        // Criar header
        createHeader: function(title, icon = null, actions = []) {
            const header = document.createElement('div');
            header.className = 'tw-header';
            
            const titleDiv = document.createElement('div');
            titleDiv.className = 'tw-header-title';
            if (icon) {
                const iconImg = document.createElement('img');
                iconImg.src = icon;
                iconImg.style.width = '20px';
                iconImg.style.height = '20px';
                titleDiv.appendChild(iconImg);
            }
            titleDiv.appendChild(document.createTextNode(title));
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'tw-header-actions';
            actions.forEach(action => actionsDiv.appendChild(action));
            
            header.appendChild(titleDiv);
            header.appendChild(actionsDiv);
            return header;
        },
        
        // Criar box/card
        createBox: function(title, content, options = {}) {
            const box = document.createElement('div');
            box.className = `tw-box ${options.className || ''}`;
            
            if (title) {
                const header = document.createElement('div');
                header.className = 'tw-box-header';
                if (options.icon) {
                    const icon = document.createElement('img');
                    icon.src = options.icon;
                    header.appendChild(icon);
                }
                const titleSpan = document.createElement('span');
                titleSpan.className = 'tw-box-title';
                titleSpan.textContent = title;
                header.appendChild(titleSpan);
                box.appendChild(header);
            }
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'tw-box-content';
            if (typeof content === 'string') contentDiv.innerHTML = content;
            else contentDiv.appendChild(content);
            box.appendChild(contentDiv);
            
            return box;
        },
        
        // Criar tabela
        createTable: function(headers, rows, options = {}) {
            const table = document.createElement('table');
            table.className = `tw-table ${options.striped ? 'tw-table-striped' : ''} ${options.compact ? 'tw-table-compact' : ''}`;
            
            if (headers && headers.length) {
                const thead = document.createElement('thead');
                const tr = document.createElement('tr');
                headers.forEach(h => {
                    const th = document.createElement('th');
                    th.textContent = h;
                    tr.appendChild(th);
                });
                thead.appendChild(tr);
                table.appendChild(thead);
            }
            
            const tbody = document.createElement('tbody');
            rows.forEach(row => {
                const tr = document.createElement('tr');
                row.forEach(cell => {
                    const td = document.createElement('td');
                    if (typeof cell === 'string') td.textContent = cell;
                    else td.appendChild(cell);
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            
            if (options.responsive) {
                const wrapper = document.createElement('div');
                wrapper.className = 'tw-table-responsive';
                wrapper.appendChild(table);
                return wrapper;
            }
            
            return table;
        },
        
        // Criar botão
        createButton: function(text, onClick, options = {}) {
            const btn = document.createElement('button');
            btn.className = `tw-btn ${options.variant ? `tw-btn-${options.variant}` : ''} ${options.size ? `tw-btn-${options.size}` : ''} ${options.block ? 'tw-btn-block' : ''}`;
            btn.textContent = text;
            if (options.icon) {
                btn.innerHTML = `<img src="${options.icon}" style="width:14px;height:14px;"> ${text}`;
            }
            if (onClick) btn.addEventListener('click', onClick);
            if (options.disabled) btn.disabled = true;
            return btn;
        },
        
        // Criar grupo de botões
        createButtonGroup: function(buttons) {
            const group = document.createElement('div');
            group.className = 'tw-btn-group';
            buttons.forEach(btn => group.appendChild(btn));
            return group;
        },
        
        // Criar stat card
        createStat: function(value, label, options = {}) {
            const stat = document.createElement('div');
            stat.className = `tw-stat ${options.size ? `tw-stat-${options.size}` : ''}`;
            stat.innerHTML = `
                <span class="tw-stat-value">${value}</span>
                <span class="tw-stat-label">${label}</span>
            `;
            return stat;
        },
        
        // Criar stats bar
        createStatsBar: function(stats) {
            const bar = document.createElement('div');
            bar.className = 'tw-stats';
            stats.forEach(s => bar.appendChild(this.createStat(s.value, s.label, s.options)));
            return bar;
        },
        
        // Criar alerta
        createAlert: function(message, type = 'info', closable = true) {
            const alert = document.createElement('div');
            alert.className = `tw-alert tw-alert-${type}`;
            alert.innerHTML = `
                <span>${message}</span>
                ${closable ? '<span class="tw-alert-close">✕</span>' : ''}
            `;
            if (closable) {
                alert.querySelector('.tw-alert-close').addEventListener('click', () => alert.remove());
            }
            return alert;
        },
        
        // Criar modal
        createModal: function(title, content, options = {}) {
            const overlay = document.createElement('div');
            overlay.className = 'tw-modal-overlay';
            
            const modal = document.createElement('div');
            modal.className = 'tw-modal';
            
            const header = document.createElement('div');
            header.className = 'tw-modal-header';
            header.innerHTML = `
                <span>${title}</span>
                <span class="tw-modal-close">✕</span>
            `;
            
            const body = document.createElement('div');
            body.className = 'tw-modal-body';
            if (typeof content === 'string') body.innerHTML = content;
            else body.appendChild(content);
            
            modal.appendChild(header);
            modal.appendChild(body);
            
            if (options.buttons) {
                const footer = document.createElement('div');
                footer.className = 'tw-modal-footer';
                options.buttons.forEach(btn => footer.appendChild(btn));
                modal.appendChild(footer);
            }
            
            overlay.appendChild(modal);
            
            const close = () => overlay.remove();
            header.querySelector('.tw-modal-close').addEventListener('click', close);
            if (options.closeOnOverlayClick) {
                overlay.addEventListener('click', e => {
                    if (e.target === overlay) close();
                });
            }
            
            return { element: overlay, close };
        },
        
        // Criar input group
        createInputGroup: function(label, input, help = null) {
            const group = document.createElement('div');
            group.className = 'tw-form-group';
            
            if (label) {
                const labelEl = document.createElement('label');
                labelEl.className = 'tw-form-label';
                labelEl.textContent = label;
                group.appendChild(labelEl);
            }
            
            group.appendChild(input);
            
            if (help) {
                const helpEl = document.createElement('div');
                helpEl.className = 'tw-form-help';
                helpEl.textContent = help;
                group.appendChild(helpEl);
            }
            
            return group;
        },
        
        // Criar input
        createInput: function(type = 'text', options = {}) {
            const input = document.createElement('input');
            input.type = type;
            input.className = `tw-input ${options.size ? `tw-input-${options.size}` : ''}`;
            if (options.placeholder) input.placeholder = options.placeholder;
            if (options.value) input.value = options.value;
            if (options.onChange) input.addEventListener('change', options.onChange);
            return input;
        },
        
        // Criar select
        createSelect: function(options, selectedValue = null) {
            const select = document.createElement('select');
            select.className = 'tw-select';
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (selectedValue === opt.value) option.selected = true;
                select.appendChild(option);
            });
            return select;
        },
        
        // Criar tabs
        createTabs: function(tabs, containerId) {
            const tabsContainer = document.createElement('div');
            tabsContainer.className = 'tw-tabs';
            
            const contents = {};
            
            tabs.forEach((tab, index) => {
                const tabBtn = document.createElement('div');
                tabBtn.className = `tw-tab ${index === 0 ? 'active' : ''}`;
                tabBtn.textContent = tab.label;
                tabBtn.dataset.tab = tab.id;
                
                tabBtn.addEventListener('click', () => {
                    // Atualizar tabs
                    tabsContainer.querySelectorAll('.tw-tab').forEach(t => t.classList.remove('active'));
                    tabBtn.classList.add('active');
                    
                    // Atualizar conteúdos
                    Object.keys(contents).forEach(id => {
                        contents[id].style.display = id === tab.id ? 'block' : 'none';
                    });
                });
                
                tabsContainer.appendChild(tabBtn);
                
                // Criar container de conteúdo
                const contentDiv = document.createElement('div');
                contentDiv.id = `tw-tab-${tab.id}`;
                contentDiv.style.display = index === 0 ? 'block' : 'none';
                if (typeof tab.content === 'string') contentDiv.innerHTML = tab.content;
                else contentDiv.appendChild(tab.content);
                contents[tab.id] = contentDiv;
            });
            
            const wrapper = document.createElement('div');
            wrapper.appendChild(tabsContainer);
            Object.values(contents).forEach(c => wrapper.appendChild(c));
            
            return wrapper;
        },
        
        // Criar log viewer
        createLogViewer: function(height = '120px', options = {}) {
            const logContainer = document.createElement('div');
            logContainer.className = 'tw-log';
            logContainer.style.height = height;
            if (options.id) logContainer.id = options.id;
            return logContainer;
        },
        
        // Adicionar entrada ao log
        addLogEntry: function(logContainer, message, type = 'info', timestamp = true) {
            const entry = document.createElement('div');
            entry.className = `tw-log-entry tw-log-${type}`;
            
            let text = message;
            if (timestamp) {
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
                text = `[${timeStr}] ${message}`;
            }
            
            entry.textContent = text;
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
        },
        
        // Criar grade de tropas
        createTroopGrid: function(prefix, troopsList, options = {}) {
            const grid = document.createElement('div');
            grid.className = 'tw-troop-grid';
            
            troopsList.forEach(troop => {
                const cell = document.createElement('div');
                cell.className = 'tw-troop-cell';
                cell.innerHTML = `
                    <img src="${troop.icon}" title="${troop.name}">
                    <div class="tw-troop-name">${troop.name}</div>
                    <input type="number" id="${prefix}-${troop.id}" value="${options.defaultValue || 0}" min="0" ${options.disabled ? 'disabled' : ''}>
                `;
                grid.appendChild(cell);
            });
            
            return grid;
        },
        
        // Criar badge
        createBadge: function(text, type = 'info') {
            const badge = document.createElement('span');
            badge.className = `tw-badge tw-badge-${type}`;
            badge.textContent = text;
            return badge;
        },
        
        // Criar progress bar
        createProgressBar: function(value, max = 100, showText = true) {
            const percent = (value / max) * 100;
            const progress = document.createElement('div');
            progress.className = 'tw-progress';
            progress.innerHTML = `
                <div class="tw-progress-bar" style="width: ${percent}%;">
                    ${showText ? `<div class="tw-progress-text">${value}/${max}</div>` : ''}
                </div>
            `;
            return progress;
        },
        
        // Criar spinner
        createSpinner: function(text = null) {
            if (text) {
                const wrapper = document.createElement('div');
                wrapper.className = 'tw-loading';
                wrapper.innerHTML = `<div class="tw-spinner"></div><span>${text}</span>`;
                return wrapper;
            }
            const spinner = document.createElement('div');
            spinner.className = 'tw-spinner';
            return spinner;
        },
        
        // Mostrar notificação toast (simples)
        showToast: function(message, type = 'info', duration = 3000) {
            const toast = this.createAlert(message, type, true);
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.right = '20px';
            toast.style.zIndex = '1000001';
            toast.style.minWidth = '200px';
            toast.style.maxWidth = '300px';
            document.body.appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, duration);
        },
        
        // Limpar container
        clearContainer: function(container) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
        },
        
        // Mostrar/esconder elemento
        toggleVisibility: function(element, visible) {
            element.style.display = visible ? 'block' : 'none';
        }
    };
    
    // Exportar para uso global
    window.TWUI = TWUI;
    
    // Injetar estilos automaticamente
    TWUI.injectStyles();
    
    console.log('[TWUI] UI Kit carregado v' + TWUI.version);
})();
