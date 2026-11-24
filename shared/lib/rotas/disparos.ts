/**
 * B4 (item 4.1 d): disparos e safras extraídos de server.ts.
 */
import type { Express } from 'express';

import { TOKEN_NAMES, normalizeFieldKey } from '../leadTokens.js';
import { buildLeadVariables } from '../templateCopy.js';
import { dispatchRpm, effectiveSpeedPerSecond, maxDispatchPerSecond, planRpm } from '../dispatchRate.js';
import { distributionByCount } from '../distribution.js';
import { fluxoInstancePath } from '../fluxoClient.js';
import { validarInstanciaEscolhida } from '../dispatchInstancia.js';
import { regrasDeContatoSql, uxSchemaOn } from '../uxRoutes.js';
import type { Lead } from '../../types.js';
import type { LoteCampanha, ProgressoLote, RespostaAcaoLote, RespostaAcaoSimulada, RespostaAlteracaoVelocidade, RespostaCancelamentoLote, RespostaCopiaRemovida, RespostaCopiaSalva, RespostaDevolucaoLeads, RespostaDisparo, RespostaDistribuicaoCampanha, RespostaLiberacaoQuarentena, RespostaListaCopias, RespostaListaLotes, RespostaResetSafra, RespostaRetornoQuarentena, RespostaSincronizacaoWhatsApp, RespostaSucesso, RespostaVelocidadeDisparo } from '../../contracts/rotas.js';
import { SQL_SELECT_CAMPAIGN_LEADS, SQL_INSERT_CAMPAIGN_BATCHES, SQL_SELECT_CAMPAIGN_COPY_TEMPLATES, SQL_INSERT_CAMPAIGN_COPY_TEMPLATES, SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_2, SQL_INSERT_CAMPAIGN_COPY_TEMPLATES_2, SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_3, SQL_UPDATE_CAMPAIGN_COPY_TEMPLATES, SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_4, SQL_DELETE_CAMPAIGN_COPY_TEMPLATES, SQL_SELECT_SALESPEOPLE, SQL_UPDATE_CAMPAIGN_BATCHES, SQL_UPDATE_CAMPAIGN_LEADS, SQL_UPDATE_CAMPAIGN_LEADS_2, SQL_INSERT_LEADS, SQL_UPDATE_CAMPAIGN_LEADS_3, SQL_UPDATE_CAMPAIGN_LEADS_4, SQL_INSERT_LEADS_2, SQL_UPDATE_CAMPAIGN_LEADS_5, SQL_UPDATE_CAMPAIGN_LEADS_6, SQL_UPDATE_CAMPAIGN_BATCHES_2, SQL_UPDATE_CAMPAIGN_BATCHES_3, SQL_SELECT_CAMPAIGN_LEADS_2, SQL_UPDATE_CAMPAIGN_LEADS_7, SQL_UPDATE_CAMPAIGN_BATCHES_4, SQL_UPDATE_CAMPAIGN_LEADS_8, SQL_UPDATE_CAMPAIGN_BATCHES_5, SQL_SELECT_CAMPAIGN_LEADS_3, SQL_UPDATE_CAMPAIGN_LEADS_9, SQL_UPDATE_CAMPAIGN_LEADS_10, SQL_UPDATE_CAMPAIGN_LEADS_11, SQL_UPDATE_CAMPAIGN_BATCHES_6, SQL_SELECT_CAMPAIGN_LEADS_4, SQL_DELETE_CAMPAIGN_LEADS, SQL_DELETE_ZIP_UPLOADS, SQL_DELETE_CAMPAIGN_BATCHES } from './repo/disparos.js';
type StoredCampaignBatch = any;
type StoredCampaignCopyTemplate = any;
type StoredCampaignLead = any;
export interface DependenciasDisparos {
  readonly COPY_VALUE_MAX: number;
  readonly broadcastSSE: any;
  readonly broadcastSocketEvent: any;
  readonly cancelBatchProgress: any;
  readonly camposDoLoteParaCopy: any;
  readonly copiesByIndexFromBody: any;
  readonly cortarJaContatados: any;
  readonly devolverNaoEnviadosDoLote: any;
  readonly enqueueCampaignDispatchBatch: any;
  readonly garantirSchemaCopias: any;
  readonly getBatchProgress: any;
  readonly getCampaignSpeed: any;
  readonly initBatchProgress: any;
  readonly logAudit: any;
  readonly memoryCampaignBatchesMap: Map<string, any>;
  readonly memoryCampaignCopyTemplatesMap: Map<string, any>;
  readonly memoryCampaignLeadsMap: Map<string, any>;
  readonly memoryFluxoConfig: any;
  readonly memoryLeadsMap: Map<string, any>;
  readonly memorySalespeopleMap: Map<string, any>;
  readonly normalizarValoresCopy: any;
  readonly pauseBatchProgress: any;
  readonly pgPool: any;
  readonly removeBatchWaitingJobs: any;
  readonly resumeBatchProgress: any;
  readonly setCampaignSpeed: any;
  readonly trackedLinkFor: any;
  readonly usePostgres: boolean;
  readonly valoresDaLinhaCopy: any;
}

let D: DependenciasDisparos;

export function configurarDisparos(deps: DependenciasDisparos): void {
  D = deps;
}

export function registrarDisparos(app: Express): void {
  // 1. Get all campaign batches (Safras)
  app.get('/api/campaign/batches', async (req, res) => {
    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(SQL_SELECT_CAMPAIGN_LEADS);
        return res.json(result.rows satisfies RespostaListaLotes);
      } else {
        const batches = Array.from(D.memoryCampaignBatchesMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return res.json(batches satisfies RespostaListaLotes);
      }
    } catch (err: any) {
      console.error('Erro ao buscar safras de disparo:', err);
      res.status(500).json({ error: 'Erro ao buscar safras de disparo.' });
    }
  });

  // 2. Create a new campaign batch
  app.post('/api/campaign/batches', async (req: any, res) => {
    const { name, templateName = 'notificacao_pedido_atendimento', quarantineHours = 4 } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome da safra é obrigatório.' });
    }

    const batchId = `safra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const cleanName = name.trim();
    const hours = Number(quarantineHours) > 0 ? Number(quarantineHours) : 4;
    const now = new Date().toISOString();

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          SQL_INSERT_CAMPAIGN_BATCHES,
          [batchId, cleanName, templateName, hours]
        );
        await D.logAudit('CAMPANHA_SAFRA_CRIADA', `Criou safra: ${cleanName}`, req);
        // result.rows é any: este tipo só vale em tempo de compilação, não confere a linha do banco.
        const loteCriado: LoteCampanha = result.rows[0];
        return res.status(201).json(loteCriado);
      } else {
        const newBatch: StoredCampaignBatch = {
          id: batchId,
          name: cleanName,
          totalLeads: 0,
          validMobiles: 0,
          landlines: 0,
          withNyrohUrl: 0,
          withWebsite: 0,
          status: 'draft',
          templateName,
          quarantineHours: hours,
          allowedClosers: ['seller-thomas'],
          hotLeadsRetainedByAdmin: true,
          dispatchedCount: 0,
          hotCount: 0,
          coldCount: 0,
          optOutCount: 0,
          createdAt: now
        };
        D.memoryCampaignBatchesMap.set(batchId, newBatch);
        await D.logAudit('CAMPANHA_SAFRA_CRIADA', `Criou safra: ${cleanName}`, req);
        const loteCriado: LoteCampanha = newBatch;
        return res.status(201).json(loteCriado);
      }
    } catch (err: any) {
      console.error('Erro ao criar safra:', err);
      res.status(500).json({ error: 'Erro ao criar safra de campanha.' });
    }
  });

  app.get('/api/campaign/copies', async (req: any, res) => {
    try {
      if (D.usePostgres && D.pgPool) {
        try {
          await D.garantirSchemaCopias();

          const result = await D.pgPool.query(SQL_SELECT_CAMPAIGN_COPY_TEMPLATES);

          if (result.rows.length > 0) {
            // Sincronizar com o mapa em memória
            for (const row of result.rows) {
              D.memoryCampaignCopyTemplatesMap.set(row.id, {
                id: row.id,
                name: row.name,
                description: row.description,
                category: row.category,
                var1: row.var1,
                var2: row.var2,
                var3: row.var3,
                metaTemplateName: row.metaTemplateName || null,
                values: D.valoresDaLinhaCopy(row),
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                isDefault: row.isDefault
              });
            }
            return res.json(result.rows.map((r: any) => ({ ...r, values: D.valoresDaLinhaCopy(r) })) satisfies RespostaListaCopias);
          } else {
            // Se a tabela estiver vazia, semear com os padrões e retornar
            for (const defTpl of Array.from(D.memoryCampaignCopyTemplatesMap.values())) {
              await D.pgPool.query(
                SQL_INSERT_CAMPAIGN_COPY_TEMPLATES,
                [defTpl.id, defTpl.name, defTpl.description, defTpl.category, defTpl.var1, defTpl.var2, defTpl.var3, defTpl.isDefault]
              );
            }
            const seeded = await D.pgPool.query(SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_2);
            if (seeded.rows.length > 0) {
              return res.json(seeded.rows.map((r: any) => ({ ...r, values: D.valoresDaLinhaCopy(r) })) satisfies RespostaListaCopias);
            }
          }
        } catch (tableErr: any) {
          console.warn('[PostgreSQL] Erro ao buscar campaign_copy_templates:', tableErr.message);
        }
      }
      const list = Array.from(D.memoryCampaignCopyTemplatesMap.values()).map(r => ({ ...r, values: D.valoresDaLinhaCopy(r) }));
      return res.json(list satisfies RespostaListaCopias);
    } catch (err: any) {
      console.error('Erro ao buscar templates de copy:', err);
      res.status(500).json({ error: 'Erro ao listar templates de copy.' });
    }
  });

  app.post('/api/campaign/copies', async (req: any, res) => {
    const { name, description, category = 'prospeccao', var1, var2, var3, metaTemplateName, values } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome da copy de mensagem é obrigatório.' });
    }

    const id = `tpl_copy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const valoresNovos = values !== undefined
      ? D.normalizarValoresCopy(values)
      : D.normalizarValoresCopy({ 1: var1, 2: var2, 3: var3 });
    const newTemplate: StoredCampaignCopyTemplate = {
      id,
      name: name.trim(),
      description: description ? description.trim() : '',
      category: category || 'prospeccao',
      var1: valoresNovos['1'] || '',
      var2: valoresNovos['2'] || '',
      var3: valoresNovos['3'] || '',
      metaTemplateName: metaTemplateName ? String(metaTemplateName).trim() : null,
      values: valoresNovos,
      createdAt: now,
      isDefault: false
    };

    try {
      if (D.usePostgres && D.pgPool) {
        await D.garantirSchemaCopias();
        await D.pgPool.query(
          SQL_INSERT_CAMPAIGN_COPY_TEMPLATES_2,
          [id, newTemplate.name, newTemplate.description, newTemplate.category, newTemplate.var1, newTemplate.var2, newTemplate.var3, newTemplate.metaTemplateName || null, JSON.stringify(valoresNovos), now]
        );
        console.log(`[Campaign Copies] Template "${newTemplate.name}" salvo no PostgreSQL com id ${id}`);
      }

      D.memoryCampaignCopyTemplatesMap.set(id, newTemplate);
      await D.logAudit('COPY_TEMPLATE_CRIADO', `Criado template de copy "${newTemplate.name}"`, req);

      return res.status(201).json(newTemplate satisfies RespostaCopiaSalva);
    } catch (err: any) {
      console.error('Erro ao salvar template de copy:', err);
      res.status(500).json({ error: 'Erro ao salvar template de copy no banco: ' + err.message });
    }
  });

  app.put('/api/campaign/copies/:id', async (req: any, res) => {
    const { id } = req.params;
    const { name, description, category, var1, var2, var3, metaTemplateName, values } = req.body;

    try {
      await D.garantirSchemaCopias().catch(() => {});
      let existing = D.memoryCampaignCopyTemplatesMap.get(id);

      if (D.usePostgres && D.pgPool) {
        try {
          const checkRes = await D.pgPool.query(SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_3, [id]);
          if (checkRes.rows.length > 0) {
            const row = checkRes.rows[0];
            existing = {
              id: row.id,
              name: row.name,
              description: row.description,
              category: row.category,
              var1: row.var1 || '',
              var2: row.var2 || '',
              var3: row.var3 || '',
              metaTemplateName: row.meta_template_name || null,
              values: D.valoresDaLinhaCopy({ var1: row.var1, var2: row.var2, var3: row.var3, values: row.values_json }),
              createdAt: row.created_at,
              isDefault: row.is_default
            };
          }
        } catch (err) {}
      }

      if (!existing) {
        return res.status(404).json({ error: 'Template de copy não encontrado.' });
      }

      let valoresAtualizados: Record<string, string> = { ...(existing.values || {}) };
      if (values !== undefined) {
        valoresAtualizados = D.normalizarValoresCopy(values);
      } else if (var1 !== undefined || var2 !== undefined || var3 !== undefined) {
        if (var1 !== undefined) valoresAtualizados['1'] = String(var1).slice(0, D.COPY_VALUE_MAX);
        if (var2 !== undefined) valoresAtualizados['2'] = String(var2).slice(0, D.COPY_VALUE_MAX);
        if (var3 !== undefined) valoresAtualizados['3'] = String(var3).slice(0, D.COPY_VALUE_MAX);
      }
      const updated: StoredCampaignCopyTemplate = {
        ...existing,
        name: name ? name.trim() : existing.name,
        description: description !== undefined ? description : existing.description,
        category: category || existing.category,
        metaTemplateName: metaTemplateName !== undefined ? (metaTemplateName ? String(metaTemplateName).trim() : null) : (existing.metaTemplateName || null),
        values: valoresAtualizados,
        var1: valoresAtualizados['1'] || '',
        var2: valoresAtualizados['2'] || '',
        var3: valoresAtualizados['3'] || '',
        updatedAt: new Date().toISOString()
      };

      D.memoryCampaignCopyTemplatesMap.set(id, updated);

      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_COPY_TEMPLATES,
          [updated.name, updated.description, updated.category, updated.var1, updated.var2, updated.var3, id, updated.metaTemplateName || null, JSON.stringify(updated.values || {})]
        );
      }

      await D.logAudit('COPY_TEMPLATE_ATUALIZADO', `Atualizado template de copy "${updated.name}"`, req);
      return res.json(updated satisfies RespostaCopiaSalva);
    } catch (err: any) {
      console.error('Erro ao atualizar template de copy:', err);
      res.status(500).json({ error: 'Erro ao atualizar template de copy.' });
    }
  });

  app.delete('/api/campaign/copies/:id', async (req: any, res) => {
    const { id } = req.params;
    try {
      let existing = D.memoryCampaignCopyTemplatesMap.get(id);

      if (D.usePostgres && D.pgPool) {
        try {
          const checkRes = await D.pgPool.query(SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_4, [id]);
          if (checkRes.rows.length > 0) {
            existing = {
              id: checkRes.rows[0].id,
              name: checkRes.rows[0].name,
              isDefault: checkRes.rows[0].is_default
            } as any;
          }
        } catch (err) {}
      }

      if (!existing) {
        return res.status(404).json({ error: 'Template de copy não encontrado.' });
      }

      if (existing.isDefault) {
        return res.status(400).json({ error: 'Templates padrão do sistema não podem ser excluídos.' });
      }

      D.memoryCampaignCopyTemplatesMap.delete(id);

      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(SQL_DELETE_CAMPAIGN_COPY_TEMPLATES, [id]);
      }

      await D.logAudit('COPY_TEMPLATE_EXCLUIDO', `Excluído template de copy "${existing.name}"`, req);
      return res.json({ success: true, message: 'Template de copy removido com sucesso.' } satisfies RespostaCopiaRemovida);
    } catch (err: any) {
      console.error('Erro ao excluir template de copy:', err);
      res.status(500).json({ error: 'Erro ao excluir template de copy.' });
    }
  });

  app.post('/api/campaign/dispatch', async (req: any, res) => {
    const {
      batchId,
      templateName,
      quarantineHours = 4,
      variableValues,
      customBodyText,
      speedMode = 'turbo',
      limit,
      leadIds,
      salespersonId,
      salespersonIds,
      dryRun = false,
      phoneNumberId
    } = req.body;

    if (!batchId) {
      return res.status(400).json({ error: 'ID da safra é obrigatório para disparo.' });
    }
    if (!String(templateName || '').trim()) {
      return res.status(400).json({ error: 'Escolha um modelo aprovado antes de disparar.' });
    }

    // Número escolhido na tela (instância da FluxoAPI). Vazio = padrão (marca da safra ou número geral).
    const instanciaEscolhida = validarInstanciaEscolhida(phoneNumberId);
    if (instanciaEscolhida === null) {
      return res.status(400).json({ error: 'Número de envio inválido. Escolha um número da lista.' });
    }

    // Campo que não existe nas safras bloqueia o disparo ANTES de qualquer alteração no banco.
    {
      const conhecidos = new Set<string>([...TOKEN_NAMES, ...(await D.camposDoLoteParaCopy(String(batchId)))]);
      const desconhecidos = new Set<string>();
      for (const texto of Object.values(D.copiesByIndexFromBody(variableValues))) {
        for (const m of String(texto).matchAll(/\{([a-zA-Z_][^{}\n]{0,59})\}/g)) {
          const campo = normalizeFieldKey(m[1]);
          if (!conhecidos.has(campo)) desconhecidos.add(campo);
        }
      }
      if (desconhecidos.size > 0) {
        return res.status(400).json({
          error: `Campos que não existem nas safras escolhidas: ${[...desconhecidos].map(u => `{${u}}`).join(', ')}. Use um campo da lista de tags.`
        });
      }
    }

    // Resolver lista de vendedores para distribuição (round-robin)
    let rawSellerIds: string[] = [];
    if (Array.isArray(salespersonIds) && salespersonIds.length > 0) {
      rawSellerIds = salespersonIds.filter(Boolean);
    } else if (salespersonId) {
      rawSellerIds = [salespersonId];
    }
    if (rawSellerIds.length === 0) {
      rawSellerIds = ['seller-thomas'];
    }

    // Carregar dados dos vendedores para obter nomes reais
    const sellerMap = new Map<string, { id: string; name: string }>();
    if (D.usePostgres && D.pgPool) {
      try {
        const spRes = await D.pgPool.query(SQL_SELECT_SALESPEOPLE, [rawSellerIds]);
        for (const row of spRes.rows) {
          sellerMap.set(row.id, { id: row.id, name: row.name });
        }
      } catch (spErr: any) {
        console.warn('[Dispatch] Erro ao carregar salespeople do banco:', spErr.message);
      }
    } else {
      for (const sid of rawSellerIds) {
        const sp = D.memorySalespeopleMap.get(sid);
        if (sp) sellerMap.set(sid, { id: sp.id, name: sp.name });
      }
    }

    // Lista normalizada de vendedores disponíveis
    const activeSellers = rawSellerIds.map(sid => {
      const s = sellerMap.get(sid);
      return {
        id: sid,
        name: s?.name || (sid === 'seller-thomas' ? 'Thomas Gabriel' : 'Thomas')
      };
    });

    const hours = Number(quarantineHours) > 0 ? Number(quarantineHours) : 4;
    const now = new Date();
    const quarantineEnds = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
    const sentAt = now.toISOString();
    let numLimit: number | undefined = undefined;
    if (limit === 'ALL' || req.body.allowAll === true) {
      numLimit = undefined;
    } else if (limit && Number(limit) > 0) {
      numLimit = Number(limit);
    } else if (!Array.isArray(leadIds) || leadIds.length === 0) {
      // Salvaguarda: se nenhum limite ou IDs específicos foram passados, padrão seguro de 100 leads
      numLimit = 100;
    }

    // Credenciais FluxoAPI / Meta Cloud API
    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
    const instanceId = D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';
    const targetPath = fluxoInstancePath('/messages/template', instanceId);

    try {
      let dispatchedLeads: any[] = [];

      if (D.usePostgres && D.pgPool) {
        // Antes de disparar, tira do pipeline quem já foi contatado (outra safra ou CRM)
        await D.cortarJaContatados();

        // Regras de contato (tela Configurações > Regras de contato) + bloqueio pelo admin.
        const foraDoDisparo = uxSchemaOn() ? await regrasDeContatoSql(D.pgPool) : '';

        if (Array.isArray(leadIds) && leadIds.length > 0) {
          const updateRes = await D.pgPool.query(
            `UPDATE campaign_leads
             SET status = 'QUARENTENA',
                 sent_at = CURRENT_TIMESTAMP,
                 quarantine_expires_at = $1
             WHERE batch_id = $2 AND id = ANY($3::text[]) ${foraDoDisparo}
             RETURNING id, name, phone_number AS "phoneNumber", is_mobile AS "isMobile", public_url AS "publicUrl", website, niche, raw_data AS "rawData"`,
            [quarantineEnds, batchId, leadIds]
          );
          dispatchedLeads = updateRes.rows || [];
        } else if (numLimit) {
          const updateRes = await D.pgPool.query(
            `UPDATE campaign_leads
             SET status = 'QUARENTENA',
                 sent_at = CURRENT_TIMESTAMP,
                 quarantine_expires_at = $1
             WHERE id IN (
               SELECT id FROM campaign_leads
               WHERE batch_id = $2 AND status = 'STAGING' AND is_mobile = TRUE
                 AND NOT EXISTS (
                   SELECT 1 FROM campaign_leads cl2
                   WHERE cl2.id <> campaign_leads.id
                     AND cl2.status NOT IN ('STAGING', 'DESCARTADO')
                     AND (cl2.whatsapp_message_id IS NOT NULL OR cl2.status = 'INTERESSADO')
                     AND regexp_replace(cl2.phone_number, '[^0-9]', '', 'g') = regexp_replace(campaign_leads.phone_number, '[^0-9]', '', 'g')
                 ) ${foraDoDisparo}
               ORDER BY created_at ASC
               LIMIT $3
             )
             RETURNING id, name, phone_number AS "phoneNumber", is_mobile AS "isMobile", public_url AS "publicUrl", website, niche, raw_data AS "rawData"`,
            [quarantineEnds, batchId, numLimit]
          );
          dispatchedLeads = updateRes.rows || [];
        } else {
          // Disparo explícito de TODOS os celulares válidos em STAGING
          const updateRes = await D.pgPool.query(
            `UPDATE campaign_leads
             SET status = 'QUARENTENA',
                 sent_at = CURRENT_TIMESTAMP,
                 quarantine_expires_at = $1
             WHERE id IN (
               SELECT id FROM campaign_leads
               WHERE batch_id = $2 AND status = 'STAGING' AND is_mobile = TRUE
                 AND NOT EXISTS (
                   SELECT 1 FROM campaign_leads cl2
                   WHERE cl2.id <> campaign_leads.id
                     AND cl2.status NOT IN ('STAGING', 'DESCARTADO')
                     AND (cl2.whatsapp_message_id IS NOT NULL OR cl2.status = 'INTERESSADO')
                     AND regexp_replace(cl2.phone_number, '[^0-9]', '', 'g') = regexp_replace(campaign_leads.phone_number, '[^0-9]', '', 'g')
                 ) ${foraDoDisparo}
               ORDER BY created_at ASC
             )
             RETURNING id, name, phone_number AS "phoneNumber", is_mobile AS "isMobile", public_url AS "publicUrl", website, niche, raw_data AS "rawData"`,
            [quarantineEnds, batchId]
          );
          dispatchedLeads = updateRes.rows || [];
        }

        const dispatchedCount = dispatchedLeads.length;

        // Update batch stats
        await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_BATCHES,
          [templateName, hours, quarantineEnds, dispatchedCount, batchId, variableValues?.var1 || '', variableValues?.var2 || '', variableValues?.var3 || '']
        );

        // Disparo REAL via esteira BullMQ + Redis com velocidade configurável
        // Velocidade SEMPRE dentro do que o plano da FluxoAPI aguenta (limite por MINUTO — §A10)
        const requestedSpeed = effectiveSpeedPerSecond(Number(req.body.speedPerSecond) || D.getCampaignSpeed());
        const dispatchJobs: any[] = [];

        for (let i = 0; i < dispatchedLeads.length; i++) {
          const dLead = dispatchedLeads[i];
          const assignedSeller = activeSellers[i % activeSellers.length];
          const sellerName = assignedSeller.name;
          const sellerId = assignedSeller.id;

          // Atualizar vendedor atribuído no campaign_leads
          await D.pgPool.query(
            SQL_UPDATE_CAMPAIGN_LEADS,
            [sellerId, sellerName, dLead.id]
          ).catch(() => {});

          // Resolver variáveis da copy dinamicamente para este lead e vendedor
          const firstName = (dLead.name || 'Cliente').trim().split(' ')[0] || 'Cliente';
          const company = (dLead.name && dLead.name !== 'Cliente' ? dLead.name : 'sua empresa').trim();
          const nyrohUrl = dLead.publicUrl || 'https://nyroh.app/preview';

          const copiesMap: Record<number, string> = D.copiesByIndexFromBody(variableValues);
          const trackedUrl = await D.trackedLinkFor(dLead.id, nyrohUrl);
          const built = buildLeadVariables(copiesMap, { leadName: dLead.name, phoneNumber: dLead.phoneNumber, publicUrl: trackedUrl, website: dLead.website, niche: dLead.niche, sellerName, extra: dLead.rawData });
          const problemas = [
            ...built.unknown.map(c => `campo desconhecido {${c}}`),
            ...built.emptyFields.map(c => `sem dado para {${c}}`),
            ...built.empty.map(n => `variável {{${n}}} vazia`)
          ];
          if (problemas.length > 0) {
            const motivo = problemas.join('; ');
            console.warn(`[Disparo] lead ${dLead.id}: ${motivo}. Não enfileirado.`);
            if (D.usePostgres && D.pgPool) {
              await D.pgPool.query(SQL_UPDATE_CAMPAIGN_LEADS_2, [dLead.id, `Não enviado: ${motivo}`]).catch(() => {});
            } else {
              const m = D.memoryCampaignLeadsMap.get(dLead.id);
              if (m) m.status = 'ERRO_VARIAVEL' as any;
            }
            continue;
          }
          const sanitizedVariables: Record<string, string> = built.variables;
          const cleanDigits = String(dLead.phoneNumber || '').replace(/\D/g, '');
          let formattedE164 = '';
          if (cleanDigits.length >= 10) {
            formattedE164 = cleanDigits.startsWith('55') ? `+${cleanDigits}` : `+55${cleanDigits}`;
          }

          dispatchJobs.push({
            campaignId: batchId,
            batchId,
            leadId: dLead.id,
            phone: formattedE164 || dLead.phoneNumber || '',
            leadName: dLead.name,
            templateName: String(templateName).trim(),
            templateLanguage: 'pt_BR',
            variables: sanitizedVariables,
            salespersonId: sellerId,
            salespersonName: sellerName,
            publicUrl: nyrohUrl,
            speedPerSecond: requestedSpeed,
            dryRun: Boolean(dryRun),
            // Modelos com botão de URL variável / cupom / mídia de cabeçalho exigem esses valores (§A4)
            buttonValues: req.body.buttonValues && typeof req.body.buttonValues === 'object' ? req.body.buttonValues : undefined,
            headerMediaUrl: typeof req.body.headerMediaUrl === 'string' ? req.body.headerMediaUrl : undefined,
            dispatchedAt: Date.now(),
            instanceId: instanciaEscolhida || undefined
          });

          // Sincronizar lead com o CRM para aparecer no Kanban e no WhatsApp do vendedor atribuído
          try {
            await D.pgPool.query(
              SQL_INSERT_LEADS,
              [dLead.id, dLead.name || 'Cliente', formattedE164 || dLead.phoneNumber || '', dLead.publicUrl || null, dLead.website || null, dLead.niche || null, sellerId, sellerName]
            );
          } catch (dbErr: any) {
            console.warn('[Postgres Sync Lead Warning]:', dbErr.message);
          }
        }

        D.initBatchProgress(batchId, dispatchJobs.length, requestedSpeed);
        const queueInfo = await D.enqueueCampaignDispatchBatch(dispatchJobs, requestedSpeed);

        await D.logAudit(
          'CAMPANHA_DISPARO_ENFILEIRADO',
          `Disparo enfileirado na esteira BullMQ: ${dispatchJobs.length} leads da safra ${batchId} a ${queueInfo.speed} msgs/s com template ${templateName}`,
          req
        );

        D.broadcastSSE('DISPATCH_QUEUED', {
          batchId,
          dispatchedCount,
          speed: queueInfo.speed,
          estimatedSeconds: queueInfo.estimatedSeconds,
          templateName,
          quarantineEndsAt: quarantineEnds
        });
        D.broadcastSSE('LEAD_UPDATED', { batchId, count: dispatchedCount });

        return res.json({
          success: true,
          queued: true,
          dispatchedCount,
          enqueuedCount: dispatchJobs.length,
          speedPerSecond: queueInfo.speed,
          estimatedDurationSeconds: queueInfo.estimatedSeconds,
          templateName,
          quarantineHours: hours,
          quarantineEndsAt: quarantineEnds,
          sellersUsed: activeSellers.map(s => s.name),
          batchId,
          speedPerMinute: Math.round(queueInfo.speed * 60),
          // o corte ao teto do plano acontece ANTES de a fila ver o número, então compara com o que o usuário pediu
          cappedByPlan: queueInfo.cappedByPlan || (Number(req.body.speedPerSecond) > queueInfo.speed + 1e-9),
          planRpm: planRpm(),
          message: `🚀 ${dispatchJobs.length} leads enfileirados à velocidade de ${Math.round(queueInfo.speed * 60)} msgs/min${queueInfo.cappedByPlan ? ` (reduzida ao teto do seu plano FluxoAPI: ${dispatchRpm()}/min)` : ''}. Duração estimada: ~${Math.ceil(queueInfo.estimatedSeconds / 60)} min.`
        } satisfies RespostaDisparo);
      } else {
        // Memory Branch
        let dispatchedCount = 0;
        const dispatchedLeads: StoredCampaignLead[] = [];

        let leadsToProcess = Array.from(D.memoryCampaignLeadsMap.values())
          .filter(l => l.batchId === batchId && l.status === 'STAGING');

        if (Array.isArray(leadIds) && leadIds.length > 0) {
          leadsToProcess = leadsToProcess.filter(l => leadIds.includes(l.id));
        } else if (numLimit) {
          leadsToProcess = leadsToProcess.slice(0, numLimit);
        }

        // Velocidade SEMPRE dentro do que o plano da FluxoAPI aguenta (limite por MINUTO — §A10)
        const requestedSpeed = effectiveSpeedPerSecond(Number(req.body.speedPerSecond) || D.getCampaignSpeed());
        const dispatchJobs: any[] = [];

        for (let i = 0; i < leadsToProcess.length; i++) {
          const lead = leadsToProcess[i];
          const assignedSeller = activeSellers[i % activeSellers.length];
          const sellerName = assignedSeller.name;
          const sellerId = assignedSeller.id;

          lead.status = 'QUARENTENA';
          lead.sentAt = sentAt;
          lead.quarantineExpiresAt = quarantineEnds;
          lead.assignedSalespersonId = sellerId;
          lead.assignedSalespersonName = sellerName;
          dispatchedCount++;
          dispatchedLeads.push(lead);

          const firstName = (lead.name || 'Cliente').trim().split(' ')[0] || 'Cliente';
          const company = (lead.name && lead.name !== 'Cliente' ? lead.name : 'sua empresa').trim();
          const nyrohUrl = lead.publicUrl || 'https://nyroh.app/preview';

          const copiesMap: Record<number, string> = D.copiesByIndexFromBody(variableValues);
          const trackedUrl = await D.trackedLinkFor(lead.id, nyrohUrl);
          const built = buildLeadVariables(copiesMap, { leadName: lead.name, phoneNumber: lead.phoneNumber, publicUrl: trackedUrl, website: lead.website, niche: lead.niche, sellerName, extra: lead.rawData });
          const problemas = [
            ...built.unknown.map(c => `campo desconhecido {${c}}`),
            ...built.emptyFields.map(c => `sem dado para {${c}}`),
            ...built.empty.map(n => `variável {{${n}}} vazia`)
          ];
          if (problemas.length > 0) {
            const motivo = problemas.join('; ');
            console.warn(`[Disparo] lead ${lead.id}: ${motivo}. Não enfileirado.`);
            if (D.usePostgres && D.pgPool) {
              await D.pgPool.query(SQL_UPDATE_CAMPAIGN_LEADS_3, [lead.id, `Não enviado: ${motivo}`]).catch(() => {});
            } else {
              const m = D.memoryCampaignLeadsMap.get(lead.id);
              if (m) m.status = 'ERRO_VARIAVEL' as any;
            }
            continue;
          }
          const sanitizedVariables: Record<string, string> = built.variables;
          const cleanDigits = String(lead.phoneNumber || '').replace(/\D/g, '');
          let formattedE164 = '';
          if (cleanDigits.length >= 10) {
            formattedE164 = cleanDigits.startsWith('55') ? `+${cleanDigits}` : `+55${cleanDigits}`;
          }

          dispatchJobs.push({
            campaignId: batchId,
            batchId,
            leadId: lead.id,
            phone: formattedE164 || lead.phoneNumber || '',
            leadName: lead.name,
            templateName: String(templateName).trim(),
            templateLanguage: 'pt_BR',
            variables: sanitizedVariables,
            salespersonId: sellerId,
            salespersonName: sellerName,
            publicUrl: nyrohUrl,
            speedPerSecond: requestedSpeed,
            dryRun: Boolean(dryRun),
            // Modelos com botão de URL variável / cupom / mídia de cabeçalho exigem esses valores (§A4)
            buttonValues: req.body.buttonValues && typeof req.body.buttonValues === 'object' ? req.body.buttonValues : undefined,
            headerMediaUrl: typeof req.body.headerMediaUrl === 'string' ? req.body.headerMediaUrl : undefined,
            dispatchedAt: Date.now(),
            instanceId: instanciaEscolhida || undefined
          });

          // Sync into memory CRM leads
          const existingCRMLead = D.memoryLeadsMap.get(lead.id);
          if (existingCRMLead) {
            existingCRMLead.subStatus = 'Disparo WhatsApp Realizado (Aguardando Resposta)';
            existingCRMLead.salespersonId = sellerId;
            existingCRMLead.salespersonName = sellerName;
            existingCRMLead.lastCallTag = 'WhatsApp Enviado';
            existingCRMLead.updatedAt = sentAt;
          } else {
            D.memoryLeadsMap.set(lead.id, {
              id: lead.id,
              name: lead.name || 'Cliente',
              phoneNumber: formattedE164 || lead.phoneNumber || '',
              publicUrl: lead.publicUrl,
              website: lead.website,
              niche: lead.niche,
              columnStatus: 'Leads',
              subStatus: 'Disparo WhatsApp Realizado (Aguardando Resposta)',
              salespersonId: sellerId,
              salespersonName: sellerName,
              lastCallTag: 'WhatsApp Enviado',
              callCount: 1,
              createdAt: sentAt,
              updatedAt: sentAt
            });
          }
        }

        const batch = D.memoryCampaignBatchesMap.get(batchId);
        if (batch) {
          batch.status = 'quarantine';
          if (templateName) batch.templateName = templateName;
          batch.quarantineHours = hours;
          batch.quarantineStartedAt = sentAt;
          batch.quarantineEndsAt = quarantineEnds;
          batch.dispatchedCount = (batch.dispatchedCount || 0) + dispatchedCount;
        }

        D.initBatchProgress(batchId, dispatchJobs.length, requestedSpeed);
        const queueInfo = await D.enqueueCampaignDispatchBatch(dispatchJobs, requestedSpeed);

        await D.logAudit(
          'CAMPANHA_DISPARO_ENFILEIRADO',
          `Disparo enfileirado na esteira BullMQ (memória): ${dispatchJobs.length} leads da safra ${batchId} a ${queueInfo.speed} msgs/s com template ${templateName}`,
          req
        );

        D.broadcastSSE('DISPATCH_QUEUED', {
          batchId,
          dispatchedCount,
          speed: queueInfo.speed,
          estimatedSeconds: queueInfo.estimatedSeconds,
          templateName,
          quarantineEndsAt: quarantineEnds
        });
        D.broadcastSSE('LEAD_UPDATED', { batchId, count: dispatchedCount });

        return res.json({
          success: true,
          queued: true,
          dispatchedCount,
          enqueuedCount: dispatchJobs.length,
          speedPerSecond: queueInfo.speed,
          estimatedDurationSeconds: queueInfo.estimatedSeconds,
          templateName,
          quarantineHours: hours,
          quarantineEndsAt: quarantineEnds,
          sellersUsed: activeSellers.map(s => s.name),
          batchId,
          speedPerMinute: Math.round(queueInfo.speed * 60),
          // o corte ao teto do plano acontece ANTES de a fila ver o número, então compara com o que o usuário pediu
          cappedByPlan: queueInfo.cappedByPlan || (Number(req.body.speedPerSecond) > queueInfo.speed + 1e-9),
          planRpm: planRpm(),
          message: `🚀 ${dispatchJobs.length} leads enfileirados à velocidade de ${Math.round(queueInfo.speed * 60)} msgs/min${queueInfo.cappedByPlan ? ` (reduzida ao teto do seu plano FluxoAPI: ${dispatchRpm()}/min)` : ''}. Duração estimada: ~${Math.ceil(queueInfo.estimatedSeconds / 60)} min.`
        } satisfies RespostaDisparo);
      }
    } catch (err: any) {
      console.error('Erro ao disparar campanha:', err);
      res.status(500).json({ error: `Erro ao executar disparo: ${err.message}` });
    }
  });

  // Endpoint para consultar e atualizar a velocidade de disparo da esteira BullMQ/Redis
  // A velocidade é limitada pelo plano da FluxoAPI, que mede por MINUTO e conta TODA requisição da credencial
  // (§A10: Starter 60/min, Pro 300, Escala 1.200, Enterprise 6.000 — env FLUXO_PLAN_RPM). O disparo usa só uma
  // fração (FLUXO_DISPATCH_SHARE, padrão 80%) para sobrar fôlego para o atendimento manual.
  app.get('/api/campaign/dispatch/speed', (req, res) => {
    const maxPerSec = maxDispatchPerSecond();
    const preset = (label: string, fraction: number, extra: string) => {
      const speed = Math.max(1 / 60, maxPerSec * fraction);
      return { label, speed, perMinute: Math.round(speed * 60), description: `${Math.round(speed * 60)} msgs/min - ${extra}` };
    };
    res.json({
      currentSpeed: D.getCampaignSpeed(),
      currentPerMinute: Math.round(D.getCampaignSpeed() * 60),
      maxSpeed: maxPerSec,
      maxPerMinute: dispatchRpm(),
      planRpm: planRpm(),
      presets: [
        preset('Seguro / Aquecimento', 0.25, 'Recomendado para números recentes'),
        preset('Equilibrado', 0.5, 'Ritmo comercial seguro'),
        preset('Máximo do plano', 1, 'Teto do seu plano FluxoAPI (reserva fôlego p/ o atendimento)')
      ]
    } satisfies RespostaVelocidadeDisparo);
  });

  app.post('/api/campaign/dispatch/speed', (req, res) => {
    const { speed } = req.body;
    const requested = Number(speed);
    const newSpeed = D.setCampaignSpeed(requested);
    const cappedByPlan = Number.isFinite(requested) && requested > newSpeed + 1e-9;
    D.broadcastSocketEvent('campaign_speed_changed', { speed: newSpeed });
    D.broadcastSSE('CAMPAIGN_SPEED_CHANGED', { speed: newSpeed });
    res.json({ success: true, speed: newSpeed, perMinute: Math.round(newSpeed * 60), cappedByPlan, planRpm: planRpm() } satisfies RespostaAlteracaoVelocidade);
  });

  // Endpoint para obter o progresso em tempo real de um lote em execução
  app.get('/api/campaign/batches/:batchId/progress', (req, res) => {
    const { batchId } = req.params;
    const progress = D.getBatchProgress(batchId);
    if (!progress) {
      return res.status(404).json({ error: 'Lote não está na esteira ativa no momento.' });
    }
    const progresso: ProgressoLote = progress;
    res.json(progresso);
  });

  // Pausar execução do lote
  app.post('/api/campaign/batches/:batchId/pause', (req, res) => {
    const ok = D.pauseBatchProgress(req.params.batchId);
    D.broadcastSocketEvent('campaign_batch_paused', { batchId: req.params.batchId });
    res.json({ success: ok, batchId: req.params.batchId } satisfies RespostaAcaoLote);
  });

  // Retomar execução do lote
  app.post('/api/campaign/batches/:batchId/resume', (req, res) => {
    const ok = D.resumeBatchProgress(req.params.batchId);
    D.broadcastSocketEvent('campaign_batch_resumed', { batchId: req.params.batchId });
    res.json({ success: ok, batchId: req.params.batchId } satisfies RespostaAcaoLote);
  });

  // Cancelar execução do lote
  app.post('/api/campaign/batches/:batchId/cancel', async (req: any, res) => {
    const { batchId } = req.params;
    const ok = D.cancelBatchProgress(batchId);
    D.broadcastSocketEvent('campaign_batch_cancelled', { batchId });
    if (!D.usePostgres || !D.pgPool) {
      return res.json({ success: ok, batchId, returned: 0, message: 'Cancelado na fila. Sem Postgres: nada foi revertido no banco.' } satisfies RespostaCancelamentoLote);
    }
    try {
      // Cancelar agora também devolve para Novos Leads os que a Meta não aceitou (muda no banco, não só na memória)
      const r = await D.devolverNaoEnviadosDoLote(batchId);
      return res.json({ success: ok, batchId, returned: r.returned, removedFromQueue: r.removedFromQueue, skippedInvalid: r.skippedInvalid, message: `Disparo cancelado. ${r.message}` } satisfies RespostaCancelamentoLote);
    } catch (err: any) {
      console.error('[Cancelar] Erro ao devolver leads:', err);
      return res.status(500).json({ success: ok, batchId, error: `Cancelado na fila, mas erro ao devolver leads: ${err.message}` });
    }
  });

  // 6. Interactive Simulator Action (Simulate Lead Hot Response, Opt-out, or Quarantine Expiration)
  app.post('/api/campaign/simulate-action', async (req: any, res) => {
    const { leadId, action, responseText } = req.body;
    if (!leadId || !action) {
      return res.status(400).json({ error: 'leadId e action são obrigatórios.' });
    }

    const now = new Date().toISOString();

    try {
      let newStatus: string = 'QUARENTENA';
      let preview: string | null = null;

      if (action === 'SET_STATUS' && req.body.status) {
        newStatus = req.body.status;
        preview = responseText || null;
      } else if (action === 'HOT_RESPONSE') {
        newStatus = 'INTERESSADO';
        preview = responseText || 'Olá! Vi o link da página que vocês criaram. Ficou ótimo! Quanto custa pra colocar no ar?';
      } else if (action === 'OPTOUT') {
        newStatus = 'DESCARTADO';
        preview = 'PARAR - Não tenho interesse no momento, por favor não me mande mais mensagens.';
      } else if (action === 'EXPIRE_COLD') {
        newStatus = 'FRIO';
        preview = 'Sem resposta durante o período de quarentena. Liberado para abordagem telefônica da equipe.';
      } else if (action === 'RESET_STAGING') {
        newStatus = 'STAGING';
        preview = null;
      }

      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_LEADS_4,
          [newStatus, preview, leadId]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Lead de campanha não encontrado.' });
        }
        return res.json({ success: true, lead: result.rows[0] } satisfies RespostaAcaoSimulada);
      } else {
        const lead = D.memoryCampaignLeadsMap.get(leadId);
        if (!lead) {
          return res.status(404).json({ error: 'Lead de campanha não encontrado.' });
        }
        lead.status = newStatus as any;
        if (newStatus === 'INTERESSADO') lead.respondedAt = now;
        lead.responsePreview = preview || undefined;
        return res.json({ success: true, lead } satisfies RespostaAcaoSimulada);
      }
    } catch (err: any) {
      console.error('Erro ao simular ação do lead:', err);
      res.status(500).json({ error: `Erro na simulação: ${err.message}` });
    }
  });

  // 7. Distribute leads to Salespeople (Transfers leads into active CRM pipeline!)
  app.post('/api/campaign/distribute', async (req: any, res) => {
    const { batchId, distributions, sellerQuotas, onlyCold = true, retainHotForAdmin = !distributionByCount(), includeQuarantine = true } = req.body;

    // Normalizar distribuição aceitando tanto array de distribuições quanto objeto sellerQuotas
    let normalizedDistributions: { salespersonId: string; salespersonName: string; quota: number }[] = [];

    if (Array.isArray(distributions) && distributions.length > 0) {
      normalizedDistributions = distributions;
    } else if (sellerQuotas && typeof sellerQuotas === 'object') {
      normalizedDistributions = Object.entries(sellerQuotas).map(([sellerId, quota]) => {
        const seller = D.memorySalespeopleMap.get(sellerId);
        return {
          salespersonId: sellerId,
          salespersonName: seller ? seller.name : (sellerId === 'seller-thomas' ? 'Thomas' : sellerId),
          quota: Number(quota) || 0
        };
      }).filter(d => d.quota > 0);
    }

    if (normalizedDistributions.length === 0) {
      return res.status(400).json({ error: 'Nenhuma cota de vendedor configurada para distribuição.' });
    }

    try {
      let eligibleLeads: any[] = [];

      if (D.usePostgres && D.pgPool) {
        // Montar lista de status aceitos
        const statuses: string[] = ['FRIO'];
        if (includeQuarantine) {
          statuses.push('QUARENTENA', 'DISPARADO');
        }
        if (!onlyCold) {
          statuses.push('STAGING');
        }
        if (!retainHotForAdmin) {
          statuses.push('INTERESSADO');
        }

        const statusPlaceholders = statuses.map(s => `'${s}'`).join(', ');

        const leadsRes = await D.pgPool.query(
          `SELECT id, name, phone_number, public_url, website, niche, status
           FROM campaign_leads
           WHERE batch_id = $1 AND status IN (${statusPlaceholders}) AND is_mobile = TRUE
           ORDER BY 
             CASE WHEN status = 'FRIO' THEN 1 WHEN status = 'QUARENTENA' THEN 2 ELSE 3 END,
             created_at ASC`,
          [batchId]
        );
        eligibleLeads = leadsRes.rows;
      } else {
        eligibleLeads = Array.from(D.memoryCampaignLeadsMap.values()).filter(l => {
          if (l.batchId !== batchId || !l.isMobile) return false;
          if (l.status === 'FRIO') return true;
          if (includeQuarantine && (l.status === 'QUARENTENA' || l.status === 'DISPARADO')) return true;
          if (!onlyCold && l.status === 'STAGING') return true;
          if (!retainHotForAdmin && l.status === 'INTERESSADO') return true;
          return false;
        });
      }

      if (eligibleLeads.length === 0) {
        return res.status(400).json({ 
          error: 'Nenhum lead qualificado para distribuição nesta safra. Se os leads ainda estiverem em Quarentena, use "Liberar Leads Agora" primeiro.' 
        });
      }

      let distributedTotal = 0;
      let leadIndex = 0;
      const summaryPerSeller: { sellerName: string; count: number }[] = [];

      for (const dist of normalizedDistributions) {
        const { salespersonId, salespersonName, quota } = dist;
        if (!salespersonId || !quota || quota <= 0) continue;

        let countForThisSeller = 0;

        while (countForThisSeller < quota && leadIndex < eligibleLeads.length) {
          const lead = eligibleLeads[leadIndex];
          leadIndex++;
          countForThisSeller++;

          // Inserir / Atualizar na tabela oficial de CRM de Leads com flag para ligação telefônica
          if (D.usePostgres && D.pgPool) {
            await D.pgPool.query(
              SQL_INSERT_LEADS_2,
              [lead.id, lead.name, lead.phone_number || lead.phoneNumber, lead.public_url || lead.publicUrl, lead.website, salespersonId, salespersonName, lead.niche]
            );

            await D.pgPool.query(
              SQL_UPDATE_CAMPAIGN_LEADS_5,
              [salespersonId, salespersonName, lead.id]
            );
          } else {
            const mainLead: Lead = {
              id: lead.id,
              name: lead.name,
              phoneNumber: lead.phoneNumber || lead.phone_number,
              publicUrl: lead.publicUrl || lead.public_url,
              website: lead.website,
              columnStatus: 'Leads',
              subStatus: 'Distribuído para Ligação Ativa (Campanha)',
              salespersonId,
              salespersonName,
              niche: lead.niche,
              lastCallTag: 'Aguardando Ligação',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              callCount: 0
            };
            D.memoryLeadsMap.set(lead.id, mainLead);

            const cLead = D.memoryCampaignLeadsMap.get(lead.id);
            if (cLead) {
              cLead.assignedSalespersonId = salespersonId;
              cLead.assignedSalespersonName = salespersonName;
              cLead.status = 'FRIO';
            }
          }
        }

        if (countForThisSeller > 0) {
          summaryPerSeller.push({ sellerName: salespersonName, count: countForThisSeller });
          distributedTotal += countForThisSeller;
        }
      }

      await D.logAudit('CAMPANHA_DISTRIBUICAO_EXECUTADA', `Distribuídos ${distributedTotal} leads da safra ${batchId} entre ${summaryPerSeller.length} vendedores`, req);

      return res.json({
        success: true,
        totalDistributed: distributedTotal,
        remaining: eligibleLeads.length - leadIndex,
        summary: summaryPerSeller,
        message: `${distributedTotal} leads distribuídos com sucesso no Pipeline CRM para ligação telefônica!`
      } satisfies RespostaDistribuicaoCampanha);
    } catch (err: any) {
      console.error('Erro na distribuição de campanha:', err);
      res.status(500).json({ error: `Erro na distribuição: ${err.message}` });
    }
  });

  // Liberar quarentena antecipadamente (move leads de QUARENTENA para FRIO para ficarem aptos à discagem/distribuição)
  app.post('/api/campaign/batches/:batchId/release-quarantine', async (req: any, res) => {
    const { batchId } = req.params;
    try {
      let releasedCount = 0;
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_LEADS_6,
          [batchId]
        );
        releasedCount = result.rowCount || 0;

        await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_BATCHES_2,
          [releasedCount, batchId]
        );
      } else {
        for (const lead of D.memoryCampaignLeadsMap.values()) {
          if (lead.batchId === batchId && (lead.status === 'QUARENTENA' || lead.status === 'DISPARADO')) {
            lead.status = 'FRIO';
            lead.quarantineExpiresAt = new Date().toISOString();
            releasedCount++;
          }
        }
        const batch = D.memoryCampaignBatchesMap.get(batchId);
        if (batch) {
          batch.status = 'completed';
          batch.quarantineEndsAt = new Date().toISOString();
          batch.coldCount = (batch.coldCount || 0) + releasedCount;
        }
      }

      await D.logAudit('CAMPANHA_QUARENTENA_LIBERADA', `Liberou ${releasedCount} leads da safra ${batchId} da quarentena`, req);
      D.broadcastSSE('CAMPAIGN_BATCH_UPDATED', { batchId });

      return res.json({
        success: true,
        releasedCount,
        message: `${releasedCount} leads liberados da quarentena! Agora estão na coluna "Sem Resposta (Frio)" e prontos para distribuição e ligação.`
      } satisfies RespostaLiberacaoQuarentena);
    } catch (err: any) {
      console.error('Erro ao liberar quarentena:', err);
      return res.status(500).json({ error: `Erro ao liberar quarentena: ${err.message}` });
    }
  });

  // Salvar configurações de Quarentena no banco de dados
  app.post('/api/campaign/batches/:batchId/quarantine-config', async (req: any, res) => {
    const { batchId } = req.params;
    const { quarantineHours, allowedClosers, hotRetainedByAdmin, onReplyAction, onExpireAction } = req.body;
    const hours = Number(quarantineHours) > 0 ? Number(quarantineHours) : 4;
    const REGRA_RESPOSTA = ['lock_closer', 'notify_admin', 'move_hot_column'];
    const REGRA_EXPIRA = ['roulette_closers', 'manual_pool', 'cold_call_list'];
    if (onReplyAction !== undefined && !REGRA_RESPOSTA.includes(onReplyAction)) {
      return res.status(400).json({ success: false, error: 'Regra de resposta inválida.' });
    }
    if (onExpireAction !== undefined && !REGRA_EXPIRA.includes(onExpireAction)) {
      return res.status(400).json({ success: false, error: 'Regra de expiração inválida.' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_BATCHES_3,
          [hours, allowedClosers ? JSON.stringify(allowedClosers) : null, typeof hotRetainedByAdmin === 'boolean' ? hotRetainedByAdmin : null, batchId, onReplyAction ?? null, onExpireAction ?? null]
        );
      } else {
        const batch = D.memoryCampaignBatchesMap.get(batchId);
        if (batch) {
          batch.quarantineHours = hours;
          if (allowedClosers) batch.allowedClosers = allowedClosers;
          if (typeof hotRetainedByAdmin === 'boolean') batch.hotLeadsRetainedByAdmin = hotRetainedByAdmin;
        }
      }

      await D.logAudit('CAMPANHA_QUARENTENA_CONFIGURADA', `Atualizou parâmetros de quarentena da safra ${batchId}`, req);
      return res.json({ success: true, message: `Configurações salvas: Quarentena de ${hours}h gravada com sucesso!` } satisfies RespostaSucesso);
    } catch (err: any) {
      console.error('Erro ao salvar configuração de quarentena:', err);
      return res.status(500).json({ error: `Erro ao salvar configuração: ${err.message}` });
    }
  });

  app.post('/api/campaign/batches/:batchId/return-unsent', async (req: any, res) => {
    const { batchId } = req.params;
    try {
      if (!D.usePostgres || !D.pgPool) {
        return res.status(400).json({ success: false, error: 'Recurso disponível apenas com banco Postgres.' });
      }
      const r = await D.devolverNaoEnviadosDoLote(batchId);
      return res.json({ success: true, returned: r.returned, removedFromQueue: r.removedFromQueue, skippedInvalid: r.skippedInvalid, message: r.message } satisfies RespostaDevolucaoLeads);
    } catch (err: any) {
      console.error('[Retorno] Erro:', err);
      return res.status(500).json({ success: false, error: `Erro ao devolver leads: ${err.message}` });
    }
  });

  // Devolve para Novos Leads TODOS os leads em "Em Espera" (QUARENTENA) da safra.
  // Trava: o cliente informa quantos espera devolver (expectedCount); se não bater, nada é alterado.
  app.post('/api/campaign/batches/:batchId/return-quarantine', async (req: any, res) => {
    const { batchId } = req.params;
    const expected = Number(req.body?.expectedCount);
    try {
      if (!D.usePostgres || !D.pgPool) {
        return res.status(400).json({ success: false, error: 'Recurso disponível apenas com banco Postgres.' });
      }
      if (!Number.isInteger(expected) || expected < 0) {
        return res.status(400).json({ success: false, error: 'Informe expectedCount (quantos leads devolver).' });
      }
      const atualRes = await D.pgPool.query(
        SQL_SELECT_CAMPAIGN_LEADS_2,
        [batchId]
      );
      const atual = Number(atualRes.rows[0]?.n || 0);
      if (atual !== expected) {
        return res.status(409).json({ success: false, error: `Esperava ${expected} leads em Em Espera, mas há ${atual}. Nada foi alterado.` });
      }
      const removedFromQueue = await D.removeBatchWaitingJobs(batchId);
      const upd = await D.pgPool.query(
        SQL_UPDATE_CAMPAIGN_LEADS_7,
        [batchId]
      );
      const returned = upd.rowCount || 0;
      await D.pgPool.query(
        SQL_UPDATE_CAMPAIGN_BATCHES_4,
        [batchId]
      );
      D.broadcastSocketEvent('LEAD_UPDATED', { batchId, count: returned });
      return res.json({
        success: true,
        returned,
        removedFromQueue,
        message: `${returned} lead(s) voltaram para Novos Leads. ${removedFromQueue} mensagem(ns) removida(s) da fila.`
      } satisfies RespostaRetornoQuarentena);
    } catch (err: any) {
      console.error('[Retorno-Quarentena] Erro:', err);
      return res.status(500).json({ success: false, error: `Erro ao devolver leads: ${err.message}` });
    }
  });

  // Resetar Safra para Staging (Recuperação e recomeço limpo de disparos)
  app.post('/api/campaign/batches/:batchId/reset-staging', async (req: any, res) => {
    const { batchId } = req.params;
    try {
      let resetCount = 0;
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_LEADS_8,
          [batchId]
        );
        resetCount = result.rowCount || 0;

        await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_BATCHES_5,
          [batchId]
        );
      } else {
        for (const lead of D.memoryCampaignLeadsMap.values()) {
          if (lead.batchId === batchId && lead.isMobile) {
            lead.status = 'STAGING';
            lead.sentAt = undefined;
            lead.quarantineExpiresAt = undefined;
            lead.respondedAt = undefined;
            lead.responsePreview = undefined;
            resetCount++;
          }
        }
        const batch = D.memoryCampaignBatchesMap.get(batchId);
        if (batch) {
          batch.status = 'draft';
          batch.dispatchedCount = 0;
          batch.hotCount = 0;
          batch.coldCount = 0;
          batch.quarantineStartedAt = undefined;
          batch.quarantineEndsAt = undefined;
        }
      }

      await D.logAudit('CAMPANHA_SAFRA_RESETADA', `Resetou ${resetCount} leads da safra ${batchId} para STAGING`, req);
      D.broadcastSSE('CAMPAIGN_BATCH_UPDATED', { batchId });

      return res.json({
        success: true,
        resetCount,
        message: `Safra reiniciada! ${resetCount} leads foram restaurados para "Novos Leads (Staging)" prontos para novo disparo.`
      } satisfies RespostaResetSafra);
    } catch (err: any) {
      console.error('Erro ao resetar safra:', err);
      return res.status(500).json({ error: `Erro ao resetar safra: ${err.message}` });
    }
  });

  // Sincronizar Safra com lista real capturada no WhatsApp Web
  app.post('/api/campaign/batches/:batchId/sync-whatsapp-web', async (req: any, res) => {
    const { batchId } = req.params;
    const { items, rawText } = req.body;

    let rawList: any[] = [];
    if (Array.isArray(items)) {
      rawList = items;
    } else if (typeof rawText === 'string' && rawText.trim()) {
      try {
        const parsed = JSON.parse(rawText.trim());
        if (Array.isArray(parsed)) rawList = parsed;
        else if (parsed && Array.isArray(parsed.items)) rawList = parsed.items;
        else if (parsed && Array.isArray(parsed.leads)) rawList = parsed.leads;
      } catch {
        // Fallback: linhas de texto
        rawList = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean);
      }
    }

    if (rawList.length === 0) {
      return res.status(400).json({ error: 'Nenhum contato ou JSON fornecido para sincronização.' });
    }

    // Conjunto de nomes ignorados (contatos pessoais/sistema)
    const IGNORE_NAMES = new Set(['thomas', 'whatsapp business', 'facebook business', 'amor ❤️', 'amor', 'desconhecido', '‎desconhecido']);

    const parsedPhoneSet = new Set<string>();
    const parsedNameList: string[] = [];

    for (const item of rawList) {
      let nameVal = '';
      if (typeof item === 'string') {
        nameVal = item.trim();
      } else if (item && typeof item === 'object') {
        nameVal = String(item.nome || item.name || item.phone || item.telefone || '').trim();
      }

      if (!nameVal) continue;
      const lowerName = nameVal.toLowerCase();
      if (IGNORE_NAMES.has(lowerName)) continue;

      // Números de telefone
      const digits = nameVal.replace(/\D/g, '');
      if (digits.length >= 8) {
        parsedPhoneSet.add(digits);
        if (digits.length >= 8) parsedPhoneSet.add(digits.slice(-8));
        if (digits.length >= 9) parsedPhoneSet.add(digits.slice(-9));
        if (digits.length >= 10) parsedPhoneSet.add(digits.slice(-10));
        if (digits.length >= 11) parsedPhoneSet.add(digits.slice(-11));
      }

      // Nomes comerciais limpos
      const lettersOnly = nameVal.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
      if (lettersOnly.length >= 3 && !/^\d+$/.test(lettersOnly)) {
        parsedNameList.push(lettersOnly);
      }
    }

    let totalBatchLeads = 0;
    let confirmedDispatched = 0;
    let recycledToStaging = 0;
    let movedToLandlines = 0;
    let alreadyResponded = 0;

    try {
      if (D.usePostgres && D.pgPool) {
        const leadsRes = await D.pgPool.query(
          SQL_SELECT_CAMPAIGN_LEADS_3,
          [batchId]
        );
        const leads = leadsRes.rows || [];
        totalBatchLeads = leads.length;

        const leadsToStaging: string[] = [];
        const leadsToLandline: string[] = [];
        const leadsToConfirm: string[] = [];

        for (const lead of leads) {
          if (lead.status === 'INTERESSADO') {
            alreadyResponded++;
            continue;
          }

          const leadDigits = (lead.phone_number || '').replace(/\D/g, '');
          const last8 = leadDigits.slice(-8);
          const last9 = leadDigits.slice(-9);

          // Match por telefone
          let isMatched = (
            parsedPhoneSet.has(leadDigits) ||
            (last9.length === 9 && parsedPhoneSet.has(last9)) ||
            (last8.length === 8 && parsedPhoneSet.has(last8))
          );

          // Match por nome se ainda não deu match
          if (!isMatched && lead.name) {
            const leadCleanName = lead.name.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
            if (leadCleanName.length >= 3) {
              for (const pName of parsedNameList) {
                if (leadCleanName.includes(pName) || pName.includes(leadCleanName)) {
                  isMatched = true;
                  break;
                }
              }
            }
          }

          if (isMatched) {
            confirmedDispatched++;
            leadsToConfirm.push(lead.id);
          } else {
            // Checar se é telefone fixo (8 dígitos, início 2,3,4,5)
            const localDigits = leadDigits.startsWith('55') ? leadDigits.slice(4) : leadDigits.slice(2);
            const isLandline = localDigits.length === 8 && ['2', '3', '4', '5'].includes(localDigits[0]);

            if (isLandline) {
              movedToLandlines++;
              leadsToLandline.push(lead.id);
            } else {
              // Celular válido que NÃO foi disparado -> RECICLA PARA STAGING
              recycledToStaging++;
              leadsToStaging.push(lead.id);
            }
          }
        }

        // Executar atualizações em lote no Postgres
        if (leadsToStaging.length > 0) {
          await D.pgPool.query(
            SQL_UPDATE_CAMPAIGN_LEADS_9,
            [leadsToStaging]
          );
        }

        if (leadsToLandline.length > 0) {
          await D.pgPool.query(
            SQL_UPDATE_CAMPAIGN_LEADS_10,
            [leadsToLandline]
          );
        }

        if (leadsToConfirm.length > 0) {
          await D.pgPool.query(
            SQL_UPDATE_CAMPAIGN_LEADS_11,
            [leadsToConfirm]
          );
        }

        // Atualizar métricas da safra
        await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_BATCHES_6,
          [batchId]
        );
      } else {
        // Modo em memória
        for (const lead of D.memoryCampaignLeadsMap.values()) {
          if (lead.batchId !== batchId) continue;
          totalBatchLeads++;
          if (lead.status === 'INTERESSADO') {
            alreadyResponded++;
            continue;
          }
          const leadDigits = (lead.phoneNumber || '').replace(/\D/g, '');
          const last8 = leadDigits.slice(-8);
          const last9 = leadDigits.slice(-9);

          let isMatched = (
            parsedPhoneSet.has(leadDigits) ||
            (last9.length === 9 && parsedPhoneSet.has(last9)) ||
            (last8.length === 8 && parsedPhoneSet.has(last8))
          );

          if (!isMatched && lead.name) {
            const leadCleanName = lead.name.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase();
            if (leadCleanName.length >= 3) {
              for (const pName of parsedNameList) {
                if (leadCleanName.includes(pName) || pName.includes(leadCleanName)) {
                  isMatched = true;
                  break;
                }
              }
            }
          }

          if (isMatched) {
            confirmedDispatched++;
            lead.status = 'QUARENTENA';
          } else {
            const localDigits = leadDigits.startsWith('55') ? leadDigits.slice(4) : leadDigits.slice(2);
            const isLandline = localDigits.length === 8 && ['2', '3', '4', '5'].includes(localDigits[0]);
            if (isLandline) {
              movedToLandlines++;
              lead.status = 'DESCARTADO';
              lead.isMobile = false;
              lead.responsePreview = 'Telefone fixo comercial (Sem WhatsApp) - Destinado a ligação ativa';
            } else {
              recycledToStaging++;
              lead.status = 'STAGING';
              lead.isMobile = true;
              lead.sentAt = undefined;
              lead.quarantineExpiresAt = undefined;
            }
          }
        }
      }

      await D.logAudit('CAMPANHA_WHATSAPP_SYNC', `Sincronizou safra ${batchId} com WhatsApp Web: ${confirmedDispatched} confirmados, ${recycledToStaging} reciclados para Staging, ${movedToLandlines} fixos isolados`, req);
      D.broadcastSSE('CAMPAIGN_BATCH_UPDATED', { batchId });

      return res.json({
        success: true,
        stats: {
          totalBatchLeads,
          whatsappChatsProvided: rawList.length,
          confirmedDispatched,
          recycledToStaging,
          movedToLandlines,
          alreadyResponded
        },
        message: `Sincronização concluída com sucesso! ${confirmedDispatched} disparos confirmados e mantidos, ${recycledToStaging} celulares não disparados reciclados de volta para a 1ª Etapa e ${movedToLandlines} telefones fixos isolados para ligação.`
      } satisfies RespostaSincronizacaoWhatsApp);
    } catch (err: any) {
      console.error('Erro ao sincronizar safra com WhatsApp Web:', err);
      return res.status(500).json({ error: `Erro na sincronização: ${err.message}` });
    }
  });

  app.delete('/api/campaign/batches/:batchId', async (req: any, res) => {
    const { batchId } = req.params;
    try {
      if (D.usePostgres && D.pgPool) {
        const naoStaging = await D.pgPool.query(
          SQL_SELECT_CAMPAIGN_LEADS_4, [batchId]);
        if (naoStaging.rows[0].n > 0) {
          return res.status(409).json({
            error: `Não dá para apagar esta safra: ${naoStaging.rows[0].n} lead(s) já foram disparados ou têm resposta do cliente. Nada foi apagado.`
          });
        }
        await D.pgPool.query(SQL_DELETE_CAMPAIGN_LEADS, [batchId]);
        await D.pgPool.query(SQL_DELETE_ZIP_UPLOADS, [batchId]);
        await D.pgPool.query(SQL_DELETE_CAMPAIGN_BATCHES, [batchId]);
      } else {
        D.memoryCampaignBatchesMap.delete(batchId);
        for (const [id, lead] of D.memoryCampaignLeadsMap.entries()) {
          if (lead.batchId === batchId) {
            D.memoryCampaignLeadsMap.delete(id);
          }
        }
      }
      await D.logAudit('CAMPANHA_EXCLUIDA', `Excluiu safra ${batchId}`, req);
      D.broadcastSSE('CAMPAIGN_BATCH_DELETED', { batchId });
      return res.json({ success: true, message: 'Safra excluída com sucesso.' } satisfies RespostaSucesso);
    } catch (err: any) {
      console.error('Erro ao excluir safra:', err);
      res.status(500).json({ error: 'Erro ao excluir safra.' });
    }
  });

}
