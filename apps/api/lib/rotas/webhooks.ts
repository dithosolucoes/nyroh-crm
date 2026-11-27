/**
 * B1 (item 4.1 a): rotas de webhook (FluxoAPI e Meta) extraídas de server.ts.
 * Comportamento preservado: mesmas rotas, mesma ordem de validação (banco → assinatura → dedup → enfileira → 2xx).
 * As dependências do servidor entram por configurarRotasWebhooks, como getters, para ler o valor atual.
 */
import type { Express } from 'express';
import type { RespostaWebhookRecebido, RespostaWebhookJaProcessado, RespostaSimulacaoWebhook } from '../../../../shared/contracts/rotas.js';
import { optOutPorBotaoDoWebhook } from '../descadastroPadrao.js';
import { segredosWebhookFluxo, registrarEventoPorNumeroMeta, contaDoNumeroMeta, segredoWebhookDaInstancia, atualizarSaudeInstancia, registrarEventoFluxo } from '../fluxoContas.js';
import type { SaudeInstancia } from '../fluxoContas.js';


export interface DependenciasWebhooks {
  readonly IS_PRODUCTION: any;
  readonly TransientProcessingError: any;
  readonly applyMessageStatus: any;
  readonly broadcastSSE: any;
  readonly coexistenceSeen: any;
  readonly enqueueIncomingWebhook: any;
  readonly lastFluxoWebhookEvents: any;
  readonly memoryMetaConfig: any;
  readonly memoryTemplates: any;
  readonly metaDownloadMedia: any;
  readonly parseCoexistenceEchoes: any;
  readonly pgPool: any;
  readonly processDeliveryStatusUpdate: any;
  readonly processIncomingWhatsAppMessage: any;
  readonly processOutboundPhoneMessage: any;
  readonly requireDatabaseReady: any;
  readonly saveMediaBuffer: any;
  readonly setLeadMetaRoute: any;
  readonly usePostgres: any;
  readonly verifyFluxoWebhook: any;
  readonly verifyMetaSignature: any;
}

let D: DependenciasWebhooks;

export function configurarRotasWebhooks(deps: DependenciasWebhooks): void {
  D = deps;
}

// Deduplicação de eventos por X-Fluxo-Event-Id (§A9: a entrega é at-least-once).
// `seen` = já ENFILEIRADO com sucesso; `inFlight` = sendo enfileirado agora (cobre duas entregas simultâneas).
// O id só vira "visto" depois do enfileiramento OK: se falhar, a reentrega da Fluxo ainda é aceita.
const processedWebhookEventIds = new Map<string, number>();
const inFlightWebhookEventIds = new Set<string>();

function isEventDuplicate(eventId: string): boolean {
  if (!eventId) return false;
  const now = Date.now();
  if (processedWebhookEventIds.size > 5000) {
    for (const [id, ts] of processedWebhookEventIds.entries()) {
      if (now - ts > 3600000) processedWebhookEventIds.delete(id);
    }
  }
  return processedWebhookEventIds.has(eventId) || inFlightWebhookEventIds.has(eventId);
}

// Saúde do número, atualizada pelos webhooks instance.status_changed / instance.access_expiring
export const instanceHealth: {
  quality?: string;
  messagingLimit24h?: number;
  field?: string;
  accessDaysLeft?: number;
  updatedAt?: string;
} = {};

/** Tipo de mídia de uma mensagem Fluxo (§A9) a partir de `data.type` e `data.media`. */
function classifyFluxoMedia(kind: string, media: any): 'audio' | 'image' | 'document' | 'video' | undefined {
  const mime = String(media?.mime_type || '').toLowerCase();
  if (kind === 'audio' || media?.voice || mime.startsWith('audio/')) return 'audio';
  if (kind === 'image' || kind === 'sticker' || mime.startsWith('image/')) return 'image';
  if (kind === 'video' || mime.startsWith('video/')) return 'video';
  if (kind === 'document' || (media && (media.filename || media.download_path || mime))) return 'document';
  return undefined;
}


export async function processWebhookEventAsync(event: any) {
  // Log sem dado pessoal: antes gravava o payload inteiro (telefone e texto do cliente)
  // no log do servidor, onde fica guardado e visível para quem tem acesso ao painel.
  // Fora de produção o payload completo ajuda a depurar, então segue aparecendo lá.
  if (D.IS_PRODUCTION) {
    console.log('[Webhook] evento recebido:', JSON.stringify({
      type: event?.type || event?.event || 'desconhecido',
      id: event?.id || event?.data?.message_id || null,
      at: event?.created_at || null
    }));
  } else {
    console.log('[Webhook Event Received - Background Worker]:', JSON.stringify(event));
  }

  try {
    let eventType = event.type || event.event || 'meta_event';
    let summary = `Evento oficial recebido (${eventType})`;

    // ========================================================================
    // 1. Processamento de Webhooks no Padrão Oficial Meta Cloud API
    // ========================================================================
    if (event.entry && Array.isArray(event.entry)) {
      for (const entryItem of event.entry) {
        if (entryItem.changes && Array.isArray(entryItem.changes)) {
          for (const change of entryItem.changes) {
            const field = change.field;
            const val = change.value || {};

            // 1.1 Atualização de status de template da Meta (APPROVED / REJECTED)
            if (field === 'message_template_status_update') {
              eventType = 'template_status_update';
              const tplName = val.message_template_name || val.element_name;
              const newStatus = String(val.event || val.status || 'APPROVED').toUpperCase();
              const reason = val.reason || val.rejection_reason || null;
              summary = `Meta atualizou template "${tplName}" para ${newStatus}${reason ? ` (Motivo: ${reason})` : ''}`;

              console.log(`[Meta Template Status Update]: ${tplName} -> ${newStatus}`);

              // Prefere o ID do modelo (único por BM). Só cai no nome quando o evento não traz ID.
              const tplId = val.message_template_id ? String(val.message_template_id) : null;
              const memTpl = (tplId ? D.memoryTemplates.find(t => String(t.id) === tplId) : undefined)
                || D.memoryTemplates.find(t => t.name.toLowerCase() === String(tplName).toLowerCase());
              if (memTpl) {
                memTpl.status = newStatus as any;
                if (reason) memTpl.rejectedReason = reason;
              }

              if (D.usePostgres && D.pgPool && tplName) {
                try {
                  await D.pgPool.query(
                    tplId
                      ? `UPDATE meta_templates SET status = $1, rejected_reason = COALESCE($2, rejected_reason), updated_at = CURRENT_TIMESTAMP WHERE id = $3`
                      : `UPDATE meta_templates SET status = $1, rejected_reason = COALESCE($2, rejected_reason), updated_at = CURRENT_TIMESTAMP WHERE LOWER(name) = LOWER($3)`,
                    [newStatus, reason, tplId || tplName]
                  );
                } catch (pgErr) {
                  console.warn('[PostgreSQL] Erro ao atualizar status de template via webhook:', pgErr);
                }
              }

              D.broadcastSSE('TEMPLATE_STATUS_UPDATE', {
                templateName: tplName,
                status: newStatus,
                reason
              }, { broadcastAll: true });
            }

            // 1.2 Mensagens e Status de Entrega da Meta
            // 1.3 Coexistência: mensagens enviadas pelo APP do celular (WhatsApp Business), espelhadas pela Meta.
            // Sem isso o CRM não vê o que o vendedor respondeu pelo celular no mesmo número.
            else if (field === 'smb_message_echoes') {
              // Eco de mensagem enviada pelo celular prova que o número está em coexistência
              const echoPid = String(val?.metadata?.phone_number_id || '');
              if (echoPid) D.coexistenceSeen.set(echoPid, Date.now());
              for (const echo of D.parseCoexistenceEchoes(val)) {
                eventType = 'message_sent_from_phone';
                await D.processOutboundPhoneMessage({
                  phone: echo.phone,
                  text: echo.text,
                  messageId: echo.messageId,
                  eventTimestamp: echo.eventTimestamp
                });
                summary = `Vendedor respondeu pelo celular para ${echo.phone}`;
              }
            }

            else if (field === 'messages') {
              // Número que recebeu (multi-número): define qual token/BM usar para baixar mídia e marcar leitura
              const receivingPhoneId = String(val.metadata?.phone_number_id || '').trim() || undefined;
              // Saúde do número e decisão do operador (só com o cadastro de contas ligado).
              let numeroIgnorado = false;
              if (receivingPhoneId && D.usePostgres && D.pgPool && (process.env.NYROH_FLUXO_CONTAS || '').trim() === 'true') {
                try {
                  await registrarEventoPorNumeroMeta(D.pgPool, receivingPhoneId);
                  const vinculo = await contaDoNumeroMeta(D.pgPool, receivingPhoneId);
                  numeroIgnorado = Boolean(vinculo?.ignorado);
                  if (!vinculo) console.warn(`[webhook] número ${receivingPhoneId} não está cadastrado em nenhuma conta da FluxoAPI.`);
                  if (numeroIgnorado) console.info(`[webhook] número ${receivingPhoneId} marcado como "não usar": mensagem não entra no CRM.`);
                } catch (err: any) {
                  console.error('[webhook] falha ao consultar o cadastro do número:', err?.message);
                }
              }
              // Status de entrega (sent, delivered, read, failed)
              if (val.statuses && Array.isArray(val.statuses)) {
                for (const s of val.statuses) {
                  eventType = 'status_update';
                  summary = `Status mensagem: ${s.status} (${s.recipient_id || ''})`;
                  await D.processDeliveryStatusUpdate({
                    phone: s.recipient_id,
                    status: s.status as any,
                    messageId: s.id,
                    error: Array.isArray(s.errors) ? s.errors[0] : undefined
                  });
                }
              }

              // Mensagem recebida do cliente
              if (val.messages && Array.isArray(val.messages) && !numeroIgnorado) {
                for (const m of val.messages) {
                  eventType = 'message_received';
                  let textBody = m.text?.body || '';
                  const senderName = val.contacts?.[0]?.profile?.name;
                  let isAudio = false;
                  let audioUrl: string | undefined = undefined;
                  let mediaType: 'audio' | 'image' | 'document' | undefined = undefined;
                  let mediaUrl: string | undefined = undefined;
                  let mediaName: string | undefined = undefined;

                  // Mídia da Meta: vem só com o ID. Baixa AGORA com o token da conta dona do número e guarda cópia própria.
                  const mediaId = (m.audio?.id || m.document?.id || m.image?.id || m.video?.id) as string | undefined;
                  const metaMediaMime = (m.audio?.mime_type || m.document?.mime_type || m.image?.mime_type || m.video?.mime_type) as string | undefined;
                  const mediaFallbackExt = m.type === 'audio' || m.audio ? 'ogg' : m.type === 'image' || m.image ? 'jpg' : m.type === 'video' || m.video ? 'mp4' : 'bin';
                  let storedMetaMedia: string | undefined;
                  if (mediaId) {
                    const dl = await D.metaDownloadMedia(mediaId, receivingPhoneId);
                    if (dl.success && dl.buffer) {
                      const saved = await D.saveMediaBuffer(dl.buffer, { mime: metaMediaMime || dl.contentType, filename: m.document?.filename, fallbackExt: mediaFallbackExt, scope: 'inbound' });
                      storedMetaMedia = saved.relativeUrl;
                    } else {
                      console.warn('[Meta Media Download] não baixou mídia:', dl.error);
                    }
                  }

                  // Formato Meta direto: texto de apoio e tipo de mídia
                  if (m.type === 'audio' || m.audio) {
                    isAudio = true;
                    mediaType = 'audio';
                    audioUrl = storedMetaMedia;
                    mediaUrl = storedMetaMedia;
                    if (!textBody) textBody = '🎤 Mensagem de áudio recebida';
                  } else if (m.type === 'document' || m.document) {
                    mediaType = 'document';
                    mediaName = m.document?.filename || 'documento.pdf';
                    mediaUrl = storedMetaMedia;
                    if (!textBody) textBody = m.document?.caption || `[Arquivo: ${mediaName}]`;
                  } else if (m.type === 'image' || m.image) {
                    mediaType = 'image';
                    mediaName = 'imagem.jpg';
                    mediaUrl = storedMetaMedia;
                    if (!textBody) textBody = m.image?.caption || '[Imagem recebida]';
                  } else if (!textBody) {
                    textBody = m.type ? `[Anexo: ${m.type}]` : 'Mensagem recebida';
                  }

                  const processed = await D.processIncomingWhatsAppMessage({
                    phone: m.from,
                    text: textBody,
                    senderName,
                    messageId: m.id,
                    timestamp: m.timestamp,
                    isAudio,
                    audioUrl,
                    mediaType,
                    mediaUrl,
                    mediaName
                  });

                  if (receivingPhoneId && processed?.targetId) {
                    await D.setLeadMetaRoute(String(processed.targetId), receivingPhoneId).catch(() => {});
                  }

                  summary = `Mensagem de ${m.from} (${processed?.targetName || 'Lead'}): "${textBody.substring(0, 35)}"`;
                }
              }
            }
          }
        }
      }
    }

    // ========================================================================
    // 2. Formato Oficial FluxoAPI (type: 'message.received') — §A9
    //    Reabre a janela de 24h. Mídia: baixar JÁ pelo data.media.download_path (§A6).
    // ========================================================================
    else if ((event.type === 'message.received' || event.event === 'message.received') && event.data) {
      const msgData = event.data;
      const media = msgData.media || null;
      const kind = String(msgData.type || 'text');
      const messageId = msgData.message_id || msgData.id;
      const mediaType = classifyFluxoMedia(kind, media);

      if (msgData.sent_from_phone === true) {
        // Defesa: se algum dia o eco do celular vier como "received", NUNCA tratar como mensagem do cliente
        eventType = 'message_sent_from_phone';
        const toPhone = String(msgData.to || msgData.from || '').replace(/\D/g, '');
        await D.processOutboundPhoneMessage({
          phone: toPhone,
          text: String(msgData.text || media?.caption || ''),
          messageId,
          conversationId: msgData.conversation_id,
          eventTimestamp: event.created_at,
          mediaType,
          mediaName: media?.filename || undefined,
          mediaMime: media?.mime_type,
          mediaDownloadPath: media?.download_path || undefined
        });
        summary = `Vendedor respondeu pelo celular para ${toPhone}`;
      } else {
        eventType = 'message_received';
        const phone = String(msgData.from || '').replace('@s.whatsapp.net', '');
        const senderName = msgData.pushName || msgData.contact_name || msgData.name || undefined;
        const caption = String(msgData.text || media?.caption || '').trim();
        let textBody = caption;

        if (kind === 'interactive' || kind === 'button') {
          const btnTitle = msgData.reply?.title || msgData.text || 'Opção selecionada';
          textBody = `🔘 ${btnTitle}`;
        } else if (kind === 'reaction') {
          textBody = `Reagiu com ${caption || '👍'}`;
        } else if (kind === 'location') {
          textBody = `📍 Localização compartilhada${caption ? `: ${caption}` : ''}`;
        } else if (kind === 'contacts') {
          textBody = '👤 Contato compartilhado';
        } else if (kind === 'sticker' && !textBody) {
          textBody = '[Figurinha]';
        } else if (mediaType === 'video' && !textBody) {
          textBody = '[Vídeo recebido]';
        } else if (mediaType === 'image' && !textBody) {
          textBody = '[Imagem recebida]';
        }

        const mediaName = media?.filename
          || (mediaType === 'image' ? 'imagem.jpg' : mediaType === 'video' ? 'video.mp4' : mediaType === 'document' ? 'documento.pdf' : undefined);

        const processed = await D.processIncomingWhatsAppMessage({
          phone,
          text: textBody,
          senderName,
          messageId,
          eventTimestamp: event.created_at,
          optOutPorBotao: optOutPorBotaoDoWebhook(kind, msgData.reply),
          conversationId: msgData.conversation_id,
          isAudio: mediaType === 'audio',
          mediaType,
          mediaName,
          mediaMime: media?.mime_type,
          mediaDownloadPath: media?.download_path || undefined,
          // mídia enviada por link público (sem download_path): usa o próprio link
          mediaUrl: !media?.download_path && media?.link ? media.link : undefined,
          audioUrl: mediaType === 'audio' && !media?.download_path && media?.link ? media.link : undefined
        });

        summary = `FluxoAPI Mensagem de ${phone} (${processed?.targetName || 'Lead'}): "${(textBody || '[mídia]').substring(0, 35)}"${processed?.duplicate ? ' [duplicada ignorada]' : ''}`;
      }
    }

    // ========================================================================
    // 2.1 Coexistência FluxoAPI: Mensagem enviada pelo celular do vendedor (message.sent_from_phone)
    //     Só chega em instância com mode:"coexistence". NÃO reabre a janela de 24h.
    // ========================================================================
    else if ((event.type === 'message.sent_from_phone' || event.event === 'message.sent_from_phone') && event.data) {
      const msgData = event.data;
      const media = msgData.media || null;
      eventType = 'message_sent_from_phone';
      const phone = String(msgData.to || '').replace(/\D/g, '');
      const textBody = String(msgData.text || media?.caption || '').trim();
      const messageId = msgData.message_id || msgData.id;

      await D.processOutboundPhoneMessage({
        phone,
        text: textBody,
        messageId,
        conversationId: msgData.conversation_id,
        eventTimestamp: event.created_at,
        mediaType: classifyFluxoMedia(String(msgData.type || 'text'), media),
        mediaName: media?.filename || undefined,
        mediaMime: media?.mime_type,
        mediaDownloadPath: media?.download_path || undefined
      });

      summary = `Vendedor respondeu pelo celular para ${phone}: "${(textBody || '[mídia]').substring(0, 35)}"`;
    }

    // ========================================================================
    // 2.2 Processamento de Webhooks no Padrão Evolution API / Legado
    // ========================================================================
    else if (event.event === 'messages.upsert' && event.data) {
      const msgData = event.data;
      const isFromMe = !!msgData.key?.fromMe;
      if (!isFromMe) {
        eventType = 'message_received';
        const remoteJid = String(msgData.key?.remoteJid || '');
        const phone = remoteJid.replace('@s.whatsapp.net', '');
        let textBody = 
          msgData.message?.conversation ||
          msgData.message?.extendedTextMessage?.text ||
          msgData.message?.imageMessage?.caption ||
          msgData.message?.documentMessage?.caption ||
          '';
        const senderName = msgData.pushName;
        const messageId = msgData.key?.id;

        let isAudio = false;
        let audioUrl: string | undefined = undefined;
        let mediaType: 'audio' | 'image' | 'document' | undefined = undefined;
        let mediaUrl: string | undefined = undefined;
        let mediaName: string | undefined = undefined;

        if (msgData.message?.audioMessage) {
          isAudio = true;
          mediaType = 'audio';
          if (!textBody) textBody = '🎤 Mensagem de áudio recebida';
          if (msgData.message?.audioMessage?.url) {
            mediaUrl = msgData.message.audioMessage.url;
            audioUrl = mediaUrl;
          }
        } else if (msgData.message?.documentMessage) {
          mediaType = 'document';
          mediaName = msgData.message.documentMessage.fileName || 'documento.pdf';
          if (!textBody) textBody = `[Arquivo: ${mediaName}]`;
          if (msgData.message?.documentMessage?.url) {
            mediaUrl = msgData.message.documentMessage.url;
          }
        } else if (msgData.message?.imageMessage) {
          mediaType = 'image';
          if (!textBody) textBody = '[Imagem recebida]';
          if (msgData.message?.imageMessage?.url) {
            mediaUrl = msgData.message.imageMessage.url;
          }
        } else if (!textBody) {
          textBody = 'Mensagem de WhatsApp recebida';
        }

        const processed = await D.processIncomingWhatsAppMessage({
          phone,
          text: textBody,
          senderName,
          messageId,
          isAudio,
          audioUrl,
          mediaType,
          mediaUrl,
          mediaName
        });

        summary = `FluxoAPI Mensagem de ${phone} (${processed?.targetName || 'Lead'}): "${textBody.substring(0, 35)}"`;
      }
    }

    // ========================================================================
    // 3. Formato Oficial FluxoAPI (type: 'message.status') — §A9
    //    O estado só AVANÇA por rank; id desconhecido NÃO altera nenhuma mensagem.
    // ========================================================================
    else if ((event.type === 'message.status' || event.event === 'message.status') && event.data) {
      const statusData = event.data;
      const statusVal = statusData.status || 'unknown';
      const msgId = statusData.message_id || statusData.id;
      const errorObj = statusData.error;

      eventType = 'message.status';
      summary = `Status oficial Meta: ${statusVal} (msg: ${msgId || 'desconhecida'})${
        errorObj ? ` - Erro ${errorObj.code || ''}: ${errorObj.message || ''}` : ''
      }`;

      if (msgId) {
        const r = await D.applyMessageStatus({
          messageId: msgId,
          status: statusVal,
          rank: typeof statusData.rank === 'number' ? statusData.rank : undefined,
          error: errorObj,
          at: statusData.at
        });
        if (!r.matched) summary += ' [aguardando a mensagem ser gravada]';
        else if (!r.applied) summary += ' [ignorado: rank menor ou igual ao atual]';
      }
    }

    // ========================================================================
    // 3.1 Saúde do número (qualidade/limite) e vencimento de acesso — avisos antes de virar punição
    // ========================================================================
    else if (event.type === 'instance.status_changed' && event.data) {
      eventType = 'instance.status_changed';
      const d = event.data;
      instanceHealth.quality = d.quality ?? instanceHealth.quality;
      instanceHealth.messagingLimit24h = d.messaging_limit_24h ?? instanceHealth.messagingLimit24h;
      instanceHealth.field = d.field ?? instanceHealth.field;
      instanceHealth.updatedAt = new Date().toISOString();
      summary = `Número: qualidade ${d.quality || '—'}, limite 24h ${d.messaging_limit_24h ?? '—'}`;
      await salvarSaudeFluxo(event.instance_id, { qualidade: d.quality ?? null, limite24h: d.messaging_limit_24h ?? null });
      D.broadcastSSE('INSTANCE_STATUS', { ...instanceHealth }, { broadcastAll: true });
      if (d.quality === 'red' || d.quality === 'yellow') {
        console.warn(`⚠️ [FluxoAPI] Qualidade do número caiu para ${String(d.quality).toUpperCase()} — a Meta reduz o limite diário e pode desativar o número. Reduza os disparos.`);
      }
    }
    else if (event.type === 'instance.access_expiring' && event.data) {
      eventType = 'instance.access_expiring';
      instanceHealth.accessDaysLeft = event.data.days_left;
      instanceHealth.updatedAt = new Date().toISOString();
      summary = `Acesso do número vence em ${event.data.days_left} dia(s) — reconecte pelo painel da FluxoAPI`;
      await salvarSaudeFluxo(event.instance_id, { diasAcesso: event.data.days_left ?? null });
      D.broadcastSSE('INSTANCE_ACCESS_EXPIRING', { ...instanceHealth }, { broadcastAll: true });
      console.warn(`⚠️ [FluxoAPI] ${summary}`);
    }

    // ========================================================================
    // 4. Formato Direto de Mensagem / Status
    // ========================================================================
    else if (event.messages && Array.isArray(event.messages) && event.messages[0]) {
      const m = event.messages[0];
      eventType = 'message_received';
      const textBody = m.text?.body || m.body || m.text || 'Mensagem recebida';
      const processed = await D.processIncomingWhatsAppMessage({
        phone: m.from || m.phone,
        text: textBody,
        senderName: m.senderName || m.name,
        messageId: m.id
      });
      summary = `Mensagem de ${m.from || m.phone}: "${textBody.substring(0, 30)}"`;
    } 
    else if (event.statuses && Array.isArray(event.statuses) && event.statuses[0]) {
      const s = event.statuses[0];
      eventType = 'status_update';
      summary = `Status: ${s.status} (${s.recipient_id || ''})`;
      await D.processDeliveryStatusUpdate({
        phone: s.recipient_id || s.phone,
        status: s.status as any,
        messageId: s.id
      });
    }

    // Adiciona evento na lista de auditoria de webhooks
    D.lastFluxoWebhookEvents.unshift({
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      receivedAt: new Date().toLocaleTimeString('pt-BR'),
      type: eventType,
      summary,
      payload: event
    });

    if (D.lastFluxoWebhookEvents.length > 60) {
      D.lastFluxoWebhookEvents.pop();
    }
  } catch (err: any) {
    // Falha TRANSITÓRIA (banco fora, rede, download momentâneo): RELANÇA para o BullMQ reprocessar
    // (attempts: 3 + backoff) ou para o retry em memória. Antes o erro era engolido e a mensagem se perdia calada.
    const msg = String(err?.message || err);
    const transient =
      err instanceof D.TransientProcessingError ||
      /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|Connection terminated|terminating connection|too many clients|timeout exceeded/i.test(msg);
    if (transient) {
      console.error(`[Webhook Worker] Falha TRANSITÓRIA (será reprocessado): ${msg}`);
      throw err;
    }
    // Erro permanente (payload que nunca vai funcionar): registra e descarta, senão ficaria em laço.
    console.error('[Webhook Worker] Erro PERMANENTE ao processar evento (descartado):', err);
    D.lastFluxoWebhookEvents.unshift({
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      receivedAt: new Date().toLocaleTimeString('pt-BR'),
      type: 'processing_error',
      summary: `Erro ao processar: ${msg.substring(0, 160)}`,
      payload: event
    });
    if (D.lastFluxoWebhookEvents.length > 60) D.lastFluxoWebhookEvents.pop();
  }
}


/** Contas da FluxoAPI ativas: flag ligada e banco disponível. */
function contasFluxoAtivas(): boolean {
  return (process.env.NYROH_FLUXO_CONTAS || '').trim() === 'true' && Boolean(D.usePostgres && D.pgPool);
}

/** Saúde por número. Falha de banco só vira log: o evento já foi aceito pela assinatura. */
async function salvarSaudeFluxo(instanceId: string | undefined, saude: SaudeInstancia): Promise<void> {
  if (!instanceId || !contasFluxoAtivas()) return;
  try {
    await atualizarSaudeInstancia(D.pgPool, instanceId, saude);
  } catch (err: any) {
    console.error('[fluxo] não consegui salvar a saúde do número:', err?.message);
  }
}

/** Log do evento aceito, por número (aparece na tela de Contas). Falha de banco não derruba o webhook. */
async function registrarLogFluxo(eventId: string, event: any): Promise<void> {
  if (!contasFluxoAtivas()) return;
  try {
    const d = event?.data || {};
    const resumo =
      event?.type === 'message.received' ? `mensagem de ${d.from || '?'}`
      : event?.type === 'message.sent_from_phone' ? `resposta pelo celular para ${d.to || '?'}`
      : event?.type === 'message.status' ? `status ${d.status || '?'}`
      : event?.type === 'instance.status_changed' ? `qualidade ${d.quality || '?'}`
      : event?.type === 'instance.access_expiring' ? `acesso vence em ${d.days_left ?? '?'} dia(s)`
      : null;
    await registrarEventoFluxo(D.pgPool, {
      eventId,
      instanceId: typeof event?.instance_id === 'string' ? event.instance_id : null,
      tipo: String(event?.type || 'desconhecido'),
      resumo,
    });
  } catch (err: any) {
    console.error('[fluxo] não consegui registrar o evento no log:', err?.message);
  }
}

/**
 * Valida a assinatura da FluxoAPI. Ordem: segredo do próprio número (instance_id do evento),
 * depois o do ambiente e os das contas. Cada número tem o seu segredo na FluxoAPI.
 */
async function validarAssinaturaFluxo(rawBody: string, headers: any, instanceId?: string): Promise<{ isValid: boolean; reason?: string; contaId?: string }> {
  const candidatos: Array<{ contaId?: string; segredo: string }> = [];
  if (instanceId && contasFluxoAtivas()) {
    try {
      const segredoNumero = await segredoWebhookDaInstancia(D.pgPool, instanceId);
      if (segredoNumero) candidatos.push({ segredo: segredoNumero });
    } catch (err: any) {
      console.error('[webhook] não consegui ler o segredo do número:', err?.message);
    }
  }
  if ((process.env.FLUXO_WEBHOOK_SECRET || '').trim()) {
    candidatos.push({ segredo: (process.env.FLUXO_WEBHOOK_SECRET || '').trim() });
  }
  if (contasFluxoAtivas()) {
    try {
      candidatos.push(...(await segredosWebhookFluxo(D.pgPool)));
    } catch (err: any) {
      console.error('[webhook] não consegui ler os segredos das contas:', err?.message);
    }
  }
  if (!candidatos.length) {
    return D.verifyFluxoWebhook(rawBody, headers);
  }
  let ultimo: { isValid: boolean; reason?: string } = { isValid: false, reason: 'Nenhum segredo de webhook bate com a assinatura.' };
  for (const c of candidatos) {
    const r = D.verifyFluxoWebhook(rawBody, headers, c.segredo);
    if (r.isValid) return { isValid: true, contaId: c.contaId };
    ultimo = r;
  }
  return ultimo;
}

export function registrarRotasWebhooks(app: Express): void {
  app.get(['/api/v1/webhook', '/api/webhooks/fluxo', '/api/webhooks/meta', '/api/webhook/whatsapp', '/webhook'], (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = (D.memoryMetaConfig.verifyToken || process.env.META_VERIFY_TOKEN || '').trim();

    if (mode === 'subscribe' && expectedToken && token === expectedToken) {
      console.log('[Meta Webhook Verified Successfully]: hub.challenge aceito pela Meta.');
      return res.status(200).send(challenge);
    }

    console.warn('[Meta Webhook Verification Failed]: verify_token inválido', { mode, token, expectedToken });
    return res.status(403).send('Forbidden: Token de verificação inválido.');
  });


  // POST WEBHOOK META & FLUXO (Recebimento e conexão de eventos oficiais em tempo real - Fast Receiver Pattern via BullMQ / Redis)
  // Ordem: (1) banco pronto? → (2) assinatura → (3) dedup → (4) enfileira → (5) responde 2xx.
  // Só responde 2xx DEPOIS de enfileirar: um evento aceito nunca se perde; se o Redis/DB falhar a Fluxo reentrega.
  app.post(['/api/v1/webhook', '/api/webhooks/fluxo', '/api/webhooks/meta', '/api/webhook/whatsapp', '/webhook'], D.requireDatabaseReady, async (req, res) => {
    const event = req.body || {};
    const rawBody = (req as any).rawBody || JSON.stringify(event);

    // Assinatura HMAC (§A9): HMAC-SHA256(whsec_…, `${timestamp}\n${corpo bruto}`)
    const metaSig = req.headers['x-hub-signature-256'];
    // FluxoAPI: a assinatura diz de QUAL conta veio o evento. Testa o segredo de cada conta (e o do ambiente)
    // até um bater. Assim não confiamos em nenhum campo do corpo antes de validar.
    const authCheck = metaSig
      ? D.verifyMetaSignature(rawBody, String(metaSig))
      : await validarAssinaturaFluxo(rawBody, req.headers as any, typeof event.instance_id === 'string' ? event.instance_id : undefined);
    if (!authCheck.isValid) {
      console.warn('[Webhook Auth Failed]:', authCheck.reason);
      return res.status(401).json({ error: 'Unauthorized: Assinatura do webhook inválida.', hint: authCheck.reason });
    }

    const eventId = String(
      req.headers['x-fluxo-event-id'] ||
      req.headers['x-event-id'] ||
      event.id ||
      `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    );

    if (isEventDuplicate(eventId)) {
      return res.status(200).json({
        status: 'already_processed',
        event_id: eventId,
        accepted_at: new Date().toISOString()
      } satisfies RespostaWebhookJaProcessado);
    }

    inFlightWebhookEventIds.add(eventId);
    try {
      await D.enqueueIncomingWebhook({
        rawPayload: event,
        headers: req.headers,
        receivedAt: Date.now(),
        source: (req.originalUrl && req.originalUrl.includes('fluxo')) ? 'fluxo' : 'meta'
      });
      processedWebhookEventIds.set(eventId, Date.now());
      if (!metaSig) await registrarLogFluxo(eventId, event);
    } catch (err: any) {
      console.error('[Fast-Receiver Enqueue Error]:', err?.message || err);
      // 5xx → a FluxoAPI reentrega (0s, 30s, 2min, 10min, 1h, 6h, 24h)
      return res.status(503).json({ error: 'enqueue_failed', event_id: eventId });
    } finally {
      inFlightWebhookEventIds.delete(eventId);
    }

    return res.status(200).json({
      status: 'received',
      received: true,
      event_id: eventId,
      accepted_at: new Date().toISOString()
    } satisfies RespostaWebhookRecebido);
  });


  // Endpoint dedicado para teste de recebimento de webhook
  app.post('/api/webhooks/simulate-incoming', async (req: any, res) => {
    const { phone, text, senderName, leadId } = req.body;
    const targetPhone = phone || '+55 11 98821-6073';
    const targetText = text || 'Olá! Recebi sua mensagem sobre o novo site. Achei excelente! Como funciona para contratar?';

    const result = await D.processIncomingWhatsAppMessage({
      phone: targetPhone,
      text: targetText,
      senderName: senderName || 'Cliente em Potencial (Lead Teste)',
      messageId: `msg_test_${Date.now()}`
    });

    D.lastFluxoWebhookEvents.unshift({
      id: `evt_sim_${Date.now()}`,
      receivedAt: new Date().toLocaleTimeString('pt-BR'),
      type: 'message_received',
      summary: `[Simulação Webhook] Mensagem de ${targetPhone}: "${targetText.substring(0, 35)}..."`,
      payload: { phone: targetPhone, text: targetText, senderName, result }
    });

    return res.json({
      success: true,
      message: 'Mensagem simulada via webhook processada com sucesso!',
      data: result
    } satisfies RespostaSimulacaoWebhook);
  });
}
