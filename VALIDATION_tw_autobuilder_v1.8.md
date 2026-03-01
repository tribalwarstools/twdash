# Validação — TW Auto Builder (Corrigido v1.8)

## Resultado
**Status geral:** ✅ **Aprovado com ressalvas (pronto para uso com ajustes recomendados).**

## O que foi validado
- Estrutura geral da classe e inicialização.
- Persistência de configurações e estatísticas em `localStorage`.
- Estratégia de coleta por aldeia com concorrência controlada.
- Fallback de parsing quando `BuildingMain.buildings` não é encontrado.
- Fluxo de execução contínua (`start`/`stop`/`loopWorker`).
- Construção via link nativo do jogo (`upgrade_building_link`).

## Pontos fortes
- Usa URL de upgrade nativa do HTML do jogo (evita montar endpoint manualmente).
- Implementa retry com backoff exponencial + jitter para busca de páginas.
- Possui validações semânticas para impedimentos comuns (fila cheia, recursos, fazenda/armazém).
- UI completa com estado persistente, logs e ordenação drag-and-drop.
- Proteções para evitar loops duplicados (`_loopRunning`) e countdown concorrente.

## Ressalvas importantes
1. **Tratamento de fila cheia no retorno de build**
   - Em `processVillage`, existe verificação `result.message === 'queue_full'`, mas `executeBuild` retorna mensagem textual do servidor.
   - Impacto: pode cair em ramo genérico em vez de tratar como fila cheia.
   - Recomendação: normalizar erros em um `code` canônico (ex.: `queue_full`, `insufficient_resources`, etc.).

2. **Regex agressivas na normalização de JSON**
   - O bloco de limpeza em `extractBuildingsFromHTML` usa regexes que podem quebrar conteúdo legítimo em casos extremos.
   - Impacto: parsing pode falhar em versões de frontend diferentes.
   - Recomendação: priorizar extração estrita do objeto e reduzir transformações destrutivas.

3. **Dependência de seletores/markup específicos**
   - Fallback depende de seletores como `tr[id^="main_buildrow_"]`, `.btn-build`, `.btn-bcr`, `.inactive.center`.
   - Impacto: qualquer alteração visual no Tribal Wars pode degradar a extração.
   - Recomendação: manter monitoramento de regressão e logs de diagnósticos por seletor.

4. **`parseInt` sem base explícita**
   - Em vários pontos, `parseInt` é chamado sem radix.
   - Recomendação: usar `parseInt(valor, 10)` por robustez e consistência.

## Conclusão prática
O script está **bem estruturado e funcional** para o objetivo proposto. As ressalvas acima não invalidam a versão, mas indicam pontos de robustez para evitar regressões entre mundos/atualizações do jogo.
