/**
 * B6 f2 (item 4.1 f): Fluxo e Meta administrativos extraídos de server.ts.
 */
import type { Express } from 'express';
import crypto from 'crypto';
import { cifrarSegredo } from '../cifraSegredos.js';
import { listarContas, salvarConta, registrarInstancia } from '../fluxoContas.js';

type StoredMetaTemplate = any;
type FluxoWebhookEvent = any;

import { buildMetaButtons, validateTemplateCategory, defaultExamples as neutralExamples, validateTemplateVariables } from '../templateRules.js';
import { describeFluxoError } from '../fluxoErrors.js';
import { encryptMetaToken, getEmbeddedSignupConfig, getMetaCredentials, getMetaProvider, listMetaRegistry, metaCreateTemplate, metaDeleteTemplate, metaDiscoverWabaIds, metaExchangeSignupCode, metaListPhoneNumbers, metaListTemplates, metaSendText, metaSubscribeWaba, metaValidateToken, resolveMetaAccount } from '../metaClient.js';
import { executeFluxoRequest, fluxoInstancePath } from '../fluxoClient.js';
import { isUserAdmin } from '../serverAuth.js';
import { missingFluxoVars, summarizeFluxoInstance } from '../fluxoInstanceStatus.js';
import type { RespostaCadastroContaOk, RespostaCatalogoModelosMeta, RespostaConfigEmbeddedSignup, RespostaConfigFluxo, RespostaContasMeta, RespostaCriacaoInstancia, RespostaEmbeddedSignupConcluido, RespostaEnvioTesteSucesso, RespostaEventoSimulado, RespostaEventosFluxo, RespostaInstanciasFluxo, RespostaLeituraMeta, RespostaListaModelosFluxo, RespostaMetaRemovida, RespostaModeloCriado, RespostaModoInstancia, RespostaRuntimeConfig, RespostaSalvarConfigFluxo, RespostaSincronizacaoConta, RespostaSincronizacaoModelos, RespostaSincronizacaoTodas, RespostaStatusFluxo, RespostaStatusMeta, RespostaSucesso, RespostaTesteConexaoFluxo } from '../../../../shared/contracts/rotas.js';
import { SQL_INSERT_SYSTEM_SETTINGS, SQL_INSERT_SYSTEM_SETTINGS_2, SQL_INSERT_SYSTEM_SETTINGS_3, SQL_INSERT_SYSTEM_SETTINGS_4, SQL_INSERT_SYSTEM_SETTINGS_5, SQL_INSERT_SYSTEM_SETTINGS_6, SQL_INSERT_SYSTEM_SETTINGS_7, SQL_SELECT_META_TEMPLATES, SQL_INSERT_META_TEMPLATES, SQL_INSERT_META_TEMPLATES_2, SQL_INSERT_META_TEMPLATES_3, SQL_UPDATE_META_TEMPLATES, SQL_DELETE_META_TEMPLATES, SQL_UPDATE_META_TEMPLATES_2, SQL_INSERT_META_ACCOUNTS, SQL_SELECT_META_ACCOUNTS, SQL_UPDATE_META_ACCOUNTS, SQL_INSERT_META_ACCOUNTS_2, SQL_SELECT_META_NUMBERS, SQL_DELETE_META_ACCOUNTS, SQL_SELECT_META_TEMPLATES_2 } from './repo/fluxoMeta.js';
export interface DependenciasFluxoMeta {
  readonly IS_PRODUCTION: boolean;
  readonly SIMULATORS_ENABLED: boolean;
  readonly coexistenceSeen: Map<string, number>;
  readonly fetchMetaGraphTemplates: any;
  readonly fluxoCatalogCache: any;
  setFluxoCatalogCache(valor: any): void;
  readonly getInstanceInfo: any;
  readonly lastFluxoWebhookEvents: any[];
  readonly loadMetaRegistryFromDb: any;
  readonly metaToFluxoResult: any;
  readonly memoryFluxoConfig: any;
  readonly memoryMetaConfig: any;
  readonly memoryTemplates: any[];
  readonly normalizeMetaGraphTemplate: any;
  readonly pgPool: any;
  readonly usePostgres: boolean;
  readonly sendTemplateViaFluxo: any;
  readonly syncMetaAccountIntoDb: any;
  readonly logAudit: any;
}

let D: DependenciasFluxoMeta;

export function configurarFluxoMeta(deps: DependenciasFluxoMeta): void {
  D = deps;
}

export function registrarFluxoMeta(app: Express): void {
  // Contas da FluxoAPI (hierarquia conta -> instâncias). Atrás da flag NYROH_FLUXO_CONTAS (nasce desligada).
  const contasLigadas = () => (process.env.NYROH_FLUXO_CONTAS || '').trim() === 'true';
  const contasRecusa = (req: any, res: any) => {
    if (!isUserAdmin(req.user)) {
      res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
      return true;
    }
    if (!contasLigadas() || !D.usePostgres || !D.pgPool) {
      res.status(404).json({ error: 'Recurso indisponível: ative NYROH_FLUXO_CONTAS e a migração 2026-11-fluxo-contas.sql.' });
      return true;
    }
    return false;
  };
  const auditar = (req: any, acao: string, detalhe: Record<string, unknown>) => {
    console.info('[auditoria] fluxo contas', JSON.stringify({
      por: req.user?.email || req.user?.id || 'desconhecido',
      em: new Date().toISOString(),
      acao,
      ...detalhe
    }));
  };

  app.get('/api/admin/fluxo/contas', async (req: any, res) => {
    if (contasRecusa(req, res)) return;
    try {
      return res.json({ contas: await listarContas(D.pgPool) });
    } catch (err: any) {
      return res.status(500).json({ error: 'Não foi possível listar as contas.' });
    }
  });

  app.post('/api/admin/fluxo/contas', async (req: any, res) => {
    if (contasRecusa(req, res)) return;
    try {
      const { id, nome, bmId, apiKey, apiSecret, webhookSecret } = req.body || {};
      const { id: contaId } = await salvarConta(D.pgPool, { id, nome, bmId, apiKey, apiSecret, webhookSecret });
      auditar(req, id ? 'conta_atualizada' : 'conta_criada', {
        contaId,
        campos: ['nome', 'bmId', 'apiKey', 'apiSecret', 'webhookSecret'].filter(k => req.body?.[k] !== undefined)
      });
      return res.json({ ok: true, id: contaId });
    } catch (err: any) {
      // Sem chave-mestra, a cifra recusa: nada foi gravado.
      const semChave = /NYROH_CHAVE_SEGREDOS/.test(String(err?.message));
      return res.status(semChave ? 503 : 400).json({ error: semChave ? 'Configure NYROH_CHAVE_SEGREDOS antes de salvar segredos. Nada foi gravado.' : (err?.message || 'Dados inválidos.') });
    }
  });

  app.post('/api/admin/fluxo/contas/:id/instancias', async (req: any, res) => {
    if (contasRecusa(req, res)) return;
    try {
      const { instanceId, numero, marcaId } = req.body || {};
      const { id } = await registrarInstancia(D.pgPool, String(req.params.id), { instanceId, numero, marcaId });
      auditar(req, 'instancia_registrada', { contaId: req.params.id, instanciaId: id });
      return res.json({ ok: true, id });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Dados inválidos.' });
    }
  });

  // GET config
  app.get('/api/admin/fluxo/config', (req: any, res) => {
    const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    const effectiveKey = D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '';
    const effectiveSecret = D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '';
    const effectiveInstanceId = D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

    const effectiveMetaToken = D.memoryMetaConfig.accessToken || process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '';
    const effectiveMetaWabaId = D.memoryMetaConfig.wabaId || process.env.META_WABA_ID || process.env.WHATSAPP_WABA_ID || '';
    const effectiveMetaPhoneId = D.memoryMetaConfig.phoneNumberId || process.env.META_PHONE_NUMBER_ID || '';
    const effectiveMetaVerify = D.memoryMetaConfig.verifyToken || process.env.META_VERIFY_TOKEN || 'crm_webhook_meta_token';

    // NUNCA devolver segredo inteiro ao navegador: só "está configurado" + 4 últimos dígitos.
    // Antes isto devolvia `fullApiKey` e `fullMetaAccessToken` completos — qualquer pessoa
    // com acesso à tela (ou à aba de rede do navegador) saía com a chave da operação.
    const maskSecret = (v: string) => (v ? (v.length > 4 ? `••••${v.slice(-4)}` : '••••') : '');

    return res.json({
      apiKey: maskSecret(effectiveKey),
      hasApiKey: Boolean(effectiveKey),
      hasSecret: Boolean(effectiveSecret),
      instanceId: effectiveInstanceId,
      isConfigured: Boolean(effectiveKey && effectiveSecret),
      source: (process.env.FLUXO_KEY && process.env.FLUXO_SECRET) ? 'env' : (D.memoryFluxoConfig.apiKey ? 'custom' : 'none'),
      // Credenciais diretas da Meta Cloud API
      metaAccessToken: maskSecret(effectiveMetaToken),
      hasMetaToken: Boolean(effectiveMetaToken),
      metaWabaId: effectiveMetaWabaId,
      metaPhoneNumberId: effectiveMetaPhoneId,
      metaVerifyToken: effectiveMetaVerify,
      isMetaConfigured: Boolean(effectiveMetaToken && effectiveMetaWabaId)
    } satisfies RespostaConfigFluxo);
  });

  // POST config
  app.post('/api/admin/fluxo/config', async (req: any, res) => {
    const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    const {
      apiKey,
      apiSecret,
      instanceId,
      metaAccessToken,
      metaWabaId,
      metaPhoneNumberId,
      metaVerifyToken
    } = req.body;

    // Segredo só vai para o banco CIFRADO. Sem a chave-mestra, recusa antes de mexer em qualquer coisa.
    const enviouSegredo = [apiKey, apiSecret, metaAccessToken, metaVerifyToken].some(v => v !== undefined && String(v).trim());
    if (D.usePostgres && enviouSegredo && !(process.env.NYROH_CHAVE_SEGREDOS || '').trim()) {
      return res.status(503).json({
        error: 'Configure NYROH_CHAVE_SEGREDOS no Railway antes de salvar segredos. Nada foi gravado.'
      });
    }

    if (apiKey !== undefined) D.memoryFluxoConfig.apiKey = String(apiKey).trim();
    if (apiSecret !== undefined && String(apiSecret).trim()) D.memoryFluxoConfig.apiSecret = String(apiSecret).trim();
    if (instanceId !== undefined) D.memoryFluxoConfig.instanceId = String(instanceId).trim();

    if (metaAccessToken !== undefined && String(metaAccessToken).trim()) D.memoryMetaConfig.accessToken = String(metaAccessToken).trim();
    if (metaWabaId !== undefined) D.memoryMetaConfig.wabaId = String(metaWabaId).trim();
    if (metaPhoneNumberId !== undefined) D.memoryMetaConfig.phoneNumberId = String(metaPhoneNumberId).trim();
    if (metaVerifyToken !== undefined && String(metaVerifyToken).trim()) D.memoryMetaConfig.verifyToken = String(metaVerifyToken).trim();

    // Auditoria: quem mudou e quais campos (nunca os valores).
    const camposAlterados = Object.entries({ apiKey, apiSecret, instanceId, metaAccessToken, metaWabaId, metaPhoneNumberId, metaVerifyToken })
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);
    console.info('[auditoria] config FluxoAPI/Meta alterada', JSON.stringify({
      por: req.user?.email || req.user?.id || 'desconhecido',
      em: new Date().toISOString(),
      campos: camposAlterados
    }));

    // Persist to PostgreSQL system_settings if connected
    if (D.usePostgres && D.pgPool) {
      try {
        if (apiKey !== undefined && String(apiKey).trim()) {
          await D.pgPool.query(
            SQL_INSERT_SYSTEM_SETTINGS,
            [cifrarSegredo(String(apiKey).trim())]
          );
        }
        if (apiSecret !== undefined && String(apiSecret).trim()) {
          await D.pgPool.query(
            SQL_INSERT_SYSTEM_SETTINGS_2,
            [cifrarSegredo(String(apiSecret).trim())]
          );
        }
        if (instanceId !== undefined && String(instanceId).trim()) {
          await D.pgPool.query(
            SQL_INSERT_SYSTEM_SETTINGS_3,
            [String(instanceId).trim()]
          );
        }

        if (metaAccessToken !== undefined && String(metaAccessToken).trim()) {
          await D.pgPool.query(
            SQL_INSERT_SYSTEM_SETTINGS_4,
            [cifrarSegredo(String(metaAccessToken).trim())]
          );
        }
        if (metaWabaId !== undefined && String(metaWabaId).trim()) {
          await D.pgPool.query(
            SQL_INSERT_SYSTEM_SETTINGS_5,
            [String(metaWabaId).trim()]
          );
        }
        if (metaPhoneNumberId !== undefined && String(metaPhoneNumberId).trim()) {
          await D.pgPool.query(
            SQL_INSERT_SYSTEM_SETTINGS_6,
            [String(metaPhoneNumberId).trim()]
          );
        }
        if (metaVerifyToken !== undefined && String(metaVerifyToken).trim()) {
          await D.pgPool.query(
            SQL_INSERT_SYSTEM_SETTINGS_7,
            [cifrarSegredo(String(metaVerifyToken).trim())]
          );
        }

        console.log('[PostgreSQL] Credenciais da Meta e FluxoAPI salvas com sucesso em system_settings.');
      } catch (dbErr) {
        console.error('[PostgreSQL] Erro ao gravar system_settings:', dbErr);
      }
    }

    await D.logAudit(
      'CONFIGURAR_FLUXO_WHATSAPP',
      `Admin configurou credenciais da Meta/FluxoAPI`,
      req
    );

    return res.json({
      success: true,
      message: 'Credenciais salvas com sucesso!',
      isConfigured: Boolean(D.memoryFluxoConfig.apiKey && D.memoryFluxoConfig.apiSecret),
      isMetaConfigured: Boolean(D.memoryMetaConfig.accessToken && D.memoryMetaConfig.wabaId)
    } satisfies RespostaSalvarConfigFluxo);
  });

  // POST test-connection
  app.post('/api/admin/fluxo/test-connection', async (req: any, res) => {
    const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    const apiKey = (req.body.apiKey || D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (req.body.apiSecret || D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message: 'Chave Pública (FLUXO_KEY) e Chave Secreta (FLUXO_SECRET) são obrigatórias para autenticação HMAC-SHA256.',
        hint: 'Insira as credenciais geradas no painel da FluxoAPI ou configure as variáveis de ambiente.'
      });
    }

    try {
      const result = await executeFluxoRequest({
        method: 'GET',
        path: '/v1/instances',
        apiKey,
        apiSecret
      });

      if (result.success) {
        const rawInstances = Array.isArray(result.data)
          ? result.data
          : (result.data?.instances || result.data?.data || []);

        const instances = Array.isArray(rawInstances) ? rawInstances : [];

        if (!D.memoryFluxoConfig.instanceId && instances.length > 0 && instances[0]?.id) {
          D.memoryFluxoConfig.instanceId = instances[0].id;
        }

        await D.logAudit(
          'TESTE_CONEXAO_FLUXO_SUCESSO',
          `Conexão com FluxoAPI testada com sucesso (${instances.length} instâncias encontradas, latência: ${result.latencyMs}ms)`,
          req
        );

        return res.json({
          success: true,
          latencyMs: result.latencyMs,
          instances,
          message: `Conexão autenticada via HMAC-SHA256 com sucesso! Encontrada(s) ${instances.length} instância(s).`
        } satisfies RespostaTesteConexaoFluxo);
      } else {
        await D.logAudit(
          'TESTE_CONEXAO_FLUXO_FALHA',
          `Falha ao testar FluxoAPI: ${result.error?.message || result.status}`,
          req
        );

        return res.status(result.status || 400).json({
          success: false,
          status: result.status,
          latencyMs: result.latencyMs,
          error: result.error,
          raw: result.raw,
          message: result.error?.message || 'Falha ao autenticar com a FluxoAPI.'
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'internal_error',
          message: err.message || 'Erro inesperado ao testar conexão com a FluxoAPI.'
        }
      });
    }
  });

  // POST send-test-message
  // GET status (somente leitura): diz quais variáveis faltam e se a instância está "No ar" na FluxoAPI.
  // Não envia mensagem nenhuma: só chama GET /v1/instances.
  app.get('/api/admin/fluxo/status', async (req: any, res) => {
    if (!isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }
    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
    const instanceId = (D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '').trim();
    const missing = missingFluxoVars({
      key: Boolean(apiKey),
      secret: Boolean(apiSecret),
      instanceId: Boolean(instanceId),
      webhookSecret: Boolean((process.env.FLUXO_WEBHOOK_SECRET || '').trim())
    });
    const base: Pick<RespostaStatusFluxo, 'provider' | 'missing' | 'source' | 'webhookPath'> = {
      provider: getMetaProvider(),
      missing,
      source: (process.env.FLUXO_KEY && process.env.FLUXO_SECRET) ? 'railway' : (D.memoryFluxoConfig.apiKey ? 'sistema' : 'nenhuma'),
      webhookPath: '/api/webhooks/fluxo'
    };
    if (!apiKey || !apiSecret) {
      return res.json({ ...base, connected: false, instance: summarizeFluxoInstance([], instanceId), message: 'Faltam credenciais da FluxoAPI.' } satisfies RespostaStatusFluxo);
    }
    try {
      const r = await executeFluxoRequest({ method: 'GET', path: '/v1/instances', apiKey, apiSecret });
      if (!r.success) {
        return res.json({ ...base, connected: false, instance: summarizeFluxoInstance([], instanceId), message: r.error?.message || 'FluxoAPI não respondeu com sucesso.' } satisfies RespostaStatusFluxo);
      }
      const list = Array.isArray(r.data) ? r.data : (r.data?.instances || r.data?.data || []);
      const instance = summarizeFluxoInstance(list, instanceId);
      return res.json({
        ...base,
        connected: instance.found && instance.status === 'no_ar',
        instance,
        message: instance.status === 'no_ar' ? 'FluxoAPI conectada e instância No ar.' : 'Instância encontrada, mas não está No ar.'
      } satisfies RespostaStatusFluxo);
    } catch (err: any) {
      return res.status(500).json({ ...base, connected: false, message: err?.message || 'Erro ao consultar a FluxoAPI.' });
    }
  });

  app.post('/api/admin/fluxo/send-test-message', async (req: any, res) => {
    const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    const { to, text, instanceId: requestedInstanceId } = req.body;
    if (!to || !text) {
      return res.status(400).json({ error: 'Destinatário (to) e mensagem de texto (text) são obrigatórios.' });
    }

    if (getMetaProvider() === 'meta') {
      const direct = await metaSendText(String(to), String(text));
      if (!direct.success) return res.status(502).json({ success: false, error: { code: 'meta_error', message: direct.error } });
      return res.json({ success: true, messageId: direct.data?.messages?.[0]?.id, provider: 'meta' } satisfies RespostaEnvioTesteSucesso);
    }

    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();

    if (!apiKey || !apiSecret) {
      return res.status(400).json({
        error: 'Credenciais da FluxoAPI não configuradas.',
        hint: 'Configure a Chave Pública e Secreta antes de realizar o envio.'
      });
    }

    let cleanDigits = String(to).replace(/\D/g, '');
    if (cleanDigits.length === 10 || cleanDigits.length === 11) {
      cleanDigits = `55${cleanDigits}`;
    }
    const formattedE164 = `+${cleanDigits}`;

    const instanceId = requestedInstanceId || D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

    try {
      const payload = {
        to: formattedE164,
        type: 'text',
        text: {
          body: String(text)
        }
      };

      const targetPath = fluxoInstancePath('/messages', instanceId);

      const result = await executeFluxoRequest({
        method: 'POST',
        path: targetPath,
        body: payload,
        apiKey,
        apiSecret
      });

      if (result.success) {
        await D.logAudit(
          'WHATSAPP_DISPARO_TESTE',
          `Disparou WhatsApp de teste para ${formattedE164} (instância: ${instanceId || 'padrão'})`,
          req
        );

        return res.json({
          success: true,
          to: formattedE164,
          instanceId,
          latencyMs: result.latencyMs,
          result: result.data || result.raw,
          message: 'Mensagem de teste enviada com sucesso para a fila oficial da Meta!'
        } satisfies RespostaEnvioTesteSucesso);
      } else {
        return res.status(result.status || 400).json({
          success: false,
          status: result.status,
          latencyMs: result.latencyMs,
          error: result.error,
          raw: result.raw,
          message: result.error?.message || 'Erro retornado pela FluxoAPI ao disparar mensagem.'
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        error: `Erro ao enviar mensagem: ${err.message}`
      });
    }
  });

  // WEBHOOK FLUXOAPI & EVENT STORAGE
  // List Instances — dados REAIS da FluxoAPI (GET /v1/instances). Nunca inventa uma "linha conectada".
  app.get('/api/admin/fluxo/instances', async (req: any, res) => {
    // Provedor Meta: lista os números da conta WABA direto da Meta, no formato que a tela já usa
    if (getMetaProvider() === 'meta') {
      const r = await metaListPhoneNumbers();
      const fromEnv: any[] = r.success ? (r.data?.data || []) : [];
      const reg = listMetaRegistry();
      const seen = new Set<string>();
      const instances: any[] = [];
      for (const n of fromEnv) {
        seen.add(String(n.id));
        instances.push({
          id: n.id,
          name: n.verified_name || n.display_phone_number,
          phone: n.display_phone_number,
          status: String(n.status || 'unknown').toLowerCase(),
          quality: n.quality_rating || null,
          messagingLimit: null,
          // Campo oficial da Meta (is_on_biz_app): true = número também está no app WhatsApp Business.
          // Sem o campo (versão antiga da resposta) cai no eco do celular; senão null (não verificado).
          coexistence: typeof n.is_on_biz_app === 'boolean'
            ? (n.is_on_biz_app || D.coexistenceSeen.has(String(n.id)))
            : (D.coexistenceSeen.has(String(n.id)) ? true : null),
          coexistenceSeenAt: D.coexistenceSeen.get(String(n.id)) || null,
          accountId: 'env'
        });
      }
      // Números das BMs cadastradas no CRM (multi-BM)
      for (const n of reg.numbers) {
        if (seen.has(n.phoneNumberId)) continue;
        seen.add(n.phoneNumberId);
        instances.push({
          id: n.phoneNumberId,
          name: n.verifiedName || n.displayPhoneNumber,
          phone: n.displayPhoneNumber,
          status: String(n.status || 'unknown').toLowerCase(),
          quality: n.qualityRating || null,
          messagingLimit: null,
          coexistence: D.coexistenceSeen.has(String(n.phoneNumberId)) ? true : null,
          coexistenceSeenAt: D.coexistenceSeen.get(String(n.phoneNumberId)) || null,
          accountId: n.accountId
        });
      }
      if (!r.success && instances.length === 0) {
        const friendly = String(r.error || '').includes('META_ACCESS_TOKEN')
          ? 'Token da Meta não encontrado no servidor. Confira se a variável no Railway se chama exatamente META_ACCESS_TOKEN.'
          : (r.error || 'Não foi possível listar os números da Meta.');
        return res.json({ success: false, instances: [], error: { message: friendly } } satisfies RespostaInstanciasFluxo);
      }
      return res.json({ success: true, instances, accounts: reg.accounts } satisfies RespostaInstanciasFluxo);
    }
    const apiKey = (D.memoryFluxoConfig.apiKey || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || '').trim();

    if (!apiKey || !apiSecret) {
      return res.json({
        success: false,
        configured: false,
        instances: [],
        error: describeFluxoError({ code: 'missing_credentials' })
      } satisfies RespostaInstanciasFluxo);
    }

    try {
      const result = await executeFluxoRequest({
        method: 'GET',
        path: '/v1/instances',
        apiKey,
        apiSecret
      });

      if (!result.success) {
        return res.json({
          success: false,
          configured: true,
          instances: [],
          error: describeFluxoError(result.error, result.status)
        } satisfies RespostaInstanciasFluxo);
      }

      const raw = Array.isArray(result.data) ? result.data : (result.data?.instances || result.data?.data || []);
      const list: any[] = Array.isArray(raw) ? raw : [];

      // Uma credencial presa a 1 instância: adota automaticamente se ainda não há FLUXO_INSTANCE_ID
      if (!D.memoryFluxoConfig.instanceId && list.length === 1 && list[0]?.id) {
        D.memoryFluxoConfig.instanceId = String(list[0].id);
        console.log(`ℹ️ [FluxoAPI] FLUXO_INSTANCE_ID não definido: usando a única instância encontrada (${D.memoryFluxoConfig.instanceId}).`);
      }

      return res.json({
        success: true,
        configured: true,
        selectedInstanceId: D.memoryFluxoConfig.instanceId || null,
        instances: list.map((i: any) => ({
          id: i.id,
          name: i.name || i.id,
          phone: i.phone || null,
          status: i.status || 'unknown',
          mode: i.mode || 'unknown',
          coexistence: i.mode === 'coexistence',
          quality: String(i.quality || 'unknown').toUpperCase(),
          messagingLimit24h: i.messaging_limit_24h ?? null,
          throughputMps: i.throughput_mps ?? null,
          conversations24h: i.conversations_24h ?? null,
          messages24h: i.messages_24h ?? null
        }))
      } satisfies RespostaInstanciasFluxo);
    } catch (err: any) {
      return res.json({
        success: false,
        configured: true,
        instances: [],
        error: describeFluxoError({ code: 'network_error', message: err?.message })
      } satisfies RespostaInstanciasFluxo);
    }
  });

  app.get('/api/runtime-config', async (_req: any, res) => {
    const info = await D.getInstanceInfo();
    res.json({
      simulatorsEnabled: D.SIMULATORS_ENABLED,
      isProduction: D.IS_PRODUCTION,
      instancePhone: info.phone || null,
      instanceStatus: info.status || 'unknown',
      whatsappConnected: info.status === 'connected'
    } satisfies RespostaRuntimeConfig);
  });

  // GET /api/admin/fluxo/instance-mode (T30: Diagnóstico do modo da instância para verificar se Coexistence está ativo)
  app.get('/api/admin/fluxo/instance-mode', async (req: any, res) => {
    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
    const instanceId = (D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '').trim();

    if (!apiKey || !apiSecret || !instanceId) {
      return res.status(400).json({
        configured: false,
        error: 'Credenciais da FluxoAPI ou FLUXO_INSTANCE_ID não configurados.',
        mode: 'unknown',
        status: 'unconfigured'
      });
    }

    try {
      const result = await executeFluxoRequest({
        method: 'GET',
        path: `/v1/instances/${instanceId}`,
        apiKey,
        apiSecret
      });

      if (result.success && result.data) {
        const inst = result.data;
        const mode = inst.mode || 'unknown';
        const status = inst.status || 'unknown';
        const isCoexistenceReady = mode === 'coexistence' && status === 'connected';

        return res.json({
          configured: true,
          instanceId,
          mode,
          status,
          quality: inst.quality || 'unknown',
          throughputMps: inst.throughput_mps || 80,
          messagingLimit24h: inst.messaging_limit_24h || 250,
          isCoexistenceReady,
          coexistenceNotice: isCoexistenceReady
            ? 'Coexistência ativa: mensagens enviadas pelo aplicativo WhatsApp Business do celular serão espelhadas no CRM.'
            : mode !== 'coexistence'
            ? 'Atenção: A instância está em modo api_only. Para ver mensagens enviadas pelo celular no CRM, ative o modo Coexistence no painel da FluxoAPI.'
            : 'Instância em modo coexistence, porém status ainda não está conectado.',
          raw: inst
        } satisfies RespostaModoInstancia);
      }

      return res.status(result.status || 500).json({
        configured: true,
        error: result.error?.message || 'Falha ao consultar instância na FluxoAPI.',
        raw: result.raw
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Create or Connect Instance
  app.post('/api/admin/fluxo/instances', async (req: any, res) => {
    const { name, phone } = req.body;
    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();

    try {
      const result = await executeFluxoRequest({
        method: 'POST',
        path: '/v1/instances',
        body: { name: name || 'NOVA_INSTANCIA', phone: phone || undefined },
        apiKey,
        apiSecret
      });

      await D.logAudit(
        'CRIAR_INSTANCIA_FLUXO',
        `Tentativa de criar instância ${name || 'NOVA'}`,
        req
      );

      return res.json({
        success: result.success,
        data: result.data || result.raw,
        message: result.success ? 'Instância criada com sucesso na FluxoAPI!' : (result.error?.message || 'Falha ao criar instância.')
      } satisfies RespostaCriacaoInstancia);
    } catch (err: any) {
      return res.status(500).json({ error: `Erro ao criar instância: ${err.message}` });
    }
  });

  // List Templates
  app.get('/api/admin/fluxo/templates', async (req: any, res) => {
    // Provedor Meta: lê os modelos da conta WABA direto da Meta, com o status de aprovação
    if (getMetaProvider() === 'meta') {
      // Modelos de TODAS as BMs (ambiente + cadastradas), cada um marcado com a origem
      const accountIds = ['env', ...listMetaRegistry().accounts.map(a => a.id)];
      const templates: any[] = [];
      const errors: any[] = [];
      for (const accountId of accountIds) {
        const acc = resolveMetaAccount(accountId);
        const r = await metaListTemplates(accountId);
        if (!r.success) { errors.push({ accountId, accountName: acc?.name, message: r.error }); continue; }
        for (const t of r.data?.data || []) {
          templates.push({
            id: `${accountId}:${t.id || t.name}`,
            name: t.name,
            category: t.category,
            language: t.language,
            status: t.status,
            components: t.components || [],
            usageCount: 0,
            qualityScore: t.quality_score?.score || 'UNKNOWN',
            rejectedReason: t.rejected_reason || null,
            submittedToMeta: true,
            accountId,
            accountName: acc?.name || accountId
          });
        }
      }
      if (templates.length === 0 && errors.length > 0) return res.json({ success: false, templates: [], error: { message: errors[0].message }, errors } satisfies RespostaListaModelosFluxo);
      return res.json({ success: true, templates, errors } satisfies RespostaListaModelosFluxo);
    }
    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
    const instanceId = D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

    const metaToken = (D.memoryMetaConfig.accessToken || process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '').trim();
    const metaWabaId = (D.memoryMetaConfig.wabaId || process.env.META_WABA_ID || process.env.WHATSAPP_WABA_ID || '').trim();

    const map = new Map<string, any>();
    let remoteError: string | null = null;
    let remoteMetaCount = 0;
    let remoteFluxoCount = 0;

    // 1. Carrega todos os templates salvos localmente em PostgreSQL (incluindo DRAFT, PENDING, APPROVED)
    if (D.usePostgres && D.pgPool) {
      try {
        const dbRes = await D.pgPool.query(
          SQL_SELECT_META_TEMPLATES
        );
        for (const r of dbRes.rows) {
          const comps = typeof r.components === 'string' ? JSON.parse(r.components) : (r.components || []);
          map.set(r.name.toLowerCase(), {
            id: r.id,
            name: r.name,
            category: r.category,
            language: r.language,
            status: r.status,
            components: comps,
            headerText: comps.find((c: any) => c.type === 'HEADER')?.text || '',
            bodyText: comps.find((c: any) => c.type === 'BODY')?.text || '',
            footerText: comps.find((c: any) => c.type === 'FOOTER')?.text || '',
            buttons: comps.find((c: any) => c.type === 'BUTTONS')?.buttons || [],
            usageCount: Number(r.usage_count) || 0,
            qualityScore: r.quality_score || 'GREEN',
            rejectedReason: r.rejected_reason || null,
            createdAt: r.created_at,
            submittedToMeta: r.status !== 'DRAFT',
            sendable: r.status === 'APPROVED'
          });
        }
      } catch (err) {
        console.warn('[PostgreSQL] Erro ao carregar meta_templates:', err);
      }
    }

    // Rascunhos em memória
    D.memoryTemplates.forEach(t => {
      if (t.status === 'DRAFT' && !map.has(t.name.toLowerCase())) {
        map.set(t.name.toLowerCase(), t);
      }
    });

    // 2. Consulta direta à Meta Graph API Oficial se credenciais estiverem configuradas
    if (metaToken && metaWabaId) {
      try {
        const metaRes = await D.fetchMetaGraphTemplates(metaToken, metaWabaId);
        if (metaRes.success && metaRes.templates) {
          remoteMetaCount = metaRes.templates.length;
          for (const rawTpl of metaRes.templates) {
            const normalized = D.normalizeMetaGraphTemplate(rawTpl);
            map.set(normalized.name.toLowerCase(), normalized);

            // Salva/sincroniza no PostgreSQL para persistência definitiva
            if (D.usePostgres && D.pgPool) {
              try {
                await D.pgPool.query(
                  SQL_INSERT_META_TEMPLATES,
                  [
                    normalized.id,
                    normalized.name,
                    normalized.category,
                    normalized.language,
                    normalized.status,
                    JSON.stringify(normalized.components),
                    normalized.usageCount,
                    normalized.qualityScore,
                    normalized.rejectedReason
                  ]
                );
              } catch (upsertErr) {
                console.warn(`[PostgreSQL] Falha ao sincronizar template "${normalized.name}":`, upsertErr);
              }
            }
          }
        } else if (metaRes.error) {
          remoteError = metaRes.error;
        }
      } catch (metaErr: any) {
        remoteError = metaErr.message;
      }
    }

    // 3. Consulta à FluxoAPI se configurada
    if (apiKey && apiSecret) {
      try {
        const path = instanceId ? `/v1/instances/${instanceId}/templates` : '/v1/templates';
        const result = await executeFluxoRequest({
          method: 'GET',
          path,
          apiKey,
          apiSecret
        });
        if (result.success && result.data) {
          const fluxoTpls = Array.isArray(result.data) ? result.data : (result.data?.data || result.data?.templates || []);
          remoteFluxoCount = fluxoTpls.length;
          fluxoTpls.forEach((t: any) => {
            if (t && t.name) {
              const reconstructedComponents: any[] = [];
              if (t.headerText) reconstructedComponents.push({ type: 'HEADER', format: 'TEXT', text: t.headerText });
              if (t.bodyText) reconstructedComponents.push({ type: 'BODY', text: t.bodyText });
              if (t.footerText) reconstructedComponents.push({ type: 'FOOTER', text: t.footerText });
              if (t.buttons && Array.isArray(t.buttons) && t.buttons.length > 0) {
                reconstructedComponents.push({ type: 'BUTTONS', buttons: t.buttons });
              }

              const rawStatus = (t.status || 'PENDING').toUpperCase();
              let qScore = 'GREEN';
              if (t.quality_score && typeof t.quality_score === 'object') {
                qScore = t.quality_score.score || 'GREEN';
              } else if (typeof t.quality_score === 'string') {
                qScore = t.quality_score;
              }

              const isRejected = rawStatus === 'REJECTED';
              const rejectedReason = isRejected ? (t.blockedReason || 'Rejeitado pelas políticas da Meta') : null;

              map.set(t.name.toLowerCase(), {
                id: t.id || `tpl_${t.name}`,
                name: t.name,
                category: (t.category || 'UTILITY').toUpperCase(),
                language: t.language || 'pt_BR',
                status: rawStatus,
                components: reconstructedComponents,
                headerText: t.headerText || '',
                bodyText: t.bodyText || '',
                footerText: t.footerText || '',
                buttons: t.buttons || [],
                usageCount: 0,
                qualityScore: qScore,
                rejectedReason,
                createdAt: new Date().toISOString(),
                submittedToMeta: true,
                sendable: rawStatus === 'APPROVED',
                blockedReason: t.blockedReason || null,
                fields: t.fields || []
              });
            }
          });
        }
      } catch (err: any) {
        if (!remoteError) remoteError = err.message;
      }
    }

    return res.json({
      success: true,
      templates: Array.from(map.values()),
      remoteMetaCount,
      remoteFluxoCount,
      remoteCount: remoteMetaCount + remoteFluxoCount,
      remoteError,
      metaConnected: Boolean(metaToken && metaWabaId)
    } satisfies RespostaListaModelosFluxo);
  });

  // Sincronização explícita em tempo real com a Meta
  app.post('/api/admin/fluxo/templates/sync-meta', async (req: any, res) => {
    const metaToken = (D.memoryMetaConfig.accessToken || process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || '').trim();
    const metaWabaId = (D.memoryMetaConfig.wabaId || process.env.META_WABA_ID || process.env.WHATSAPP_WABA_ID || '').trim();

    if (!metaToken || !metaWabaId) {
      return res.status(400).json({
        success: false,
        error: 'Token de Acesso da Meta ou WABA ID não configurados. Configure na aba Conexão.'
      });
    }

    try {
      // Sincroniza o ambiente E todas as BMs cadastradas (cada uma com o próprio token e WABA)
      const sources: Array<{ token: string; waba: string }> = [{ token: metaToken, waba: metaWabaId }];
      for (const acc of listMetaRegistry().accounts) {
        const resolved = resolveMetaAccount(acc.id);
        if (resolved?.accessToken && resolved?.wabaId) sources.push({ token: resolved.accessToken, waba: resolved.wabaId });
      }
      const allRawTemplates: any[] = [];
      const syncErrors: string[] = [];
      for (const src of sources) {
        const r = await D.fetchMetaGraphTemplates(src.token, src.waba);
        if (r.success && r.templates) allRawTemplates.push(...r.templates);
        else syncErrors.push(r.error || `WABA ${src.waba}: falha ao consultar`);
      }
      if (allRawTemplates.length === 0 && syncErrors.length > 0) {
        return res.status(502).json({
          success: false,
          error: syncErrors[0]
        });
      }

      const syncedList: any[] = [];
      for (const rawTpl of allRawTemplates) {
        const normalized = D.normalizeMetaGraphTemplate(rawTpl);
        syncedList.push(normalized);

        if (D.usePostgres && D.pgPool) {
          try {
            await D.pgPool.query(
              SQL_INSERT_META_TEMPLATES_2,
              [
                normalized.id,
                normalized.name,
                normalized.category,
                normalized.language,
                normalized.status,
                JSON.stringify(normalized.components),
                normalized.usageCount,
                normalized.qualityScore,
                normalized.rejectedReason
              ]
            );
          } catch (dbErr) {
            console.warn('[PostgreSQL] Erro ao sincronizar template:', dbErr);
          }
        }
      }

      await D.logAudit(
        'SINCRONIZAR_TEMPLATES_META',
        `Admin sincronizou ${syncedList.length} templates diretamente da Meta Graph API`,
        req
      );

      return res.json({
        success: true,
        count: syncedList.length,
        templates: syncedList,
        message: `${syncedList.length} modelos sincronizados diretamente da Meta com sucesso!`
      } satisfies RespostaSincronizacaoModelos);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create & Submit Template to Meta (or save as Draft)
  app.post('/api/admin/fluxo/templates', async (req: any, res) => {
    const { name, category, language, components, isDraft, status: initialStatus, examples, bodyText: explicitBodyText, footerText: explicitFooterText, buttons: explicitButtons, accountId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome do template é obrigatório.' });
    }

    const normalizedName = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const categoryCheck = validateTemplateCategory(category);
    if (!categoryCheck.ok) {
      return res.status(400).json({ error: categoryCheck.error });
    }
    const targetCategory = categoryCheck.value;
    const targetLanguage = language || 'pt_BR';
    const isSavingAsDraft = Boolean(isDraft || initialStatus === 'DRAFT');

    // Extract body text
    let bodyText = explicitBodyText || '';
    let footerText: string | undefined = explicitFooterText ? String(explicitFooterText).trim() : undefined;
    let buttonsList: any[] = Array.isArray(explicitButtons) ? explicitButtons : [];

    if (Array.isArray(components)) {
      const bComp = components.find((c: any) => c.type === 'BODY');
      if (bComp?.text && !bodyText) {
        bodyText = bComp.text;
      }
      const fComp = components.find((c: any) => c.type === 'FOOTER');
      if (fComp?.text && !footerText) {
        footerText = String(fComp.text).trim();
      }
      const btnComp = components.find((c: any) => c.type === 'BUTTONS');
      if (btnComp && Array.isArray(btnComp.buttons) && buttonsList.length === 0) {
        buttonsList = btnComp.buttons;
      }
    }

    if (!bodyText.trim()) {
      return res.status(400).json({ error: 'O corpo do template (BODY) é obrigatório.' });
    }

    // Detect variables {{1}}, {{2}}, etc.
    const varMatches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const uniqueVars = Array.from(new Set(varMatches.map(m => m.replace(/[{}]/g, '')))).sort((a, b) => Number(a) - Number(b));

    let resolvedExamples: string[] = [];
    if (Array.isArray(examples) && examples.length > 0) {
      resolvedExamples = examples.map(e => String(e).trim()).filter(Boolean);
    }

    // If there are variables but examples are missing or incomplete, auto-populate realistic examples required by Meta
    if (uniqueVars.length > 0 && resolvedExamples.length < uniqueVars.length) {
      const examplePool = neutralExamples(targetCategory, uniqueVars.length);
      resolvedExamples = uniqueVars.map((_, i) => resolvedExamples[i] || examplePool[i]);
    }

    // Format buttons as QUICK_REPLY
    const formattedButtons: any[] = buildMetaButtons(buttonsList);

    // Build real FluxoAPI / Meta Payload
    const fluxoPayload: any = {
      name: normalizedName,
      category: targetCategory,
      language: targetLanguage,
      body: {
        text: bodyText.trim()
      }
    };

    if (resolvedExamples.length > 0) {
      fluxoPayload.body.examples = resolvedExamples;
    }
    if (footerText) {
      fluxoPayload.footer = footerText;
    }
    if (formattedButtons.length > 0) {
      fluxoPayload.buttons = formattedButtons;
    }

    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
    const instanceId = D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

    let remoteResult: any = null;

    if (!isSavingAsDraft) {
      if (getMetaProvider() !== 'meta' && (!apiKey || !apiSecret)) {
        return res.status(400).json({ error: 'Credenciais da FluxoAPI (Key e Secret) não configuradas.' });
      }

      if (getMetaProvider() === 'meta') {
        // Criação direta na Meta (WABA). A Meta revisa e aprova; o status chega pelo webhook.
        const metaComponents: any[] = [{
          type: 'BODY',
          text: bodyText.trim(),
          ...(resolvedExamples.length ? { example: { body_text: [resolvedExamples] } } : {})
        }];
        if (footerText) metaComponents.push({ type: 'FOOTER', text: String(footerText) });
        if (formattedButtons.length > 0) metaComponents.push({ type: 'BUTTONS', buttons: formattedButtons });
        remoteResult = D.metaToFluxoResult(await metaCreateTemplate({
          name: normalizedName,
          language: targetLanguage,
          category: targetCategory as 'MARKETING' | 'UTILITY',
          components: metaComponents
        }, String(accountId || 'env')));
      } else {
      const targetPath = instanceId ? `/v1/instances/${instanceId}/templates` : '/v1/templates';
      remoteResult = await executeFluxoRequest({
        method: 'POST',
        path: targetPath,
        body: fluxoPayload,
        apiKey,
        apiSecret
      });
      }

      if (!remoteResult.success) {
        console.error('[Meta/FluxoAPI Error]', remoteResult);
        const errMsg = remoteResult.error?.message || (typeof remoteResult.error === 'string' ? remoteResult.error : null) || 'A Meta rejeitou a criação do template.';
        return res.status(remoteResult.status || 422).json({
          success: false,
          error: `Erro Meta/FluxoAPI (${remoteResult.status || 422}): ${errMsg}`,
          details: remoteResult.data || remoteResult.raw || remoteResult.error
        });
      }
    }

    const metaReturnedStatus = remoteResult?.data?.status ? String(remoteResult.data.status).toUpperCase() : (isSavingAsDraft ? 'DRAFT' : 'PENDING');
    const metaTemplateId = remoteResult?.data?.id || `tpl_${Date.now()}`;

    const reconstructedComponents: any[] = [{ type: 'BODY', text: bodyText.trim() }];
    if (footerText) reconstructedComponents.push({ type: 'FOOTER', text: footerText });
    if (formattedButtons.length > 0) reconstructedComponents.push({ type: 'BUTTONS', buttons: formattedButtons });

    const newTemplate: StoredMetaTemplate = {
      id: metaTemplateId,
      name: normalizedName,
      category: targetCategory,
      language: targetLanguage,
      status: metaReturnedStatus as any,
      components: reconstructedComponents,
      usageCount: 0,
      qualityScore: 'UNKNOWN',
      createdAt: new Date().toISOString(),
      submittedToMeta: !isSavingAsDraft
    };

    // Add to local list or replace if exists
    const existingIndex = D.memoryTemplates.findIndex(t => t.name === normalizedName);
    if (existingIndex >= 0) {
      D.memoryTemplates[existingIndex] = newTemplate;
    } else {
      D.memoryTemplates.unshift(newTemplate);
    }

    // Persist template into PostgreSQL meta_templates
    if (D.usePostgres && D.pgPool) {
      try {
        await D.pgPool.query(
          SQL_INSERT_META_TEMPLATES_3,
          [
            newTemplate.id,
            newTemplate.name,
            newTemplate.category,
            newTemplate.language,
            newTemplate.status,
            JSON.stringify(newTemplate.components),
            newTemplate.usageCount,
            newTemplate.qualityScore
          ]
        );
        console.log(`[PostgreSQL] Template ${newTemplate.name} salvo com sucesso no banco de dados (status: ${metaReturnedStatus}).`);
      } catch (tplDbErr) {
        console.error('[PostgreSQL] Erro ao salvar template no banco:', tplDbErr);
      }
    }

    await D.logAudit(
      isSavingAsDraft ? 'CRIAR_RASCUNHO_TEMPLATE' : 'SUBMETER_TEMPLATE_META',
      `Template ${normalizedName} ${isSavingAsDraft ? 'salvo como rascunho' : 'submetido para aprovação da Meta'} (${targetCategory})`,
      req
    );

    return res.json({
      success: true,
      template: newTemplate,
      remoteResult: remoteResult?.data,
      message: isSavingAsDraft
        ? 'Template salvo como Rascunho com sucesso!'
        : `Template enviado com sucesso para a Meta! Status atual: ${metaReturnedStatus} (ID Meta: ${metaTemplateId})`
    } satisfies RespostaModeloCriado);
  });

  // Update Template Status / Quality Score
  app.patch('/api/admin/fluxo/templates/:name/status', async (req: any, res) => {
    const { name } = req.params;
    const { status, qualityScore, rejectedReason } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status é obrigatório.' });
    }

    const targetStatus = String(status).toUpperCase();

    // Update in memory
    const tpl = D.memoryTemplates.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (tpl) {
      tpl.status = targetStatus as any;
      if (qualityScore) tpl.qualityScore = qualityScore;
      if (rejectedReason !== undefined) tpl.rejectedReason = rejectedReason;
    }

    // Update in PostgreSQL
    if (D.usePostgres && D.pgPool) {
      try {
        await D.pgPool.query(
          SQL_UPDATE_META_TEMPLATES,
          [targetStatus, qualityScore || null, rejectedReason || null, name]
        );
      } catch (err) {
        console.warn('[PostgreSQL] Erro ao atualizar status do template:', err);
      }
    }

    await D.logAudit('ALTERAR_STATUS_TEMPLATE', `Status do template ${name} alterado para ${targetStatus}`, req);

    return res.json({
      success: true,
      message: `Status do template ${name} atualizado para ${targetStatus} com sucesso!`
    } satisfies RespostaSucesso);
  });

  // Delete Template
  app.delete('/api/admin/fluxo/templates/:name', async (req: any, res) => {
    const { name } = req.params;

    // Na Meta: apaga o modelo na conta WABA escolhida (se falhar, mantém o registro local para não perder a referência)
    if (getMetaProvider() === 'meta') {
      const accountId = String(req.query?.accountId || req.body?.accountId || 'env');
      const del = await metaDeleteTemplate(String(name), accountId);
      if (!del.success) {
        return res.status(502).json({ success: false, error: { code: 'meta_error', message: del.error } });
      }
    }

    // Remove from memory
    const idx = D.memoryTemplates.findIndex(t => t.name.toLowerCase() === name.toLowerCase() || t.id === name);
    if (idx >= 0) {
      D.memoryTemplates.splice(idx, 1);
    }

    // Remove from PostgreSQL
    if (D.usePostgres && D.pgPool) {
      try {
        await D.pgPool.query(SQL_DELETE_META_TEMPLATES, [name]);
      } catch (err) {
        console.warn('[PostgreSQL] Erro ao deletar template do banco:', err);
      }
    }

    await D.logAudit('EXCLUIR_TEMPLATE_META', `Template ${name} excluído do sistema`, req);

    return res.json({
      success: true,
      message: `Template ${name} excluído com sucesso.`
    } satisfies RespostaSucesso);
  });

  // Send Template Test Message
  app.post('/api/admin/fluxo/send-template-test', async (req: any, res) => {
    const { to, templateName, language, parameters, requestedInstanceId } = req.body;

    if (!to || !templateName) {
      return res.status(400).json({ error: 'Número de destino e nome do template são obrigatórios.' });
    }

    let cleanDigits = String(to).replace(/\D/g, '');
    if (cleanDigits.length === 10 || cleanDigits.length === 11) {
      cleanDigits = `55${cleanDigits}`;
    }
    const formattedE164 = `+${cleanDigits}`;

    const apiKey = (D.memoryFluxoConfig.apiKey || process.env.FLUXO_KEY || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || process.env.FLUXO_SECRET || '').trim();
    const instanceId = requestedInstanceId || D.memoryFluxoConfig.instanceId || process.env.FLUXO_INSTANCE_ID || '';

    // Preparar mapeamento de variáveis para o template da Meta / FluxoAPI
    let variablesObj: Record<string, string> = {};
    if (req.body.variables && typeof req.body.variables === 'object') {
      variablesObj = { ...req.body.variables };
    } else if (Array.isArray(parameters)) {
      parameters.forEach((val: any, idx: number) => {
        variablesObj[String(idx + 1)] = String(val ?? '');
      });
    }

    const cleanVariablesObj: Record<string, string> = {};
    for (const [k, v] of Object.entries(variablesObj)) {
      cleanVariablesObj[k] = String(v ?? '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    try {
      // Monta o corpo pela definição REAL do modelo (catálogo) — ver D.sendTemplateViaFluxo
      const result = await D.sendTemplateViaFluxo({
        to: formattedE164,
        name: String(templateName).trim(),
        language: typeof language === 'string' ? language : 'pt_BR',
        variables: cleanVariablesObj,
        phoneNumberId: String(req.body?.phoneNumberId || '').trim() || undefined,
        creds: { instanceId, apiKey, apiSecret }
      });

      if (result.success) {
        // Increment usage count for template
        if (D.usePostgres && D.pgPool) {
          try {
            await D.pgPool.query(
              SQL_UPDATE_META_TEMPLATES_2,
              [templateName]
            );
          } catch (uErr) {
            console.warn('[PostgreSQL] Erro ao atualizar usage_count do template:', uErr);
          }
        }
        const memTpl = D.memoryTemplates.find(t => t.name.toLowerCase() === String(templateName).toLowerCase());
        if (memTpl) {
          memTpl.usageCount = (memTpl.usageCount || 0) + 1;
        }

        await D.logAudit(
          'DISPARO_TEMPLATE_TESTE',
          `Disparou template ${templateName} para ${formattedE164}`,
          req
        );

        return res.json({
          success: true,
          to: formattedE164,
          templateName,
          latencyMs: result.latencyMs,
          result: result.data || result.raw,
          message: 'Template enviado com sucesso para a fila oficial da Meta!'
        } satisfies RespostaEnvioTesteSucesso);
      } else {
        return res.status(result.status || 400).json({
          success: false,
          status: result.status,
          latencyMs: result.latencyMs,
          error: result.error,
          raw: result.raw,
          message: result.error?.message || 'Erro ao enviar template pela FluxoAPI.'
        });
      }
    } catch (err: any) {
      return res.status(500).json({ error: `Erro no envio do template: ${err.message}` });
    }
  });

  // Status consolidado da integração Meta, para a faixa do topo da tela (sem expor segredos)
  app.get('/api/admin/meta/status', (_req: any, res) => {
    const env = getMetaCredentials();
    const reg = listMetaRegistry();
    const verifyToken = String(D.memoryMetaConfig.verifyToken || process.env.META_VERIFY_TOKEN || '').trim();
    return res.json({
      provider: getMetaProvider(),
      envToken: Boolean(env.accessToken),
      envPhoneNumberId: Boolean(env.phoneNumberId),
      appSecret: Boolean(env.appSecret),
      verifyToken: Boolean(verifyToken),
      webhookReady: Boolean(env.appSecret && verifyToken),
      accounts: reg.accounts.length,
      numbers: reg.numbers.length + (env.accessToken ? 1 : 0)
    } satisfies RespostaStatusMeta);
  });

  // Lista as contas cadastradas (sem token) e quantos números cada uma tem
  app.get('/api/admin/meta/accounts', async (_req: any, res) => {
    const reg = listMetaRegistry();
    return res.json({
      success: true,
      accounts: reg.accounts.map(a => ({ ...a, numbers: reg.numbers.filter(n => n.accountId === a.id).length }))
    } satisfies RespostaContasMeta);
  });

  // Cadastra uma BM: valida o token na Meta, guarda criptografado e já sincroniza os números
  app.post('/api/admin/meta/accounts', async (req: any, res) => {
    const name = String(req.body?.name || '').trim();
    const wabaId = String(req.body?.wabaId || '').trim();
    const accessToken = String(req.body?.accessToken || '').trim();
    const businessId = String(req.body?.businessId || '').trim() || null;
    if (!name || !wabaId || !accessToken) {
      return res.status(400).json({ success: false, error: 'Informe nome, ID da conta do WhatsApp (WABA) e o token.' });
    }
    if (!D.pgPool || !D.usePostgres) return res.status(503).json({ success: false, error: 'Banco indisponível.' });
    try {
      const check = await metaValidateToken(accessToken);
      if (!check.success) return res.status(400).json({ success: false, error: `Token recusado pela Meta: ${check.error}` });
      const id = `bm_${crypto.randomBytes(6).toString('hex')}`;
      const enc = encryptMetaToken(accessToken);
      await D.pgPool.query(
        SQL_INSERT_META_ACCOUNTS,
        [id, name, wabaId, businessId, enc]
      );
      const sync = await D.syncMetaAccountIntoDb(id);
      return res.json({ success: true, account: { id, name, wabaId, businessId }, sync } satisfies RespostaCadastroContaOk);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Falha ao cadastrar a conta.' });
    }
  });

  // Sincronizar com a Meta: atualiza números e status de modelos de UMA conta
  app.post('/api/admin/meta/accounts/:id/sync', async (req: any, res) => {
    try {
      const r = await D.syncMetaAccountIntoDb(String(req.params.id));
      return res.status(r.success ? 200 : 502).json(r satisfies RespostaSincronizacaoConta);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Falha na sincronização.' });
    }
  });

  // Embedded Signup: configuração pública (App ID / Config ID) para o botão "Conectar número pela Meta"
  app.get('/api/admin/meta/embedded-signup/config', (_req: any, res) => {
    const cfg = getEmbeddedSignupConfig();
    return res.json({ success: true, appId: cfg.appId, configId: cfg.configId, ready: cfg.ready } satisfies RespostaConfigEmbeddedSignup);
  });

  // Embedded Signup: recebe o código do login + WABA/número escolhidos e conecta a conta sem colar token
  app.post('/api/admin/meta/embedded-signup/complete', async (req: any, res) => {
    const code = String(req.body?.code || '').trim();
    let wabaId = String(req.body?.wabaId || '').trim();
    const phoneNumberId = String(req.body?.phoneNumberId || '').trim();
    if (!code) {
      return res.status(400).json({ success: false, error: 'A Meta não devolveu o código do login. Tente conectar de novo.' });
    }
    if (!D.pgPool || !D.usePostgres) return res.status(503).json({ success: false, error: 'Banco indisponível.' });
    try {
      const exchanged = await metaExchangeSignupCode(code);
      if (!exchanged.success || !exchanged.token) {
        return res.status(400).json({ success: false, error: `A Meta recusou o login: ${exchanged.error}` });
      }
      const token = exchanged.token;
      if (!wabaId) {
        const found = await metaDiscoverWabaIds(token);
        if (found.length === 0) {
          return res.status(400).json({ success: false, error: 'O login funcionou, mas nenhuma conta do WhatsApp Business foi encontrada para este usuário. Confira se o usuário tem acesso à conta Nyroh - Comercial.' });
        }
        wabaId = found[0];
      }
      const enc = encryptMetaToken(token);
      const existing = await D.pgPool.query(SQL_SELECT_META_ACCOUNTS, [wabaId]);
      let accountId: string;
      if (existing.rows.length > 0) {
        accountId = String(existing.rows[0].id);
        await D.pgPool.query(SQL_UPDATE_META_ACCOUNTS, [enc, accountId]);
      } else {
        accountId = `bm_${crypto.randomBytes(6).toString('hex')}`;
        await D.pgPool.query(
          SQL_INSERT_META_ACCOUNTS_2,
          [accountId, `WABA ${wabaId}`, wabaId, null, enc]
        );
      }
      const sub = await metaSubscribeWaba(wabaId, token);
      const sync = await D.syncMetaAccountIntoDb(accountId);
      const phoneOk = !phoneNumberId || (sync.success && (await D.pgPool.query(SQL_SELECT_META_NUMBERS, [phoneNumberId])).rows.length > 0);
      return res.json({
        success: sync.success && phoneOk,
        accountId,
        numbers: sync.numbers,
        warning: sub.success ? null : `Conectou, mas a Meta não confirmou a assinatura dos webhooks: ${sub.error}`,
        error: !sync.success ? sync.error : (!phoneOk ? 'Conectou a conta, mas o número escolhido não apareceu na listagem da Meta.' : null)
      } satisfies RespostaEmbeddedSignupConcluido);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Falha ao concluir a conexão.' });
    }
  });

  // Sincronizar TODAS as contas cadastradas
  app.post('/api/admin/meta/sync-all', async (_req: any, res) => {
    const ids = listMetaRegistry().accounts.map(a => a.id);
    const results: any[] = [];
    for (const id of ids) {
      try { results.push({ id, ...(await D.syncMetaAccountIntoDb(id)) }); }
      catch (err: any) { results.push({ id, success: false, error: err?.message }); }
    }
    return res.json({ success: results.every(r => r.success), results } satisfies RespostaSincronizacaoTodas);
  });

  // Remove a BM do CRM (apaga o token guardado; os números somem junto)
  app.delete('/api/admin/meta/accounts/:id', async (req: any, res) => {
    if (!D.pgPool || !D.usePostgres) return res.status(503).json({ success: false, error: 'Banco indisponível.' });
    await D.pgPool.query(SQL_DELETE_META_ACCOUNTS, [String(req.params.id)]);
    await D.loadMetaRegistryFromDb();
    return res.json({ success: true } satisfies RespostaMetaRemovida);
  });

  // GET /api/admin/meta/sync: lê da Meta os números e os modelos da conta WABA (sem gravar nada)
  app.get('/api/admin/meta/sync', async (_req: any, res) => {
    const creds = getMetaCredentials();
    const [phones, templates] = await Promise.all([metaListPhoneNumbers(), metaListTemplates()]);
    res.json({
      provider: getMetaProvider(),
      configured: {
        accessToken: Boolean(creds.accessToken),
        phoneNumberId: Boolean(creds.phoneNumberId),
        wabaId: Boolean(creds.wabaId),
        appSecret: Boolean(creds.appSecret)
      },
      phoneNumbers: phones.success ? (phones.data?.data || []) : [],
      templates: templates.success ? (templates.data?.data || []) : [],
      errors: { phoneNumbers: phones.error || null, templates: templates.error || null }
    } satisfies RespostaLeituraMeta);
  });

  app.get('/api/admin/fluxo/events', (req: any, res) => {
    return res.json({
      success: true,
      total: D.lastFluxoWebhookEvents.length,
      events: D.lastFluxoWebhookEvents
    } satisfies RespostaEventosFluxo);
  });

  // DELETE Webhook Events (Clear logs)
  app.delete('/api/admin/fluxo/events', (req: any, res) => {
    D.lastFluxoWebhookEvents.length = 0;
    return res.json({ success: true, message: 'Logs de eventos limpos com sucesso.' } satisfies RespostaSucesso);
  });

  // Simulate Webhook Event
  app.post('/api/admin/fluxo/events/simulate', (req: any, res) => {
    const { type, status, recipientPhone } = req.body;
    const simulatedEvent: FluxoWebhookEvent = {
      id: `evt_sim_${Date.now()}`,
      receivedAt: new Date().toLocaleTimeString('pt-BR'),
      type: type || 'status_update',
      summary: `Simulação de ${status || 'delivered'} para ${recipientPhone || '+55 11 98821-6073'}`,
      payload: {
        status: status || 'delivered',
        recipient_id: recipientPhone || '+5511988216073',
        timestamp: String(Math.floor(Date.now() / 1000)),
        simulated: true
      }
    };

    D.lastFluxoWebhookEvents.unshift(simulatedEvent);
    if (D.lastFluxoWebhookEvents.length > 50) D.lastFluxoWebhookEvents.pop();

    return res.json({ success: true, event: simulatedEvent } satisfies RespostaEventoSimulado);
  });

  app.get('/api/whatsapp/fluxo-templates', async (req: any, res) => {
    const apiKey = (D.memoryFluxoConfig.apiKey || '').trim();
    const apiSecret = (D.memoryFluxoConfig.apiSecret || '').trim();
    const instanceId = (D.memoryFluxoConfig.instanceId || '').trim();
    if (!apiKey || !apiSecret || !instanceId) {
      return res.json({ success: false, templates: [], error: describeFluxoError({ code: !apiKey || !apiSecret ? 'missing_credentials' : 'instance_required' }) } satisfies RespostaListaModelosFluxo);
    }
    const fresh = req.query.refresh === '1';
    if (!fresh && D.fluxoCatalogCache && Date.now() - D.fluxoCatalogCache.at < 5 * 60 * 1000) {
      return res.json({ success: true, cached: true, templates: D.fluxoCatalogCache.data } satisfies RespostaListaModelosFluxo);
    }
    const r = await executeFluxoRequest<any>({
      method: 'GET',
      path: fluxoInstancePath(`/templates?status=APPROVED${fresh ? '&refresh=true' : ''}`, instanceId),
      apiKey,
      apiSecret
    });
    if (!r.success) {
      return res.json({ success: false, templates: D.fluxoCatalogCache?.data || [], error: describeFluxoError(r.error, r.status) } satisfies RespostaListaModelosFluxo);
    }
    const list: any[] = Array.isArray(r.data) ? r.data : Array.isArray((r.raw as any)?.data) ? (r.raw as any).data : [];
    const data = list
      .filter(t => String(t.status || 'APPROVED').toUpperCase() === 'APPROVED')
      .map(t => {
        const fields: any[] = Array.isArray(t.fields) ? t.fields : [];
        return {
          name: t.name,
          language: t.language || 'pt_BR',
          category: t.category || '',
          bodyText: t.bodyText || '',
          headerText: t.headerText || '',
          footerText: t.footerText || '',
          parameterFormat: t.parameterFormat || 'POSITIONAL',
          sendable: t.sendable !== false,
          blockedReason: t.blockedReason || null,
          bodyVariables: fields.filter(f => f.slot === 'body').length,
          // Campos que o chat não preenche sozinho (botão de URL variável, mídia de cabeçalho, carrossel…)
          extraRequired: fields
            .filter(f => f.slot !== 'body' && f.required !== false)
            .map(f => `${f.slot}${f.buttonIndex !== undefined ? `[${f.buttonIndex}]` : ''}`)
        };
      });
    D.setFluxoCatalogCache({ at: Date.now(), data });
    return res.json({ success: true, templates: data } satisfies RespostaCatalogoModelosMeta);
  });

  // GET /api/whatsapp/approved-templates (Para uso pelos vendedores no modal de WhatsApp)
  app.get('/api/whatsapp/approved-templates', async (req: any, res) => {
    try {
      const approvedList: any[] = [];

      if (D.usePostgres && D.pgPool) {
        const dbRes = await D.pgPool.query(
          SQL_SELECT_META_TEMPLATES_2
        );
        for (const r of dbRes.rows) {
          const comps = typeof r.components === 'string' ? JSON.parse(r.components) : (r.components || []);
          const bodyComp = comps.find((c: any) => c.type === 'BODY');
          const headerComp = comps.find((c: any) => c.type === 'HEADER');
          const footerComp = comps.find((c: any) => c.type === 'FOOTER');
          approvedList.push({
            id: r.id,
            name: r.name,
            category: r.category,
            language: r.language,
            bodyText: bodyComp?.text || '',
            headerText: headerComp?.text || '',
            footerText: footerComp?.text || '',
            usageCount: Number(r.usage_count) || 0
          });
        }
      }

      // Fallback para templates em memória aprovados
      for (const memTpl of D.memoryTemplates) {
        if (memTpl.status === 'APPROVED' && !approvedList.some(a => a.name.toLowerCase() === memTpl.name.toLowerCase())) {
          const bodyComp = memTpl.components?.find((c: any) => c.type === 'BODY');
          const headerComp = memTpl.components?.find((c: any) => c.type === 'HEADER');
          const footerComp = memTpl.components?.find((c: any) => c.type === 'FOOTER');
          approvedList.push({
            id: memTpl.id,
            name: memTpl.name,
            category: memTpl.category,
            language: memTpl.language,
            bodyText: bodyComp?.text || '',
            headerText: headerComp?.text || '',
            footerText: footerComp?.text || '',
            usageCount: Number(memTpl.usageCount) || 0
          });
        }
      }

      return res.json({ success: true, templates: approvedList } satisfies RespostaListaModelosFluxo);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message, templates: [] });
    }
  });

}
