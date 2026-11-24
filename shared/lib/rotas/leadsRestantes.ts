import type { Express } from 'express';
import { Lead, CallLog, ColumnStatus, Salesperson } from '../../types.js';
import { uxSchemaOn } from '../uxRoutes.js';
import type { RespostaOk, RespostaAuditoriaSite, RespostaAtualizacaoLead, RespostaListaLigacoes, RespostaLigacaoRegistrada, RespostaListaLigacoesGerais, RespostaDistribuicaoLeads, RespostaTransferenciaLote, RespostaRecuperacao, RespostaAtualizacaoLoteLeads, RespostaLoteLeads, RespostaExclusaoLote } from '../../contracts/rotas.js';
import { isUserAdmin } from '../serverAuth.js';
import { performWebsiteAudit } from '../auditEngine.js';


export interface DependenciasLeadsRestantes {
  readonly emitirEventoLead: any;
  readonly extractLegacyWebsite: any;
  readonly getOnlyDigits: any;
  readonly logAudit: any;
  readonly mapToColumnStatus: any;
  readonly memoryCallLogsMap: Map<string, CallLog[]>;
  readonly memoryLeadsMap: Map<string, Lead>;
  readonly memorySalespeopleMap: Map<string, Salesperson>;
  readonly pgPool: any;
  readonly processLeadItems: any;
  readonly usePostgres: any;
}

let D: DependenciasLeadsRestantes;

export function configurarLeadsRestantes(deps: DependenciasLeadsRestantes): void {
  D = deps;
}

export function registrarLeadsRestantes(app: Express): void {
  app.post('/api/leads/:id/audit', async (req: any, res) => {
    const { id } = req.params;

    try {
      let leadName = '';
      let websiteUrl = '';

      if (D.usePostgres && D.pgPool) {
        const leadRes = await D.pgPool.query('SELECT name, website FROM leads WHERE id = $1', [id]);
        if (leadRes.rowCount === 0) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }
        leadName = leadRes.rows[0].name;
        websiteUrl = leadRes.rows[0].website || '';
      } else {
        const lead = D.memoryLeadsMap.get(id);
        if (!lead) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }
        leadName = lead.name;
        websiteUrl = lead.website || '';
      }

      const report = await performWebsiteAudit(id, leadName, websiteUrl);
      return res.json(report satisfies RespostaAuditoriaSite);
    } catch (err: any) {
      console.error('Erro ao gerar auditoria do site:', err);
      res.status(500).json({ error: `Falha ao analisar site: ${err.message}` });
    }
  });

  app.post('/api/leads/batch-assign', async (req: any, res) => {
    if (req.user && !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Permissão negada. Apenas administradores podem transferir carteiras de leads.' });
    }
    const { leadIds, targetSalespersonId, targetSalespersonName } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'Nenhum lead selecionado para transferência.' });
    }
    if (!targetSalespersonId) {
      return res.status(400).json({ error: 'Vendedor de destino obrigatório.' });
    }

    try {
      let resolvedName = targetSalespersonName;
      if (!resolvedName) {
        if (D.usePostgres && D.pgPool) {
          const spRes = await D.pgPool.query('SELECT name FROM salespeople WHERE id = $1', [targetSalespersonId]);
          if (spRes.rows.length > 0) resolvedName = spRes.rows[0].name;
        } else {
          const sp = D.memorySalespeopleMap.get(targetSalespersonId);
          if (sp) resolvedName = sp.name;
        }
      }
      resolvedName = resolvedName || 'Thomas';

      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          `UPDATE leads 
           SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ANY($3::varchar[])`,
          [targetSalespersonId, resolvedName, leadIds]
        );
        return res.json({
          success: true,
          count: leadIds.length,
          message: `${leadIds.length} lead(s) transferido(s) para ${resolvedName} com sucesso!`
        } satisfies RespostaTransferenciaLote);
      } else {
        let count = 0;
        for (const id of leadIds) {
          const l = D.memoryLeadsMap.get(id);
          if (l) {
            l.salespersonId = targetSalespersonId;
            l.salespersonName = resolvedName;
            l.updatedAt = new Date().toISOString();
            count++;
          }
        }
        return res.json({
          success: true,
          count,
          message: `${count} lead(s) transferido(s) para ${resolvedName} com sucesso!`
        } satisfies RespostaTransferenciaLote);
      }
    } catch (err: any) {
      console.error('Erro ao transferir leads em lote:', err);
      res.status(500).json({ error: 'Erro ao transferir leads em lote.' });
    }
  });

  app.put('/api/leads/:id/assign', async (req: any, res) => {
    // Admin transfere qualquer lead. O vendedor DONO pode passar a própria conversa para um
    // colega (o guard de /api/leads/:id já garante que ele só chega aqui nos leads dele).
    // Antes só admin transferia, então um vendedor de férias não tinha como repassar nada.
    if (req.user && !isUserAdmin(req.user) && !req.user.salespersonId) {
      return res.status(403).json({ error: 'Sua conta não tem carteira de leads vinculada.' });
    }
    const { id } = req.params;
    const { salespersonId, salespersonName } = req.body;

    if (!salespersonId) {
      return res.status(400).json({ error: 'ID do vendedor é obrigatório.' });
    }

    try {
      let resolvedName = salespersonName;
      if (!resolvedName) {
        if (D.usePostgres && D.pgPool) {
          const spRes = await D.pgPool.query('SELECT name FROM salespeople WHERE id = $1', [salespersonId]);
          if (spRes.rows.length > 0) resolvedName = spRes.rows[0].name;
        } else {
          const sp = D.memorySalespeopleMap.get(salespersonId);
          if (sp) resolvedName = sp.name;
        }
      }
      resolvedName = resolvedName || 'Thomas';

      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `UPDATE leads SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, name, phone_number AS "phoneNumber", column_status AS "columnStatus", sub_status AS "subStatus", loss_reason AS "lossReason", salesperson_id AS "salespersonId", salesperson_name AS "salespersonName", created_at AS "createdAt", updated_at AS "updatedAt"`,
          [salespersonId, resolvedName, id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }
        return res.json({ success: true, lead: result.rows[0] } satisfies RespostaAtualizacaoLead);
      } else {
        const lead = D.memoryLeadsMap.get(id);
        if (!lead) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }
        lead.salespersonId = salespersonId;
        lead.salespersonName = resolvedName;
        lead.updatedAt = new Date().toISOString();
        D.memoryLeadsMap.set(id, lead);
        return res.json({ success: true, lead } satisfies RespostaAtualizacaoLead);
      }
    } catch (error) {
      console.error('Error assigning lead:', error);
      res.status(500).json({ error: 'Erro ao atribuir lead ao vendedor.' });
    }
  });

  app.post('/api/leads/distribute', async (req: any, res) => {
    const callerUser = req.user || {
      id: req.headers['x-user-id'] || req.body?.userId,
      email: req.headers['x-user-email'] || req.body?.userEmail,
      role: req.headers['x-user-role'] || req.body?.userRole,
      name: req.headers['x-user-name'] || req.body?.userName
    };

    // Se for explicitamente um vendedor comum não-admin, bloqueia
    if (callerUser && callerUser.role === 'salesperson' && !isUserAdmin(callerUser)) {
      return res.status(403).json({ error: 'Permissão negada. Apenas administradores podem redistribuir carteiras.' });
    }

    const { targetSalespersonId, mode = 'percentage', value, sourceSalespersonId } = req.body;

    if (!targetSalespersonId) {
      return res.status(400).json({ error: 'Vendedor(a) de destino é obrigatório.' });
    }

    const numValue = Number(value);
    if (isNaN(numValue) || numValue <= 0) {
      return res.status(400).json({ error: 'Informe um valor numérico válido (porcentagem ou quantidade).' });
    }

    try {
      let targetSalesperson: Salesperson | undefined;

      if (D.usePostgres && D.pgPool) {
        const spRes = await D.pgPool.query(`SELECT id, name, color, bg_color AS "bgColor" FROM salespeople WHERE id = $1`, [targetSalespersonId]);
        if (spRes.rows.length > 0) {
          targetSalesperson = spRes.rows[0];
        }
      } else {
        targetSalesperson = D.memorySalespeopleMap.get(targetSalespersonId);
      }

      if (!targetSalesperson) {
        return res.status(404).json({ error: 'Vendedor(a) de destino não encontrado(a).' });
      }

      let eligibleLeadIds: string[] = [];

      if (D.usePostgres && D.pgPool) {
        let query = `
          SELECT l.id
          FROM leads l
          LEFT JOIN calls c ON l.id = c.lead_id
          WHERE l.column_status = 'Leads'
            ${uxSchemaOn() ? 'AND l.blocked_at IS NULL' : ''}
        `;
        const params: any[] = [];

        if (sourceSalespersonId && sourceSalespersonId !== 'ALL') {
          params.push(sourceSalespersonId);
          query += ` AND l.salesperson_id = $${params.length}`;
        }

        query += `
          GROUP BY l.id, l.created_at
          HAVING COUNT(c.id) = 0
          ORDER BY l.created_at DESC
        `;

        const eligibleRes = await D.pgPool.query(query, params);
        eligibleLeadIds = eligibleRes.rows.map(r => r.id);
      } else {
        const allLeads = Array.from(D.memoryLeadsMap.values());
        eligibleLeadIds = allLeads
          .filter(lead => {
            if (lead.columnStatus !== 'Leads') return false;
            const calls = D.memoryCallLogsMap.get(lead.id) || [];
            if (calls.length > 0) return false;
            if (sourceSalespersonId && sourceSalespersonId !== 'ALL') {
              return (lead.salespersonId || 'seller-thomas') === sourceSalespersonId;
            }
            return true;
          })
          .map(l => l.id);
      }

      if (eligibleLeadIds.length === 0) {
        return res.status(400).json({
          error: 'Nenhum lead novo não abordado (coluna "Leads" com 0 ligações) está disponível para distribuição.'
        });
      }

      // Calculate count to transfer
      let countToTransfer = 0;
      if (mode === 'percentage') {
        const pct = Math.min(100, Math.max(1, numValue));
        countToTransfer = Math.round((eligibleLeadIds.length * pct) / 100);
        if (countToTransfer < 1 && eligibleLeadIds.length > 0) countToTransfer = 1;
      } else {
        countToTransfer = Math.min(eligibleLeadIds.length, Math.max(1, Math.floor(numValue)));
      }

      const idsToTransfer = eligibleLeadIds.slice(0, countToTransfer);

      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          `UPDATE leads 
           SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = ANY($3::text[])`,
          [targetSalesperson.id, targetSalesperson.name, idsToTransfer]
        );
      } else {
        for (const id of idsToTransfer) {
          const lead = D.memoryLeadsMap.get(id);
          if (lead) {
            lead.salespersonId = targetSalesperson.id;
            lead.salespersonName = targetSalesperson.name;
            lead.updatedAt = new Date().toISOString();
            D.memoryLeadsMap.set(id, lead);
          }
        }
      }

      return res.json({
        success: true,
        transferredCount: idsToTransfer.length,
        targetSalespersonName: targetSalesperson.name,
        totalEligibleBefore: eligibleLeadIds.length,
        remainingEligible: eligibleLeadIds.length - idsToTransfer.length
      } satisfies RespostaDistribuicaoLeads);
    } catch (error: any) {
      console.error('Error distributing leads:', error);
      res.status(500).json({ error: `Erro ao distribuir leads: ${error.message}` });
    }
  });

  app.post('/api/leads/recover-phones', async (req, res) => {
    try {
      let recoveredCount = 0;

      if (D.usePostgres && D.pgPool) {
        // 1. Procura em registros de chamadas anteriores
        const callsWithComments = await D.pgPool.query(`
          SELECT c.lead_id, c.comment, c.tag, l.phone_number AS current_phone
          FROM calls c
          JOIN leads l ON c.lead_id = l.id
          WHERE l.phone_number = '(Sem telefone)' OR l.phone_number = '' OR l.phone_number IS NULL
        `);

        for (const row of callsWithComments.rows) {
          const text = `${row.comment || ''} ${row.tag || ''}`;
          const match = text.match(/(?:\(?([1-9]{2})\)?\s*?)?(9\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})/);
          if (match && match[0]) {
            const cleanPhone = match[0].trim();
            await D.pgPool.query(
              `UPDATE leads SET phone_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [cleanPhone, row.lead_id]
            );
            recoveredCount++;
          }
        }

        // 2. Extrai telefone se o ID, Nome ou link contiver números válidos
        const leadsWithoutPhone = await D.pgPool.query(`
          SELECT id, name, public_url FROM leads 
          WHERE phone_number = '(Sem telefone)' OR phone_number = '' OR phone_number IS NULL
        `);

        for (const lead of leadsWithoutPhone.rows) {
          const textToSearch = `${lead.id} ${lead.name} ${lead.public_url || ''}`;
          const phoneMatch = textToSearch.match(/(?:\+?55\s?)?(?:\(?([1-9]{2})\)?\s*?)?(9\d{4}[-\s]?\d{4})/);
          if (phoneMatch && phoneMatch[0]) {
            const foundNumber = phoneMatch[0].trim();
            if (foundNumber.replace(/\D/g, '').length >= 8) {
              await D.pgPool.query(
                `UPDATE leads SET phone_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [foundNumber, lead.id]
              );
              recoveredCount++;
            }
          }
        }

        return res.json({
          success: true,
          recoveredCount,
          message: `${recoveredCount} telefones recuperados e restaurados no banco!`
        } satisfies RespostaRecuperacao);
      } else {
        for (const lead of D.memoryLeadsMap.values()) {
          if (!lead.phoneNumber || lead.phoneNumber === '(Sem telefone)') {
            const calls = D.memoryCallLogsMap.get(lead.id) || [];
            for (const c of calls) {
              const match = `${c.comment} ${c.tag}`.match(/(?:\(?([1-9]{2})\)?\s*?)?(9\d{4}[-\s]?\d{4}|\d{4}[-\s]?\d{4})/);
              if (match && match[0]) {
                lead.phoneNumber = match[0].trim();
                recoveredCount++;
                break;
              }
            }
          }
        }
        return res.json({
          success: true,
          recoveredCount,
          message: `${recoveredCount} telefones restaurados em memória!`
        } satisfies RespostaRecuperacao);
      }
    } catch (err: any) {
      console.error('Error recovering phones:', err);
      res.status(500).json({ error: `Erro ao recuperar telefones: ${err.message}` });
    }
  });

  app.post('/api/leads/recover-websites', async (req, res) => {
    try {
      let recoveredCount = 0;

      if (D.usePostgres && D.pgPool) {
        // 1. Procura leads onde website está vazio mas public_url ou categories tem link externo
        const candidatesRes = await D.pgPool.query(`
          SELECT id, public_url, categories, niche 
          FROM leads 
          WHERE website IS NULL OR website = '' OR website = '-'
        `);

        for (const row of candidatesRes.rows) {
          let foundSite = '';

          // Se public_url tiver um site externo que não é Nyroh nem Ditho
          if (row.public_url && typeof row.public_url === 'string') {
            const lower = row.public_url.toLowerCase();
            if (
              !lower.includes('nyroh.') &&
              !lower.includes('ditho.') &&
              !lower.includes('google.com') &&
              !lower.includes('maps.') &&
              (lower.startsWith('http') || lower.includes('.com') || lower.includes('.site') || lower.includes('.app'))
            ) {
              foundSite = row.public_url.trim();
            }
          }

          // Se categories tiver uma URL
          if (!foundSite && row.categories && typeof row.categories === 'string') {
            const urlMatch = row.categories.match(/(?:https?:\/\/|www\.)[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+(?:\/[^\s"',]*)?/i);
            if (
              urlMatch &&
              urlMatch[0] &&
              !urlMatch[0].toLowerCase().includes('nyroh') &&
              !urlMatch[0].toLowerCase().includes('ditho') &&
              !urlMatch[0].toLowerCase().includes('google')
            ) {
              let matchedUrl = urlMatch[0].trim();
              if (!matchedUrl.startsWith('http')) matchedUrl = `https://${matchedUrl}`;
              foundSite = matchedUrl;
            }
          }

          if (foundSite) {
            await D.pgPool.query(
              `UPDATE leads SET website = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [foundSite, row.id]
            );
            recoveredCount++;
          }
        }

        // 2. Procura em registros de chamadas se algum vendedor ou bot anotou o site do cliente no comentário
        const callsRes = await D.pgPool.query(`
          SELECT c.lead_id, c.comment, l.website
          FROM calls c
          JOIN leads l ON c.lead_id = l.id
          WHERE l.website IS NULL OR l.website = '' OR l.website = '-'
        `);

        for (const row of callsRes.rows) {
          if (row.comment && typeof row.comment === 'string') {
            const urlMatch = row.comment.match(/(?:https?:\/\/|www\.)[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+(?:\/[^\s]*)?/i);
            if (
              urlMatch &&
              urlMatch[0] &&
              !urlMatch[0].toLowerCase().includes('nyroh') &&
              !urlMatch[0].toLowerCase().includes('ditho') &&
              !urlMatch[0].toLowerCase().includes('google.com')
            ) {
              let cleanSite = urlMatch[0].trim();
              if (!cleanSite.startsWith('http')) cleanSite = `https://${cleanSite}`;
              await D.pgPool.query(
                `UPDATE leads SET website = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [cleanSite, row.lead_id]
              );
              recoveredCount++;
            }
          }
        }

        return res.json({
          success: true,
          recoveredCount,
          message: `${recoveredCount} sites recuperados e sincronizados com sucesso no banco!`
        } satisfies RespostaRecuperacao);
      } else {
        for (const lead of D.memoryLeadsMap.values()) {
          if (!lead.website || !lead.website.trim() || lead.website === '-') {
            if (
              lead.publicUrl &&
              !lead.publicUrl.includes('nyroh.') &&
              !lead.publicUrl.includes('ditho.') &&
              !lead.publicUrl.includes('google.')
            ) {
              lead.website = lead.publicUrl;
              lead.updatedAt = new Date().toISOString();
              recoveredCount++;
            }
          }
        }

        return res.json({
          success: true,
          recoveredCount,
          message: `${recoveredCount} sites restaurados em memória!`
        } satisfies RespostaRecuperacao);
      }
    } catch (err: any) {
      console.error('Error recovering websites:', err);
      res.status(500).json({ error: `Erro ao recuperar sites: ${err.message}` });
    }
  });

  app.post('/api/leads/batch-update', async (req, res) => {
    try {
      const { jsonPayload, defaultStatus = 'Recusado', addCallLog = true } = req.body;

      if (!jsonPayload) {
        return res.status(400).json({ error: 'Payload JSON é obrigatório.' });
      }

      let parsed: any = jsonPayload;
      if (typeof jsonPayload === 'string') {
        try {
          parsed = JSON.parse(jsonPayload);
        } catch (e: any) {
          // Try stripping comments or trailing commas
          try {
            const cleanStr = jsonPayload
              .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/g, '$1')
              .replace(/,\s*([}\]])/g, '$1');
            parsed = JSON.parse(cleanStr);
          } catch (e2: any) {
            return res.status(400).json({ error: `JSON inválido: ${e.message}` });
          }
        }
      }

      const fallbackCol = D.mapToColumnStatus(defaultStatus, 'Recusado');
      const updateTasks: {
        identifier: string;
        targetStatus: ColumnStatus;
        comment?: string;
        tag?: string;
        website?: string;
      }[] = [];

      // Parse various JSON schemas into standardized updateTasks array
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') {
            updateTasks.push({
              identifier: item.trim(),
              targetStatus: fallbackCol
            });
          } else if (item && typeof item === 'object') {
            const identifier = String(
              item.nome ||
              item.name ||
              item.lead ||
              item.telefone ||
              item.phone ||
              item.phoneNumber ||
              item.id ||
              ''
            ).trim();

            if (identifier) {
              const rawStat = item.status || item.estagio || item.coluna || item.state || item.situacao || item.situacaoWhatsApp;
              const targetStatus = D.mapToColumnStatus(rawStat, fallbackCol);
              const comment = String(item.observacao || item.comment || item.comentario || item.nota || '').trim();
              const tag = String(item.tag || item.etiqueta || 'WhatsApp abordado').trim();
              const website = D.extractLegacyWebsite(item);
              updateTasks.push({ identifier, targetStatus, comment, tag, website: website || undefined });
            }
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        // Check if it's an object with keys mapped to arrays e.g. { "não fechado": ["Lead 1", "Lead 2"], "interessado": ["Lead 3"] }
        // Or object with a "leads" or "items" property
        let targetArray = parsed.leads || parsed.data || parsed.items || parsed.clients;

        if (Array.isArray(targetArray)) {
          for (const item of targetArray) {
            if (typeof item === 'string') {
              updateTasks.push({ identifier: item.trim(), targetStatus: fallbackCol });
            } else if (item && typeof item === 'object') {
              const identifier = String(item.nome || item.name || item.lead || item.telefone || item.phone || item.id || '').trim();
              if (identifier) {
                const targetStatus = D.mapToColumnStatus(item.status || item.estagio || item.coluna, fallbackCol);
                const comment = String(item.observacao || item.comment || item.comentario || item.nota || '').trim();
                const tag = String(item.tag || item.etiqueta || 'WhatsApp abordado').trim();
                const website = D.extractLegacyWebsite(item);
                updateTasks.push({ identifier, targetStatus, comment, tag, website: website || undefined });
              }
            }
          }
        } else {
          // Treat keys of object as status names
          for (const [key, val] of Object.entries(parsed)) {
            const statusForKey = D.mapToColumnStatus(key, fallbackCol);
            if (Array.isArray(val)) {
              for (const subItem of val) {
                if (typeof subItem === 'string') {
                  updateTasks.push({ identifier: subItem.trim(), targetStatus: statusForKey });
                } else if (subItem && typeof subItem === 'object') {
                  const identifier = String(subItem.nome || subItem.name || subItem.telefone || subItem.phone || subItem.id || '').trim();
                  if (identifier) {
                    const comment = String(subItem.observacao || subItem.comment || subItem.comentario || '').trim();
                    const website = D.extractLegacyWebsite(subItem);
                    updateTasks.push({ identifier, targetStatus: statusForKey, comment, website: website || undefined });
                  }
                }
              }
            } else if (typeof val === 'string') {
              // Key could be lead name and val status, or key status and val lead name
              // Let's check if key looks like a status
              const keyAsStatus = D.mapToColumnStatus(key, '' as any);
              if (keyAsStatus) {
                updateTasks.push({ identifier: val.trim(), targetStatus: keyAsStatus });
              } else {
                const valAsStatus = D.mapToColumnStatus(val, fallbackCol);
                updateTasks.push({ identifier: key.trim(), targetStatus: valAsStatus });
              }
            }
          }
        }
      }

      if (updateTasks.length === 0) {
        return res.status(400).json({ error: 'Nenhum lead ou identificador válido foi encontrado no JSON.' });
      }

      // Load existing leads from DB/memory to perform matching
      let allLeads: Lead[] = [];
      if (D.usePostgres && D.pgPool) {
        const dbRes = await D.pgPool.query(`SELECT id, name, phone_number AS "phoneNumber", column_status AS "columnStatus" FROM leads`);
        allLeads = dbRes.rows;
      } else {
        allLeads = Array.from(D.memoryLeadsMap.values());
      }

      const updatedLeadsList: { id: string; name: string; oldStatus: string; newStatus: string }[] = [];
      const notFoundIdentifiers: string[] = [];

      for (const task of updateTasks) {
        const cleanIdent = task.identifier.toLowerCase().trim();
        const digitsIdent = D.getOnlyDigits(task.identifier);

        // Find matching lead
        let matched = allLeads.find((l) => l.id.toLowerCase() === cleanIdent);

        if (!matched && digitsIdent.length >= 8) {
          matched = allLeads.find((l) => D.getOnlyDigits(l.phoneNumber).includes(digitsIdent) || digitsIdent.includes(D.getOnlyDigits(l.phoneNumber)));
        }

        if (!matched) {
          matched = allLeads.find((l) => l.name.toLowerCase().trim() === cleanIdent);
        }

        if (!matched && cleanIdent.length >= 3) {
          matched = allLeads.find((l) => {
            const lName = l.name.toLowerCase().trim();
            return lName.includes(cleanIdent) || cleanIdent.includes(lName);
          });
        }

        if (matched) {
          const oldStatus = matched.columnStatus;
          const newStatus = task.targetStatus;

          // Perform DB update
          if (D.usePostgres && D.pgPool) {
            if (task.website) {
              await D.pgPool.query(
                `UPDATE leads SET column_status = $1, website = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
                [newStatus, task.website, matched.id]
              );
            } else {
              await D.pgPool.query(
                `UPDATE leads SET column_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                [newStatus, matched.id]
              );
            }

            if (addCallLog) {
              const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              const commentText = task.comment || `Atualizado em lote para "${newStatus}" via JSON.`;
              const tagText = task.tag || 'Atualização via JSON';
              await D.pgPool.query(
                `INSERT INTO calls (id, lead_id, tag, comment, duration_seconds, created_at)
                 VALUES ($1, $2, $3, $4, 0, CURRENT_TIMESTAMP)`,
                [callId, matched.id, tagText, commentText]
              );
            }
          } else {
            const memLead = D.memoryLeadsMap.get(matched.id);
            if (memLead) {
              memLead.columnStatus = newStatus;
              if (task.website) memLead.website = task.website;
              memLead.updatedAt = new Date().toISOString();
              D.memoryLeadsMap.set(matched.id, memLead);

              if (addCallLog) {
                const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                const existingCalls = D.memoryCallLogsMap.get(matched.id) || [];
                const newCall: CallLog = {
                  id: callId,
                  leadId: matched.id,
                  tag: task.tag || 'Atualização via JSON',
                  comment: task.comment || `Atualizado em lote para "${newStatus}" via JSON.`,
                  durationSeconds: 0,
                  createdAt: new Date().toISOString()
                };
                existingCalls.push(newCall);
                D.memoryCallLogsMap.set(matched.id, existingCalls);
                memLead.callCount = existingCalls.length;
                memLead.lastCallAt = newCall.createdAt;
                memLead.lastCallTag = newCall.tag;
              }
            }
          }

          updatedLeadsList.push({
            id: matched.id,
            name: matched.name,
            oldStatus,
            newStatus
          });
        } else {
          notFoundIdentifiers.push(task.identifier);
        }
      }

      return res.json({
        totalProcessed: updateTasks.length,
        updatedCount: updatedLeadsList.length,
        notFoundCount: notFoundIdentifiers.length,
        updatedLeads: updatedLeadsList,
        notFoundIdentifiers
      } satisfies RespostaAtualizacaoLoteLeads);
    } catch (error: any) {
      console.error('Error in batch update:', error);
      res.status(500).json({ error: `Erro ao processar atualização via JSON: ${error.message}` });
    }
  });

  app.post('/api/leads/batch', async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Formato inválido. Esperado array de items.' });
      }

      const stats = await D.processLeadItems(items, `Lote JSON ${new Date().toLocaleString('pt-BR')}`);
      return res.json(stats satisfies RespostaLoteLeads);
    } catch (error: any) {
      console.error('Error handling batch leads:', error);
      res.status(500).json({ error: `Erro ao salvar lote de leads: ${error.message}` });
    }
  });

  app.get('/api/leads/:id/calls', async (req, res) => {
    const { id } = req.params;

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `SELECT id, lead_id AS "leadId", tag, comment, duration_seconds AS "durationSeconds", follow_up_at AS "followUpAt", created_at AS "createdAt"
           FROM calls
           WHERE lead_id = $1
           ORDER BY created_at DESC`,
          [id]
        );
        return res.json(result.rows satisfies RespostaListaLigacoes);
      } else {
        const calls = D.memoryCallLogsMap.get(id) || [];
        return res.json(calls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) satisfies RespostaListaLigacoes);
      }
    } catch (error) {
      console.error('Error fetching call logs:', error);
      res.status(500).json({ error: 'Erro ao buscar histórico de ligações.' });
    }
  });

  app.post('/api/leads/:id/calls', async (req, res) => {
    const { id } = req.params;
    const { tag, comment, durationSeconds, followUpAt } = req.body;

    if (!tag) {
      return res.status(400).json({ error: 'A etiqueta da ligação é obrigatória.' });
    }

    const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();
    const duration = typeof durationSeconds === 'number' && durationSeconds >= 0 ? Math.floor(durationSeconds) : 0;
    const followUp = followUpAt && typeof followUpAt === 'string' && followUpAt.trim() ? followUpAt : null;

    try {
      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          `INSERT INTO calls (id, lead_id, tag, comment, duration_seconds, follow_up_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [callId, id, tag, comment || '', duration, followUp, createdAt]
        );

        D.emitirEventoLead('tag_mudou', id, { tag: String(tag) });

        // Touch lead updated_at and update next_follow_up_at
        if (followUp) {
          await D.pgPool.query(`UPDATE leads SET updated_at = CURRENT_TIMESTAMP, next_follow_up_at = $2 WHERE id = $1`, [id, followUp]);
        } else {
          await D.pgPool.query(`UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
        }

        return res.json({
          id: callId,
          leadId: id,
          tag,
          comment,
          durationSeconds: duration,
          followUpAt: followUp || undefined,
          createdAt
        } satisfies RespostaLigacaoRegistrada);
      } else {
        const lead = D.memoryLeadsMap.get(id);
        if (!lead) {
          return res.status(404).json({ error: 'Lead não encontrado.' });
        }

        const existingCalls = D.memoryCallLogsMap.get(id) || [];
        const newCallLog: CallLog = {
          id: callId,
          leadId: id,
          tag,
          comment: comment || '',
          durationSeconds: duration,
          followUpAt: followUp || undefined,
          createdAt
        };

        existingCalls.push(newCallLog);
        D.memoryCallLogsMap.set(id, existingCalls);

        lead.callCount = existingCalls.length;
        lead.lastCallAt = createdAt;
        lead.lastCallTag = tag;
        if (followUp) {
          lead.nextFollowUpAt = followUp;
        }
        lead.updatedAt = createdAt;
        D.memoryLeadsMap.set(id, lead);

        return res.json(newCallLog satisfies RespostaLigacaoRegistrada);
      }
    } catch (error) {
      console.error('Error adding call log:', error);
      res.status(500).json({ error: 'Erro ao registrar ligação.' });
    }
  });

  app.delete('/api/leads/:id', async (req: any, res) => {
    const { id } = req.params;
    try {
      await D.logAudit('EXCLUIR_LEAD', `Excluiu lead ID: ${id}`, req);
      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(`DELETE FROM leads WHERE id = $1`, [id]);
        return res.json({ success: true } satisfies RespostaOk);
      } else {
        D.memoryLeadsMap.delete(id);
        D.memoryCallLogsMap.delete(id);
        return res.json({ success: true } satisfies RespostaOk);
      }
    } catch (error) {
      console.error('Error deleting lead:', error);
      res.status(500).json({ error: 'Erro ao excluir lead.' });
    }
  });

  app.post('/api/leads/bulk-delete', async (req: any, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Nenhum lead selecionado para exclusão.' });
    }

    try {
      await D.logAudit('EXCLUIR_LEADS_LOTE', `Excluiu ${ids.length} leads em lote`, req);
      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(`DELETE FROM leads WHERE id = ANY($1::varchar[])`, [ids]);
        return res.json({ success: true, count: ids.length, message: `${ids.length} lead(s) excluído(s) com sucesso!` } satisfies RespostaExclusaoLote);
      } else {
        for (const id of ids) {
          D.memoryLeadsMap.delete(id);
          D.memoryCallLogsMap.delete(id);
        }
        return res.json({ success: true, count: ids.length, message: `${ids.length} lead(s) excluído(s) com sucesso!` } satisfies RespostaExclusaoLote);
      }
    } catch (error: any) {
      console.error('Error bulk deleting leads:', error);
      res.status(500).json({ error: 'Erro ao excluir leads em lote.' });
    }
  });

  app.get('/api/calls', async (req: any, res) => {
    let { salespersonId } = req.query;

    // Mesma regra de /api/leads: só admin vê as ligações da equipe toda.
    // Antes, `?salespersonId=ALL` devolvia as ligações de todo mundo para qualquer vendedor.
    if (!isUserAdmin(req.user)) {
      const own = req.user?.salespersonId;
      if (!own) return res.json([] satisfies RespostaListaLigacoesGerais);
      salespersonId = own;
    }

    try {
      if (D.usePostgres && D.pgPool) {
        let query = `
          SELECT c.id, c.lead_id AS "leadId", l.name AS "leadName", l.phone_number AS "phoneNumber",
                 l.column_status AS "columnStatus", COALESCE(l.salesperson_id, 'seller-thomas') AS "salespersonId",
                 COALESCE(l.salesperson_name, 'Thomas') AS "salespersonName",
                 c.tag, c.comment, c.duration_seconds AS "durationSeconds",
                 c.follow_up_at AS "followUpAt", c.created_at AS "createdAt"
          FROM calls c
          JOIN leads l ON c.lead_id = l.id
        `;
        const params: any[] = [];
        if (salespersonId && salespersonId !== 'ALL') {
          params.push(salespersonId);
          query += ` WHERE l.salesperson_id = $1`;
        }
        query += ` ORDER BY c.created_at DESC`;

        const result = await D.pgPool.query(query, params);
        return res.json(result.rows satisfies RespostaListaLigacoesGerais);
      } else {
        const allCalls: any[] = [];
        D.memoryCallLogsMap.forEach((calls, leadId) => {
          const lead = D.memoryLeadsMap.get(leadId);
          const sellerId = lead?.salespersonId || 'seller-thomas';
          const sellerName = lead?.salespersonName || 'Thomas';

          if (!salespersonId || salespersonId === 'ALL' || sellerId === salespersonId) {
            calls.forEach((c) => {
              allCalls.push({
                ...c,
                leadName: lead?.name || 'Lead Excluído',
                phoneNumber: lead?.phoneNumber || '',
                columnStatus: lead?.columnStatus || 'Leads',
                salespersonId: sellerId,
                salespersonName: sellerName
              });
            });
          }
        });
        allCalls.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return res.json(allCalls satisfies RespostaListaLigacoesGerais);
      }
    } catch (error) {
      console.error('Error fetching all calls:', error);
      res.status(500).json({ error: 'Erro ao buscar chamadas.' });
    }
  });

}
