# Nyroh CRM — leads, disparo e atendimento WhatsApp (FluxoAPI)

CRM com Kanban de leads, disparo em massa por modelo aprovado e chat de atendimento no **mesmo número de WhatsApp** para a equipe toda, via [FluxoAPI](https://fluxoapi.com.br) (Cloud API oficial da Meta, com coexistência).

- **Servidor:** Node 20 + Express (`server.ts`), PostgreSQL, Redis/BullMQ (opcional, recomendado).
- **Interface:** React 19 + Vite (`src/`).
- **Tempo real:** SSE (`/api/realtime/stream`) com reenvio do que se perdeu na reconexão.

---

## 1. Antes do primeiro deploy (checklist)

### Na FluxoAPI
1. **Revogue a chave antiga** `fxk_live_q3oQ…` (esteve publicada no código) e gere uma nova em *Credenciais*. Escopos: `messages:send`, `messages:read`, `conversations:read`, `templates:read`.
2. Confira se o número está em **modo coexistência** (*Instâncias*). Em `api_only`, as mensagens que você manda pelo celular **nunca** aparecem no CRM. A tela *Admin → WhatsApp* mostra o modo.
3. Cadastre o **webhook**: `POST https://SEU-DOMINIO/api/webhooks/fluxo` com os eventos `message.received`, `message.sent_from_phone`, `message.status`, `instance.status_changed` e `instance.access_expiring`. Copie o segredo `whsec_…`.

### Na Railway (Variables)
| Variável | Obrigatória | O que é |
|---|---|---|
| `FLUXO_KEY`, `FLUXO_SECRET` | sim | Credencial nova da FluxoAPI |
| `FLUXO_INSTANCE_ID` | sim | `inst_…` do número |
| `FLUXO_WEBHOOK_SECRET` | sim | O `whsec_…` do webhook. **Sem ele o webhook aceita qualquer requisição.** |
| `FLUXO_PLAN_RPM` | sim | Requisições/min do seu plano: Starter 60, Pro 300, Escala 1200, Enterprise 6000 |
| `DATABASE_URL` | sim | PostgreSQL (o plugin da Railway preenche) |
| `REDIS_URL` | recomendado | Fila durável (sem ele a fila fica em memória) |
| `ADMIN_INITIAL_PASSWORD` | recomendado | Senha inicial de `admin@nyroh.com` e `thomas@nyroh.com` numa instalação nova |
| `APP_PUBLIC_URL` | não* | URL `https` do Nyroh. *Na Railway o domínio público é detectado sozinho. |
| `FLUXO_DISPATCH_SHARE` | não | Fração do limite usada pelo disparo (padrão `0.8`) |

Lista completa e comentada: [`.env.example`](.env.example).

### Disco para mídia
Crie um **Volume** na Railway (qualquer caminho de montagem). O Nyroh usa `RAILWAY_VOLUME_MOUNT_PATH` automaticamente. **Sem volume, fotos, áudios e PDFs somem a cada deploy.**

### Depois de subir
1. Abra `https://SEU-DOMINIO/api/infrastructure/status` logado como admin. O bloco `whatsapp.items` lista **tudo** que ainda falta (credencial, webhook, URL pública, volume, ffmpeg, banco, Redis, senhas padrão). `whatsapp.ready: true` significa pronto.
2. **Troque as senhas** de todas as contas apontadas como "senha padrão/previsível". Trocar a senha derruba as outras sessões abertas daquela conta.
3. Mande um "oi" de outro celular para o número e veja a conversa aparecer no chat.

---

## 2. Como o WhatsApp funciona aqui (regras que a Meta impõe)

- **Janela de 24h:** texto livre só até 24h depois da última mensagem do cliente. Fora disso, só **modelo aprovado** (cobrado pela Meta). O chat mostra o estado da janela e, se ela estiver fechada, abre a escolha de modelo.
- **Modelos:** o chat e o disparo usam o **catálogo real** da sua conta (`GET /templates`). Se o modelo exige botão de URL ou mídia de cabeçalho, isso é verificado **antes** de enviar.
- **Status:** `na fila` → ✓ enviado → ✓✓ entregue → ✓✓ azul lido. Falha mostra o motivo e o botão "Tentar de novo". O status só avança e nunca volta.
- **Celular (coexistência):** o que você responde pelo app aparece no CRM com o selo 📱 e não reabre a janela.
- **Vários vendedores:** quem abre a mesma conversa vê "Fulano também está nesta conversa / está digitando…".
- **Disparo em massa:** a velocidade é limitada ao seu plano (por **minuto**). Em `429`, a fila espera o `Retry-After` e continua sem duplicar envios.
- **Mídia enviada:** fica no seu volume e vai para a Meta por URL pública do próprio Nyroh. Limites: imagem 5 MB, áudio/vídeo 16 MB, documento 100 MB. O áudio gravado no navegador é convertido para OGG/Opus (ffmpeg, instalado via `nixpacks.toml`).

---

## 3. Rodar localmente

```bash
npm install
```

```bash
npm run dev
```

Em desenvolvimento a tela de login mostra botões de acesso rápido (contas de demonstração). Eles **não existem** no build de produção.

Para testar sem o número real, suba o mock da FluxoAPI (implementa o contrato da documentação oficial) e aponte o servidor para ele com `FLUXO_BASE_URL=http://127.0.0.1:4010`:

```bash
npm run mock:fluxo
```

---

## 4. Testes

```bash
npm test
```

Testes de regra (status, janela, telefone, assinatura, montagem de modelo, limites, mídia): 53 casos.

```bash
npm run test:e2e
```

Sobe o servidor de verdade e o mock e percorre o fluxo inteiro: segurança, webhooks, coexistência, envio, mídia, status, presença, SSE e disparo (111 casos). Com `E2E_DATABASE_URL=postgres://…` roda contra um PostgreSQL real.

```bash
npm run test:boot
```

Segurança de inicialização: senha que não volta após reiniciar, contas de demo desligadas em produção. Precisa de `E2E_ADMIN_DATABASE_URL` apontando para um PostgreSQL descartável.

---

## 5. Documentos do projeto
- [`q.a e plano.md`](q.a%20e%20plano.md): QA original e o plano de correção (T01–T82) que foi implementado.
