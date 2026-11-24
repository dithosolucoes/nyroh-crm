/**
 * B2 (item 4.1 b): importação de leads e uploads de ZIP para as campanhas, extraídos de server.ts.
 * Rotas: POST /api/upload-zip, progresso da importação, POST /api/campaign/upload-zip,
 * GET /api/campaign/uploads, POST /api/campaign/uploads/apagar-todos, DELETE /api/campaign/uploads/:uploadId.
 * Dependências do servidor entram por configurarRotasUploads (getters, valor atual).
 */
import type { Express } from 'express';
import fs from 'fs';
import JSZip from 'jszip';
import type { ProgressoImportacao, RespostaApagarZip, RespostaApagarZipsEmLote, RespostaImportacaoIniciada, RespostaImportacaoZipDireta, RespostaListaUploads, RespostaUploadZipOk, RespostaZipEnfileirado, UploadZipRegistro } from '../../../../shared/contracts/rotas.js';
import { SQL_INSERT_CAMPAIGN_BATCHES, SQL_INSERT_CAMPAIGN_BATCHES_2, SQL_SELECT_CAMPAIGN_LEADS, SQL_UPDATE_CAMPAIGN_BATCHES, SQL_INSERT_ZIP_UPLOADS, SQL_SELECT_ZIP_UPLOADS, SQL_SELECT_ZIP_UPLOADS_2, SQL_SELECT_ZIP_UPLOADS_3, SQL_DELETE_CAMPAIGN_LEADS, SQL_DELETE_ZIP_UPLOADS, SQL_DELETE_CAMPAIGN_BATCHES, SQL_DELETE_ZIP_UPLOADS_2, SQL_SELECT_ZIP_UPLOADS_4, SQL_SELECT_CAMPAIGN_LEADS_2, SQL_SELECT_ZIP_UPLOADS_5, SQL_DELETE_CAMPAIGN_LEADS_2, SQL_DELETE_CAMPAIGN_BATCHES_2, SQL_DELETE_ZIP_UPLOADS_3 } from './repo/uploads.js';

export interface DependenciasUploads {
  readonly broadcastSSE: any;
  readonly bulkInsertCampaignLeads: any;
  readonly campaignImportProgressMap: Map<string, ProgressoImportacao>;
  readonly classifyPhoneNumber: any;
  readonly diskUpload: any;
  readonly enqueueZipImportJob: any;
  readonly extractLegacyWebsite: any;
  readonly extractNyrohUrl: any;
  readonly extractPhoneNumber: any;
  readonly getLeadNiche: any;
  readonly isUserAdmin: any;
  readonly logAudit: any;
  readonly memoryCampaignBatchesMap: Map<string, any>;
  readonly memoryCampaignLeadsMap: Map<string, any>;
  readonly pgPool: any;
  readonly processLeadItems: any;
  readonly sanitizeRawLead: any;
  readonly updateCampaignImportProgress: any;
  readonly usePostgres: any;
}

let D: DependenciasUploads;

export function configurarRotasUploads(deps: DependenciasUploads): void {
  D = deps;
}

export function registrarRotasUploads(app: Express): void {
  // 2. Upload ZIP recursively and parse JSONs (Otimizado para Railway com stream e fila BullMQ)
  app.post('/api/upload-zip', D.diskUpload.single('zipFile') as any, async (req, res) => {
    const tempFilePath = req.file?.path;
    try {
      if (!req.file || !tempFilePath) {
        return res.status(400).json({ error: 'Nenhum arquivo .ZIP enviado.' });
      }

      const isAsync = req.query.async === 'true';

      if (isAsync) {
        // Processamento 100% assíncrono via Worker BullMQ para Railway
        await D.enqueueZipImportJob({
          tempFilePath,
          originalFileName: req.file.originalname,
          uploadedAt: Date.now()
        });

        return res.status(202).json({
          success: true,
          queued: true,
          message: 'Arquivo .ZIP recebido com sucesso! O processamento em segundo plano foi iniciado via BullMQ.',
          fileName: req.file.originalname
        } satisfies RespostaZipEnfileirado);
      }

      const fileBuffer = await fs.promises.readFile(tempFilePath);
      const zip = new JSZip();
      const contents = await zip.loadAsync(fileBuffer);

      let totalProcessed = 0;
      let insertedCount = 0;
      let skippedDuplicates = 0;
      const errors: string[] = [];

      const jsonEntries: { relativePath: string; content: string }[] = [];

      // Recursively iterate over all files in ZIP subfolders
      for (const [relativePath, fileObj] of Object.entries(contents.files)) {
        const normPath = relativePath.replace(/\\/g, '/');
        const fileName = normPath.split('/').pop() || '';

        if (
          !fileObj.dir &&
          !normPath.includes('__MACOSX') &&
          !fileName.startsWith('.') &&
          !fileName.startsWith('._')
        ) {
          try {
            const rawContent = await fileObj.async('string');
            const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();

            const isJsonExt = normPath.toLowerCase().endsWith('.json');
            const isJsonContent = cleanContent.startsWith('{') || cleanContent.startsWith('[');

            if (cleanContent && (isJsonExt || isJsonContent)) {
              jsonEntries.push({ relativePath: normPath, content: cleanContent });
            }
          } catch (e: any) {
            errors.push(`Erro ao ler ${normPath}: ${e.message}`);
          }
        }
      }

      const allItems: any[] = [];
      for (const entry of jsonEntries) {
        try {
          let parsed: any;
          try {
            parsed = JSON.parse(entry.content);
          } catch (err1) {
            try {
              const stripped = entry.content
                .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/g, '$1')
                .replace(/,\s*([}\]])/g, '$1');
              parsed = JSON.parse(stripped);
            } catch (err2: any) {
              errors.push(`Erro ao processar JSON em ${entry.relativePath}: ${err2.message}`);
              continue;
            }
          }

          if (Array.isArray(parsed)) {
            allItems.push(...parsed);
          } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.leads)) allItems.push(...parsed.leads);
            else if (Array.isArray(parsed.data)) allItems.push(...parsed.data);
            else if (Array.isArray(parsed.clients)) allItems.push(...parsed.clients);
            else if (Array.isArray(parsed.items)) allItems.push(...parsed.items);
            else if (Array.isArray(parsed.results)) allItems.push(...parsed.results);
            else allItems.push(parsed);
          }
        } catch (err: any) {
          errors.push(`Erro ao ler ${entry.relativePath}: ${err.message}`);
        }
      }

      const stats = await D.processLeadItems(allItems, `Upload ZIP ${new Date().toLocaleString('pt-BR')}`);

      // Limpa o arquivo temporário após o término
      await fs.promises.unlink(tempFilePath).catch(() => {});

      return res.json({
        totalProcessed: stats.totalProcessed,
        insertedCount: stats.insertedCount,
        skippedDuplicates: stats.skippedDuplicates,
        errors
      } satisfies RespostaImportacaoZipDireta);
    } catch (error: any) {
      if (tempFilePath) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
      console.error('Error handling zip upload:', error);
      res.status(500).json({ error: `Erro no servidor ao processar o arquivo ZIP: ${error.message}` });
    }
  });

  // Rota de inicialização de progresso da importação
  app.post('/api/campaign/import-progress/init', (req, res) => {
    const { jobId, fileName, fileSizeBytes, batchId } = req.body;
    const id = jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const item: ProgressoImportacao = {
      jobId: id,
      batchId,
      fileName: fileName || '',
      fileSizeBytes: Number(fileSizeBytes) || 0,
      stage: 'uploading',
      percent: 5,
      statusText: 'Recebendo arquivo ZIP no disco temporário...',
      processedFiles: 0,
      totalFiles: 0,
      totalLeadsFound: 0,
      savedLeads: 0,
      validMobiles: 0,
      landlines: 0,
      withNyrohUrl: 0,
      withWebsite: 0,
      logs: [
        {
          timestamp: new Date().toLocaleTimeString('pt-BR'),
          text: `Iniciando upload de ${fileName || 'arquivo'} (${((Number(fileSizeBytes) || 0) / (1024 * 1024)).toFixed(1)} MB)...`,
          type: 'info'
        }
      ],
      startedAt: Date.now(),
      updatedAt: Date.now()
    };
    D.campaignImportProgressMap.set(id, item);
    res.json({ success: true, jobId: id } satisfies RespostaImportacaoIniciada);
  });

  // Rota de consulta de progresso em tempo real
  app.get('/api/campaign/import-progress/:jobId', (req, res) => {
    const progress = D.campaignImportProgressMap.get(req.params.jobId);
    if (!progress) {
      return res.status(404).json({ error: 'Job de importação não encontrado.' });
    }
    const progresso: ProgressoImportacao = progress;
    res.json(progresso);
  });

  // 3. Upload ZIP dedicado para a Área de Disparo (Staging Oficial Meta)
  // Otimizado com disco temporário + lotes no Postgres + faxina automática para não estourar RAM da Railway
  app.post('/api/campaign/upload-zip', D.diskUpload.single('zipFile') as any, async (req: any, res) => {
    const tempFilePath = req.file?.path;
    const jobId = req.body.jobId || `import_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      if (!req.file || !tempFilePath) {
        D.updateCampaignImportProgress(jobId, {
          stage: 'error',
          error: 'Nenhum arquivo .ZIP foi enviado pelo formulário.'
        }, { text: 'Erro: Nenhum arquivo ZIP recebido.', type: 'error' });
        return res.status(400).json({ error: 'Nenhum arquivo .ZIP enviado.' });
      }

      const { batchId: requestedBatchId, safraName } = req.body;
      let targetBatchId = requestedBatchId;
      const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(1);

      D.updateCampaignImportProgress(jobId, {
        fileName: req.file.originalname,
        fileSizeBytes: req.file.size,
        stage: 'extracting',
        percent: 20,
        statusText: `Descompactando ${req.file.originalname} (${fileSizeMB} MB) no disco...`
      }, {
        text: `Arquivo ${req.file.originalname} (${fileSizeMB} MB) recebido com segurança no disco da Railway. Descompactando...`,
        type: 'info'
      });

      const fileBuffer = await fs.promises.readFile(tempFilePath);
      const zip = new JSZip();
      const contents = await zip.loadAsync(fileBuffer);

      // Localizar arquivos JSON relevantes ignorando lixo de sistema
      const validJsonFiles: Array<{ relativePath: string; fileObj: any }> = [];
      for (const [relativePath, fileObj] of Object.entries(contents.files)) {
        const normPath = relativePath.replace(/\\/g, '/');
        const fileName = normPath.split('/').pop() || '';

        if (
          !fileObj.dir &&
          !normPath.includes('__MACOSX') &&
          !fileName.startsWith('.') &&
          !fileName.startsWith('._')
        ) {
          const isJsonExt = normPath.toLowerCase().endsWith('.json');
          if (isJsonExt || normPath.includes('cliente') || normPath.includes('lead')) {
            validJsonFiles.push({ relativePath: normPath, fileObj });
          }
        }
      }

      D.updateCampaignImportProgress(jobId, {
        stage: 'parsing',
        percent: 35,
        totalFiles: validJsonFiles.length,
        statusText: `Lendo dados de ${validJsonFiles.length} arquivos JSON extraídos...`
      }, {
        text: `${validJsonFiles.length} arquivos JSON identificados dentro do pacote ZIP. Extraindo leads...`,
        type: 'info'
      });

      const rawLeads: any[] = [];
      for (let fIdx = 0; fIdx < validJsonFiles.length; fIdx++) {
        const { relativePath, fileObj } = validJsonFiles[fIdx];
        try {
          const rawContent = await fileObj.async('string');
          const cleanContent = rawContent.replace(/^\uFEFF/, '').trim();
          if (!cleanContent) continue;

          let parsed: any;
          try {
            parsed = JSON.parse(cleanContent);
          } catch {
            const stripped = cleanContent
              .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*/g, '$1')
              .replace(/,\s*([}\]])/g, '$1');
            parsed = JSON.parse(stripped);
          }

          if (Array.isArray(parsed)) {
            rawLeads.push(...parsed);
          } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.leads)) rawLeads.push(...parsed.leads);
            else if (Array.isArray(parsed.data)) rawLeads.push(...parsed.data);
            else if (Array.isArray(parsed.clients)) rawLeads.push(...parsed.clients);
            else if (Array.isArray(parsed.items)) rawLeads.push(...parsed.items);
            else if (Array.isArray(parsed.results)) rawLeads.push(...parsed.results);
            else rawLeads.push(parsed);
          }
        } catch (err: any) {
          console.warn(`Aviso ao ler JSON em ${relativePath}:`, err.message);
        }
      }

      if (rawLeads.length === 0) {
        D.updateCampaignImportProgress(jobId, {
          stage: 'error',
          error: 'Nenhum lead encontrado nos arquivos JSON do arquivo ZIP.'
        }, { text: 'Nenhum lead encontrado nos arquivos JSON do ZIP.', type: 'error' });
        return res.status(400).json({ error: 'Nenhum lead encontrado nos arquivos JSON do arquivo ZIP.' });
      }

      // Auto-criação da Safra se não foi fornecido um batchId existente
      if (!targetBatchId) {
        targetBatchId = `safra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const name = safraName || `Safra Importada ${new Date().toLocaleDateString('pt-BR')} (${rawLeads.length} leads)`;

        if (D.usePostgres && D.pgPool) {
          await D.pgPool.query(
            SQL_INSERT_CAMPAIGN_BATCHES,
            [targetBatchId, name]
          );
        } else {
          D.memoryCampaignBatchesMap.set(targetBatchId, {
            id: targetBatchId,
            name,
            totalLeads: 0,
            validMobiles: 0,
            landlines: 0,
            withNyrohUrl: 0,
            withWebsite: 0,
            status: 'draft',
            templateName: '',
            quarantineHours: 4,
            allowedClosers: ['seller-thomas'],
            hotLeadsRetainedByAdmin: true,
            dispatchedCount: 0,
            hotCount: 0,
            coldCount: 0,
            optOutCount: 0,
            createdAt: new Date().toISOString()
          });
        }
      } else {
        const name = safraName || `Safra ${targetBatchId}`;
        if (D.usePostgres && D.pgPool) {
          await D.pgPool.query(
            SQL_INSERT_CAMPAIGN_BATCHES_2,
            [targetBatchId, name]
          );
        } else if (!D.memoryCampaignBatchesMap.has(targetBatchId)) {
          D.memoryCampaignBatchesMap.set(targetBatchId, {
            id: targetBatchId,
            name,
            totalLeads: 0,
            validMobiles: 0,
            landlines: 0,
            withNyrohUrl: 0,
            withWebsite: 0,
            status: 'draft',
            templateName: '',
            quarantineHours: 4,
            allowedClosers: ['seller-thomas'],
            hotLeadsRetainedByAdmin: true,
            dispatchedCount: 0,
            hotCount: 0,
            coldCount: 0,
            optOutCount: 0,
            createdAt: new Date().toISOString()
          });
        }
      }

      D.updateCampaignImportProgress(jobId, {
        batchId: targetBatchId,
        batchName: safraName || targetBatchId,
        stage: 'validating',
        percent: 45,
        totalLeadsFound: rawLeads.length,
        statusText: `Higienizando ${rawLeads.length.toLocaleString('pt-BR')} contatos para WhatsApp...`
      }, {
        text: `Safra ID: ${targetBatchId} configurada. Higienizando telefones e preparando gravação no PostgreSQL...`,
        type: 'info'
      });

      // Sanitização e formatação dos leads
      let validMobiles = 0;
      let landlines = 0;
      let withNyrohUrl = 0;
      let withWebsite = 0;

      const formattedLeadsToSave: Array<{
        id: string;
        batchId: string;
        name: string;
        phoneNumber: string;
        isMobile: boolean;
        publicUrl: string;
        website: string;
        niche: string;
        status: string;
        responsePreview: string | null;
        rawData?: Record<string, string> | null;
      }> = [];

      for (const item of rawLeads) {
        if (!item || typeof item !== 'object') continue;

        const leadId = String(
          item.id ||
          item.placeId ||
          item.place_id ||
          item.username ||
          item.pin ||
          `clead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        ).trim();

        const name = String(
          item.name || item.title || item.companyName || item.company_name || item.businessName || 'Lead Sem Nome'
        ).trim();

        const rawPhone = D.extractPhoneNumber(item);
        const phoneInfo = D.classifyPhoneNumber(rawPhone);
        const publicUrl = D.extractNyrohUrl(item) || '';
        const website = D.extractLegacyWebsite(item) || '';
        const niche = D.getLeadNiche(item) || 'Geral';

        if (phoneInfo.isMobile) validMobiles++;
        else landlines++;

        if (publicUrl) withNyrohUrl++;
        if (website) withWebsite++;

        const initialStatus = phoneInfo.isValid ? 'STAGING' : 'DESCARTADO';
        const descReason = !phoneInfo.isValid ? 'Número inválido ou sem telefone informado' : null;

        formattedLeadsToSave.push({
          id: leadId,
          batchId: targetBatchId,
          name,
          phoneNumber: phoneInfo.formatted,
          isMobile: phoneInfo.isMobile,
          publicUrl,
          website,
          niche,
          status: initialStatus,
          responsePreview: descReason,
          rawData: D.sanitizeRawLead(item)
        });
      }

      let dedupSkippedContacted = 0;
      let dedupSkippedRepeated = 0;

      // DEDUP POR TELEFONE: não sobe de novo quem já recebeu disparo (outra safra ou CRM) nem quem está repetido no arquivo.
      if (D.pgPool) {
        const alreadyContacted = new Set<string>();
        try {
          // Qualquer lead que já exista com esse telefone (qualquer safra, qualquer status, ou no CRM) não sobe de novo.
          const prev = await D.pgPool.query(
            SQL_SELECT_CAMPAIGN_LEADS
          );
          for (const r of prev.rows) if (r.d) alreadyContacted.add(String(r.d));
        } catch (dedupErr: any) {
          console.warn('[Import] Dedup por telefone indisponível:', dedupErr.message);
        }

        const seenInFile = new Set<string>();
        const kept: typeof formattedLeadsToSave = [];
        let skippedContacted = 0;
        let skippedRepeated = 0;
        for (const item of formattedLeadsToSave) {
          const d = String(item.phoneNumber || '').replace(/[^0-9]/g, '');
          if (!d) { kept.push(item); continue; }
          if (alreadyContacted.has(d)) { skippedContacted++; continue; }
          if (seenInFile.has(d)) { skippedRepeated++; continue; }
          seenInFile.add(d);
          kept.push(item);
        }
        if (skippedContacted || skippedRepeated) {
          console.log(`[Import] Ignorados: ${skippedContacted} já disparado(s) antes, ${skippedRepeated} repetido(s) no arquivo.`);
        }
        dedupSkippedContacted = skippedContacted;
        dedupSkippedRepeated = skippedRepeated;
        formattedLeadsToSave.length = 0;
        formattedLeadsToSave.push(...kept);
      }

      // Gravação em Lotes no PostgreSQL (Chunks de 250 itens por consulta SQL)
      // Isso evita estourar memória RAM e reduz 15.000 queries para apenas algumas dezenas
      const CHUNK_SIZE = 250;
      const totalBatches = Math.ceil(formattedLeadsToSave.length / CHUNK_SIZE);
      let savedLeadsCount = 0;

      D.updateCampaignImportProgress(jobId, {
        stage: 'saving_db',
        percent: 50,
        totalBatches,
        currentBatchIndex: 1,
        validMobiles,
        landlines,
        withNyrohUrl,
        withWebsite,
        statusText: `Gravando leads no PostgreSQL (Lote 1 de ${totalBatches})...`
      }, {
        text: `Iniciando gravação no PostgreSQL em ${totalBatches} lotes de ${CHUNK_SIZE} leads...`,
        type: 'info'
      });

      for (let cIdx = 0; cIdx < formattedLeadsToSave.length; cIdx += CHUNK_SIZE) {
        const chunk = formattedLeadsToSave.slice(cIdx, cIdx + CHUNK_SIZE);
        const currentBatchNumber = Math.floor(cIdx / CHUNK_SIZE) + 1;

        if (D.usePostgres && D.pgPool) {
          await D.bulkInsertCampaignLeads(D.pgPool, chunk);
        } else {
          // Fallback em memória
          for (const l of chunk) {
            D.memoryCampaignLeadsMap.set(l.id, {
              id: l.id,
              batchId: l.batchId,
              name: l.name,
              phoneNumber: l.phoneNumber,
              isMobile: l.isMobile,
              publicUrl: l.publicUrl,
              website: l.website,
              niche: l.niche,
              status: l.status as any,
              responsePreview: l.responsePreview || undefined,
              rawData: l.rawData || null,
              createdAt: new Date().toISOString()
            });
          }
        }

        savedLeadsCount += chunk.length;
        const progressPercent = Math.min(95, 50 + Math.floor((savedLeadsCount / formattedLeadsToSave.length) * 45));

        D.updateCampaignImportProgress(jobId, {
          savedLeads: savedLeadsCount,
          currentBatchIndex: currentBatchNumber,
          percent: progressPercent,
          statusText: `Gravando no PostgreSQL: ${savedLeadsCount.toLocaleString('pt-BR')} de ${formattedLeadsToSave.length.toLocaleString('pt-BR')} leads (${currentBatchNumber}/${totalBatches})...`
        }, {
          text: `Lote ${currentBatchNumber}/${totalBatches} gravado com sucesso no PostgreSQL (+${chunk.length} leads).`,
          type: 'info'
        });
      }

      // Atualização final dos contadores da Safra
      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          SQL_UPDATE_CAMPAIGN_BATCHES,
          [targetBatchId]
        );
      } else {
        const b = D.memoryCampaignBatchesMap.get(targetBatchId);
        if (b) {
          const batchLeads = Array.from(D.memoryCampaignLeadsMap.values()).filter(l => l.batchId === targetBatchId);
          b.totalLeads = batchLeads.length;
          b.validMobiles = batchLeads.filter(l => l.isMobile).length;
          b.landlines = batchLeads.filter(l => !l.isMobile).length;
          b.withNyrohUrl = batchLeads.filter(l => Boolean(l.publicUrl)).length;
          b.withWebsite = batchLeads.filter(l => Boolean(l.website)).length;
        }
      }

      if (D.usePostgres && D.pgPool) {
        try {
          await D.pgPool.query(
            SQL_INSERT_ZIP_UPLOADS,
            [jobId, targetBatchId, req.file.originalname, req.file.size, rawLeads.length, savedLeadsCount, dedupSkippedContacted, dedupSkippedRepeated, validMobiles, landlines]
          );
        } catch (histErr: any) {
          console.warn('[Import] Histórico do ZIP não gravado:', histErr.message);
        }
      }

      await D.logAudit('CAMPANHA_ZIP_IMPORTADO', `Safra ID: ${targetBatchId} - ${savedLeadsCount} leads processados em lotes`, req);

      D.updateCampaignImportProgress(jobId, {
        stage: 'completed',
        percent: 100,
        savedLeads: savedLeadsCount,
        completedAt: Date.now(),
        statusText: `Importação concluída com sucesso! ${savedLeadsCount.toLocaleString('pt-BR')} leads salvos no PostgreSQL.`
      }, {
        text: `🎉 Sucesso absoluto! ${validMobiles.toLocaleString('pt-BR')} celulares válidos prontos para disparo. Disco temporário limpo.`,
        type: 'success'
      });

      const resposta: RespostaUploadZipOk = {
        success: true,
        jobId,
        batchId: targetBatchId,
        totalProcessed: savedLeadsCount,
        validMobiles,
        landlines,
        withNyrohUrl,
        withWebsite
      };
      return res.json(resposta);
    } catch (err: any) {
      console.error('Erro ao importar ZIP de campanha:', err);
      D.updateCampaignImportProgress(jobId, {
        stage: 'error',
        percent: 100,
        error: err.message || 'Erro interno ao processar o arquivo ZIP.'
      }, {
        text: `Erro fatal: ${err.message}`,
        type: 'error'
      });
      res.status(500).json({ error: `Erro ao importar ZIP: ${err.message}` });
    } finally {
      // Faxina garantida: remove arquivo temporário do disco da Railway para não acumular espaço
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
        console.log(`🧹 [CleanUp Railway] Arquivo temporário de ZIP removido: ${tempFilePath}`);
      }
    }
  });

  // Histórico dos ZIPs subidos (um registro por arquivo)
  app.get('/api/campaign/uploads', async (_req, res) => {
    if (!D.usePostgres || !D.pgPool) return res.json({ uploads: [] } satisfies RespostaListaUploads);
    try {
      const r = await D.pgPool.query(
        SQL_SELECT_ZIP_UPLOADS
      );
      const resposta: RespostaListaUploads = {
        uploads: r.rows.map((x: any): UploadZipRegistro => ({
          id: x.id,
          batchId: x.batch_id,
          batchName: x.batch_name,
          fileName: x.file_name,
          fileSizeBytes: Number(x.file_size_bytes) || 0,
          leadsInZip: x.leads_in_zip,
          leadsSaved: x.leads_saved,
          skippedContacted: x.skipped_contacted,
          skippedRepeated: x.skipped_repeated,
          validMobiles: x.valid_mobiles,
          landlines: x.landlines,
          createdAt: x.created_at,
        })),
      };
      res.json(resposta);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Apaga um ZIP que foi subido por engano (e a safra dele, se for só este ZIP e nenhum lead dela foi disparado).
  // Apagar TODOS os ZIPs de uma vez. Só apaga safras sem lead já disparado. Com dryRun (padrão) só conta.
  app.post('/api/campaign/uploads/apagar-todos', async (req: any, res) => {
    if (!D.isUserAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    if (!D.usePostgres || !D.pgPool) return res.status(503).json({ error: 'Apagar exige o banco de dados.' });
    const dryRun = req.body?.dryRun !== false;
    try {
      const r = await D.pgPool.query(SQL_SELECT_ZIP_UPLOADS_2);
      const orfaos = await D.pgPool.query(
        SQL_SELECT_ZIP_UPLOADS_3);
      const apagaveis = r.rows.filter((x: any) => x.nao_staging === 0);
      const bloqueadas = r.rows.filter((x: any) => x.nao_staging > 0);
      const resumo = {
        safras: apagaveis.length,
        zips: apagaveis.reduce((a: number, x: any) => a + x.zips, 0) + orfaos.rows[0].n,
        leads: apagaveis.reduce((a: number, x: any) => a + x.staging, 0),
        bloqueadas: bloqueadas.length,
        leadsBloqueados: bloqueadas.reduce((a: number, x: any) => a + x.nao_staging, 0)
      };
      if (dryRun) return res.json({ dryRun: true, ...resumo } satisfies RespostaApagarZipsEmLote);

      for (const x of apagaveis) {
        await D.pgPool.query(SQL_DELETE_CAMPAIGN_LEADS, [x.id, 'STAGING']);
        await D.pgPool.query(SQL_DELETE_ZIP_UPLOADS, [x.id]);
        await D.pgPool.query(SQL_DELETE_CAMPAIGN_BATCHES, [x.id]);
      }
      await D.pgPool.query(SQL_DELETE_ZIP_UPLOADS_2);
      await D.logAudit('ZIPS_APAGADOS_EM_LOTE', `Apagou ${resumo.zips} ZIP(s) em ${resumo.safras} safra(s); ${resumo.leads} lead(s) em espera`, req);
      D.broadcastSSE('CAMPAIGN_BATCH_DELETED', { batchId: null });
      return res.json({ dryRun: false, ...resumo } satisfies RespostaApagarZipsEmLote);
    } catch (err: any) {
      console.error('Erro ao apagar ZIPs em lote:', err);
      return res.status(500).json({ error: 'Erro ao apagar os ZIPs.' });
    }
  });

  app.delete('/api/campaign/uploads/:uploadId', async (req: any, res) => {
    if (!D.isUserAdmin(req.user)) return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    if (!D.usePostgres || !D.pgPool) return res.status(503).json({ error: 'Apagar ZIP exige o banco de dados.' });
    const { uploadId } = req.params;
    try {
      const up = await D.pgPool.query(SQL_SELECT_ZIP_UPLOADS_4, [uploadId]);
      if (up.rowCount === 0) return res.status(404).json({ error: 'ZIP não encontrado no histórico.' });
      const { batch_id: batchId, file_name: fileName } = up.rows[0];

      if (batchId) {
        const naoStaging = await D.pgPool.query(
          SQL_SELECT_CAMPAIGN_LEADS_2, [batchId]);
        if (naoStaging.rows[0].n > 0) {
          return res.status(409).json({
            error: `Não dá para apagar: ${naoStaging.rows[0].n} lead(s) desta safra já foram disparados ou têm resposta do cliente. Nada foi apagado.`
          });
        }
        const outrosZips = await D.pgPool.query(
          SQL_SELECT_ZIP_UPLOADS_5, [batchId, uploadId]);
        if (outrosZips.rows[0].n > 0) {
          return res.status(409).json({
            error: 'Esta safra recebeu outros ZIPs, então este não pode ser apagado sozinho. Use “Apagar safra” para apagar a safra inteira. Nada foi apagado.'
          });
        }
        await D.pgPool.query(SQL_DELETE_CAMPAIGN_LEADS_2, [batchId, 'STAGING']);
        await D.pgPool.query(SQL_DELETE_CAMPAIGN_BATCHES_2, [batchId]);
      }
      await D.pgPool.query(SQL_DELETE_ZIP_UPLOADS_3, [uploadId]);
      await D.logAudit('ZIP_EXCLUIDO', `Excluiu ZIP ${fileName} (safra ${batchId || '—'})`, req);
      D.broadcastSSE('CAMPAIGN_BATCH_DELETED', { batchId });
      return res.json({ success: true, message: 'ZIP apagado.' } satisfies RespostaApagarZip);
    } catch (err: any) {
      console.error('Erro ao apagar ZIP:', err);
      return res.status(500).json({ error: 'Erro ao apagar ZIP.' });
    }
  });
}
