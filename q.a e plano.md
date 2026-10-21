QA Completo — Nyroh CRM / WhatsApp
Data: 2026-10-06 Método: QA por rastreamento de código — cada funcionalidade foi tratada como caso de teste e seguida do clique do usuário → rota do servidor → chamada à API → volta (webhook/SSE). Não houve envio real ao WhatsApp (exige credenciais ativas + seu OK, pois é efeito externo). Onde o veredito depende do provedor (Meta/Fluxo), está marcado. Legenda: ✅ PASSA · ❌ FALHA · ⚠️ RISCO (funciona às vezes / depende de condição)

0. Resumo executivo (os seus 3 sintomas)
Seu sintoma	Veredito	Causa-raiz
"Mando pelo meu celular e não aparece no Nyroh (coexistência)"	❌	Depende do evento message.sent_from_phone que o provedor provavelmente não envia. A Meta Cloud API padrão não ecoa mensagens enviadas pelo app do celular sem o modo Coexistence ativado na conta. O handler existe (server.ts:4026), mas sem o evento, nada chega.
"As mensagens que mando pelo Nyroh não vão"	⚠️/❌	Envio é dispare-e-esqueça e a UI diz "enviado" mesmo quando falha (server.ts:9483, 9703). Fora da janela de 24h, texto livre é recusado pela Meta e falha calado (nunca checa window_expires_at).
"Áudio, imagem, arquivo: esquece"	❌	Pipeline de mídia depende de ffmpeg (não existe no deploy) + upload em hosts efêmeros (litterbox/uguu/tmpfiles). Se qualquer um falha, manda url vazia ou data: URI que a Meta não baixa → mídia não vai.
Placar geral do rastreamento: 7 ✅ · 11 ❌ · 9 ⚠️ (detalhe abaixo).

1. Autenticação & Sessão
#	Caso	Esperado	Resultado (traçado)	Veredito
1.1	Login	Sessão criada, cookie setado	OK (server.ts:1124)	✅
1.2	Cookie de sessão	Seguro	cookies.txt versionado com token real no repo	⚠️
1.3	Assinatura HMAC Fluxo	67 chars, headers certos	Correto (fluxoClient.ts:35), coberto pelo script QA	✅
2. Recebimento de mensagem (webhook de entrada)
#	Caso	Esperado	Resultado	Veredito
2.1	Webhook responde rápido	200 imediato	OK, fast-receiver (server.ts:3781)	✅
2.2	Verificação de assinatura do webhook	Rejeita payload forjado	Não verifica nada — aceita qualquer origem (server.ts:3771)	❌
2.3	Formatos suportados	Meta + Fluxo + Evolution	4 formatos tratados (server.ts:3810-4183)	✅
2.4	Mensagem cai no lead certo	Casar telefone exato	Casa pelos últimos 8 dígitos → cai no lead errado (server.ts:3238)	❌
2.5	Mensagem duplicada (reentrega Meta)	Ignorar repetida	Sem dedup em memória (server.ts:3418) → duplica	❌
2.6	Falha transitória no banco	Retry (attempts:3)	Erro é engolido no try/catch (server.ts:4197) → sem retry, perda silenciosa	❌
2.7	Mensagem chega durante boot	Persistir	DB conecta depois do servidor subir (server.ts:10100) → janela ~15s só memória	⚠️
3. Coexistência (mensagem enviada pelo SEU celular) — SINTOMA #1
#	Caso	Esperado	Resultado	Veredito
3.1	Provedor envia evento de eco	message.sent_from_phone chega	Meta Cloud API padrão não ecoa msg do app; precisa do modo Coexistence habilitado na conta/provedor	❌
3.2	Handler do eco	Salva + mostra	Handler existe e salva (server.ts:4026, 3637), mas só roda se o evento chegar	⚠️
3.3	Eco cai no lead certo	Casar telefone	Mesmo bug dos 8 dígitos (findLeadByPhoneNumber)	❌
3.4	Aparece ao vivo	SSE empurra	Só broadcastSSE (processo único); poll de 3s só pega se estiver na conversa aberta	⚠️
Conclusão 3: mesmo com o código correto, a coexistência não funciona sem o modo Coexistence ativo no número (lado Meta/Fluxo). É provável que esse seja o motivo real de "não aparece".

4. Envio pelo Nyroh — texto — SINTOMA #2
#	Caso	Esperado	Resultado	Veredito
4.1	Texto dentro da janela 24h	Entrega	Envia type:text (server.ts:9611) — OK se Fluxo/instância ativos e janela aberta	⚠️
4.2	Texto fora da janela 24h	Bloquear/usar template	Não checa janela; Meta recusa 131047 e falha calado	❌
4.3	Confirmação de envio	UI reflete sucesso/falha real	Responde 201 sucesso antes da API (server.ts:9703); falha vira só console.warn (server.ts:9691)	❌
4.4	Instância Fluxo desconectada	Erro visível	Falha silenciosa; UI mostra "enviado"	❌
5. Envio de template
#	Caso	Esperado	Resultado	Veredito
5.1	Template com 2 variáveis	Entrega	Parâmetros hardcoded (nome + URL) (server.ts:9499)	⚠️
5.2	Template com header/botão/nº diferente de params	Entrega	Mismatch → Meta recusa	❌
5.3	Template não aprovado na Meta	Erro claro	Falha (silenciosa pelo 4.3)	⚠️
6. Envio de áudio / imagem / arquivo — SINTOMA #3
#	Caso	Esperado	Resultado	Veredito
6.1	Áudio gravado no navegador	Converte p/ OGG/Opus e envia	Front manda base64; servidor tenta ffmpeg que não existe no deploy (fluxoClient.ts:218) → fallback com codec errado	❌
6.2	Upload de mídia pública	Link HTTPS 200 durável	Usa litterbox/uguu/tmpfiles (fluxoClient.ts:248) — caem, bloqueiam, e expiram em 72h	❌
6.3	Upload falhou	Não enviar quebrado	Retorna '' ou data: URI → envia media:{url:''} que a Meta recusa (131053)	❌
6.4	execSync(ffmpeg)	Não travar servidor	Bloqueia o event loop por até 5s durante gravação	⚠️
6.5	Imagem/arquivo recebidos do cliente	Baixar e exibir	downloadAndStoreFluxoMedia grava em /uploads local (server.ts:2993) — some em deploy/restart (sem volume)	⚠️
7. Status de entrega (tiques ✓ ✓✓)
#	Caso	Esperado	Resultado	Veredito
7.1	"Enviado/entregue/lido"	Via webhook de status	Marca delivered já no aceite da API (server.ts:10030, 9458) — não é entrega real	❌
7.2	Status de msg desconhecida	Ignorar	Fallback aplica status na última msg da conversa (server.ts:4125) → tique errado	❌
8. Tempo real (a UI atualizando sozinha)
#	Caso	Esperado	Resultado	Veredito
8.1	Nova msg aparece na conversa aberta	Ao vivo	SSE + poll 3s (ThomasWhatsAppDesktopView.tsx:353)	✅
8.2	Nova msg de OUTRO lead	Notifica/atualiza lista	Só por SSE; se cair, perde (sem replay)	⚠️
8.3	2+ instâncias na Railway	Todos recebem	SSE é processo único (server.ts:429) → quem está na outra instância não recebe	❌
9. Disparo em massa (campanha)
#	Caso	Esperado	Resultado	Veredito
9.1	Enfileirar lote	BullMQ + pacing	OK (server.ts:8415, redisQueue.ts:494)	✅
9.2	Pausar/retomar/cancelar	Controla lote	OK (estado em memória)	✅
9.3	Workers estáveis	Conexões dedicadas	1 conexão Redis compartilhada por 3 workers (redisQueue.ts:373) → trava intermitente	❌
9.4	Marca "enviado"	Reflete Meta	Marca delivered no aceite; sem reconciliação de status real	⚠️
9.5	Lote some em restart	Persistir progresso	Progresso só em memória → zera em restart	⚠️
10. Roleta / multi-vendedor (mesmo WhatsApp)
#	Caso	Esperado	Resultado	Veredito
10.1	Distribuir lead quente	Atribui a vendedor	OK (assignLeadViaRoulette)	✅
10.2	Dois vendedores no mesmo lead	Travar colisão	Sem trava de colisão / presença → dois respondem o mesmo cliente	❌
10.3	Vendedor só vê os seus	Permissão por dono	Não há escopo por vendedor no chat	⚠️
11. Persistência / infra
#	Caso	Esperado	Resultado	Veredito
11.1	Dado sobrevive a restart	Postgres fonte de verdade	Memória é usada como verdade em vários pontos → perde em restart	❌
11.2	Banco cai em runtime	Reconecta	Sem re-init; queries falham caladas	⚠️
11.3	Pool de conexões	Dimensionado	Sem max/idleTimeout (server.ts:478) — risco de esgotar com workers	⚠️
11.4	Credenciais	Em env var	Live key/secret hardcoded (server.ts:287)	❌
12. Sobre o "QA" que já existe no projeto (atenção!)
Os scripts scripts/test-fluxo-qa.ts e scripts/test-campaign-dispatch-qa.ts dão falsa sensação de segurança: o teste de webhook (test-fluxo-qa.ts:84) só confere se a rota responde 200 — mas ela responde 200 sempre (fast-receiver), mesmo que o processamento falhe ou a mensagem se perca. Ou seja: esses testes passam mesmo com a mensagem não chegando. Eles testam que o cano existe, não que a água passa.

13. Diagnóstico final dos seus sintomas
Celular → Nyroh (coexistência): quase certo que o evento de eco não está vindo do provedor. Primeiro passo é confirmar no painel Fluxo/Meta se o número tem Coexistence ligado; sem isso, nenhum código resolve.
Nyroh → cliente (não vai): some por janela de 24h fechada + falha silenciosa (UI mente que enviou). Precisa (a) checar a janela, (b) esperar a resposta da API e mostrar falha de verdade.
Mídia: quebra na origem — sem ffmpeg e hosts de mídia efêmeros. Só funciona de verdade com storage próprio (ex.: volume na Railway, S3/R2) e ffmpeg instalado (ou transcodificação no navegador).
14. Como virar ✅ (ordem sugerida)
Tirar credenciais do código → env var.
Envio: aguardar resposta da API, refletir failed real na UI.
Checar janela de 24h antes de texto livre (usar template se fechada).
Telefone E.164 completo no casamento (acaba o lead errado).
Confirmar/ativar Coexistence no provedor (sintoma #1).
Mídia: storage durável + ffmpeg (ou transcodificar no front).
Dedup de entrada + deixar worker relançar erro (retry real).
Rodar em 1 instância só enquanto for provisório. 





Plano determinístico de correção do WhatsApp — Nyroh × FluxoAPI
Data: 2026-10-06 Objetivo: deixar o WhatsApp do Nyroh 100% funcional (recebimento, coexistência, envio, mídia, status, disparo) seguindo o contrato real da FluxoAPI (OpenAPI v1.0.0, base https://api.fluxoapi.com.br/v1). Como usar este documento: execute as tarefas na ordem do DAG. Cada tarefa é atômica e tem: Depende de, Arquivos, Passos exatos, Critério de aceite, Verificação. Não comece uma tarefa antes das suas dependências estarem com o critério de aceite satisfeito. Nenhuma tarefa deve inventar payload — use só o que está em "Fatos da API" (§A).

§A. Fatos da API (fonte da verdade — NÃO inventar nada fora daqui)
A1. Autenticação (toda chamada à API)
4 cabeçalhos: X-Fluxo-Key (fxk_live_…), X-Fluxo-Timestamp (Unix em segundos, texto), X-Fluxo-Nonce (único por requisição, 8–128 chars), X-Fluxo-Signature (v1= + HMAC-SHA256 hex).
String assinada = 6 linhas unidas por \n, nesta ordem: v1, {timestamp}, {nonce}, {MÉTODO MAIÚSCULO}, {caminho+query exatamente como enviado}, {sha256(corpo) hex}.
Corpo vazio usa sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
Assine e envie os mesmos bytes do corpo (serializar 2x quebra a assinatura → invalid_signature).
Timestamp tolera ±300s (stale_timestamp). Nonce memorizado 600s (409 nonce_reused).
✅ O arquivo src/lib/fluxoClient.ts já implementa isso corretamente (buildFluxoAuthHeaders). Não reescrever a receita; só reutilizar.
A2. Instância
GET /v1/instances → { data: [Instance] }. GET /v1/instances/{instance_id} → detalhe.
Instance.mode: coexistence ou api_only. Instance.status: pending|connected|disconnected|suspended. Instance.quality: green|yellow|red|unknown.
A coexistência (ver mensagem enviada pelo celular) só existe se mode === "coexistence".
A3. Enviar mensagem de sessão (dentro da janela 24h)
POST /v1/instances/{instance_id}/messages
Corpo: { to, type, text?, media?, interactive?, reply_to?, idempotency_key? }
to: E.164, ex. +5519991802264.
type: text|image|document|audio|video|interactive (default text).
text: { body } (máx 4096).
media: { url (HTTPS pública), caption?, filename? }. Limites: imagem 5MB, áudio/vídeo 16MB, documento 100MB. Em áudio, caption é ignorado. Quem baixa a url é a Meta no envio → a URL precisa ser pública e estável.
Resposta: 202 com status: "queued". (Aceito ≠ entregue.)
Fora da janela → 422 window_closed com error.window_expired_at e error.hint (aponta o endpoint de template).
503 instance_reconnecting, 402 payment_required, 403 insufficient_scope (campo required_scope), 404 not_found.
A4. Enviar modelo (fora da janela, ou sempre que quiser modelo)
POST /v1/instances/{instance_id}/messages/template
Corpo: { to, template: { name, language, variables?|body?|header?|buttons?|cards?|components? }, idempotency_key? }
language: string (ex.: "pt_BR") — NÃO { code: ... }.
variables: objeto { "1": "...", "2": "..." } (forma antiga, = variáveis do corpo por posição).
body: objeto chave→valor (posição "1" ou nome, conforme parameterFormat).
header: { text?: {…}, media?: { link|id, filename? }, location?: {…} }.
buttons: objeto { "<índice 0-based de TODOS os botões>": "<trecho URL|cupom|token>" }.
cards: objeto { "0": { header, body, buttons }, … } (carrossel).
components: escotilha (array da Meta pronto).
Resposta: 202 com billable: true e preview.
422 = falta parâmetro OU modelo não APPROVED (a mensagem diz qual). 404 = modelo inexistente nesse idioma.
Faltar o parâmetro de UM botão faz a Meta recusar a mensagem inteira → sempre preencher conforme a definição real (ver A5).
A5. Catálogo de modelos
GET /v1/instances/{instance_id}/templates (ou GET /v1/templates?instance_id=…). Filtros: status, category, language, name, refresh.
Cada Template traz fields[]: lista do que PRECISA ser preenchido (slot, kind, ref, buttonIndex, cardIndex, required, example). É a fonte para montar variables/body/buttons/cards sem erro. Também sendable e blockedReason.
A6. Baixar mídia recebida
A Meta não manda o arquivo no webhook, só um id; o webhook já traz o caminho pronto em data.media.download_path (ex.: /v1/messages/{message_id}/media).
GET /v1/messages/{message_id}/media → bytes (não JSON), com Content-Type/X-Media-Mime-Type. Assinar como GET normal (corpo vazio).
Mídia expira na Meta em 30 dias (410 media_expired). Baixar ao receber.
⚠️ O caminho correto é download_path do evento. NÃO usar /v1/media/{id} (não existe).
A7. Marcar como lida
POST /v1/messages/{message_id}/read (só inbound com wamid). Zera não lidas. Escopo messages:send.
A8. Listagens para reconciliação
GET /v1/messages?conversation_id|instance_id|direction|status|since|until|limit≤200 (janela ≤90 dias).
GET /v1/conversations?instance_id&status&since&cursor&limit≤100 → cada conversa traz window_expires_at (fim da janela 24h; null/passado = só modelo).
GET /v1/conversations/{conversation_id}/messages → fio + window_expires_at no topo.
A9. Webhooks (entrega at-least-once)
Cabeçalhos por entrega: X-Fluxo-Event-Id (chave de idempotência), X-Fluxo-Event-Type, X-Fluxo-Timestamp, X-Fluxo-Signature = v1=<hex> do HMAC-SHA256 com o segredo whsec_… da instância sobre {timestamp} + \n + corpo bruto. Em rotação, vêm 2 assinaturas separadas por vírgula → aceitar qualquer uma.
Responder 2xx rápido. Reenvio em 0s, 30s, 2min, 10min, 1h, 6h, 24h; depois vai pra fila de falhas. Endpoint 24h sem sucesso é desligado.
Tipos e payloads (campo data):
message.received: { conversation_id, message_id, from, type, text, sent_from_phone, media?, reply?, reply_to_wamid? }. Reabre a janela de 24h. type ∈ text|image|audio|video|document|sticker|location|contacts|reaction|interactive|button. Clique vem com reply: { kind, id, title, description? }.
message.sent_from_phone (SÓ em mode: coexistence): { conversation_id, message_id, to, type, text, sent_from_phone: true, media? }. Tem to (cliente), NÃO tem from. NÃO reabre a janela. Serve para saber que um humano assumiu.
message.status: data: { message_id, conversation_id, status, rank, at, error? }. rank só cresce: 1 sent, 2 delivered, 3 read, 9 failed. Comparar por rank, nunca por ordem de chegada.
instance.status_changed: data: { field, messaging_limit_24h?, quality? }.
instance.access_expiring: data: { days_left }.
A10. Limites de uso (CRÍTICO para disparo)
Por credencial, por MINUTO: Starter 60, Pro 300, Escala 1.200, Enterprise 6.000.
Toda resposta traz X-RateLimit-Limit/Remaining/Reset. Estourar → 429 rate_limited com Retry-After (segundos) — respeitar o cabeçalho.
⚠️ A velocidade do disparo hoje é em msgs/segundo; o limite do plano é por minuto. 30/s = 1.800/min → estoura Starter (60/min) e Pro (300/min) na hora.
A11. Idempotência de envio
Campo idempotency_key no corpo dos envios. Mesma chave em 7 dias devolve a mesma mensagem (replayed: true, header x-fluxo-idempotent-replay: true), sem reenviar. Sem ela, retry da sua infra = mensagem duplicada no cliente.
A12. Identificadores e erros
IDs com prefixo ULID: inst_, conv_, msg_, cont_, lead_, cred_; chaves fxk_…; segredo fxs_…; segredo de webhook whsec_….
Erro sempre { error: { code, message, request_id?, …extras } }. Programar pelo code, mostrar message, guardar request_id.
§B. DAG — visão geral (ordem de execução por camadas)
P0 (segredos/infra, sem deps)
  T01 ─┬─> P1
  T02  │
  T03 ─┤
  T04  │
P1 (cliente/base)        deps: T01,T03
  T10 ─┬─> P2,P4
  T11 ─┤
  T12 ─┤
  T13 ─┘
P2 (recebimento)         deps: T10,T11,T12,T13
  T20 -> T21 -> T22 ─┬─> T23
  T24 (paralela)      ├─> T25
P3 (coexistência)        deps: T10,T21,T22
  T30 -> T33 ; T31 -> T32
P4 (envio)               deps: T10
  T40 ─┬─ T41 ─ T42 ─ T43 ─ T45
       └─ T44 ─> P5
P5 (template correto)    deps: T44
  T50 -> T51
P6 (status por rank)     deps: T22
  T60 -> T61 ; T62
P7 (disparo no limite)   deps: T51
  T70 -> T71 -> T72
P8 (persistência/tempo)  deps: T04,T22,T23,T40
  T80 ; T81 ; T82
VERIFICAÇÃO FINAL        deps: tudo
  V1..V8
Regra de paralelismo: tarefas na mesma camada sem dependência entre si podem ser feitas em qualquer ordem. Uma tarefa só "fecha" quando seu Critério de aceite passa.

§C. Tarefas
FASE 0 — Segredos e infraestrutura
T01 — Remover credenciais do código e ler só de env
Depende de: —
Arquivos: server.ts (linhas ~287-289), .env (novo, não versionar), .env.example.
Passos:
Em server.ts, trocar os defaults hardcoded por string vazia: apiKey: process.env.FLUXO_KEY || '', apiSecret: process.env.FLUXO_SECRET || '', instanceId: process.env.FLUXO_INSTANCE_ID || ''.
Criar .env local com FLUXO_KEY, FLUXO_SECRET, FLUXO_INSTANCE_ID reais.
Revogar/rotacionar na FluxoAPI a chave antiga que foi exposta (a chave em si foi retirada deste arquivo; confira em FluxoAPI > Credenciais se ainda existe alguma credencial antiga ativa e revogue).
Critério de aceite: grep -R "fxk_live_" server.ts não retorna nada; servidor sobe lendo as chaves do .env.
Verificação: grep -R "fxk_live_\|fxs_m_" . --exclude-dir=node_modules → zero ocorrências em arquivos versionados.
T02 — Tirar cookies.txt do repositório
Depende de: —
Arquivos: cookies.txt, .gitignore.
Passos: apagar cookies.txt; adicionar cookies.txt ao .gitignore.
Critério de aceite: arquivo não existe; .gitignore o ignora.
Verificação: git status não lista cookies.txt.
T03 — Declarar novas variáveis de ambiente
Depende de: —
Arquivos: .env.example, .env.
Passos: adicionar e documentar:
FLUXO_WEBHOOK_SECRET= (o whsec_… da instância; usado em §A9).
APP_PUBLIC_URL= (URL pública do Nyroh, p/ servir mídia que a Meta baixa — §A3).
FLUXO_PLAN_RPM=60 (limite do plano por minuto — §A10; Starter=60).
Critério de aceite: as 3 variáveis existem no .env.example com comentário.
Verificação: leitura do arquivo.
T04 — Fixar 1 réplica na Railway (enquanto o tempo real for SSE)
Depende de: —
Arquivos: railway.json (ou painel Railway).
Passos: garantir numReplicas = 1 (SSE é por processo — §(ver T82)). Documentar que escalar exige T82.
Critério de aceite: deploy roda com exatamente 1 instância.
Verificação: painel Railway mostra 1 réplica ativa.
FASE 1 — Cliente FluxoAPI e base de webhook
T10 — Exigir instance_id em todas as chamadas de mensagem
Depende de: T01
Arquivos: server.ts (envio avulso ~9480; disparo worker ~9919), src/lib/fluxoClient.ts.
Passos:
Centralizar: criar helper fluxoInstancePath(suffix) que retorna /v1/instances/${FLUXO_INSTANCE_ID}${suffix} e lança erro claro se FLUXO_INSTANCE_ID vazio.
Substituir os caminhos atuais que caem em /v1/messages sem instância (ex.: server.ts:9480, :8249, :2567) por esse helper. Spec §A3/§A4 sempre usa /v1/instances/{id}/....
Critério de aceite: nenhum envio usa /v1/messages sem instância; sem instanceId, o envio falha com mensagem explícita (não silencioso).
Verificação: grep -n "'/v1/messages'" server.ts → zero; teste unitário do helper com env vazia lança erro.
T11 — Corrigir o download de mídia recebida (usar download_path)
Depende de: T01
Arquivos: src/lib/fluxoClient.ts (downloadFluxoMediaBinary), server.ts (downloadAndStoreFluxoMedia ~2993 e chamadas ~3888/3902/3915).
Passos:
Mudar downloadFluxoMediaBinary para receber o download_path literal do evento (ex.: /v1/messages/{message_id}/media) e assinar um GET nesse caminho exato (A1 + A6). Remover a construção /v1/media/{id} (está errada).
Ajustar processWebhookEventAsync/processIncomingWhatsAppMessage para passar m.media.download_path (não o id).
Critério de aceite: a função assina e baixa usando exatamente data.media.download_path.
Verificação: teste com um download_path fixo → a URL chamada é https://api.fluxoapi.com.br{download_path} e a assinatura bate (A1).
T12 — Helper de verificação de assinatura de webhook
Depende de: T03
Arquivos: novo src/lib/webhookAuth.ts.
Passos: criar verifyFluxoWebhook(rawBody: string, headers): boolean:
Ler X-Fluxo-Timestamp e X-Fluxo-Signature.
Calcular HMAC_SHA256(FLUXO_WEBHOOK_SECRET, ${timestamp}\n${rawBody}) em hex (A9).
A assinatura do header é v1=<hex>; pode haver duas separadas por vírgula → aceitar se bater com qualquer uma. Comparar em tempo constante (crypto.timingSafeEqual).
Rejeitar se |now - timestamp| > 300s.
Critério de aceite: retorna true só para assinatura válida; false para corpo adulterado ou timestamp velho.
Verificação: teste unitário com um corpo e segredo conhecidos (gerar a assinatura esperada no teste).
T13 — Capturar o corpo bruto do webhook
Depende de: —
Arquivos: server.ts (middleware express.json ~51).
Passos: configurar express.json({ verify: (req,_res,buf)=>{ (req as any).rawBody = buf.toString('utf8'); } }) ou registrar um parser raw dedicado só nas rotas de webhook. A verificação de assinatura (T12) exige os bytes exatos recebidos.
Critério de aceite: dentro do handler do webhook, req.rawBody contém o JSON exato recebido.
Verificação: log temporário imprime req.rawBody igual ao corpo enviado por um curl.
FASE 2 — Recebimento confiável
T20 — Deduplicar eventos por X-Fluxo-Event-Id
Depende de: T12, T13
Arquivos: server.ts (POST webhook ~3771), opcional Redis.
Passos: manter um conjunto de ids já vistos (Redis SET com TTL 1h, ou Map em memória com expiração). Se o X-Fluxo-Event-Id já foi processado, responder 200 e não processar de novo (A9 at-least-once).
Critério de aceite: enviar o mesmo evento 2x gera uma mensagem só.
Verificação: curl duas vezes com o mesmo X-Fluxo-Event-Id → a conversa recebe 1 mensagem.
T21 — Verificar assinatura antes de enfileirar
Depende de: T12, T13, T20
Arquivos: server.ts (POST webhook ~3771).
Passos: no POST do webhook, se verifyFluxoWebhook falhar → responder 401 e não enfileirar. Se passar → responder 200 e enfileirar (manter o fast-receiver). Guardar X-Fluxo-Event-Type e X-Fluxo-Event-Id no job.
Critério de aceite: payload sem assinatura válida é rejeitado com 401; válido segue o fluxo.
Verificação: curl sem assinatura → 401; com assinatura correta → 200 e evento processado.
T22 — Reescrever o processamento de message.received no formato real
Depende de: T11, T20, T21
Arquivos: server.ts (processWebhookEventAsync ~3800, processIncomingWhatsAppMessage ~3325).
Passos: tratar o payload oficial (A9): ler data.message_id, data.from, data.type, data.text, data.sent_from_phone, data.media, data.reply, data.conversation_id.
Ignorar/rotear à parte quando sent_from_phone === true (isso é T31, não é mensagem de cliente).
Para mídia (type ∈ image/audio/video/document/sticker): usar data.media.download_path (T11/T23).
Para clique (type: interactive|button): usar data.reply.title/data.reply.id.
Persistir no Postgres com whatsapp_message_id = data.message_id e conversation_id.
Reabrir janela: gravar window_expires_at = created_at + 24h no lead/conversa.
Critério de aceite: um message.received de texto cria/atualiza o lead e grava a mensagem com o message_id real.
Verificação: curl com o exemplo "texto" da doc (A9) → aparece a mensagem "oi" no lead do telefone 5519996155951.
T23 — Baixar mídia recebida e servir de forma estável
Depende de: T11, T22
Arquivos: server.ts (downloadAndStoreFluxoMedia ~2993), infra de storage.
Passos:
Ao receber mídia, baixar os bytes na hora (A6: expira em 30 dias) via download_path assinado.
Salvar em storage durável e público (não /uploads efêmero da Railway sem volume) — ver T81. Guardar a URL pública resultante em media_url.
Nunca apontar <img>/<audio> do frontend direto para api.fluxoapi.com.br/... (exige HMAC → 401 no navegador).
Critério de aceite: uma imagem recebida fica acessível por uma URL do próprio Nyroh que abre no navegador sem autenticação da Fluxo.
Verificação: receber um message.received tipo document (exemplo da doc) → o arquivo abre pela URL salva.
T24 — Casar telefone por E.164 completo (fim do "lead errado")
Depende de: —
Arquivos: server.ts (findLeadByPhoneNumber ~3227), src/lib/phone.ts, frontend ThomasWhatsAppDesktopView.tsx ~384.
Passos: normalizar todo telefone para E.164 (+55DDDNÚMERO) e casar pela string inteira normalizada, não por endsWith(8 dígitos). Tratar 9º dígito (móvel) de forma explícita, não por sufixo.
Critério de aceite: dois números com os mesmos 8 dígitos finais e DDDs diferentes não casam entre si.
Verificação: teste unitário: +5511987654321 ≠ +5521987654321.
T25 — Deixar o worker relançar erro (retry real do BullMQ)
Depende de: T22
Arquivos: server.ts (processWebhookEventAsync try/catch ~4197).
Passos: em falha transitória (ex.: DB fora, 5xx), relançar o erro para o BullMQ reprocessar (attempts: 3). Em erro permanente (payload inválido), logar e encerrar sem relançar (senão fica em loop).
Critério de aceite: simular DB fora durante o processamento → o job é retentado; depois que o DB volta, a mensagem é persistida.
Verificação: forçar exceção transitória e ver o job repetir nas tentativas (log do BullMQ).
FASE 3 — Coexistência (SINTOMA #1: "mando pelo celular e não aparece")
T30 — Verificar o modo da instância (diagnóstico que destrava tudo)
Depende de: T10
Arquivos: rota nova GET /api/admin/fluxo/instance-mode em server.ts.
Passos: chamar GET /v1/instances/{instance_id} (A2) e expor mode, status, quality.
Critério de aceite: a rota retorna mode.
Verificação: se mode === "api_only", a coexistência NUNCA vai funcionar por código — é preciso religar o número em modo coexistência no painel Fluxo/Meta. Registrar isso como bloqueio operacional. Se mode === "coexistence", seguir T31/T33.
T31 — Handler de message.sent_from_phone conforme a spec
Depende de: T22
Arquivos: server.ts (processWebhookEventAsync ~4026, processOutboundPhoneMessage ~3637).
Passos: tratar o payload real (A9): usar data.to (cliente), data.message_id, data.type, data.text, data.media. Gravar como outbound (sent_from_phone: true), sem reabrir a janela de 24h, e casar status futuro por message_id. Fazer dedup por X-Fluxo-Event-Id (T20).
Critério de aceite: o exemplo message.sent_from_phone da doc cria uma mensagem de saída no lead do cliente 5519996155951.
Verificação: curl com o exemplo da doc → mensagem "Oi! Já vou te atender por aqui." aparece como enviada no lead.
T32 — (Opcional) Pausar automações quando o humano assume
Depende de: T31
Arquivos: server.ts.
Passos: ao receber message.sent_from_phone, marcar a conversa como "assumida por humano" para não deixar nenhuma automação responder por cima.
Critério de aceite: flag registrada na conversa.
Verificação: evento marca a flag; sem automação disparando depois.
T33 — Registrar o webhook no painel apontando para o Nyroh
Depende de: T21, T30
Arquivos: operacional (painel Fluxo) + .env (FLUXO_WEBHOOK_SECRET).
Passos: no painel da FluxoAPI, cadastrar o endpoint POST {APP_PUBLIC_URL}/api/webhooks/fluxo para os eventos message.received, message.sent_from_phone, message.status, instance.*; copiar o whsec_… para FLUXO_WEBHOOK_SECRET.
Critério de aceite: eventos reais chegam no endpoint e passam na verificação de assinatura (T21).
Verificação: enviar uma mensagem de teste ao número e ver o message.received chegar com assinatura válida.
FASE 4 — Envio confiável (SINTOMA #2: "mando pelo Nyroh e não vai")
T40 — Parar o "dispare-e-esqueça": aguardar a API e devolver status real
Depende de: T10
Arquivos: server.ts (POST /api/leads/:leadId/messages ~9371).
Passos:
Aguardar a resposta do executeFluxoRequest (remover o IIFE em segundo plano ~9483) antes de responder ao cliente.
Mapear 202 → gravar msg com status: 'queued' e whatsapp_message_id = data.id (A3).
Falha → gravar status: 'failed' com error.code/error.message/request_id, e responder HTTP coerente (ex.: 422/402/503 conforme o code).
Critério de aceite: a rota só responde sucesso quando a Fluxo devolveu 202; falha retorna erro com o code.
Verificação: com instância desconectada, a rota devolve erro (não "enviado"); com janela aberta, devolve 202/queued.
T41 — Checar a janela de 24h antes de texto livre
Depende de: T40
Arquivos: server.ts (mesma rota), uso de window_expires_at (gravado em T22).
Passos:
Antes de enviar type:text/mídia de sessão, checar window_expires_at do lead/conversa (A8). Se expirada/nula → não mandar sessão; retornar instrução para usar template (A3 hint).
Defensivo: se mesmo assim a API responder 422 window_closed, capturar e retornar a mesma orientação (não falhar calado).
Critério de aceite: texto livre fora da janela é bloqueado com mensagem clara ("janela fechada, use modelo"); nunca "enviado" falso.
Verificação: simular window_expires_at no passado → a rota recusa e sugere template.
T42 — Enviar idempotency_key em todo envio
Depende de: T40
Arquivos: server.ts (envio avulso e, depois, disparo).
Passos: gerar uma idempotency_key estável por mensagem (ex.: ${leadId}:${messageLocalId}) e incluir no corpo (A11). Em retry, reutilizar a mesma chave.
Critério de aceite: dois envios com a mesma chave não geram 2 mensagens no cliente.
Verificação: repetir o POST com a mesma key → resposta com replayed: true (ou sem nova mensagem no destino).
T43 — Mapear erros da Fluxo para mensagens claras
Depende de: T40
Arquivos: server.ts (helper de erro), reutilizar translateMetaErrorCode (~2951).
Passos: mapear os code da §A12 (window_closed, insufficient_scope+required_scope, instance_not_connected, instance_reconnecting, payment_required, rate_limited+Retry-After, template_not_found) para texto em pt-BR e ação sugerida; sempre guardar request_id.
Critério de aceite: cada code tem uma mensagem amigável associada.
Verificação: tabela de mapeamento cobre todos os code do enum do §A12.
T44 — Corrigir o shape do template no envio avulso
Depende de: T40
Arquivos: server.ts (envio avulso ~9486-9509).
Passos: trocar o corpo atual (template.language = { code } + components) pelo formato da §A4: { to, template: { name, language: "pt_BR", body: { "1": "...", ... } }, idempotency_key }. Nada de parâmetros fixos "nome + URL" chumbados (~9499).
Critério de aceite: o corpo do envio de template bate exatamente com §A4.
Verificação: log do corpo enviado = formato §A4 (language string, body objeto).
T45 — Frontend reflete failed/queued reais
Depende de: T40
Arquivos: src/components/ThomasWhatsAppDesktopView.tsx (~488, handlers de envio).
Passos: usar o status retornado pela API e os eventos MESSAGE_STATUS_UPDATE (A9/message.status) para mostrar ✓/✓✓/✗ corretos; em failed, exibir o motivo (error.message).
Critério de aceite: mensagem que falhou aparece como falha com o motivo, não como enviada.
Verificação: forçar erro → a UI mostra ✗ + motivo.
FASE 5 — Template montado pela definição real
T50 — Montar variáveis a partir de fields do catálogo
Depende de: T44
Arquivos: server.ts (novo helper buildTemplatePayload), consumo de GET /templates.
Passos:
Buscar o template em GET /v1/instances/{id}/templates?name=…&language=… (A5), ler fields[].
Para cada field (slot/kind/ref/buttonIndex/cardIndex), preencher body/header/buttons/cards conforme §A4. Preencher TODOS os required (botão de URL inclusive) senão a Meta recusa tudo.
Critério de aceite: dado um template com botão de URL variável, o payload inclui o buttons: { "<idx>": "<trecho>" } correto.
Verificação: com um template real de teste, o envio retorna 202 (não 422 por parâmetro faltando).
T51 — Disparo usa o mesmo builder
Depende de: T50
Arquivos: server.ts (worker processCampaignDispatch ~9898).
Passos: substituir a montagem atual (variables + fallback components) por buildTemplatePayload (T50). Guardar whatsapp_message_id = data.id, status: 'queued'.
Critério de aceite: o disparo usa exatamente o payload da §A4 montado por fields.
Verificação: log do job mostra corpo no formato §A4; status inicial queued.
FASE 6 — Status por rank
T60 — Handler de message.status casando por message_id e rank
Depende de: T22
Arquivos: server.ts (processDeliveryStatusUpdate ~3690; bloco status ~4111).
Passos: ler data.message_id, data.status, data.rank (A9). Atualizar a mensagem (match por whatsapp_message_id = data.message_id) só se rank novo > rank atual (guardar o rank). Em failed (rank 9), gravar error.
Critério de aceite: um delivered(2) atrasado não sobrescreve um read(3) já gravado.
Verificação: aplicar read depois delivered → fica read.
T61 — Remover o fallback perigoso de "última mensagem"
Depende de: T60
Arquivos: server.ts (~4125-4130 e ~3730-3732).
Passos: eliminar o fallback que aplica status na última mensagem da conversa quando não acha o id. Sem message_id casado → ignorar o evento (logar).
Critério de aceite: status de id desconhecido não altera nenhuma mensagem.
Verificação: enviar status com message_id inexistente → nada muda.
T62 — (Opcional) Marcar recebidas como lidas
Depende de: T22
Arquivos: server.ts (nova rota), frontend ao abrir conversa.
Passos: ao abrir a conversa, chamar POST /v1/messages/{message_id}/read (A7) para a última inbound com wamid.
Critério de aceite: contador de não lidas zera; cliente vê os 2 tiques azuis.
Verificação: abrir conversa → chamada 200.
FASE 7 — Disparo dentro do limite do plano
T70 — Alinhar a velocidade do disparo ao RPM do plano
Depende de: T51
Arquivos: server/redisQueue.ts (limiter ~408; pacing ~494), server.ts (dispatch ~8321).
Passos: trocar o raciocínio de msgs/segundo por msgs/minuto ≤ FLUXO_PLAN_RPM (A10). Ajustar o limiter do BullMQ para max: FLUXO_PLAN_RPM, duration: 60000 e o pacing para 60000 / RPM ms entre jobs. Default seguro = 60/min (Starter).
Critério de aceite: em 1 minuto, o nº de envios não ultrapassa FLUXO_PLAN_RPM.
Verificação: disparar 200 leads com RPM=60 → no máx 60 saem no 1º minuto.
T71 — Respeitar 429 Retry-After
Depende de: T70
Arquivos: server.ts (worker de disparo), src/lib/fluxoClient.ts.
Passos: se a resposta for 429, ler Retry-After (segundos) e reprogramar o job com esse atraso (BullMQ moveToDelayed/throw com backoff), sem loop curto (A10).
Critério de aceite: em 429, o worker espera o Retry-After antes de tentar de novo.
Verificação: simular 429 com Retry-After: 30 → próximo envio só após 30s.
T72 — idempotency_key por lead no disparo
Depende de: T51, T42
Arquivos: server.ts (worker de disparo).
Passos: usar idempotency_key = ${batchId}:${leadId} (A11). Em retry do BullMQ, a mesma chave evita 2ª mensagem.
Critério de aceite: reprocessar um job do mesmo lead não manda 2 mensagens.
Verificação: forçar retry → destino recebe 1 só.
FASE 8 — Persistência e tempo real
T80 — Postgres como fonte de verdade; subir DB antes de aceitar webhook
Depende de: T22, T40
Arquivos: server.ts (main ~9841/initDatabase ~452; POST webhook ~3771).
Passos:
Conectar ao Postgres antes do httpServer.listen, ou responder 503 nos webhooks/envios enquanto usePostgres === false (para a Fluxo reentregar — A9).
Tratar memória como cache; toda leitura/escrita de mensagem/lead passa pelo Postgres quando ativo.
Critério de aceite: nenhum evento é aceito (2xx) antes do DB pronto; nada essencial vive só em memória.
Verificação: subir com DB atrasado → webhooks recebem 503 até o DB conectar; depois processam normal.
T81 — Mídia de saída durável e pública + áudio no codec certo
Depende de: T23
Arquivos: src/lib/fluxoClient.ts (uploadDirectPublicMedia, transcodeAudioToWhatsAppVoice), infra (volume Railway/S3/R2), nixpacks.toml.
Passos:
Substituir litterbox/uguu/tmpfiles por storage próprio com URL pública estável sob APP_PUBLIC_URL (A3 exige URL que a Meta baixe; nada de link que expira em 72h).
Instalar ffmpeg no build (nixpacks.toml → nixPkgs = ["nodejs_20","ffmpeg"]) ou transcodificar no navegador; áudio precisa de OGG/Opus para a Meta.
Não bloquear o event loop: rodar transcode fora do caminho síncrono (execSync → processo assíncrono/fila).
Critério de aceite: enviar áudio/imagem/arquivo chega ao cliente; a URL de mídia é do próprio Nyroh e continua válida dias depois.
Verificação: enviar os 3 tipos → chegam no WhatsApp; abrir a URL salva 1 dia depois ainda funciona.
T82 — Tempo real robusto (ou travar em 1 instância)
Depende de: T04
Arquivos: server.ts (SSE ~429/9307), src/App.tsx, src/components/* (EventSource).
Passos (escolher 1):
(a) Simples/provisório: manter SSE + 1 réplica (T04) e adicionar reconciliação: além do poll da conversa aberta, revalidar a lista de conversas a cada N s (ou via GET /v1/conversations?since= — A8) para não perder conversa nova quando o SSE cair.
(b) Definitivo: migrar o frontend para socket.io (o Redis Adapter já existe em redisQueue.ts) para funcionar multi-instância.
Critério de aceite: mensagem nova aparece mesmo após queda/reconexão do tempo real; (b) funciona com 2+ réplicas.
Verificação: derrubar o SSE 1 min, mandar mensagem, reconectar → a conversa aparece (via reconciliação).
§D. Verificação final (end-to-end — rodar só depois do DAG)
Pré-requisito: GET https://api.fluxoapi.com.br/health = 200 e GET /api/admin/fluxo/instance-mode = connected.

V1 (assinatura): curl no webhook com assinatura inválida → 401; válida → 200 e evento processado. (T21)
V2 (dedup): mesmo X-Fluxo-Event-Id 2x → 1 mensagem. (T20)
V3 (recebimento): enviar WhatsApp real ao número → message.received cria/atualiza lead e grava a mensagem com message_id. (T22)
V4 (mídia in): enviar imagem/áudio/pdf ao número → baixado e exibível por URL do Nyroh. (T23)
V5 (coexistência): responder pelo app do celular → message.sent_from_phone grava saída no lead (só se mode: coexistence). (T30/T31)
V6 (envio in-window): responder pelo Nyroh dentro de 24h → 202 queued, depois delivered/read via status. (T40/T60)
V7 (fora da janela): com janela fechada → Nyroh bloqueia texto e orienta template; template vai. (T41/T50)
V8 (disparo): disparar N leads → respeita FLUXO_PLAN_RPM, trata 429, sem duplicadas. (T70/T71/T72)
§E. Resumo dos achados do contrato que explicam os sintomas
Coexistência (sintoma #1): message.sent_from_phone só existe em mode: coexistence. Verificar isso é o passo 0 (T30) — pode ser bloqueio operacional, não de código.
Download de mídia recebida quebrado: o código usa /v1/media/{id} (inexistente). O certo é data.media.download_path = /v1/messages/{message_id}/media (T11). Explica parte do "mídia não funciona".
Envio falha calado (sintoma #2): fire-and-forget + sem checar janela 24h + shape de template errado (language:{code} em vez de string) (T40/T41/T44).
Disparo estoura o rate limit: velocidade em msg/segundo vs limite por minuto → 429 em massa (T70).
Sem verificação de assinatura nem dedup de webhook → insegurança + duplicação (T20/T21).
Status sem rank → tiques retrocedem/erram (T60/T61).