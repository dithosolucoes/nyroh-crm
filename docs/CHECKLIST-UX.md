# Checklist das experiências de UX (NYROH)

Estado de cada item. "Feito" = código pronto e checado por teste automático.
"Validar" = código pronto, falta rodar com dados ou envio reais.
"Fora do código" = depende de conta, Meta ou decisão.

| # | Item | Estado | Onde está | Como validar |
|---|------|--------|-----------|--------------|
| 1 | Regra de um contato por lead por dia, somando todas as marcas | Feito no SQL (testado com Postgres); falta disparo real | `src/lib/uxRoutes.ts` (`regraForaDoDisparoSql`), `server.ts` (`/api/campaign/dispatch`) | Dois lotes no mesmo dia com o mesmo telefone: o segundo não pode sair |
| 2 | Disparo usa o número da marca da safra | Feito (testado com Postgres); falta envio real | `server.ts` (`processCampaignDispatch`) + `instanciaDaSafra` em `uxRoutes.ts` | Safra ligada a marca com número com `fluxo_instance_id`: o envio usa essa instância |
| 3 | Direcionar bloco ou remessa para marca | Feito (testado com Postgres) | `POST /api/central/{selections,remessas}/:id/direcionar`; botões em `AdminEstruturaView.tsx` | `scripts/qa-tudo.ts` (grupo 4) |
| 4 | Bloqueados fora de todos os fluxos | Feito (testado com Postgres) | Disparo (regra 1), caixa de entrada, distribuição, `GET /api/leads` | `scripts/qa-tudo.ts` (grupo 5) |
| 5 | Testes fixos das rotas e regras | Feito | `scripts/test-ux-regras.ts` (`npm run test:ux`), `scripts/qa-tudo.ts` | Rodar os dois |
| 6 | Mensagem clara quando a migração está desligada | Feito | `jsonFetch` em `AdminEstruturaView.tsx` (trata 503) | Desligar a flag e abrir a Estrutura |
| 7 | Migração em um só lugar | Feito | `migrations/2026-11-ux-experiencias.sql` é a única fonte; o módulo só lê esse arquivo | — |
| 8 | Status de entrega (entregue, lido, falhou) | Validar | Webhook atualiza `lead_messages` por `whatsapp_message_id`; `/api/campaign/leads` lê `deliveryStatus` | Disparo real: o status deve mudar sozinho |
| 9 | Modal de detalhe do lead | Validar | `LeadDetailModal.tsx`: botão "Sugerir bloqueio" e histórico presentes | Abrir um lead e conferir visualmente |
| 10 | Checklist do projeto | Feito | Este arquivo | — |

## Fora do código (depende de você ou de terceiros)

- **Entrega no WhatsApp**: a Meta/FluxoAPI responde erro 100 para o número `1332235279981524`. Sem resolver, nenhum disparo chega ao lead, e o item 8 não tem como ser validado.
- **Revisão visual** de escala de texto e espaçamento: precisa de olho humano. O script mede só tamanho mínimo de texto e rolagem horizontal no celular.
- **Contas**: trocar a senha padrão das 6 contas.
- **Chaves**: rotacionar se alguma apareceu em lugar exposto.
- **Webhook**: o túnel rápido muda a cada reinício. Precisa de endereço fixo para produção.
- **Migração em produção**: só com backup e decisão explícita.

## Decisões a confirmar

- A regra atual do disparo já bloqueava um telefone para sempre depois do primeiro contato com resposta (regra antiga, mantida). A regra nova é de um contato por dia. Hoje valem as duas: a mais restritiva prevalece. Se a intenção for só "por dia", a regra antiga precisa ser relaxada.
- Exportação de leads (admin) continua incluindo bloqueados, de propósito: é o registro completo.
