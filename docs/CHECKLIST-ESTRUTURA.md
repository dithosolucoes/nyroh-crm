# Checklist: estrutura ideal do NYROH (100%)

Regras de execução (valem para todo item):
- Cada item é uma branch, um pull request e uma revisão de diff. Nada vai para a `main` sem aprovação.
- Cada item só começa quando as dependências dele estão concluídas (ver o grafo).
- Mudança de comportamento é proibida em item de refatoração. Só move código, com teste igual antes e depois.
- Item só é "pronto" quando o critério de pronto estiver cumprido e o portão (lint, testes, build) passar.
- Nada de deploy na Railway até o commit final ser aprovado.

## Grafo de dependências

```
ONDA 0 (sem dependência)      ONDA 1                       ONDA 2                  ONDA 3              ONDA 4        ONDA 5
─────────────────────────     ───────────────────────      ─────────────────       ────────────        ──────        ──────
F0 backup Postgres ─────────► M1 migrations versionadas ─► M2 tirar ALTER do boot
G1 portão de qualidade
T1 testes de rotas críticas ─► B1..B5 módulos críticos ─► B6 demais módulos ─► B7 repos (SQL)
                              R1 Redis durável ─────────────────────────────────────────────┐
S1 config validada                                                                           │
C1 contratos compartilhados ─► C2 cliente único front ─► F1 disparos   ─┐                     │
FT1 testes de UI (front) ───────────────────────────────► F2 whatsapp  ─┼─► D1 mock designer ─┼─► W1 monorepo ─► Z1 fechamento
                                                          thomas desktop┘                     │
```

## ONDA 0: base, em paralelo

- [ ] **F0. Backup do Postgres de produção**
  - Depende de: sua autorização (ação no Railway, feita por você ou com seu OK).
  - Pronto quando: dump salvo fora do Railway e restauração testada em base local.
- [ ] **G1. Portão de qualidade**
  - Depende de: nada.
  - Pronto quando: lint, testes unitários, teste do cliente e build rodam num único comando e precisam passar para aprovar um PR.
- [ ] **T1. Testes de rotas críticas (HTTP)**
  - Depende de: nada.
  - Cobre: importar leads (dedupe por telefone), disparo (cota e fila), webhook de status (assinatura e ordem), opt-out, janela de 24h.
  - Pronto quando: cada rota crítica tem pelo menos um teste de caminho feliz e um de erro, e todos passam no código atual.
- [ ] **S1. Configuração validada na subida**
  - Depende de: nada.
  - Pronto quando: o sistema recusa subir com variável obrigatória faltando, com mensagem clara, e isso é testado.
- [ ] **C1. Contratos compartilhados**
  - Depende de: nada.
  - Pronto quando: pacote com tipos e schemas das requisições e respostas das rotas usadas pelo front, e o build confirma que front e back usam o mesmo tipo.

## ONDA 1: primeiras mudanças estruturais

- [ ] **M1. Migrations versionadas**
  - Depende de: F0.
  - Pronto quando: existe um runner de migrations com ordem, registro do que já rodou e teste em base vazia.
- [ ] **B1. Módulo webhooks**
  - Depende de: T1.
  - Pronto quando: as rotas de webhook saem do `server.ts`, e os testes de T1 passam sem alteração.
- [ ] **B2. Módulo importação de leads**
  - Depende de: T1.
  - Pronto quando: as rotas de importação saem do `server.ts`, e os testes de T1 passam sem alteração.
- [ ] **B3. Módulo leads**
  - Depende de: T1.
  - Pronto quando: as rotas de leads saem do `server.ts`, e os testes de T1 passam sem alteração.
- [ ] **B4. Módulo disparos**
  - Depende de: T1, S1.
  - Pronto quando: as rotas de disparo e campanha saem do `server.ts`, e os testes de T1 passam sem alteração.
- [ ] **B5. Módulo conversas (inbox e mensagens)**
  - Depende de: T1.
  - Pronto quando: as rotas de conversa saem do `server.ts`, e os testes de T1 passam sem alteração.
- [ ] **R1. Progresso de lote e fila durável no Redis**
  - Depende de: T1.
  - Pronto quando: o progresso do lote sobrevive a um reinício do servidor (testado), e o comportamento visível no front não muda.

## ONDA 2: consolidação

- [ ] **M2. Tirar `ALTER TABLE` do boot**
  - Depende de: M1.
  - Pronto quando: nenhum `ALTER`/`CREATE` roda no código de subida; tudo está em migration, e o boot ainda sobe em base nova e em base existente.
- [ ] **B6. Demais módulos**
  - Depende de: B1 a B5 (mesmo padrão).
  - Módulos: admin, vendedores, automações, tags, respostas rápidas, exportação, saúde, infraestrutura.
  - Pronto quando: `server.ts` só monta os módulos e sobe o servidor, sem rotas próprias.
- [ ] **B7. Repositórios (SQL fora das rotas)**
  - Depende de: B6.
  - Pronto quando: nenhuma rota tem SQL direto; cada módulo tem `repo.ts`, e os testes passam.
- [ ] **C2. Cliente de API único no front**
  - Depende de: C1.
  - Pronto quando: os 167 `fetch('/api...')` usam o cliente tipado, arquivo por arquivo, e o lint garante o tipo.
- [ ] **FT1. Testes de interface das telas principais**
  - Depende de: nada (pode começar cedo).
  - Pronto quando: conversas, pipeline, disparos e leads têm teste que abre a tela e checa os fluxos principais.

## ONDA 3: front por funcionalidade

- [ ] **F1. Quebrar `AdminCampaignDisparosView` (5.376 linhas)**
  - Depende de: C2, FT1.
  - Pronto quando: vira pasta `features/disparos/` com componentes menores, hooks e `api.ts`; o teste de FT1 passa sem alteração.
- [ ] **F2. Quebrar `AdminWhatsAppFluxoView` e `ThomasWhatsAppDesktopView`**
  - Depende de: C2, FT1.
  - Pronto quando: cada um vira pasta de funcionalidade, e o teste de FT1 passa sem alteração.
- [ ] **D1. Modo de dados falsos para o designer**
  - Depende de: C1, C2.
  - Pronto quando: `USE_MOCK_API=true` roda o front sem backend, a regra de produção continua bloqueando o mock, e o build de produção não contém o código de mock.

## ONDA 4: monorepo

- [ ] **W1. Migrar para workspaces (`apps/api`, `apps/web`, `packages/*`)**
  - Depende de: B6, B7, F1, F2, D1.
  - Pronto quando: os comandos de lint, teste e build continuam funcionando na raiz, e o deploy da Railway continua subindo igual (validado no commit final, com sua aprovação).

## ONDA 5: fechamento

- [ ] **Z1. Revisão final**
  - Depende de: todos os itens acima.
  - Pronto quando: documentação da arquitetura está atualizada, o checklist está todo marcado, e a regressão completa passa.

## Ordem sugerida (quando um item não pode andar em paralelo)

1. G1, T1, S1, C1 e FT1 (rede de segurança e contratos)
2. F0, depois M1 (backup e migrations)
3. B1 a B5 (módulos críticos), depois R1
4. M2, B6, B7, C2
5. F1, F2, D1
6. W1, Z1

## Itens que ficam de fora desta lista

- Mudar regra de negócio (disparo, cota, opt-out, funil). Isso é outra conversa, com teste de comportamento antes.
- Trocar fornecedor (FluxoAPI ou Meta).
- Mudar o design visual. A separação só move o front, não redesenha.
