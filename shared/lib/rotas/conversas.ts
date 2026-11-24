/**
 * B5 (item 4.1 e): conversas (caixa de entrada, histórico, envio, janela, presença, leitura) extraídos de server.ts.
 */
import type { Express } from 'express';

import { uxSchemaOn } from '../uxRoutes.js';
import { isUserAdmin } from '../serverAuth.js';
import { isWindowOpen } from '../windowUtil.js';
import { resolveManualInterest } from '../leadIntent.js';
import { shouldApplyStatus, statusRank } from '../fluxoStatus.js';
import { buildFluxoAudioMedia, isFluxoAudioVoiceEnabled, uploadFluxoAudioMedia } from '../fluxoAudio.js';
import { buildTemplatePayload } from '../fluxoTemplate.js';
import { describeFluxoError } from '../fluxoErrors.js';
import { executeFluxoRequest, fluxoInstancePath, prepareOutboundMedia } from '../fluxoClient.js';
import { formatAndValidateE164Phone, normalizeE164Phone } from '../phone.js';
import { getMetaProvider, metaMarkRead } from '../metaClient.js';
import type { InboxConversation, LeadChatMessage } from '../../types.js';
import type { TemplateValues } from '../fluxoTemplate.js';
import type { RespostaBuscaMensagens, RespostaEnviarMensagem, RespostaInbox, RespostaJanelaLead, RespostaLeituraMarcada, RespostaLeituraNaoMarcada, RespostaMensagensLead, RespostaPresenca, RespostaRespostaSimulada, StatusMensagemEnviada } from '../../contracts/rotas.js';
export interface DependenciasConversas {
  readonly applyPendingStatus: any;
  readonly broadcastPresenceIfChanged: any;
  readonly broadcastSSE: any;
  readonly broadcastSocketEvent: any;
  readonly extractRemoteMessageId: any;
  readonly findLeadTarget: any;
  readonly getLeadMetaRoute: any;
  readonly getTemplateDefinition: any;
  readonly inFlightClientSends: Set<string>|Map<string, any>|any;
  readonly lastReadMarkAt: any;
  readonly memoryCampaignLeadsMap: Map<string, any>;
  readonly memoryFluxoConfig: any;
  readonly memoryLeadMessagesMap: any;
  readonly memoryLeadsMap: Map<string, any>;
  readonly metaToFluxoResult: any;
  readonly pgPool: any;
  readonly presenceByLead: any;
  readonly presenceSnapshot: any;
  readonly realCaption: any;
  readonly requireDatabaseReady: any;
  readonly resolveLeadWindowExpiry: any;
  readonly sendBodyViaMeta: any;
  readonly usePostgres: boolean;
}

let D: DependenciasConversas;

export function configurarConversas(deps: DependenciasConversas): void {
  D = deps;
}

export function registrarConversas(app: Express): void {
  // 1. Get all leads with call stats & salesperson info (optionally filtered by salesperson)
  /**
   * GET /api/inbox — a caixa de entrada do atendimento.
   *
   * Antes a tela de chat usava a lista inteira de leads (`/api/leads`), sem ordem de conversa:
   * quem tinha acabado de escrever podia estar na posição 3.000, não havia contador de não
   * lidas e uma conversa nova só aparecia recarregando tudo.
   *
   * Aqui vêm só os leads COM conversa, do mais recente para o mais antigo, em páginas.
   * `?cursor=<ISO>` traz a página seguinte; `?q=` busca por nome ou telefone;
   * `?filter=unread|waiting` filtra não lidas / sem resposta nossa.
   */
  app.get('/api/inbox', async (req: any, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const cursor = String(req.query.cursor || '').trim();
    const q = String(req.query.q || '').trim();
    const filter = String(req.query.filter || '').trim();

    // Mesma regra de carteira do resto do sistema: vendedor só vê o que é dele.
    let ownerFilter: string | null = null;
    if (!isUserAdmin(req.user)) {
      const own = req.user?.salespersonId;
      if (!own) return res.json({ conversations: [], nextCursor: null, hasMore: false } satisfies RespostaInbox);
      ownerFilter = own;
    } else if (req.query.salespersonId && req.query.salespersonId !== 'ALL') {
      ownerFilter = String(req.query.salespersonId);
    }

    if (!D.usePostgres || !D.pgPool) {
      const all = Array.from(D.memoryLeadsMap.values())
        .filter(l => (D.memoryLeadMessagesMap.get(l.id) || []).length > 0)
        .filter(l => !ownerFilter || (l as any).salespersonId === ownerFilter)
        .sort((a, b) => String((b as any).lastMessageAt || '').localeCompare(String((a as any).lastMessageAt || '')));
      // Lacuna conhecida (modo sem banco): aqui vão Leads sem lastMessageAt/unreadCount, que o InboxConversation pede.
      // Não mudei o comportamento nesta etapa. Produção usa Postgres, que devolve os campos.
      return res.json({ conversations: all.slice(0, limit) as InboxConversation[], nextCursor: null, hasMore: all.length > limit } satisfies RespostaInbox);
    }

    try {
      const params: any[] = [];
      const where: string[] = ['l.last_message_at IS NOT NULL'];
      if (uxSchemaOn()) where.push('l.blocked_at IS NULL'); // bloqueados saem da caixa de entrada

      if (ownerFilter) {
        params.push(ownerFilter);
        where.push(`l.salesperson_id = $${params.length}`);
      }
      if (cursor) {
        params.push(cursor);
        where.push(`l.last_message_at < $${params.length}::timestamptz`);
      }
      if (q) {
        params.push(`%${q}%`);
        params.push(`%${q.replace(/\D/g, '')}%`);
        where.push(`(l.name ILIKE $${params.length - 1} OR l.phone_number ILIKE $${params.length})`);
      }
      if (filter === 'unread') where.push('COALESCE(l.unread_count, 0) > 0');
      if (filter === 'open') where.push('l.resolved_at IS NULL');
      if (filter === 'resolved') where.push('l.resolved_at IS NOT NULL');

      params.push(limit + 1); // +1 só para saber se existe próxima página

      const sql = `
        SELECT l.id, l.name, l.phone_number AS "phoneNumber", l.column_status AS "columnStatus",
               l.sub_status AS "subStatus", l.niche, l.public_url AS "publicUrl",
               l.salesperson_id AS "salespersonId", l.salesperson_name AS "salespersonName",
               l.last_message_at AS "lastMessageAt", COALESCE(l.unread_count, 0) AS "unreadCount",
               l.window_expires_at AS "windowExpiresAt", l.whatsapp_replied AS "whatsappReplied",
               l.resolved_at AS "resolvedAt",
               m.text AS "lastMessageText", m.sender AS "lastMessageSender",
               m.status AS "lastMessageStatus", m.media_type AS "lastMessageMediaType",
               m.is_audio AS "lastMessageIsAudio"
          FROM leads l
          LEFT JOIN LATERAL (
            SELECT text, sender, status, media_type, is_audio
              FROM lead_messages
             WHERE lead_id = l.id
             ORDER BY timestamp DESC
             LIMIT 1
          ) m ON TRUE
         WHERE ${where.join(' AND ')}
           ${filter === 'waiting' ? "AND m.sender = 'lead'" : ''}
         ORDER BY l.last_message_at DESC
         LIMIT $${params.length}
      `;

      const r = await D.pgPool.query(sql, params);
      const rows = r.rows;
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page[page.length - 1];

      return res.json({
        conversations: page,
        nextCursor: hasMore && last?.lastMessageAt ? new Date(last.lastMessageAt).toISOString() : null,
        hasMore
      } satisfies RespostaInbox);
    } catch (err: any) {
      console.error('[Inbox] Erro ao montar a caixa de entrada:', err?.message || err);
      return res.status(500).json({ error: 'Erro ao carregar a caixa de entrada.' });
    }
  });

  /**
   * GET /api/messages/search?q=texto — procura dentro do histórico de mensagens.
   *
   * Antes não havia busca nenhuma: para achar "aquele cliente que falou do orçamento" o
   * vendedor abria conversa por conversa. Respeita a carteira: cada um acha só o que é dele.
   */
  app.get('/api/messages/search', async (req: any, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    if (q.length < 2) return res.json({ results: [], query: q } satisfies RespostaBuscaMensagens);

    if (!D.usePostgres || !D.pgPool) {
      const termo = q.toLowerCase();
      const results: any[] = [];
      for (const [leadId, msgs] of D.memoryLeadMessagesMap.entries()) {
        for (const m of msgs) {
          if (String(m.text || '').toLowerCase().includes(termo)) {
            results.push({ leadId, leadName: D.memoryLeadsMap.get(leadId)?.name || leadId, messageId: m.id, text: m.text, sender: m.sender, timestamp: m.timestamp });
            if (results.length >= limit) break;
          }
        }
        if (results.length >= limit) break;
      }
      return res.json({ results, query: q } satisfies RespostaBuscaMensagens);
    }

    const params: any[] = [`%${q}%`];
    let ownerClause = '';
    if (!isUserAdmin(req.user)) {
      const own = req.user?.salespersonId;
      if (!own) return res.json({ results: [], query: q } satisfies RespostaBuscaMensagens);
      params.push(own);
      ownerClause = ` AND l.salesperson_id = $${params.length}`;
    }
    params.push(limit);

    try {
      const r = await D.pgPool.query(
        `SELECT m.id AS "messageId", m.lead_id AS "leadId", l.name AS "leadName",
                l.phone_number AS "phoneNumber", m.text, m.sender,
                to_char(m.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp"
           FROM lead_messages m
           JOIN leads l ON l.id = m.lead_id
          WHERE m.text ILIKE $1${ownerClause}
          ORDER BY m.timestamp DESC
          LIMIT $${params.length}`,
        params
      );
      return res.json({ results: r.rows, query: q } satisfies RespostaBuscaMensagens);
    } catch (err: any) {
      console.error('[Busca] Erro ao procurar nas mensagens:', err?.message || err);
      return res.status(500).json({ error: 'Erro ao buscar nas mensagens.' });
    }
  });

  // GET /api/leads/:leadId/messages (Histórico de mensagens de WhatsApp com o lead)
  app.get('/api/leads/:leadId/messages', async (req: any, res) => {
    const { leadId } = req.params;
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);
    // `before=<ISO>`: traz o pedaço ANTERIOR da conversa ("carregar mensagens antigas").
    // Antes vinham só as 500 mais recentes e o resto do histórico era inalcançável pela tela.
    const before = String(req.query.before || '').trim();
    let messages: LeadChatMessage[] = [];
    let hasMoreOlder = false;

    if (D.usePostgres && D.pgPool) {
      try {
        const params: any[] = [leadId];
        let beforeClause = '';
        if (before) {
          params.push(before);
          beforeClause = ` AND timestamp < $${params.length}::timestamptz`;
        }
        params.push(limit + 1); // +1 para saber se ainda há mais para trás
        const qRes = await D.pgPool.query(
          `SELECT * FROM (
             SELECT id, lead_id AS "leadId", sender, sender_name AS "senderName", text, template_name AS "templateName",
                    status, COALESCE(status_rank, -1) AS "statusRank", whatsapp_message_id AS "remoteMessageId",
                    conversation_id AS "conversationId", COALESCE(sent_from_phone, FALSE) AS "sentFromPhone",
                    error_code AS "errorCode", error_message AS "errorMessage",
                    is_audio AS "isAudio", audio_url AS "audioUrl", audio_duration AS "audioDuration",
                    media_type AS "mediaType", media_url AS "mediaUrl", media_name AS "mediaName",
                    timestamp AS "ts",
                    -- AT TIME ZONE 'UTC' é obrigatório: sem ele o Postgres renderiza no fuso do
                    -- servidor e o texto sai rotulado como "Z" (UTC) mesmo assim. Num servidor em
                    -- São Paulo, TODA mensagem aparecia 3 horas fora do lugar no chat, e o cursor
                    -- de "carregar mensagens antigas" comparava horários trocados.
                    to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp"
             FROM lead_messages
             WHERE lead_id = $1${beforeClause}
             ORDER BY ts DESC
             LIMIT $${params.length}
           ) t ORDER BY ts ASC`,
          params
        );
        if (qRes.rows.length > limit) {
          hasMoreOlder = true;
          qRes.rows.shift(); // descarta a linha extra (a mais antiga do lote)
        }
        if (qRes.rows.length > 0) {
          messages = qRes.rows.map((r: any) => {
            const { ts, errorCode, errorMessage, ...msg } = r;
            if (msg.status === 'failed' && (errorCode || errorMessage)) {
              msg.error = { code: errorCode || undefined, message: errorMessage || undefined };
            }
            return msg as LeadChatMessage;
          });
        }
      } catch (err: any) {
        console.warn('[PostgreSQL] Erro ao buscar mensagens em lead_messages:', err.message);
      }
    }

    if (messages.length === 0 && !before) {
      messages = (D.memoryLeadMessagesMap.get(leadId) || []).slice(-limit);
    }

    const windowExpiresAt = await D.resolveLeadWindowExpiry(leadId, await D.findLeadTarget(leadId).catch(() => null));

    return res.json({
      success: true,
      leadId,
      total: messages.length,
      windowExpiresAt,
      windowOpen: isWindowOpen(windowExpiresAt),
      // Cursor para "carregar mensagens antigas": o horário da mensagem mais antiga deste lote.
      hasMoreOlder,
      olderCursor: hasMoreOlder && messages.length > 0 ? messages[0].timestamp : null,
      messages
    } satisfies RespostaMensagensLead);
  });

  // GET /api/leads/:leadId/window (a interface usa para avisar "janela fechada — use um modelo")
  app.get('/api/leads/:leadId/window', async (req: any, res) => {
    const { leadId } = req.params;
    const target = await D.findLeadTarget(leadId).catch(() => null);
    const windowExpiresAt = await D.resolveLeadWindowExpiry(leadId, target);
    return res.json({ success: true, leadId, windowExpiresAt, windowOpen: isWindowOpen(windowExpiresAt) } satisfies RespostaJanelaLead);
  });

  // POST /api/leads/:leadId/messages (Enviar mensagem de WhatsApp para o lead)
  //  - AGUARDA a resposta da FluxoAPI: a rota só diz "ok" (202 queued) quando a API aceitou de fato;
  //    qualquer recusa volta como erro com o motivo (code/message/action/request_id), nunca como "enviado" falso.
  //  - `clientMessageId` torna o envio idempotente (duplo clique / retry da rede não duplica no celular do cliente).
  app.post('/api/leads/:leadId/messages', D.requireDatabaseReady, async (req: any, res) => {
    const { leadId } = req.params;
    const {
      text,
      templateName,
      templateLanguage,
      templateVariables,
      templateButtons,
      templateHeaderMediaUrl,
      isAudio,
      senderName,
      audioUrl,
      audioDuration,
      mediaType,
      mediaUrl,
      mediaName,
      phone: bodyPhone,
      clientMessageId
    } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Texto da mensagem é obrigatório.' });
    }

    // --- idempotência por clientMessageId ---------------------------------------------------------
    const clientId = clientMessageId ? String(clientMessageId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : '';
    const messageLocalId = clientId ? `msg_${clientId}` : `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    if (clientId) {
      let existing: any = (D.memoryLeadMessagesMap.get(leadId) || []).find(m => m.id === messageLocalId);
      if (!existing && D.usePostgres && D.pgPool) {
        const r = await D.pgPool.query(
          `SELECT id, status, COALESCE(status_rank, -1) AS "statusRank", whatsapp_message_id AS "remoteMessageId", error_message, error_code FROM lead_messages WHERE id = $1`,
          [messageLocalId]
        );
        if (r.rows.length > 0) existing = { ...r.rows[0], leadId };
      }
      if (existing) {
        return res.status(existing.status === 'failed' ? 422 : 200).json({
          success: existing.status !== 'failed',
          replayed: true,
          status: existing.status,
          remoteMessageId: existing.remoteMessageId,
          message: existing
        });
      }
      if (D.inFlightClientSends.has(messageLocalId)) {
        return res.status(409).json({ success: false, error: { code: 'send_in_progress', message: 'Esta mensagem já está sendo enviada.' } });
      }
      D.inFlightClientSends.add(messageLocalId);
    }

    try {
      // Find lead in CRM leads or campaign leads
      let leadTarget: any = await D.findLeadTarget(leadId);

      const phoneFromId = leadId.startsWith('lead_wa_')
        ? leadId.replace('lead_wa_', '').replace(/\D/g, '')
        : /^\+?\d{10,15}$/.test(leadId)
        ? leadId.replace(/\D/g, '')
        : '';

      const phoneRaw = bodyPhone || leadTarget?.phoneNumber || leadTarget?.phone_number || leadTarget?.phone || phoneFromId;
      const cleanPhone = String(phoneRaw || '').replace(/\D/g, '');

      if (!leadTarget && cleanPhone) {
        leadTarget = {
          id: leadId,
          name: `Lead (${cleanPhone})`,
          phoneNumber: normalizeE164Phone(cleanPhone),
          status: 'EM_NEGOCIACAO',
          createdAt: new Date().toISOString()
        };
        D.memoryLeadsMap.set(leadId, leadTarget);
      }

      const newMessage: LeadChatMessage = {
        id: messageLocalId,
        leadId,
        sender: 'salesperson',
        senderName: senderName || 'Thomas (Admin / Closer)',
        text: text.trim(),
        templateName,
        isAudio: !!isAudio,
        audioDuration: typeof audioDuration === 'number' ? audioDuration : undefined,
        mediaType: mediaType || undefined,
        mediaName: mediaName || undefined,
        status: 'sending',
        statusRank: statusRank('sending'),
        timestamp: new Date().toISOString()
      };

      const fluxoKey = (D.memoryFluxoConfig.apiKey || '').trim();
      const fluxoSecret = (D.memoryFluxoConfig.apiSecret || '').trim();
      const instanceId = (D.memoryFluxoConfig.instanceId || '').trim();

      // ---- 1) PREPARA a mídia ANTES de gravar: o que fica no histórico é a URL, nunca o base64 gigante ----
      const effectiveKind: 'audio' | 'image' | 'document' | 'video' | null = templateName
        ? null
        : (isAudio || mediaType === 'audio') ? 'audio'
        : mediaType === 'image' ? 'image'
        : mediaType === 'video' ? 'video'
        : mediaType === 'document' ? 'document'
        : null;

      let preparedMediaUrl = '';
      let preFailure: ReturnType<typeof describeFluxoError> | null = null;
      if (effectiveKind) {
        const source = effectiveKind === 'audio' ? (audioUrl || mediaUrl) : mediaUrl;
        const defaultName = effectiveKind === 'audio' ? 'voice_note.ogg' : effectiveKind === 'image' ? 'imagem.jpg' : effectiveKind === 'video' ? 'video.mp4' : 'documento.pdf';
        const prepared = await prepareOutboundMedia(source || '', mediaName || defaultName, effectiveKind);
        if (prepared.url) {
          preparedMediaUrl = prepared.url;
          newMessage.mediaUrl = prepared.url;
          newMessage.mediaType = effectiveKind;
          if (effectiveKind === 'audio') {
            newMessage.audioUrl = prepared.url;
            newMessage.isAudio = true;
          }
        } else {
          preFailure = {
            code: 'invalid_input',
            message: prepared.error || 'Não foi possível preparar o arquivo para envio.',
            action: 'Verifique o arquivo (tamanho/formato) e a configuração APP_PUBLIC_URL; depois tente de novo.',
            httpStatus: 422,
            retryable: false
          };
        }
      }

      // ---- 2) GRAVA a mensagem (status "sending") ----
      const currentList = D.memoryLeadMessagesMap.get(leadId) || [];
      currentList.push(newMessage);
      D.memoryLeadMessagesMap.set(leadId, currentList);

      if (D.usePostgres && D.pgPool) {
        try {
          await D.pgPool.query(
            `INSERT INTO lead_messages (id, lead_id, phone_number, sender, sender_name, text, template_name, status, status_rank, is_audio, audio_url, audio_duration, media_type, media_url, media_name, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'sending', -1, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO NOTHING`,
            [
              newMessage.id,
              leadId,
              cleanPhone || null,
              newMessage.sender,
              newMessage.senderName,
              newMessage.text,
              newMessage.templateName || null,
              newMessage.isAudio,
              newMessage.audioUrl || null,
              newMessage.audioDuration || null,
              newMessage.mediaType || null,
              newMessage.mediaUrl || null,
              newMessage.mediaName || null
            ]
          );
        } catch (msgErr: any) {
          console.error('[PostgreSQL] Erro ao salvar mensagem enviada em lead_messages:', msgErr.message);
          return res.status(503).json({
            success: false,
            error: { code: 'database_error', message: 'Não foi possível gravar a mensagem no banco de dados. Nada foi enviado.', action: 'Tente novamente em instantes.' }
          });
        }
      }

      // Marca como FALHA, grava o motivo, avisa todos os desktops e responde com o erro real
      const failMessage = async (info: ReturnType<typeof describeFluxoError>, httpStatusOverride?: number, retryAfterSec?: number) => {
        const errorObj = { code: info.code, message: info.message, action: info.action, requestId: info.requestId };
        newMessage.status = 'failed';
        newMessage.statusRank = statusRank('failed');
        newMessage.error = errorObj;

        if (D.usePostgres && D.pgPool) {
          await D.pgPool.query(
            `UPDATE lead_messages SET status = 'failed', status_rank = 9, error_message = $1, error_code = $2 WHERE id = $3`,
            [info.message, info.code, newMessage.id]
          ).catch((e: any) => console.warn('[PostgreSQL] Erro ao gravar falha de envio:', e.message));
        }

        const payload = { leadId, messageId: newMessage.id, status: 'failed', rank: 9, error: errorObj };
        D.broadcastSSE('MESSAGE_STATUS_UPDATE', payload);
        D.broadcastSocketEvent('message_status_update', payload);
        D.broadcastSSE('NEW_MESSAGE', { leadId, leadName: leadTarget?.name, message: newMessage });

        if (retryAfterSec) res.setHeader('Retry-After', String(Math.ceil(retryAfterSec)));
        return res.status(httpStatusOverride ?? info.httpStatus).json({
          success: false,
          error: { ...errorObj, retryable: info.retryable, windowExpiredAt: info.windowExpiredAt, requiredScope: info.requiredScope, metaCode: info.metaCode },
          message: newMessage
        });
      };

      if (preFailure) return await failMessage(preFailure);

      // ---- 3) PRÉ-REQUISITOS de envio ----
      if (getMetaProvider() !== 'meta') {
        if (!fluxoKey || !fluxoSecret) {
          return await failMessage(describeFluxoError({ code: 'missing_credentials' }));
        }
        if (!instanceId) {
          return await failMessage(describeFluxoError({ code: 'instance_required' }));
        }
      }
      const phoneCheck = formatAndValidateE164Phone(cleanPhone);
      if (!phoneCheck.isValid) {
        return await failMessage({
          code: 'invalid_input',
          message: `Telefone inválido para envio: ${phoneCheck.error || cleanPhone}`,
          action: 'Corrija o telefone do lead (DDD + número).',
          httpStatus: 422,
          retryable: false
        });
      }
      const e164 = phoneCheck.e164;

      // ---- 4) MONTA o corpo conforme o contrato (§A3/§A4) ----
      const idempotencyKey = clientId ? `nyroh:${clientId}` : `${leadId}:${newMessage.id}`;
      let targetPath = '';
      let bodyPayload: any = null;

      if (templateName) {
        const language = String(templateLanguage || 'pt_BR');
        const def = await D.getTemplateDefinition(String(templateName).trim(), language, { instanceId, apiKey: fluxoKey, apiSecret: fluxoSecret });

        if (def && ((def.status && String(def.status).toUpperCase() !== 'APPROVED') || def.sendable === false)) {
          return await failMessage({
            code: 'template_not_found',
            message: `O modelo "${templateName}" não pode ser enviado${def.status && String(def.status).toUpperCase() !== 'APPROVED' ? ` (status ${def.status})` : ''}${def.blockedReason ? `: ${def.blockedReason}` : '.'}`,
            action: 'Aguarde a aprovação da Meta ou escolha outro modelo aprovado.',
            httpStatus: 422,
            retryable: false
          });
        }

        const firstName = String(leadTarget?.name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
        const publicUrl = leadTarget?.publicUrl || leadTarget?.public_url || 'https://nyroh.com.br';
        const sellerFirst = String(senderName || 'Thomas').replace(/\(.*\)/, '').trim().split(/\s+/)[0] || 'Thomas';
        const values: TemplateValues = {
          body: templateVariables && typeof templateVariables === 'object' ? templateVariables : undefined,
          // padrão (compatível com o comportamento antigo): {{1}} nome, {{2}} link do site, {{3}} vendedor
          positional: [firstName, publicUrl, sellerFirst],
          buttons: templateButtons && typeof templateButtons === 'object' ? templateButtons : undefined,
          headerMediaLink: templateHeaderMediaUrl || undefined
        };
        const built = buildTemplatePayload(def, String(templateName).trim(), language, values);
        if (built.missing.length > 0) {
          return await failMessage({
            code: 'invalid_input',
            message: `O modelo "${templateName}" exige valores que não foram informados: ${built.missing.join(', ')}.`,
            action: 'Envie templateVariables / templateButtons / templateHeaderMediaUrl com esses campos.',
            httpStatus: 422,
            retryable: false
          });
        }
        targetPath = fluxoInstancePath('/messages/template', instanceId);
        bodyPayload = { to: e164, template: built.template, idempotency_key: idempotencyKey };
      } else if (effectiveKind === 'audio') {
        targetPath = fluxoInstancePath('/messages', instanceId);
        // Nota de voz: sobe o áudio em /media e envia pelo id com voice:true (por link vira arquivo de áudio).
        let audioMedia: { url: string } | { id: string; voice: boolean } = buildFluxoAudioMedia(preparedMediaUrl, isFluxoAudioVoiceEnabled());
        const audioDataUri = String(audioUrl || mediaUrl || '');
        if (getMetaProvider() !== 'meta' && isFluxoAudioVoiceEnabled() && audioDataUri.startsWith('data:')) {
          const mediaId = await uploadFluxoAudioMedia(audioDataUri, instanceId, fluxoKey, fluxoSecret);
          if (mediaId) audioMedia = { id: mediaId, voice: true };
          else console.warn('[Envio] upload do áudio em /media falhou; enviando por link (chega como arquivo).');
        }
        // Em áudio a Meta NÃO aceita legenda (a FluxoAPI ignora)
        bodyPayload = { to: e164, type: 'audio', media: audioMedia, idempotency_key: idempotencyKey };
      } else if (effectiveKind === 'document') {
        targetPath = fluxoInstancePath('/messages', instanceId);
        const caption = D.realCaption(text);
        bodyPayload = {
          to: e164,
          type: 'document',
          media: { url: preparedMediaUrl, filename: (mediaName || 'documento.pdf').slice(0, 240), ...(caption ? { caption } : {}) },
          idempotency_key: idempotencyKey
        };
      } else if (effectiveKind === 'image' || effectiveKind === 'video') {
        targetPath = fluxoInstancePath('/messages', instanceId);
        const caption = D.realCaption(text);
        bodyPayload = {
          to: e164,
          type: effectiveKind,
          media: { url: preparedMediaUrl, ...(caption ? { caption } : {}) },
          idempotency_key: idempotencyKey
        };
      } else {
        targetPath = fluxoInstancePath('/messages', instanceId);
        bodyPayload = { to: e164, type: 'text', text: { body: text.trim().slice(0, 4096) }, idempotency_key: idempotencyKey };
      }

      // ---- 5) ENVIA e AGUARDA a resposta da FluxoAPI ----
      const fRes = getMetaProvider() === 'meta'
        ? await D.sendBodyViaMeta(bodyPayload, String(req.body?.phoneNumberId || '').trim() || (await D.getLeadMetaRoute(String(leadId))) || undefined)
        : await executeFluxoRequest({
            method: 'POST',
            path: targetPath,
            body: bodyPayload,
            apiKey: fluxoKey,
            apiSecret: fluxoSecret
          });

      if (!fRes.success) {
        const info = describeFluxoError(fRes.error, fRes.status);
        console.warn(`[Envio] FluxoAPI recusou (${info.code}${info.requestId ? `, ${info.requestId}` : ''}): ${info.message}`);
        return await failMessage(info, undefined, fRes.retryAfterSec);
      }

      // ---- 6) 202 Accepted: a mensagem entrou na FILA da FluxoAPI (ainda não é "entregue") ----
      const remoteId = D.extractRemoteMessageId(fRes);
      newMessage.remoteMessageId = remoteId;
      if (shouldApplyStatus({ status: newMessage.status, rank: newMessage.statusRank }, { status: 'queued' })) {
        newMessage.status = 'queued';
        newMessage.statusRank = statusRank('queued');
      }

      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          `UPDATE lead_messages
              SET whatsapp_message_id = COALESCE($1, whatsapp_message_id),
                  status = CASE WHEN COALESCE(status_rank, -1) < 0 THEN 'queued' ELSE status END,
                  status_rank = GREATEST(COALESCE(status_rank, -1), 0)
            WHERE id = $2`,
          [remoteId || null, newMessage.id]
        ).catch((e: any) => console.warn('[PostgreSQL] Erro ao gravar id remoto da mensagem:', e.message));
      }

      // Um webhook `sent`/`delivered` pode ter chegado ANTES de eu gravar o id remoto: aplica agora
      if (remoteId) await D.applyPendingStatus(remoteId);

      const statusPayload = {
        leadId,
        messageId: newMessage.id,
        remoteMessageId: remoteId,
        status: newMessage.status,
        rank: newMessage.statusRank
      };
      D.broadcastSSE('MESSAGE_STATUS_UPDATE', statusPayload);
      D.broadcastSocketEvent('message_status_update', statusPayload);
      D.broadcastSSE('NEW_MESSAGE', { leadId, leadName: leadTarget?.name, message: newMessage });

      const resposta: RespostaEnviarMensagem = {
        success: true,
        status: newMessage.status as StatusMensagemEnviada,
        remoteMessageId: remoteId,
        replayed: fRes.replayed === true,
        billable: (fRes.raw as any)?.billable === true,
        message: newMessage
      };
      return res.status(202).json(resposta);
    } catch (sendErr: any) {
      console.error('[Envio] Erro inesperado:', sendErr);
      return res.status(500).json({
        success: false,
        error: { code: 'internal_error', message: sendErr?.message || 'Erro interno ao enviar a mensagem.' }
      });
    } finally {
      if (clientId) D.inFlightClientSends.delete(messageLocalId);
    }
  });

  app.get('/api/leads/:leadId/presence', (req: any, res) => {
    return res.json({ success: true, leadId: req.params.leadId, users: D.presenceSnapshot(req.params.leadId) } satisfies RespostaPresenca);
  });

  app.post('/api/leads/:leadId/presence', (req: any, res) => {
    const { leadId } = req.params;
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    const before = JSON.stringify(D.presenceSnapshot(leadId));
    if (req.body?.leave) {
      D.presenceByLead.get(leadId)?.delete(user.id);
    } else {
      let m = D.presenceByLead.get(leadId);
      if (!m) D.presenceByLead.set(leadId, (m = new Map()));
      m.set(user.id, { userId: user.id, name: String(user.name || 'Vendedor'), typing: Boolean(req.body?.typing), at: Date.now() });
    }
    D.broadcastPresenceIfChanged(leadId, before);
    return res.json({ success: true, me: user.id, users: D.presenceSnapshot(leadId) } satisfies RespostaPresenca);
  });

  app.post('/api/leads/:leadId/read', async (req: any, res) => {
    const { leadId } = req.params;
    const now = Date.now();

    // Zerar o contador de não lidas é NOSSO, não custa nada à API da Meta: acontece sempre que a
    // conversa é aberta. Antes ficava depois da trava de 20s abaixo, então reabrir a conversa
    // dentro desse intervalo deixava o contador aceso para sempre.
    if (D.usePostgres && D.pgPool) {
      D.pgPool.query(`UPDATE leads SET unread_count = 0 WHERE id = $1`, [leadId]).catch(() => {});
    }

    // no máx. 1 marcação a cada 20s por lead: abrir/fechar conversa não consome o limite da API
    if (now - (D.lastReadMarkAt.get(leadId) || 0) < 20000) return res.json({ success: true, marked: false, reason: 'recent' } satisfies RespostaLeituraMarcada);

    let wamid: string | undefined;
    if (D.usePostgres && D.pgPool) {
      const r = await D.pgPool.query(
        `SELECT whatsapp_message_id FROM lead_messages
          WHERE lead_id = $1 AND sender = 'lead' AND (whatsapp_message_id LIKE 'msg\\_%' OR whatsapp_message_id LIKE 'wamid.%')
          ORDER BY timestamp DESC LIMIT 1`,
        [leadId]
      ).catch(() => null);
      wamid = r?.rows?.[0]?.whatsapp_message_id;
    } else {
      const mem = D.memoryLeadMessagesMap.get(leadId) || [];
      for (let i = mem.length - 1; i >= 0; i--) {
        if (mem[i].sender === 'lead' && mem[i].remoteMessageId && (mem[i].remoteMessageId!.startsWith('msg_') || mem[i].remoteMessageId!.startsWith('wamid.'))) {
          wamid = mem[i].remoteMessageId;
          break;
        }
      }
    }
    if (D.usePostgres && D.pgPool) {
      D.pgPool.query(`UPDATE leads SET unread_count = 0 WHERE id = $1`, [leadId]).catch(() => {});
    }
    if (!wamid) return res.json({ success: true, marked: false, reason: 'no_inbound' } satisfies RespostaLeituraMarcada);
    if (getMetaProvider() !== 'meta' && (!D.memoryFluxoConfig.apiKey || !D.memoryFluxoConfig.apiSecret)) return res.json({ success: true, marked: false, reason: 'not_configured' } satisfies RespostaLeituraMarcada);

    D.lastReadMarkAt.set(leadId, now);
    const fRes = getMetaProvider() === 'meta'
      ? D.metaToFluxoResult(await metaMarkRead(wamid, await D.getLeadMetaRoute(String(leadId))))
      : await executeFluxoRequest({
          method: 'POST',
          path: `/v1/messages/${encodeURIComponent(wamid)}/read`,
          apiKey: D.memoryFluxoConfig.apiKey,
          apiSecret: D.memoryFluxoConfig.apiSecret
        });
    if (!fRes.success) {
      const info = describeFluxoError(fRes.error, fRes.status);
      return res.status(200).json({ success: true, marked: false, reason: info.code, message: info.message } satisfies RespostaLeituraNaoMarcada);
    }
    return res.json({ success: true, marked: true, messageId: wamid } satisfies RespostaLeituraMarcada);
  });

  // POST /api/leads/:leadId/simulate-reply (Simular resposta de lead no WhatsApp em tempo real)
  app.post('/api/leads/:leadId/simulate-reply', async (req: any, res) => {
    const { leadId } = req.params;
    const { text, isInterested = true, isAudio = false, audioDuration = 11, audioUrl } = req.body;

    let leadTarget: any = null;
    if (D.usePostgres && D.pgPool) {
      const lRes = await D.pgPool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
      if (lRes.rows.length > 0) leadTarget = lRes.rows[0];
      else {
        const cRes = await D.pgPool.query('SELECT * FROM campaign_leads WHERE id = $1', [leadId]);
        if (cRes.rows.length > 0) leadTarget = cRes.rows[0];
      }
    } else {
      leadTarget = D.memoryLeadsMap.get(leadId) || D.memoryCampaignLeadsMap.get(leadId);
    }

    const defaultText = isAudio
      ? `🎤 Mensagem de áudio (${audioDuration}s)`
      : (isInterested 
          ? 'Olá! Vi a prévia do novo site que vocês criaram. Ficou muito bacana! Como funciona para colocar no ar e qual o valor?'
          : 'Não temos interesse no momento, por favor não enviar mais mensagens.');

    const replyText = text || defaultText;
    // FASE 1: pedido de descadastro nunca vira interesse (atrás de flag, desligada por padrão).
    const interestedNow = process.env.NYROH_OPTOUT_FORA_DO_FUNIL === 'true'
      ? resolveManualInterest(replyText, !!isInterested)
      : !!isInterested;

    const incomingMessage: LeadChatMessage = {
      id: `msg_in_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      leadId,
      sender: 'lead',
      senderName: leadTarget?.name || 'Lead',
      text: replyText,
      isAudio: !!isAudio,
      audioDuration: isAudio ? audioDuration : undefined,
      audioUrl: audioUrl || undefined,
      status: 'read',
      timestamp: new Date().toISOString()
    };

    const currentList = D.memoryLeadMessagesMap.get(leadId) || [];
    currentList.push(incomingMessage);
    D.memoryLeadMessagesMap.set(leadId, currentList);

    // If it's a campaign lead, update status to INTERESSADO or DESCARTADO
    const cLead = D.memoryCampaignLeadsMap.get(leadId);
    if (cLead) {
      if (interestedNow) {
        cLead.status = 'INTERESSADO';
        cLead.respondedAt = new Date().toISOString();
        cLead.responsePreview = replyText;
      } else {
        cLead.status = 'DESCARTADO';
        cLead.responsePreview = 'Opt-out / Recusou contato';
      }
    }

    // Also if in CRM leads, update column if interested
    const crmLead = D.memoryLeadsMap.get(leadId);
    if (crmLead && interestedNow) {
      crmLead.columnStatus = 'Interessado';
      crmLead.subStatus = 'Em Negociação WhatsApp';
      crmLead.lastCallTag = '🔥 Respondeu no WhatsApp';
    }

    // Broadcast real-time SSE
    D.broadcastSSE('NEW_MESSAGE', {
      leadId,
      leadName: leadTarget?.name,
      message: incomingMessage,
      isReply: true,
      isInterested: interestedNow
    });

    if (interestedNow) {
      D.broadcastSSE('LEAD_HOT_REPLY', {
        leadId,
        leadName: leadTarget?.name,
        replyText
      });
    }

    return res.json({
      success: true,
      message: incomingMessage
    } satisfies RespostaRespostaSimulada);
  });

}
