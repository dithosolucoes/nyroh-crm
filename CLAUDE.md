# NYROH CRM: instruções para o Claude Code

## Repositório e branch
- Repositório: `https://github.com/dithosolucoes/nyroh-crm` (remoto `origin`).
- Branch de trabalho: `refactor/front-separado`. Último commit local: `5e3a782` (fronteira shared/servidor e front compilado em apps/web).
- A `main` remota é a versão antiga, sem a refatoração. Não mexer na `main` diretamente.

## Regras combinadas com o Thomas
- Só fazer `git push` quando o Thomas pedir explicitamente.
- Antes de qualquer merge na `main`, confirmar com o Thomas que o backup do Postgres de produção foi feito. O servidor roda migrações ao subir.
- Não mexer em produção (Railway, variáveis de ambiente, flags, banco de produção, envio real de mensagens) sem OK explícito.
- Flags novas nascem desligadas.
- Locks do git: mover para `.git/stale-*` em vez de apagar.

## Checklists (fonte única)
- `claude/nyroh-documentacao/18-checklist-autonomo.md`: refatoração geral e bloco H (produção).
- `claude/nyroh-documentacao/19-checklist-front-isolado.md`: isolamento do front (fases A, B e C feitas).

## Como rodar
- Front sozinho com dados falsos: `npm run dev:web`.
- Verificação de arquitetura: `node scripts/verificar-arquitetura.mjs`.
- Testes completos: `npm run qualidade` (precisa de `E2E_DATABASE_URL`).
