# Checklist das experiências de UX (NYROH)

Estado de cada item. "Feito" = código pronto e checado por teste automático.
"Parcial" = parte pronta, falta o restante indicado.
"Validar" = código pronto, falta rodar com dados ou envio reais.
"Fora do código" = depende de conta, Meta ou decisão.

Estrutura de telas alvo: `docs/BLUEPRINT-TELAS.md`.

## Experiências de dados e disparo

| # | Item | Estado | Onde está | Como validar |
|---|------|--------|-----------|--------------|
| 1 | Regra de um contato por lead por dia, somando todas as marcas | Feito no SQL (testado com Postgres); falta disparo real | `src/lib/uxRoutes.ts` (`regraForaDoDisparoSql`), `server.ts` (`/api/campaign/dispatch`) | Dois lotes no mesmo dia com o mesmo telefone: o segundo não pode sair |
| 2 | Disparo usa o número da marca da safra | Feito (testado com Postgres); falta envio real | `server.ts` (`processCampaignDispatch`) + `instanciaDaSafra` em `uxRoutes.ts` | Safra ligada a marca com número com `fluxo_instance_id`: o envio usa essa instância |
| 3 | Direcionar bloco ou remessa para marca | Feito (testado com Postgres) | `POST /api/central/{selections,remessas}/:id/direcionar`; botões em `AdminEstruturaView.tsx` | `scripts/qa-tudo.ts` (grupo 4) |
| 4 | Bloqueados fora de todos os fluxos | Feito (testado com Postgres) | Disparo (regra 1), caixa de entrada, distribuição, `GET /api/leads` | `scripts/qa-tudo.ts` (grupo 5) |
| 5 | Testes fixos das rotas e regras | Feito | `scripts/test-ux-regras.ts` (`npm run test:ux`), `scripts/qa-tudo.ts` | Rodar os dois |
| 6 | Mensagem clara quando a migração está desligada | Feito | `jsonFetch` em `AdminEstruturaView.tsx` (trata 503) | Desligar a flag e abrir Leads |
| 7 | Migração em um só lugar | Feito | `migrations/2026-11-ux-experiencias.sql` é a única fonte; o módulo só lê esse arquivo | — |
| 8 | Status de entrega (entregue, lido, falhou) | Validar | Webhook atualiza `lead_messages` por `whatsapp_message_id`; `/api/campaign/leads` lê `deliveryStatus` | Disparo real: o status deve mudar sozinho |
| 9 | Modal de detalhe do lead | Validar | `LeadDetailModal.tsx`: "Sugerir bloqueio", histórico e linha do tempo | Abrir um lead e conferir visualmente |
| 10 | Checklist do projeto | Feito | Este arquivo | — |

## Menu e telas (blueprint)

| # | Item | Estado | Onde está | Como validar |
|---|------|--------|-----------|--------------|
| 11 | Menu em 6 grupos (Hoje, Pipeline, Conversas, Leads, Disparos, Configurações) | Feito (tsc); falta ver no navegador | `src/components/AdminSidebar.tsx` | Abrir o admin e percorrer cada grupo |
| 12 | Central de leads e bloqueios dentro de Leads | Feito | `AdminEstruturaView.tsx` (prop `secao="leads"`) | Menu Leads |
| 13 | Marcas e números dentro de Configurações | Feito | `AdminEstruturaView.tsx` (prop `secao="configuracoes"`) | Menu Configurações > Marcas e números |
| 14 | Equipe e Divisão de carteiras numa só tela | Parcial: agrupadas no menu, telas ainda separadas | `AdminDashboardView.tsx` (sub-abas `usuarios` e `carteiras`) | Pendente de fusão |
| 15 | Caixa-preta de logs dentro de Configurações | Feito | `AdminSidebar.tsx` | Menu Configurações |
| 16 | Conversas: aviso "Sem janela · modelo" na lista | Feito (tsc); falta ver no navegador | `ThomasWhatsAppDesktopView.tsx` | Conversa com janela de 24h fechada |

## Pipeline, leads e permissões

| # | Item | Estado | Onde está | Como validar |
|---|------|--------|-----------|--------------|
| 17 | Card do Pipeline: "Sem próxima ação" | Feito (tsc) | `KanbanCard.tsx` | Lead aberto sem retorno agendado |
| 18 | Card do Pipeline: marca e contador de contatos do dia | Pendente: o dado não chega ao card | — | — |
| 19 | Selo "já contatado hoje" por remessa | Feito | `GET /api/central/remessas` (`contatadosHoje`) | Central de leads |
| 20 | Selo "já contatado" e "bloqueado" nos cards e na seleção de blocos | Pendente | — | — |
| 21 | Linha do tempo do lead e contador de toques (aviso em 8) | Feito (tsc) | `LeadTimeline.tsx` no `LeadDetailModal.tsx` | Abrir um lead com ligações e mensagens |
| 22 | Permissões: vendedor só vê a própria carteira | Feito no servidor (guarda em `/api/leads/:id`); central e números só admin | `server.ts` (`assertLeadAccess`), `uxRoutes.ts` | Testar com uma conta de vendedor |

## Fora do código (depende de você ou de terceiros)

- **Entrega no WhatsApp**: a Meta/FluxoAPI responde erro 100 para o número `1332235279981524`. Sem resolver, nenhum disparo chega ao lead, e o item 8 não tem como ser validado.
- **Revisão visual** de escala de texto, espaçamento e hierarquia: precisa de olho humano.
- **Contas**: trocar a senha padrão das 6 contas.
- **Chaves**: rotacionar se alguma apareceu em lugar exposto.
- **Webhook**: o túnel rápido muda a cada reinício. Precisa de endereço fixo para produção.
- **Migração em produção**: só com backup e decisão explícita.

## Decisões a confirmar

- A regra atual do disparo já bloqueava um telefone para sempre depois do primeiro contato com resposta (regra antiga, mantida). A regra nova é de um contato por dia. Hoje valem as duas: a mais restritiva prevalece. Se a intenção for só "por dia", a regra antiga precisa ser relaxada.
- Exportação de leads (admin) continua incluindo bloqueados, de propósito: é o registro completo.
