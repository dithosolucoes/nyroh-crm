# Mapa: separar o front para mexer em UI/UX com segurança

Objetivo: permitir mexer só na interface (e entregar para um designer) sem subir o backend,
e depois integrar de volta com revisão. Nada disso pode alterar disparo, fila, webhook ou deploy.

## Estrutura atual (feita na branch `refactor/front-separado`)

```
nyroh/
├── frontend/                  # SÓ a interface
│   ├── index.html
│   ├── vite.config.ts         # raiz do Vite = esta pasta
│   ├── public/                # manifest.json, sw.js
│   └── src/
│       ├── App.tsx, main.tsx, index.css, vite-env.d.ts
│       ├── components/        # telas e modais
│       └── api/client.ts      # cliente de API (etapa 1)
├── shared/                    # usado pelo backend E pelo front
│   ├── lib/                   # regras puras (fluxo, telefone, automações...)
│   ├── types.ts, types/
├── server.ts                  # backend (monolito ainda, aponta para shared/ e frontend/)
├── server/, scripts/, migrations/, docs/
└── dist/                      # gerado pelo build (ignorado pelo git)
```

Como o front importa o que é compartilhado: `@shared/lib/...` e `@shared/types`.
Como rodar: `npm run dev` (front e API na porta 3000), `npm run build` (gera `dist/`).
Verificado: tipos ok, 234 testes unitários ok, 6 testes do cliente ok, build ok,
e o dev server serve `frontend/` com o alias `@shared` resolvido.

A pasta `frontend/` é um pacote próprio: tem `package.json`, `package-lock.json` e `tsconfig.json`.
Para trabalhar só no front: `cd frontend && npm install && npm run dev`.
Ela não puxa nenhuma dependência de servidor (express, pg, socket.io, bullmq). As que usa:
react, react-dom, lucide-react, jspdf, jszip, qrcode, mais as de build.
Limite: sem o backend (ou o modo mock, ainda não feito), as telas carregam mas as chamadas à API falham.
Observação: o `npm run build` dentro de `frontend/` grava em `../dist` (raiz), que é o que o servidor usa.

## Situação atual (medida no código)

- Front em `src/` (React + Vite). Backend em `server.ts` (13.397 linhas, 136 rotas).
- Em desenvolvimento, o `server.ts` embute o Vite. Ou seja, front e API sobem juntos na porta 3000.
- Chamadas à API: 167 `fetch('/api...')` espalhadas em cerca de 30 arquivos.
  Os maiores: `AdminCampaignDisparosView.tsx` (37), `AdminWhatsAppFluxoView.tsx` (19),
  `ThomasWhatsAppDesktopView.tsx` (16), `App.tsx` (13), `AdminDashboardView.tsx` (11).
- Não existe cliente de API central nem modo de dados falsos.

## Etapas

### Etapa 1 — Fundação (feita nesta branch, sem mudar comportamento)

- `src/shared/api/client.ts`: `apiFetch` (hoje só repassa para `fetch`) e `isMockApiAllowed`.
- Regra do mock: só liga com `USE_MOCK_API=true`, e **nunca** com `NODE_ENV=production`
  ou `RAILWAY_ENVIRONMENT` definido. Nesses casos recusa, mesmo com a variável.
- `scripts/test-front-api.ts` (`npm run test:front-api`) cobre o repasse e a regra do mock.
- Nenhuma tela foi alterada. Nenhuma chamada existente foi trocada.

### Etapa 2 — Migrar chamadas para o cliente central (com aprovação, arquivo por arquivo)

- Trocar `fetch('/api...')` por `apiFetch(...)`, um arquivo por vez, começando pelos menores
  (`MetricsBar`, `QuickRepliesModal`, `ZipUploadModal`).
- Por arquivo: teste antes, troca, teste depois, diff para revisão.
- Disparos e conversas (`AdminCampaignDisparosView`, `ThomasWhatsAppDesktopView`) ficam por último
  e só com aprovação explícita.

### Etapa 3 — Mock de dados (modo para o designer)

- Criar respostas falsas para as rotas usadas pelas telas (leads, pipeline, conversas, métricas).
- Ativar com `USE_MOCK_API=true npm run dev` (desenvolvimento local apenas).
- Teste de build: confirmar que o código de mock não entra no bundle de produção.

### Etapa 4 — Entrega para design

- Designer trabalha no `src/` com o modo mock ligado, sem backend, sem banco, sem FluxoAPI.
- Mudanças de UI voltam por pull request, com diff revisado e testes passando.

## Regras que valem em todas as etapas

1. Nada vai para a `main` sem aprovação explícita. A Railway faz deploy automático da `main`.
2. Cada etapa é uma branch e um pull request separados.
3. Mock nunca fica ligado por padrão e nunca roda em produção.
4. Não mexer em fila de disparo, cota, webhook, assinatura ou templates nestas etapas.

## Riscos conhecidos

- Algumas telas dependem de sessão (cookie) e de tempo real. No modo mock, essas partes ficam
  simuladas e podem não se comportar igual à produção. Isso precisa ser dito ao designer.
- A migração da Etapa 2 é o trecho mais trabalhoso. Sem ela, o mock não consegue interceptar
  as chamadas que ainda usam `fetch` direto.
