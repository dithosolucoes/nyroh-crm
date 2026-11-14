# Estrutura completa do NYROH (alvo e ordem de execução)

Este documento define a estrutura alvo do sistema, o grafo de dependências (DAG) das etapas e o checklist de execução. A execução segue a ordem do grafo. Nenhum item começa antes das dependências dele estarem concluídas.

## Regras de execução (valem para todo item)

- Cada item é um commit (ou um pequeno conjunto de commits) em branch própria, revisado por diff antes de ir adiante.
- Nada vai para a `main` sem aprovação explícita. Push para `main` dispara deploy na Railway.
- Item de refatoração não muda comportamento. Só move código, e os testes passam sem alteração antes e depois.
- Item só está pronto quando o critério de pronto estiver cumprido e o portão de qualidade passar.
- Mudança de regra de negócio (disparo, cota, opt-out, funil) fica fora. Vai em outra conversa, com teste de comportamento antes.
- Toda mudança que cria ou altera tabela atualiza o backup no mesmo trabalho. O teste `npm run test:backup` precisa passar.

## 1. Estrutura alvo

```
nyroh/
├── apps/
│   ├── api/                          back-end (Express)
│   │   └── src/
│   │       ├── server.ts             só monta os módulos e sobe o servidor
│   │       ├── config/               variáveis validadas na subida (S1)
│   │       ├── db/migrations/        migrations versionadas (M1, M2)
│   │       └── modules/              um módulo por área de negócio
│   │           ├── webhooks/         routes.ts, service.ts, repo.ts
│   │           ├── importacao/
│   │           ├── leads/
│   │           ├── disparos/
│   │           ├── conversas/
│   │           ├── automacoes/
│   │           ├── admin/
│   │           ├── vendedores/
│   │           ├── tags/
│   │           ├── respostas/
│   │           ├── exportacao/
│   │           ├── saude/
│   │           └── infra/            Redis, filas, Socket.io
│   └── web/                          front-end (React + Vite)
│       └── src/
│           ├── features/             uma pasta por tela grande
│           │   ├── disparos/         componentes, hooks, api.ts
│           │   ├── whatsapp/
│           │   ├── conversas/
│           │   ├── leads/
│           │   ├── automacoes/
│           │   └── admin/
│           ├── shared/ui/            componentes genéricos
│           ├── api/client.ts         cliente único de API (C2)
│           └── mock/                 dados falsos para o designer (D1)
├── packages/
│   ├── contracts/                    tipos e schemas das rotas (C1), usados pelos dois lados
│   └── shared/                       utilitários comuns
├── docs/                             arquitetura, mapa do front, checklists, backup
└── scripts/                          testes e portão de qualidade (G1)
```

Regras de fronteira:
- O front nunca importa código do back.
- O back nunca importa tela ou componente.
- O que front e back compartilham fica em `packages/contracts` ou `packages/shared`.
- Rota não tem SQL direto. SQL fica em `repo.ts` de cada módulo (B7).

## 2. Grafo de dependências (DAG)

```
ONDA 0 (podem começar em paralelo)
  F0   backup do Postgres de produção          [ação sua no Railway]
  G1   portão de qualidade                      lint + testes + build em um comando
  T1   testes de rotas críticas (HTTP)
  S1   configuração validada na subida
  C1   contratos compartilhados
  FT1  testes das telas principais

ONDA 1
  M1   migrations versionadas            ← F0
  B1   módulo webhooks                   ← T1
  B2   módulo importação                 ← T1
  B3   módulo leads                      ← T1
  B4   módulo disparos                   ← T1, S1
  B5   módulo conversas                  ← T1
  R1   fila durável no Redis             ← T1

ONDA 2
  M2   tirar ALTER do boot               ← M1
  B6   demais módulos                    ← B1..B5
  B7   repositórios (SQL fora das rotas) ← B6
  C2   cliente único no front            ← C1

ONDA 3
  F1   quebrar tela de disparos          ← C2, FT1
  F2   quebrar telas de WhatsApp         ← C2, FT1
  D1   modo mock para o designer         ← C1, C2

ONDA 4
  W1   workspaces (apps/ e packages/)    ← B6, B7, F1, F2, D1

ONDA 5
  Z1   revisão final                     ← tudo

TRILHA DESCADASTRO (nova; regra de negócio, com teste antes e aprovação em cada passo)
  D0   decisão sua: palavras fixas no código ou automação obrigatória   [ação sua]
  P1   teste de comportamento do envio atual (caminho de envio)         ← G1
  O1   descadastro pelo clique do botão (reply.id), sem balão no chat   ← T1, P1, D0
  O2   automação "Parar mensagens" visível na tela de Automações        ← O1
  O3   confirmação automática, atrás de flag desligada                  ← O2, P1
  O4   testes E2E da trilha                                             ← O3
```

Ordem prática, quando um item não pode andar em paralelo:
1. G1, T1, S1, C1, FT1
2. F0, depois M1
3. B1 a B5, depois R1
4. M2, B6, B7, C2
5. F1, F2, D1
6. W1, Z1

## 3. Checklist de execução

### Onda 0

- [x] **G1. Portão de qualidade** (concluída: `npm run qualidade`)
  - Depende de: nada
  - Pronto quando: lint, testes unitários, teste do cliente e build rodam num único comando, e esse comando precisa passar para aprovar um PR.
- [x] **T1. Testes de rotas críticas (HTTP)** (concluída: E2E 159/159. Cobertura: importação com dedupe por telefone (`a2d59c0`), disparo com cota e fila, webhook com assinatura e dedupe, janela de 24h, e descadastro pela rota ("PARAR" tira o lead da fila, com controle). Ressalva: a fila é limpa também pela regra "não reenviar após resposta", então a API não distingue sozinha descadastro de resposta comum)
  - Depende de: nada
  - Cobre: importar leads (dedupe por telefone), disparo (cota e fila), webhook de status (assinatura e ordem), opt-out, janela de 24h.
  - Pronto quando: cada rota crítica tem um teste de caminho feliz e um de erro, e todos passam no código atual.
- [x] **S1. Configuração validada na subida** (concluída no código, com a chave `NYROH_EXIGIR_CONFIG` desligada por padrão. Verificado: com a chave ligada e sem `DATABASE_URL` em produção, o sistema recusa subir com mensagem clara (saída 1); com a chave desligada, sobe como antes. Teste de regra: `npm run test:config`. Ligar a chave na Railway é decisão sua, depois de revisar)
  - Depende de: nada
  - Pronto quando: o sistema recusa subir com variável obrigatória faltando, com mensagem clara, e isso está testado.
- [ ] **C1. Contratos compartilhados** (em andamento)
  - Feito, tipado no servidor e no front:
    - [x] Auth: login, me, logout, troca de senha
    - [x] Admin: usuários, logs, auditoria
    - [x] Vendedores: criar, listar, lote, editar, reset de senha, ativar/desativar, laudo de PDF, tipo de WhatsApp, excluir, roleta
    - [x] Etiquetas, notas internas e resolução de conversa
    - [x] Leads: auditoria do site, atribuição, status, resumo, ligações, listagem
    - [x] Respostas rápidas
    - [x] Meta: status, contas, sincronização e remoção de conta
    - [x] Upload de ZIP de campanha, lista de uploads e envio de mensagem
    - [x] Fluxo: config (sem segredo na resposta), status e eventos de webhook (o tipo `FluxoConfig` antigo, com `source` errado, foi removido)
    - [x] Fluxo: modo de instância (GET) e listagem de modelos (GET `templates`, com categoria e status abertos, como vêm da Meta)
    - [x] Fluxo: sincronizar modelos com a Meta, mudar status e excluir modelo
    - [x] Fluxo: criar modelo (enviar para aprovação ou rascunho)
    - [x] Fluxo: listagem de instâncias (GET `instances`, com os dois caminhos: Meta e FluxoAPI), inclusive nos dois consumidores das telas de disparo
    - [x] Fluxo: criação de instância (POST `instances`), envio de teste de texto e envio de modelo de teste
    - [x] Meta: cadastro de conta (POST `accounts`), embedded signup (config e complete) e leitura direta da Meta (GET `sync`)
    - [x] Front dos vendedores: `SalesTeamModal`, `AdminSellerInspectionView`, `BulkCreateSalespeopleModal` (criar, lote, editar, senha, excluir, estatísticas, transferência em lote, distribuição)
    - [x] Disparos (parte 1): cópias de mensagem (listar, criar, editar, excluir), lotes (listar), velocidade (ler e alterar), pausar, retomar e cancelar lote
  - Falta:
    - [ ] Disparos (parte 2) (em andamento, sem rota tipada ainda): criar lote, progresso, envio (`dispatch`, `test-dispatch`), quarentena, devolução de leads, reset de fila, sincronização do WhatsApp Web, leads e campos, importação e apagar uploads
    - [ ] Automações
    - [ ] Inbox e mensagens (`/api/inbox`, `/api/messages/search`, `/api/leads/:id/messages`)
    - [ ] Resto das rotas (~20), entre elas leads em lote e recuperação
  - Pendências conhecidas (já tipadas, mas com ressalva):
    - [x] `lead` de atribuição, status e edição: o Postgres agora devolve os campos com o nome do `Lead` (`LeadAtualizado`)
    - [ ] Resumo de lead é `Partial<Lead>` e entra na lista como `Lead` por cast (`App.tsx`)
    - [ ] Listagem de leads entra no estado como `Lead` por cast (`App.tsx`); o estado ainda não é `LeadListado`
    - [ ] Roleta em lote: o servidor lê `maxCount`, o front envia `count` (bug de comportamento, fora da C1)
  - Verificado a cada rodada: `npm run lint`, `npm run qualidade` e E2E 159/159 em banco recriado.
  - Depende de: nada
  - Pronto quando: `packages/contracts` tem os tipos e schemas das rotas usadas pelo front, e o build confirma que front e back usam o mesmo tipo.
- [ ] **FT1. Testes de interface das telas principais**
  - Depende de: nada
  - Pronto quando: conversas, pipeline, disparos e leads têm teste que abre a tela e checa os fluxos principais.
- [x] **F0. Backup do Postgres de produção** (concluída com o backup completo do sistema, baixado em 13/11/2026 e guardado fora do Railway. Dump do Postgres segue como complemento recomendado, ainda não feito)
  - Depende de: sua autorização
  - Pronto quando: dump salvo fora do Railway e restauração testada em base local.

### Onda 1

- [ ] **M1. Migrations versionadas**
  - Depende de: F0
  - Pronto quando: existe um runner de migrations com ordem, registro do que já rodou, e teste em base vazia.
- [ ] **B1. Módulo webhooks**
  - Depende de: T1
  - Pronto quando: as rotas de webhook saem do `server.ts` e os testes de T1 passam sem alteração.
- [ ] **B2. Módulo importação**
  - Depende de: T1
  - Pronto quando: as rotas de importação saem do `server.ts` e os testes de T1 passam sem alteração.
- [ ] **B3. Módulo leads**
  - Depende de: T1
  - Pronto quando: as rotas de leads saem do `server.ts` e os testes de T1 passam sem alteração.
- [ ] **B4. Módulo disparos**
  - Depende de: T1, S1
  - Pronto quando: as rotas de disparo e campanha saem do `server.ts` e os testes de T1 passam sem alteração.
- [ ] **B5. Módulo conversas**
  - Depende de: T1
  - Pronto quando: as rotas de conversa saem do `server.ts` e os testes de T1 passam sem alteração.
- [ ] **R1. Fila durável no Redis**
  - Depende de: T1
  - Pronto quando: o progresso do lote sobrevive a um reinício do servidor (testado) e o comportamento visível no front não muda.

### Onda 2

- [ ] **M2. Tirar ALTER do boot**
  - Depende de: M1
  - Pronto quando: nenhum `ALTER` ou `CREATE` roda no código de subida; tudo está em migration; o boot sobe em base nova e em base existente.
- [ ] **B6. Demais módulos**
  - Depende de: B1 a B5
  - Módulos: admin, vendedores, automações, tags, respostas rápidas, exportação, saúde, infraestrutura.
  - Pronto quando: `server.ts` só monta os módulos e sobe o servidor, sem rotas próprias.
- [ ] **B7. Repositórios (SQL fora das rotas)**
  - Depende de: B6
  - Pronto quando: nenhuma rota tem SQL direto; cada módulo tem `repo.ts`; os testes passam.
- [ ] **C2. Cliente de API único no front**
  - Depende de: C1
  - Pronto quando: as 167 chamadas `fetch('/api...')` usam o cliente tipado, arquivo por arquivo, e o lint garante o tipo.

### Onda 3

- [ ] **F1. Quebrar tela de disparos**
  - Depende de: C2, FT1
  - Pronto quando: `AdminCampaignDisparosView` (5.376 linhas) vira `features/disparos/` com componentes menores, hooks e `api.ts`; o teste de FT1 passa sem alteração.
- [ ] **F2. Quebrar telas de WhatsApp**
  - Depende de: C2, FT1
  - Pronto quando: `AdminWhatsAppFluxoView` e `ThomasWhatsAppDesktopView` viram pastas de funcionalidade; o teste de FT1 passa sem alteração.
- [ ] **D1. Modo de dados falsos para o designer**
  - Depende de: C1, C2
  - Pronto quando: `USE_MOCK_API=true` roda o front sem backend; a regra de produção continua bloqueando o mock; o build de produção não contém código de mock.

### Onda 4

- [ ] **W1. Workspaces (`apps/api`, `apps/web`, `packages/*`)**
  - Depende de: B6, B7, F1, F2, D1
  - Pronto quando: lint, teste e build continuam funcionando na raiz; o deploy da Railway continua subindo igual, validado no commit final com sua aprovação.

### Onda 5

- [ ] **Z1. Revisão final**
  - Depende de: todos os itens acima
  - Pronto quando: a documentação de arquitetura está atualizada, o checklist está todo marcado e a regressão completa passa.

### Trilha descadastro (nova)

- [x] **D0. Decisão do descadastro** (decidida: modelo híbrido. Palavras fixas no código sempre valem, e a automação "Parar mensagens" é criada pelo sistema, editável, com ação de opt-out)
  - Depende de: sua decisão
  - Pronto quando: você escolhe entre palavras fixas no código ou automação obrigatória. Hoje, sem automação cadastrada, "PARAR" não descadastra na produção.
- [x] **P1. Teste de comportamento do envio atual** (concluída: grupo "📤 Envio pelo Nyroh" do E2E, 154/154 sem alteração no servidor)
  - Depende de: G1
  - Pronto quando: o envio manual (`POST /api/leads/:leadId/messages`) tem teste que registra o comportamento atual, incluindo a janela de 24 horas, e o teste passa sem alteração.
- [ ] **O1. Descadastro pelo clique do botão** (não iniciada. Pendente: reconhecer pelo `reply.id`, registrar como evento sem balão, testar)
  - Depende de: T1, P1, D0
  - Pronto quando: o clique é reconhecido pelo código do botão (não pelo texto), é registrado como evento "cliente pediu para parar" e não aparece como balão no chat. Testado.
- [ ] **O2. Automação "Parar mensagens" visível** (parcial: palavras fixas no código e automação padrão com ação de opt-out prontas em `shared/lib/descadastroPadrao.ts`, testadas com `npm run test:descadastro`. Falta criar a automação no banco na subida e mostrar na tela. Isso muda a produção e precisa de aprovação)
  - Depende de: O1
  - Pronto quando: a automação aparece na tela de Automações, é editável, e o sistema obedece a ela. Testado.
- [ ] **O3. Confirmação automática, atrás de flag**
  - Depende de: O2, P1
  - Pronto quando: o envio da confirmação passa pelo caminho de envio testado em P1, com a janela de 24 horas, e fica desligado por padrão. Nada sai para cliente sem a flag ligada e sem sua aprovação.
- [x] **R0. Correção: recuperação de fixos (fora do DAG original, incluída aqui)** (concluída: só volta para STAGING quem tem a marca "Telefone fixo". Descadastrado nunca volta. Testes e E2E 154/154, commit `af6598e`)
  - Depende de: nada
  - Pronto quando: teste prova que quem pediu para parar não volta ao disparo.
- [ ] **O4. Testes E2E da trilha**
  - Depende de: O3
  - Pronto quando: os casos de clique, registro, descadastro e confirmação passam no E2E.

## 4. Fora desta lista

- Mudar regra de negócio (disparo, cota, opt-out, funil).
- Trocar fornecedor (FluxoAPI ou Meta).
- Mudar o design visual. A separação só move o front, não redesenha.
- Criptografia do backup e restauração. Ficam para depois do projeto finalizado.
