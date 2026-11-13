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
- [ ] **T1. Testes de rotas críticas (HTTP)**
  - Depende de: nada
  - Cobre: importar leads (dedupe por telefone), disparo (cota e fila), webhook de status (assinatura e ordem), opt-out, janela de 24h.
  - Pronto quando: cada rota crítica tem um teste de caminho feliz e um de erro, e todos passam no código atual.
- [ ] **S1. Configuração validada na subida**
  - Depende de: nada
  - Pronto quando: o sistema recusa subir com variável obrigatória faltando, com mensagem clara, e isso está testado.
- [ ] **C1. Contratos compartilhados**
  - Depende de: nada
  - Pronto quando: `packages/contracts` tem os tipos e schemas das rotas usadas pelo front, e o build confirma que front e back usam o mesmo tipo.
- [ ] **FT1. Testes de interface das telas principais**
  - Depende de: nada
  - Pronto quando: conversas, pipeline, disparos e leads têm teste que abre a tela e checa os fluxos principais.
- [ ] **F0. Backup do Postgres de produção**
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

## 4. Fora desta lista

- Mudar regra de negócio (disparo, cota, opt-out, funil).
- Trocar fornecedor (FluxoAPI ou Meta).
- Mudar o design visual. A separação só move o front, não redesenha.
- Criptografia do backup e restauração. Ficam para depois do projeto finalizado.
