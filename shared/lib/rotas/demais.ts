import type { Express } from 'express';
import type { LeadChatMessage } from '../../types.js';
import path from 'path';
import { Lead } from '../../types.js';
import { getLeadNiche } from '../niche.js';
import { recuperarFixosDescartados } from '../recuperacaoFixos.js';
import { instanceHealth } from '../rotas/webhooks.js';
import type { RespostaEstatisticasVendedor, RespostaTesteDisparo, RespostaStatusTesteDisparo, RespostaListaLeadsCampanha, RespostaCamposLead, RespostaLigacoesRecentesVendedor, RespostaSementes, RespostaStatusInfraestrutura } from '../../contracts/rotas.js';
import { executeFluxoRequest, fluxoInstancePath } from '../fluxoClient.js';
import { getMetaProvider, metaSendText } from '../metaClient.js';
import { dispatchRpm, planRpm } from '../dispatchRate.js';
import { getQueueSystemStatus } from '../../../server/redisQueue.js';
import { SQL_SELECT_SALESPEOPLE, SQL_INSERT_LEADS, SQL_INSERT_LEAD_MESSAGES, SQL_INSERT_LEADS_2, SQL_UPDATE_CAMPAIGN_LEADS } from './repo/demais.js';


export interface DependenciasDemais {
  readonly broadcastSSE: any;
  readonly buildWhatsAppReadiness: any;
  readonly camposDoLoteParaCopy: any;
  readonly cortarJaContatados: any;
  readonly findLeadByPhoneNumber: any;
  readonly isDatabaseStarting: any;
  readonly lastFluxoWebhookEvents: any;
  readonly logAudit: any;
  readonly memoryCallLogsMap: Map<string, any[]>;
  readonly memoryCampaignLeadsMap: Map<string, any>;
  readonly memoryFluxoConfig: any;
  readonly memoryLeadMessagesMap: any;
  readonly memoryLeadsMap: Map<string, any>;
  readonly memorySalespeopleMap: Map<string, any>;
  readonly metaToFluxoResult: any;
  readonly pgPool: any;
  readonly sendTemplateViaFluxo: any;
  readonly translateMetaErrorCode: any;
  readonly usePostgres: any;
}

let D: DependenciasDemais;

export function configurarDemais(deps: DependenciasDemais): void {
  D = deps;
}

export function registrarDemais(app: Express): void {
  app.post('/api/campaign/test-dispatch', async (req: any, res) => {
    const {
      phoneNumber,
      leadName = 'Lead Teste WhatsApp',
      salespersonId = 'seller-thomas',
      metaTemplateName,
      templateName,
      copyTemplateId,
      dispatchMode = 'official_meta_template', // Por padrão usa o template oficial aprovado na Meta
      messageText,
      variables,
      var1,
      var2,
      var3,
      parameters = [],
      publicUrl = 'https://nyroh.app/preview-empresa-teste',
      website = '',
      niche = 'Geral / Teste',
      customNotes = 'Disparado via Ambiente de Teste de Disparos'
    } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Número de telefone é obrigatório.' });
    }

    // Nome oficial do template aprovado na Meta (sempre escolhido pelo operador)
    const effectiveMetaTemplate = String(metaTemplateName || templateName || '').trim();

    // Limpar telefone e formatar rigorosamente em E.164 (+55...)
    let cleanDigits = String(phoneNumber).replace(/\D/g, '');
    if (cleanDigits.length === 10 || cleanDigits.length === 11) {
      cleanDigits = `55${cleanDigits}`;
    }
    const formattedE164 = `+${cleanDigits}`;

    // Resolver nome do vendedor
    let resolvedSellerName = 'Thomas';
    if (D.usePostgres && D.pgPool) {
      try {
        const spRes = await D.pgPool.query(SQL_SELECT_SALESPEOPLE, [salespersonId]);
        if (spRes.rows.length > 0) resolvedSellerName = spRes.rows[0].name;
      } catch {
        resolvedSellerName = 'Thomas';
      }
    } else {
      const sp = D.memorySalespeopleMap.get(salespersonId);
      if (sp) resolvedSellerName = sp.name;
    }

    // Verificar se o lead já existe previamente no CRM para reutilizar o mesmo ID e unificar o chat
    const existingLeadMatch = await D.findLeadByPhoneNumber(cleanDigits);
    const leadId = existingLeadMatch?.id || `lead-test-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const effectiveLeadName = (existingLeadMatch?.name && existingLeadMatch.name !== 'Cliente' && !existingLeadMatch.name.startsWith('Lead ('))
      ? existingLeadMatch.name
      : leadName;
    const now = new Date().toISOString();

    // Resolver as 3 variáveis da copy para encaixar no template oficial da Meta
    let resolvedVariables: Record<string, string> = {};
    if (variables && typeof variables === 'object') {
      // Aceita qualquer quantidade de variáveis ({{1}}, {{2}}, ...) e mantém var1..var3 como antes
      resolvedVariables = {};
      for (const k of Object.keys(variables)) {
        if (/^\d+$/.test(k)) resolvedVariables[k] = String(variables[k] ?? '').trim();
      }
      for (const n of ['1', '2', '3']) {
        if (!resolvedVariables[n]) resolvedVariables[n] = String(variables[`var${n}`] || '').trim();
      }
    } else if (var1 || var2 || var3) {
      resolvedVariables = {
        '1': String(var1 || '').trim(),
        '2': String(var2 || '').trim(),
        '3': String(var3 || '').trim()
      };
    } else if (Array.isArray(parameters) && parameters.length > 0) {
      resolvedVariables = {
        '1': String(parameters[0] || '').trim(),
        '2': String(parameters[1] || '').trim(),
        '3': String(parameters[2] || '').trim()
      };
    }

    // Sem texto padrão: variável vazia continua vazia e o envio informa qual falta (nada fixo é enviado)

    // Montar texto completo da mensagem para o histórico do chat
    const renderedFullText = messageText || (
      `Ei, ${resolvedVariables['1']}\n\n${resolvedVariables['2']}\n\n${resolvedVariables['3']}\n\nClique no botão abaixo para acessar:`
    );

    // 1. Inserir ou atualizar Lead no CRM (PostgreSQL ou memória)
    let createdLead: any = null;
    if (D.usePostgres && D.pgPool) {
      try {
        const insRes = await D.pgPool.query(
          SQL_INSERT_LEADS,
          [
            leadId,
            effectiveLeadName,
            formattedE164,
            publicUrl,
            website || null,
            niche,
            'Leads',
            'Disparo WhatsApp Realizado (Aguardando Resposta)',
            salespersonId,
            resolvedSellerName,
            '🔥 Disparo WhatsApp Feito',
            1,
            customNotes,
            now,
            now
          ]
        );
        if (insRes.rows.length > 0) {
          createdLead = insRes.rows[0];
        }
      } catch (err: any) {
        console.warn('[Test Dispatch] Inserção PostgreSQL com fallback:', err.message);
      }
    }

    if (!createdLead) {
      const existing = D.memoryLeadsMap.get(leadId);
      createdLead = {
        id: leadId,
        name: effectiveLeadName,
        phoneNumber: formattedE164,
        publicUrl: publicUrl || existing?.publicUrl,
        website: website || existing?.website,
        niche: niche || existing?.niche,
        columnStatus: existing?.columnStatus || 'Leads',
        subStatus: 'Disparo WhatsApp Realizado (Aguardando Resposta)',
        salespersonId,
        salespersonName: resolvedSellerName,
        lastCallTag: '🔥 Disparo WhatsApp Feito',
        callCount: (existing?.callCount || 0) + 1,
        notes: customNotes || existing?.notes,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      D.memoryLeadsMap.set(leadId, createdLead);
    }

    // 2. Criar a mensagem enviada de chat (LeadChatMessage) no histórico oficial do Thomas
    const outgoingMessage: LeadChatMessage = {
      id: `msg_test_${Date.now()}`,
      leadId,
      sender: 'salesperson',
      senderName: resolvedSellerName,
      text: renderedFullText,
      templateName: effectiveMetaTemplate,
      status: 'delivered',
      timestamp: now
    };

    const currentMsgs = D.memoryLeadMessagesMap.get(leadId) || [];
    currentMsgs.push(outgoingMessage);
    D.memoryLeadMessagesMap.set(leadId, currentMsgs);

    if (D.usePostgres && D.pgPool) {
      try {
        await D.pgPool.query(
          SQL_INSERT_LEAD_MESSAGES,
          [outgoingMessage.id, leadId, (createdLead?.phoneNumber || formattedE164 || '').replace(/\D/g, '') || null, outgoingMessage.sender, outgoingMessage.senderName, outgoingMessage.text, outgoingMessage.templateName || null]
        );
      } catch (testMsgErr: any) {
        console.warn('[PostgreSQL] Erro ao persistir mensagem de teste em lead_messages:', testMsgErr.message);
      }
    }

    // 3. Tentar disparar pela FluxoAPI / Meta Cloud API
    let dispatchResult: any = { mode: 'pending', success: false };
    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
    const instanceId = D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

    if ((apiKey && apiSecret) || getMetaProvider() === 'meta') {
      try {
        if (dispatchMode === 'direct_text') {
          // Modo de envio direto de texto puro
          const targetPath = fluxoInstancePath('/messages', instanceId);
          const fRes = getMetaProvider() === 'meta'
            ? D.metaToFluxoResult(await metaSendText(formattedE164, renderedFullText, String(req.body?.phoneNumberId || '').trim() || undefined))
            : await executeFluxoRequest({
            method: 'POST',
            path: targetPath,
            body: {
              to: formattedE164,
              type: 'text',
              text: { body: renderedFullText }
            },
            apiKey,
            apiSecret
          });
          dispatchResult = {
            mode: 'direct_text',
            targetPhone: formattedE164,
            ...fRes
          };
        } else {
          // Modo Padrão Oficial: Disparo via Template Homologado na Meta (/messages/template)
          // Sanitizar variáveis para a Meta
          const sanitizedVariables: Record<string, string> = {};
          for (const [k, v] of Object.entries(resolvedVariables)) {
            sanitizedVariables[k] = String(v || '')
              .replace(/[\r\n\t]+/g, ' ')
              .replace(/ {2,}/g, ' ')
              .trim();
          }

          // Corpo montado pela definição real do modelo (catálogo) — sem o antigo "fallback" de formato inválido
          const fRes = await D.sendTemplateViaFluxo({
            to: formattedE164,
            name: String(effectiveMetaTemplate),
            language: 'pt_BR',
            variables: sanitizedVariables,
            phoneNumberId: String(req.body?.phoneNumberId || '').trim() || undefined,
            creds: { instanceId, apiKey, apiSecret }
          });
          const returnedMessageId = fRes.data?.id || (fRes.data as any)?.message_id;

          dispatchResult = {
            mode: 'official_meta_template',
            templateName: effectiveMetaTemplate,
            targetPhone: formattedE164,
            messageId: returnedMessageId,
            variablesSent: sanitizedVariables,
            ...fRes
          };
        }
      } catch (fErr: any) {
        console.warn('[Test Dispatch] Fluxo API request error:', fErr.message);
        dispatchResult = { mode: 'network_error', success: false, error: fErr.message };
      }
    } else {
      dispatchResult = {
        mode: 'credentials_missing',
        success: false,
        error: 'Credenciais FLUXO_KEY e FLUXO_SECRET não estão configuradas no servidor.'
      };
    }

    // 4. Transmitir SSE em tempo real para o Kanban e WhatsApp
    D.broadcastSSE('NEW_LEAD', {
      lead: createdLead,
      message: outgoingMessage
    });
    D.broadcastSSE('NEW_MESSAGE', {
      leadId,
      leadName,
      message: outgoingMessage
    });

    await D.logAudit('TESTE_DISPARO_INDIVIDUAL', `Disparo de teste realizado para ${formattedE164} atribuído a ${resolvedSellerName}`, req);

    // Só é sucesso se a FluxoAPI/Meta realmente aceitou o envio (antes sempre dizia sucesso)
    const dispatchOk = dispatchResult?.success === true;
    if (!dispatchOk) {
      const motivo = dispatchResult?.error
        || dispatchResult?.data?.error?.message
        || dispatchResult?.data?.message
        || (dispatchResult?.status ? `Erro HTTP ${dispatchResult.status} ao enviar o modelo` : 'A Fluxo/Meta não aceitou o envio');
      console.warn('[Test Dispatch] Envio não saiu:', motivo, JSON.stringify(dispatchResult).slice(0, 800));
      return res.json({
        success: false,
        error: `O teste não saiu: ${motivo}`,
        lead: createdLead,
        outgoingMessage,
        dispatchResult
      } satisfies RespostaTesteDisparo);
    }

    return res.json({
      success: true,
      message: 'Disparo de teste executado com sucesso!',
      lead: createdLead,
      outgoingMessage,
      dispatchResult
    } satisfies RespostaTesteDisparo);
  });

  app.get('/api/campaign/test-dispatch/status/:messageId', async (req: any, res) => {
    const { messageId } = req.params;
    if (!messageId) {
      return res.status(400).json({ error: 'messageId é obrigatório' });
    }

    // 1. Procurar localmente nos eventos de webhook
    let foundEvt = D.lastFluxoWebhookEvents.find(
      e => e.payload?.data?.message_id === messageId || e.payload?.data?.id === messageId
    );

    if (foundEvt && foundEvt.payload?.data) {
      const data = foundEvt.payload.data;
      const status = data.status; // 'failed', 'delivered', 'sent', 'read'
      const errObj = data.error;

      return res.json({
        success: true,
        messageId,
        deliveryStatus: status || 'unknown',
        error: errObj,
        translation: errObj ? D.translateMetaErrorCode(errObj.code, errObj.message) : null,
        eventTimestamp: data.at || foundEvt.receivedAt
      } satisfies RespostaStatusTesteDisparo);
    }

    return res.json({
      success: true,
      messageId,
      deliveryStatus: 'queued',
      message: 'Mensagem ainda na fila de processamento da Meta (aguardando confirmação).'
    } satisfies RespostaStatusTesteDisparo);
  });

  app.get('/api/admin/salesperson/:id/stats', async (req: any, res) => {
    const { id } = req.params;
    try {
      if (D.usePostgres && D.pgPool) {
        let query = `
          SELECT 
            c.id,
            c.lead_id AS "leadId",
            l.name AS "lead_name",
            l.phone_number AS "lead_phone",
            c.tag,
            c.comment,
            c.duration_seconds AS "duration",
            c.follow_up_at AS "followUpAt",
            c.created_at
          FROM calls c
          JOIN leads l ON l.id = c.lead_id
        `;
        const queryParams: any[] = [];
        if (id && id !== 'ALL') {
          const cleanId = id.replace('seller-', '');
          query += ` WHERE l.salesperson_id = $1 OR l.salesperson_id = $2 OR LOWER(l.salesperson_name) = LOWER($3)`;
          queryParams.push(id, `seller-${cleanId}`, cleanId);
        }
        query += ` ORDER BY c.created_at DESC LIMIT 100`;

        const result = await D.pgPool.query(query, queryParams);
        return res.json({
          salespersonId: id,
          recentCalls: result.rows
        } satisfies RespostaEstatisticasVendedor);
      } else {
        const allCalls: any[] = [];
        for (const [leadId, calls] of D.memoryCallLogsMap.entries()) {
          const lead = D.memoryLeadsMap.get(leadId);
          if (!lead) continue;
          if (id && id !== 'ALL') {
            const cleanId = id.replace('seller-', '').toLowerCase();
            const sellerMatch = 
              lead.salespersonId === id ||
              (lead.salespersonId && lead.salespersonId.replace('seller-', '').toLowerCase() === cleanId) ||
              (lead.salespersonName && lead.salespersonName.toLowerCase() === cleanId);
            if (!sellerMatch) continue;
          }
          for (const c of calls) {
            allCalls.push({
              id: c.id,
              leadId: lead.id,
              lead_name: lead.name,
              lead_phone: lead.phoneNumber,
              tag: c.tag,
              comment: c.comment,
              duration: c.durationSeconds,
              followUpAt: c.followUpAt,
              created_at: c.createdAt
            });
          }
        }
        allCalls.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return res.json({
          salespersonId: id,
          recentCalls: allCalls.slice(0, 100)
        } satisfies RespostaEstatisticasVendedor);
      }
    } catch (err: any) {
      console.error('Erro ao buscar stats do vendedor:', err);
      return res.json({ salespersonId: id, recentCalls: [] } satisfies RespostaLigacoesRecentesVendedor);
    }
  });

  app.get('/api/export/csv', async (req: any, res) => {
    if (req.user && req.user.role === 'salesperson') {
      await D.logAudit('TENTATIVA_EXPORT_BLOQUEADA', 'Vendedor tentou exportar CSV da base.', req);
      return res.status(403).json({ error: 'Acesso negado. Apenas o administrador pode exportar a base de dados.' });
    }

    await D.logAudit('EXPORTAR_CSV', 'Exportação de relatório CSV com histórico completo de chamadas', req);

    try {
      let rows: any[] = [];
      if (D.usePostgres && D.pgPool) {
        const query = `
          SELECT 
            l.id AS "lead_id",
            l.name AS "lead_name",
            l.phone_number AS "phone_number",
            l.public_url AS "public_url",
            l.column_status AS "column_status",
            COALESCE(l.salesperson_name, 'Thomas') AS "salesperson_name",
            l.next_follow_up_at AS "next_follow_up_at",
            l.created_at AS "lead_created_at",
            c.id AS "call_id",
            c.tag AS "call_tag",
            c.comment AS "call_comment",
            c.duration_seconds AS "duration_seconds",
            c.follow_up_at AS "call_follow_up_at",
            c.created_at AS "call_created_at"
          FROM leads l
          LEFT JOIN calls c ON l.id = c.lead_id
          ORDER BY l.created_at DESC, c.created_at DESC
        `;
        const result = await D.pgPool.query(query);
        rows = result.rows;
      } else {
        D.memoryLeadsMap.forEach((lead) => {
          const calls = D.memoryCallLogsMap.get(lead.id) || [];
          if (calls.length === 0) {
            rows.push({
              lead_id: lead.id,
              lead_name: lead.name,
              phone_number: lead.phoneNumber,
              public_url: lead.publicUrl || '',
              column_status: lead.columnStatus,
              salesperson_name: lead.salespersonName || 'Thomas',
              next_follow_up_at: lead.nextFollowUpAt || '',
              lead_created_at: lead.createdAt,
              call_id: '',
              call_tag: '',
              call_comment: '',
              duration_seconds: 0,
              call_follow_up_at: '',
              call_created_at: ''
            });
          } else {
            calls.forEach((c) => {
              rows.push({
                lead_id: lead.id,
                lead_name: lead.name,
                phone_number: lead.phoneNumber,
                public_url: lead.publicUrl || '',
                column_status: lead.columnStatus,
                salesperson_name: lead.salespersonName || 'Thomas',
                next_follow_up_at: lead.nextFollowUpAt || '',
                lead_created_at: lead.createdAt,
                call_id: c.id,
                call_tag: c.tag,
                call_comment: c.comment,
                duration_seconds: c.durationSeconds || 0,
                call_follow_up_at: c.followUpAt || '',
                call_created_at: c.createdAt
              });
            });
          }
        });
      }

      // Generate CSV string with BOM for Excel compatibility in UTF-8
      const headers = [
        'ID Lead',
        'Nome do Lead',
        'Nicho / Segmento',
        'Telefone',
        'URL do Site',
        'Vendedor Responsável',
        'Estágio no Pipeline',
        'ID da Ligação',
        'Etiqueta / Resultado',
        'Duração (Segundos)',
        'Duração Formatada',
        'Comentário / Observação',
        'Retorno Agendado na Ligação',
        'Próximo Retorno do Lead',
        'Data da Ligação',
        'Data de Criação do Lead'
      ];

      const escapeCsvField = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const formatSeconds = (sec: number) => {
        if (!sec || sec <= 0) return '00:00';
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      };

      const csvLines = [headers.map(escapeCsvField).join(';')];

      rows.forEach((r) => {
        const niche = getLeadNiche({ name: r.lead_name, publicUrl: r.public_url });
        const line = [
          r.lead_id,
          r.lead_name,
          niche,
          r.phone_number,
          r.public_url,
          r.salesperson_name || 'Thomas',
          r.column_status,
          r.call_id,
          r.call_tag,
          r.duration_seconds || 0,
          formatSeconds(r.duration_seconds || 0),
          r.call_comment,
          r.call_follow_up_at ? new Date(r.call_follow_up_at).toLocaleString('pt-BR') : '',
          r.next_follow_up_at ? new Date(r.next_follow_up_at).toLocaleString('pt-BR') : '',
          r.call_created_at ? new Date(r.call_created_at).toLocaleString('pt-BR') : '',
          r.lead_created_at ? new Date(r.lead_created_at).toLocaleString('pt-BR') : ''
        ].map(escapeCsvField).join(';');
        csvLines.push(line);
      });

      const csvBuffer = '\uFEFF' + csvLines.join('\n'); // UTF-8 BOM
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio_vendas_ligacoes_${new Date().toISOString().slice(0, 10)}.csv"`);
      res.status(200).send(csvBuffer);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      res.status(500).json({ error: 'Erro ao gerar relatório CSV.' });
    }
  });

  app.post('/api/seed-samples', async (req, res) => {
    const samples = [
      { id: 'lead-sample-101', name: 'Dr. Roberto Campos', phoneNumber: '(31) 99881-2233', publicUrl: 'https://nyroh.com.br/dr-roberto' },
      { id: 'lead-sample-102', name: 'Boutique Flor de Lis', phoneNumber: '(11) 97722-4455', publicUrl: 'https://nyroh.com.br/flor-de-lis' },
      { id: 'lead-sample-103', name: 'Oficina Mecânica Precision', phoneNumber: '(41) 99111-8899', publicUrl: 'https://nyroh.com.br/precision' },
      { id: 'lead-sample-104', name: 'Clínica Odonto Riso', phoneNumber: '(31) 98844-3322', publicUrl: 'https://nyroh.com.br/odontoriso' },
      { id: 'lead-sample-105', name: 'Restaurante Sabor Mineiro', phoneNumber: '(31) 99150-3721', publicUrl: 'https://nyroh.com.br/sabor-mineiro' }
    ];

    let insertedCount = 0;

    for (const s of samples) {
      if (D.usePostgres && D.pgPool) {
        const res = await D.pgPool.query(
          SQL_INSERT_LEADS_2,
          [s.id, s.name, s.phoneNumber, s.publicUrl]
        );
        if (res.rowCount && res.rowCount > 0) insertedCount++;
      } else {
        if (!D.memoryLeadsMap.has(s.id)) {
          D.memoryLeadsMap.set(s.id, {
            id: s.id,
            name: s.name,
            phoneNumber: s.phoneNumber,
            publicUrl: s.publicUrl,
            columnStatus: 'Leads',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            callCount: 0
          });
          insertedCount++;
        }
      }
    }

    res.json({ message: `${insertedCount} leads de exemplo adicionados com sucesso!` } satisfies RespostaSementes);
  });

  app.get('/api/campaign/leads', async (req, res) => {
    const { batchId, batchIds, status, search, limit } = req.query as any;
    // Várias safras de uma vez (quadro com as safras marcadas). Lista separada por vírgula.
    const listaSafras: string[] = typeof batchIds === 'string'
      ? batchIds.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 200)
      : [];

    try {
      // Recupera automaticamente quaisquer leads fixos que tenham sido marcados incorretamente como descartados
      recuperarFixosDescartados(D.memoryCampaignLeadsMap.values());

      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(SQL_UPDATE_CAMPAIGN_LEADS).catch(() => {});

        // Tira da lista do disparo quem já foi contatado (CRM ou outra campanha)
        await D.cortarJaContatados();

        let query = `
          SELECT 
            id,
            batch_id AS "batchId",
            name,
            phone_number AS "phoneNumber",
            is_mobile AS "isMobile",
            public_url AS "publicUrl",
            website,
            niche,
            status,
            quarantine_expires_at AS "quarantineExpiresAt",
            sent_at AS "sentAt",
            responded_at AS "respondedAt",
            response_preview AS "responsePreview",
            CASE WHEN status = 'FALHA' THEN notes END AS "failureNote",
            (SELECT lm.status FROM lead_messages lm
              WHERE lm.whatsapp_message_id IS NOT NULL AND lm.whatsapp_message_id = campaign_leads.whatsapp_message_id
              ORDER BY lm.status_rank DESC NULLS LAST LIMIT 1) AS "deliveryStatus",
            (SELECT lm.error_message FROM lead_messages lm
              WHERE lm.whatsapp_message_id IS NOT NULL AND lm.whatsapp_message_id = campaign_leads.whatsapp_message_id
              ORDER BY lm.status_rank DESC NULLS LAST LIMIT 1) AS "deliveryError",
            assigned_salesperson_id AS "assignedSalespersonId",
            assigned_salesperson_name AS "assignedSalespersonName",
            created_at AS "createdAt"
          FROM campaign_leads
          WHERE 1=1
        `;
        const params: any[] = [];

        if (listaSafras.length > 0) {
          params.push(listaSafras);
          query += ` AND batch_id = ANY($${params.length}::text[])`;
        } else if (batchId) {
          params.push(batchId);
          query += ` AND batch_id = $${params.length}`;
        }
        if (status && status !== 'ALL') {
          params.push(status);
          query += ` AND status = $${params.length}`;
        }
        if (search && typeof search === 'string' && search.trim()) {
          params.push(`%${search.trim().toLowerCase()}%`);
          query += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(phone_number) LIKE $${params.length} OR LOWER(COALESCE(niche, '')) LIKE $${params.length})`;
        }

        if (limit && (limit === 'ALL' || limit === 'all')) {
          query += ` ORDER BY created_at DESC LIMIT 50000`;
        } else if (limit && Number(limit) > 0) {
          params.push(Number(limit));
          query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
        } else if (batchId || listaSafras.length > 0) {
          // Quando uma safra é selecionada, carrega todos os seus leads para contagem e disparo sem travar em 500
          query += ` ORDER BY created_at DESC LIMIT 50000`;
        } else {
          query += ` ORDER BY created_at DESC LIMIT 1000`;
        }

        const result = await D.pgPool.query(query, params);
        const leadsDoBanco: RespostaListaLeadsCampanha = result.rows;
        return res.json(leadsDoBanco);
      } else {
        let list = Array.from(D.memoryCampaignLeadsMap.values());
        if (batchId) {
          list = list.filter(l => l.batchId === batchId);
        }
        if (status && status !== 'ALL') {
          list = list.filter(l => l.status === status);
        }
        if (search && typeof search === 'string' && search.trim()) {
          const s = search.trim().toLowerCase();
          list = list.filter(l => 
            l.name.toLowerCase().includes(s) || 
            l.phoneNumber.includes(s) || 
            (l.niche && l.niche.toLowerCase().includes(s))
          );
        }
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (limit && limit !== 'ALL' && limit !== 'all' && Number(limit) > 0) {
          list = list.slice(0, Number(limit));
        }
        const leadsMemoria: RespostaListaLeadsCampanha = list;
        return res.json(leadsMemoria);
      }
    } catch (err: any) {
      console.error('Erro ao buscar leads de campanha:', err);
      res.status(500).json({ error: 'Erro ao buscar leads de campanha.' });
    }
  });

  app.get('/api/campaign/lead-fields', async (req: any, res) => {
    const batchId = String(req.query.batchId || '').trim();
    try {
      const fields = await D.camposDoLoteParaCopy(batchId);
      return res.json({ fields } satisfies RespostaCamposLead);
    } catch (err: any) {
      console.error('Erro ao listar campos do lead:', err);
      return res.status(500).json({ error: 'Erro ao listar campos do lead.' });
    }
  });

  app.get('/api/infrastructure/status', async (req, res) => {
    try {
      const queueStatus = await getQueueSystemStatus();
      const readiness = await D.buildWhatsAppReadiness();
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: 'Nyroh CRM Node.js + Railway',
        database: { connected: D.usePostgres, starting: D.isDatabaseStarting() },
        whatsapp: {
          ...readiness,
          instanceHealth,
          plan: { planRpm: planRpm(), dispatchRpm: dispatchRpm() }
        },
        ...queueStatus
      } satisfies RespostaStatusInfraestrutura);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

}
