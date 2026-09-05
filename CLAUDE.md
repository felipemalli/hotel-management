# Regras de sessão (carregado automaticamente — leia antes de qualquer coisa)

1. `ai-plans/RESUMO-DO-PROJETO.md` é a **fonte única da verdade**. Leia-o inteiro antes de criar ou editar qualquer arquivo. Divergência entre o RESUMO e a realidade (versão de lib, API, comportamento observado) ⇒ **pare** e reporte a correção proposta — nunca contorne em silêncio. Não use `ai-plans/inicial/SPEC.md`.
2. Invariantes §3 são inegociáveis: `Decimal` (nunca `float`), relógio injetável (`now`/`today` como parâmetro), TZ `America/Sao_Paulo` com regras em hora local, camadas services/selectors.
3. A tabela T1–T9 (§6) e os ids de teste da matriz §10 são **imutáveis**. Se um teste seu não bate com a §6, o erro está no seu código.
4. Commits: Conventional Commits em inglês, 1 unidade revisável, suíte verde, sem trailers de atribuição. **Proibido:** `git add -A` sem revisar `git status` antes, `git add -f`, commitar qualquer arquivo do `.gitignore` (RESUMO, CLAUDE.md, EXECUCAO.md, .env, pasta `ai-plans/`). Não mencione no texto do commit que foi feito com agente.
5. Como subir e verificar: `README.md`. Comandos canônicos de teste no RESUMO §10. Cole a saída completa na conversa quando a tarefa exigir prova.
6. Frontend: antes de mexer em teste, componente de UI ou primitivo shadcn, leia a skill correspondente em `.claude/skills/` (`testing-frontend`, `frontend-ui-components`, `adding-shadcn-component`).
