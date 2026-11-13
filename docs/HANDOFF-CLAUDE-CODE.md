# HANDOFF: terminar o DAG da estrutura do NYROH CRM

Documento de passagem para o Claude Code. Leia INTEIRO antes de mexer em qualquer coisa.
Ele resume contexto, decisões, regras, estado atual, o DAG restante e os cuidados que já custaram retrabalho.

Documento-mestre da estrutura: `docs/ESTRUTURA-COMPLETA.md` (estrutura alvo, DAG, checklist).
Este arquivo complementa o mestre com o histórico e as regras de trabalho que não cabem nele.

---

## 1. Quem é o dono e o que ele quer

- Dono: Thomas (dono da Ditho e do NYROH CRM). Fala em português informal, é direto e prefere respostas curtas e práticas.
- Ele quer o sistema **100% estruturado**: front e back separados, com um **DAG de etapas** executado **em ordem, item por item**.
- Ele acompanha pelo checklist. Regra dele, sem exceção: **nunca fazer nada sem marcar no checklist** (marcar antes de começar, marcar depois de terminar, e conferir no fim).
- Ele se irrita quando a ordem do DAG é pulada, quando o checklist fica desatualizado e quando há enrolação. Responda curto e entregue.
- Ele já pediu explicitamente: "vai seguindo e, SEMPRE no final vai conferindo aí" e "Vai verificando coisa por coisa".

---

## 2. Regras fixas (não negociáveis)

1. **Produção (Railway) não se toca** sem autorização explícita dele. Não fazer deploy, não ligar flags na Railway, não criar automação no banco de produção, não rodar migração de produção.
2. **Push para `main` só com aprovação explícita** ("pode dar push"). Push dispara deploy. Um hook de "commit e push" que aparece no fim do turno **não é autorização**. Ignore-o para push e avise o Thomas.
3. **Commit local** é o padrão quando uma etapa do DAG termina. Um commit por etapa, mensagem explicando o que e por quê.
4. **Branch**: trabalhar no branch `refactor/front-separado`. Nada de mexer direto no `main`.
5. **Nunca** deixar de atualizar o checklist (`docs/ESTRUTURA-COMPLETA.md`) e **republicar no projeto** depois de cada commit de checklist (ver seção 6).
6. **Mudanças cirúrgicas**: sem reescrever o que funciona, sem refatorar fora do escopo da etapa. A ordem e o escopo do DAG mandam.
7. Segredos: nunca expor chaves, tokens ou senhas em respostas, commits ou docs. Chaves que apareceram em conversa devem ser tratadas como comprometidas.
8. Autor dos commits: Claude (ver trailers abaixo). Nunca commitar com e-mail do Thomas.

Trailers de commit usados:
```
Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01ApFcvRQSkjZhJ5ooYWULZf
```

---

## 3. Stack e mapa do repositório

- Backend: Node/Express em `server.ts` (~13,4 mil linhas, a maior parte das rotas ainda está aqui).
- Front: React 19 + Vite 6 + Tailwind 4, em `frontend/`. Telas grandes: `AdminCampaignDisparosView.tsx` (~5,4 mil linhas), `AdminWhatsAppFluxoView`, `ThomasWhatsAppDesktopView`.
- Código compartilhado: `shared/` (libs puras, contratos, tipos). Alias `@shared` no front (vite e tsconfig).
- Contratos (C1): `shared/contracts/rotas.ts`.
- Banco: PostgreSQL (`pg`). Fila: BullMQ + Redis. Tempo real: socket.io e SSE.
- Integrações: FluxoAPI (WhatsApp, webhook com assinatura) e Meta Cloud API.
- Deploy: Railway, a partir de `main`.
- Testes: `scripts/` (unitários, E2E `scripts/e2e-qa.ts`, backup, front-api, config, descadastro, recuperação).

Comandos principais (`package.json`):
- `npm run lint` = `tsc --noEmit`
- `npm test` = unitários (`scripts/test-units.ts`)
- `npm run qualidade` = lint + test + test:backup + test:front-api + test:config + test:descadastro + test:recuperacao + build. **Esse comando precisa passar antes de todo commit de etapa.**
- `npm run test:e2e` = E2E (precisa de `E2E_DATABASE_URL`)
- `npm run build` = vite build do front + esbuild do server para `dist/server.cjs`

---

## 4. Flags de ambiente que criam tabelas no boot

- `NYROH_APLICAR_MIGRACOES_UX`
- `NYROH_AUTOMACOES_PERSISTENCIA`
- `NYROH_AUTOMACOES_EXECUCAO`
- `NYROH_EXIGIR_CONFIG` (nova, S1): quando `true`, o servidor recusa subir sem `DATABASE_URL` e `FLUXO_WEBHOOK_SECRET` em produção. **Desligada por padrão.** Ligar na Railway é decisão do Thomas.

Histórico: 9 tabelas não existiam em produção porque essas flags estavam desligadas. Thomas já ligou as flags de produção (13/11). A correção estrutural correta é a M1/M2 (migrations versionadas, tirar ALTER do boot), que ainda não foi feita.

---

## 5. Backup (já implementado, precisa ficar testado)

- Rota: `GET /api/admin/backup/exportar` (somente admin). Devolve um zip com `dados.json`, `midia/` e `LEIA-ME.txt`.
- Código: `shared/lib/backupRoutes.ts`.
  - `TABELAS_BACKUP`: 33 tabelas.
  - `TABELAS_EXCLUIDAS = { auth_sessions: '...' }`: sessões de login, não entram.
  - Leitura em transação `REPEATABLE READ READ ONLY`, para o dump ser consistente.
  - `COLUNA_PROIBIDA` (regex de password, hash, salt, token, secret, api_key, private): colunas assim saem do dump.
  - Segredos de `system_settings` saem como `[OMITIDO: segredo. Recadastrar nas variáveis do serviço]`.
- Teste de cobertura: `scripts/test-backup-cobertura.ts` (lê `CREATE TABLE` das migrações/boot e confere se cada tabela está em `TABELAS_BACKUP` ou em `TABELAS_EXCLUIDAS`). **Toda tabela nova precisa entrar nessa lista**, senão o teste quebra. Essa é a regra permanente que o Thomas pediu: "sempre que a gente fizer alguma alteração, atualiza o backup naturalmente".
- Restauração: **fora de escopo por enquanto** (decisão do Thomas: "esquece restauração").
- Criptografia de segredos: **postergada** até o projeto estar 100% (decisão do Thomas).
- Backup completo do sistema foi baixado em 13/11/2026 e guardado fora da Railway. Dump do Postgres ainda não feito (complemento recomendado, depende de autorização).

---

## 6. Como o checklist e o projeto são mantidos

- Fonte da verdade: `docs/ESTRUTURA-COMPLETA.md` (no repo).
- Cópia no projeto Claude: `claude/nyroh-documentacao/14-estrutura-completa.md`. **Republicar depois de cada commit que mexe no checklist.** Thomas já mostrou print de checklist desatualizado no projeto, e ficou bravo com isso.
- Este handoff também vai para o projeto como `claude/nyroh-documentacao/15-handoff-claude-code.md`.
- Formato de marcação: `- [ ]` pendente, `- [x]` concluído, com nota curta do estado. Itens parciais ficam `- [ ]` com a palavra "parcial" e o que falta.

---

## 7. Estado atual do DAG (13/11/2026, fim da sessão)

Branch: `refactor/front-separado`. Último commit: `be3c355`. Árvore limpa. **Nada enviado ao GitHub** (push pendente de autorização).

### Concluídas
- **G1** Portão de qualidade: `npm run qualidade` passa.
- **T1** Testes de rotas críticas (HTTP): E2E 159/159. Cobre importação com dedupe por telefone, disparo com cota e fila, webhook com assinatura e dedupe, janela de 24h e descadastro pela rota.
  - Ressalva: a fila também é limpa pela regra "não reenviar após resposta", então a API não distingue sozinha descadastro de resposta comum.
- **S1** Configuração validada na subida (código pronto, chave desligada por padrão). Teste: `npm run test:config`.
- **P1** Teste de comportamento do envio atual: grupo "📤 Envio pelo Nyroh" do E2E. Não alterou o servidor.
- **R0** Recuperação de fixos (fora do DAG original): só volta para STAGING quem tem a marca "Telefone fixo". Descadastrado nunca volta. Teste: `npm run test:recuperacao`.
- **D0** Decisão do descadastro: modelo híbrido. Palavras fixas no código sempre valem. A automação "Parar mensagens" é criada pelo sistema, editável, com ação `marcar_optout`.

### Parciais
- **C1** Contratos compartilhados. Feito:
  - `shared/contracts/rotas.ts` com `RespostaUploadZip` (união sucesso/erro: `RespostaUploadZipOk` e `RespostaErroApi`), `UploadZipRegistro`, `RespostaListaUploads`, `StatusMensagemEnviada`, `RespostaEnviarMensagem` (com `billable`).
  - Servidor tipa: `POST /api/campaign/upload-zip`, `GET /api/campaign/uploads`, `POST /api/leads/:leadId/messages`.
  - Front tipa: `ZipUploadModal.tsx`, `AdminCampaignDisparosView.tsx`, `PaginaSubirZip.tsx`, `ThomasWhatsAppDesktopView.tsx`.
  - Sandbox (`AdminDispatchTestSandbox.tsx`) checado: só lê `res.ok` no envio, sem consumo a tipar.
  - **Falta**: tipar as demais rotas do contrato (as que o front consome e ainda não têm tipo). Descobrir quais com `grep` em `frontend/src` por `fetch('/api` e `res.json()`.
  - Nota: o texto do "Pronto quando" da C1 fala em `packages/contracts`, mas o que existe é `shared/contracts`. Decidir se mantém o caminho atual (recomendado, sem workspace ainda) e ajustar o texto.
- **F0** Backup do Postgres de produção: backup completo do sistema feito e guardado. **Falta o dump do Postgres**, que depende de autorização do Thomas.
- **O2** Automação "Parar mensagens" visível: código pronto em `shared/lib/descadastroPadrao.ts` (`PALAVRAS_PARAR_FIXAS`, `AUTOMACAO_PARAR_PADRAO`), testado com `npm run test:descadastro`. **Falta criar a automação no banco na subida e mostrar na tela.** Isso muda produção: precisa de autorização.

### Não iniciadas (ordem sugerida)
1. **Terminar C1** (demais rotas do contrato).
2. **FT1** Testes de interface das telas principais (conversas, pipeline, disparos, leads). Depende de nada.
3. **M1** Migrations versionadas (runner com ordem, registro do que já rodou, teste em base vazia). Depende de F0.
4. **B1** Módulo webhooks, **B2** importação, **B3** leads, **B4** disparos (depende também de S1), **B5** conversas. Cada um: sair do `server.ts` sem alterar os testes de T1.
5. **R1** Fila durável no Redis (progresso do lote sobrevive a reinício). Depende de T1.
6. **M2** Tirar ALTER/CREATE do boot (depende de M1).
7. **B6** Demais módulos (admin, vendedores, automações, tags, respostas rápidas, exportação, saúde, infraestrutura). Depende de B1 a B5.
8. **B7** Repositórios: SQL fora das rotas, cada módulo com `repo.ts`.
9. **C2** Cliente de API único no front: as ~167 chamadas `fetch('/api...')` passam a usar cliente tipado, arquivo por arquivo. Depende de C1.
10. **F1** Quebrar `AdminCampaignDisparosView` em `features/disparos/` (componentes, hooks, api.ts). Depende de C2 e FT1.
11. **F2** Quebrar `AdminWhatsAppFluxoView` e `ThomasWhatsAppDesktopView` em pastas de funcionalidade. Depende de C2 e FT1.
12. **D1** Modo de dados falsos para o designer (`USE_MOCK_API=true`). A regra de produção continua bloqueando o mock, e o build de produção não pode conter código de mock. Depende de C1 e C2.
13. **W1** Workspaces (`apps/api`, `apps/web`, `packages/*`). Depende de B6, B7, F1, F2, D1. Deploy só validado com aprovação.
14. **Z1** Revisão final: arquitetura atualizada, checklist todo marcado, regressão completa passando.
15. **O1** Descadastro pelo clique do botão: reconhecer pelo `reply.id` (não pelo texto), registrar como evento "cliente pediu para parar" sem balão no chat. Depende de T1, P1, D0. **Pendente**: confirmar o formato real do clique de botão da FluxoAPI (o teste assume `reply: { kind: 'list_reply', id, title }`).
16. **O3** Confirmação automática atrás de flag, desligada por padrão. Depende de O2 e P1. **Nada sai para cliente sem a flag ligada e sem aprovação do Thomas.**
17. **O4** E2E da trilha de descadastro (clique, registro, descadastro, confirmação). Depende de O3.

**Ações que precisam de autorização explícita do Thomas (não fazer sem ele):**
- Push de qualquer commit para o GitHub.
- Qualquer coisa na Railway (ligar `NYROH_EXIGIR_CONFIG`, deploy, variáveis).
- Criar a automação "Parar mensagens" no banco de produção (O2).
- Dump do Postgres de produção (F0 complemento).
- Ativar a confirmação automática (O3).
- Trocar senhas padrão das 6 contas e a `ADMIN_INITIAL_PASSWORD` (a senha sorteada apareceu no log; orientar a troca).

---

## 8. Como rodar os testes (lições aprendidas)

- **E2E precisa de banco de teste.** Sem `E2E_DATABASE_URL` ele roda em memória e falha os testes de webhook e janela. Isso é esperado, não é bug.
- **Recriar o banco de teste antes de cada rodada do E2E** (DROP DATABASE e CREATE DATABASE). Rodar duas vezes no mesmo banco gera falhas falsas.
- **Nunca rodar dois E2E ao mesmo tempo** no mesmo banco. Isso causou 20 falhas falsas nesta sessão.
- Exemplo de comando (ajuste a URL do seu Postgres local):
  ```
  createdb nyroh_e2e   # ou DROP/CREATE se já existir
  E2E_DATABASE_URL="postgres://USUARIO@127.0.0.1:PORTA/nyroh_e2e" npm run test:e2e
  ```
- Ordem de verificação antes de commit: `npm run lint` → `npm run qualidade` → E2E (banco limpo). Só commita se tudo passar.
- O servidor de teste pode cair entre rodadas. Se `pg_isready` falhar, subir de novo antes de rodar o E2E.
- `npm run test:boot` precisa de `E2E_ADMIN_DATABASE_URL`.

---

## 9. Erros que já aconteceram (não repetir)

1. **Sair da ordem do DAG.** Thomas reclamou várias vezes. Seguir a ordem, marcar antes e depois, conferir no fim.
2. **Checklist desatualizado no projeto.** Republicar depois de cada commit de checklist.
3. **T1 com dependência errada** ("depende de O1"). A dependência correta é nenhuma. Confira o DAG antes de mexer.
4. **Import quebrado após separar o front** (`src/lib/backupRoutes` virou `shared/lib/backupRoutes`). Ao mover arquivo, grep por imports antigos.
5. **Merge de `main` no branch**: conflito só em `package.json` (scripts `test:front-api` e `test:backup`). Resolvido mantendo ambos, testado num worktree isolado antes de aplicar. Repetir o cuidado.
6. **Teste antigo de opt-out** quebrou ao mudar a regra para palavras fixas. Atualizado após aprovação do Thomas. Regra: quando a regra de negócio muda, o teste muda junto, com aprovação.
7. **Teste novo usando palavra fixa** ("parar mensagens" contém "parar"). Usar palavra neutra nos testes de "automação inativa não traz palavras extras".
8. **Controle errado no E2E de descadastro** (lead que respondeu "quanto custa?" saiu da fila pela regra de não reenviar após resposta). Controle corrigido para lead sem resposta.
9. **`recuperarFixos` voltava leads com telefone de 8+ dígitos**, incluindo descadastrados. Corrigido (R0).
10. **Commit com autor errado** (e-mail do Thomas). Corrigido via amend em commit não publicado. Commit já publicado (`3d318a5`) mantido. Para o futuro: autor Claude.
11. **Stop hook pedindo push várias vezes**. Não é autorização. Só push com "pode dar push" do Thomas.
12. **Análise de regressão**: `npm run lint` pegou import de `r.text` inexistente no tipo de resposta. Usar `r.json`.

---

## 10. Decisões já tomadas pelo Thomas (não rediscutir sem ele)

- Front e back separados, com DAG e checklist como guia. Fazer item por item, na ordem.
- Backup completo do sistema: todas as tabelas e mídias, com regra de manter o backup em dia a cada alteração. Restauração: fora de escopo por ora. Criptografia de segredos: postergada.
- Descadastro: modelo híbrido (palavras fixas no código + automação "Parar mensagens" editável com ação de opt-out).
- Mensagem de confirmação de descadastro aprovada: "Pronto, você foi removido da nossa lista e não receberá mais mensagens. Obrigado, tenha um bom dia!"
- Remover reset por telefone na importação: os leads que ele sobe já vêm validados, então dedupe por telefone é suficiente.
- Dedupe de importação: telefone já disparado (via `campaign_leads`/`leads`) e telefone repetido no arquivo são descartados. Histórico em `GET /api/campaign/uploads` com `skippedContacted` e `skippedRepeated`.
- Regras de contato em produção: "Um contato por dia" (limite_janela, máximo 1) e "Não reenviar após resposta (para sempre)" (apos_resposta).
- Clique em botão no celular do cliente não pode ser escondido (o WhatsApp mostra o toque do próprio cliente). O que se controla é o registro no CRM e a resposta automática.

---

## 11. Próximo passo imediato para quem pegar este documento

1. Confirmar `git status` limpo e branch `refactor/front-separado` em `be3c355` (ou posterior).
2. Ler `docs/ESTRUTURA-COMPLETA.md` (checklist) e este arquivo.
3. Terminar **C1**: listar as rotas que o front consome sem tipo, tipar uma por vez, rodar `npm run lint`, depois `npm run qualidade` e E2E em banco limpo, commit local, atualizar checklist, republicar no projeto.
4. Seguir para **FT1**, depois **M1**, e assim por diante, sempre na ordem do DAG.
5. Ao terminar cada etapa: resumir para o Thomas o que foi feito, o que foi testado e o que falta, em português simples. Não fazer push nem tocar produção sem ele autorizar.

---

## 12. Prompt sugerido para colar no Claude Code

> Continue o projeto NYROH CRM no branch `refactor/front-separado` (repo `/home/claude/nyroh` ou o clone equivalente). Leia primeiro `docs/HANDOFF-CLAUDE-CODE.md` e `docs/ESTRUTURA-COMPLETA.md` inteiros. Siga o DAG na ordem, item por item. Antes de cada item, marque no checklist o que vai fazer. Depois, rode `npm run lint`, `npm run qualidade` e o E2E em banco limpo. Só faça commit local se tudo passar. Atualize o checklist e avise o que foi feito, testado e o que falta. Não faça push, não toque em produção (Railway), não crie automação no banco de produção e não ligue flags sem autorização explícita do Thomas. Comece pelo que falta da C1 (demais rotas do contrato em `shared/contracts/rotas.ts`).
