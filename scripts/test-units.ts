/**
 * Testes UNITÁRIOS das regras de negócio do WhatsApp (sem rede, sem servidor, sem banco).
 * Rodar:  npm test        (ou)   npx tsx scripts/test-units.ts
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { statusRank, shouldApplyStatus, normalizeStatus } from '../src/lib/fluxoStatus';
import { describeFluxoError, KNOWN_FLUXO_ERROR_CODES } from '../src/lib/fluxoErrors';
import { buildTemplatePayload, sanitizeTemplateValue, type CatalogTemplate } from '../src/lib/fluxoTemplate';
import { isWindowOpen, windowExpiryFromInbound, latestExpiry, WINDOW_MS } from '../src/lib/windowUtil';
import { arePhonesEquivalent, phoneDigitVariants, normalizeE164Phone, formatAndValidateE164Phone } from '../src/lib/phone';
import { verifyFluxoWebhook } from '../src/lib/webhookAuth';
import { missingFluxoVars, summarizeFluxoInstance } from '../src/lib/fluxoInstanceStatus';
import { buildFluxoAudioMedia, isFluxoAudioVoiceEnabled } from '../src/lib/fluxoAudio';
import { parseTemplateBody, templateVarIndexes, renderTemplateBody } from '../src/lib/templateSegments';
import { buildTemplateVariables, fillLeadTokens } from '../src/lib/templateCopy';
import { buildFluxoAuthHeaders, fluxoInstancePath, prepareOutboundMedia } from '../src/lib/fluxoClient';
import { extensionFor, saveMediaBuffer } from '../src/lib/mediaStorage';
import { effectiveSpeedPerSecond, dispatchRpm, planRpm, delayForIndex, maxDispatchPerSecond, FluxoRateLimitedError } from '../src/lib/dispatchRate';
import { detectOptOut, sanitizeTemplateVariable } from '../src/lib/leadIntent';
import { isPubliclyFetchableUrl } from '../src/lib/auditEngine';
import { validarAutomacao, logicaEmPalavras, conversaSimulada, renderPrevia, tokensDesconhecidos, EVENTOS, ACOES, CONDICOES, type Automacao } from '../src/lib/automacoes';
import { planejarEvento, type RegistroAutomacao } from '../src/lib/automacoesExecucao';
import { criarExecutorAcoes, camposDoLead } from '../src/lib/automacoesExecutores';
import { colunaPermitida, TABELAS_BACKUP } from '../src/lib/backupRoutes';
import { quandoExecutar, estaVencido, contemPalavra } from '../src/lib/automacoesFila';
import { registrarEventoCliente, eventoDaResposta, type DepsRecebimento } from '../src/lib/automacoesExecucao';
import { processarVencidos, type DepsWorker } from '../src/lib/automacoesWorker';
import { decidirEvento, estadoInicial, pausarLead, liberarLead } from '../src/lib/automacoesEstado';
import { dentroDosLimites, pausaGeralAtiva, proximaVersao, registroAuditoria, aplicarVersao } from '../src/lib/automacoesLimites';
const LIMITES_TESTE = { porDia: 3, porSemana: 10 };
import { avaliarCondicoes, dentroDaFaixaHoraria, proximaOcorrencia, avaliarNo } from '../src/lib/automacoesEstado';
import { substituirVariaveis } from '../src/lib/automacoes';
import { pedidoDePararPelasRegras, pedidoDeAlertaPelasRegras } from '../src/lib/automacoesExecucao';
import { dentroDaJanela24h } from '../src/lib/automacoesWorker';
import { resolveLeadTokens, TOKEN_NAMES } from '../src/lib/leadTokens';
import { validateTemplateCategory, buildMetaButtons, defaultExamples, countBodyVariables, validateTemplateVariables } from '../src/lib/templateRules';
import {
  verifyMetaSignature, metaSendText, metaSendTemplate, metaMarkRead, metaDownloadMedia,
  encryptMetaToken, decryptMetaToken, setMetaRegistry, resolveMetaSender,
  metaCreateTemplate, metaDeleteTemplate, metaListTemplates, receivingPhoneNumberId, parseCoexistenceEchoes
} from '../src/lib/metaClient';

let passed = 0;
let failed = 0;
const pending: Array<Promise<void>> = [];

function test(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (e: any) {
      failed++;
      console.error(`  ❌ ${name}\n     ${e?.message || e}`);
    }
  };
  pending.push(run());
}
// Serializa a execução (alguns testes mexem em process.env)
async function sequential(tests: Array<[string, () => void | Promise<void>]>) {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (e: any) {
      failed++;
      console.error(`  ❌ ${name}\n     ${e?.message || e}`);
    }
  }
}
const group = (title: string) => console.log(`\n${title}`);

async function main() {
  // ---------------------------------------------------------------------------
  group('Status por rank (§A9 — o estado só avança)');
  await sequential([
    ['ranks: queued 0 < sent 1 < delivered 2 < read 3 < failed 9', () => {
      assert.equal(statusRank('queued'), 0);
      assert.equal(statusRank('sent'), 1);
      assert.equal(statusRank('delivered'), 2);
      assert.equal(statusRank('read'), 3);
      assert.equal(statusRank('failed'), 9);
    }],
    ['delivered atrasado NÃO desfaz um read', () => {
      assert.equal(shouldApplyStatus({ status: 'read', rank: 3 }, { status: 'delivered', rank: 2 }), false);
    }],
    ['read depois de delivered avança', () => {
      assert.equal(shouldApplyStatus({ status: 'delivered' }, { status: 'read' }), true);
    }],
    ['mesmo status repetido não reaplica', () => {
      assert.equal(shouldApplyStatus({ status: 'sent' }, { status: 'sent' }), false);
    }],
    ['rank explícito da API vence o texto', () => {
      assert.equal(statusRank('delivered', 9), 9);
    }],
    ['status desconhecido é ignorado (não adivinha)', () => {
      assert.equal(normalizeStatus('banana'), null);
      assert.equal(shouldApplyStatus({ status: 'sent' }, { status: 'banana' }), false);
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Erros da FluxoAPI (§A12)');
  await sequential([
    ['cobre TODOS os códigos do enum da documentação', () => {
      const docEnum = ['missing_auth_headers','stale_timestamp','invalid_nonce','invalid_key','nonce_reused','invalid_signature','too_many_failures','rate_limited','insufficient_scope','not_found','invalid_input','window_closed','payment_required','instance_reconnecting','meta_error','template_not_found','range_too_wide','instance_required','instance_not_connected','not_readable','unknown_stage','reason_required','stage_mismatch','server_error'];
      for (const c of docEnum) assert.ok(KNOWN_FLUXO_ERROR_CODES.includes(c), `faltou mapear: ${c}`);
    }],
    ['window_closed → 422 + orientação de usar modelo', () => {
      const i = describeFluxoError({ code: 'window_closed', request_id: 'req_1', window_expired_at: '2026-01-01T00:00:00Z' }, 422);
      assert.equal(i.httpStatus, 422);
      assert.match(i.action, /modelo/i);
      assert.equal(i.requestId, 'req_1');
      assert.equal(i.windowExpiredAt, '2026-01-01T00:00:00Z');
    }],
    ['429 sem code vira rate_limited retryable', () => {
      const i = describeFluxoError({ message: 'x' }, 429);
      assert.equal(i.code, 'rate_limited');
      assert.equal(i.retryable, true);
    }],
    ['insufficient_scope traz o escopo exigido', () => {
      assert.equal(describeFluxoError({ code: 'insufficient_scope', required_scope: 'messages:send' }).requiredScope, 'messages:send');
    }],
    ['invalid_input mostra a mensagem específica da API (diz qual campo)', () => {
      assert.match(describeFluxoError({ code: 'invalid_input', message: 'Falta o parâmetro do botão 0.' }).message, /botão 0/);
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Montagem de template pela definição real (§A4/§A5)');
  const tplBody2: CatalogTemplate = {
    name: 'boas_vindas', language: 'pt_BR', parameterFormat: 'POSITIONAL',
    fields: [
      { slot: 'body', kind: 'text', ref: '1', required: true },
      { slot: 'body', kind: 'text', ref: '2', required: true }
    ]
  };
  const tplButton: CatalogTemplate = {
    name: 'com_botao', language: 'pt_BR',
    fields: [
      { slot: 'body', kind: 'text', ref: '1', required: true },
      { slot: 'button', kind: 'url_suffix', ref: '0', buttonIndex: 0, required: true }
    ]
  };
  await sequential([
    ['preenche o corpo por posição e usa language como TEXTO', () => {
      const b = buildTemplatePayload(tplBody2, 'boas_vindas', 'pt_BR', { positional: ['Marina', 'https://x'] });
      assert.deepEqual(b.template, { name: 'boas_vindas', language: 'pt_BR', body: { '1': 'Marina', '2': 'https://x' } });
      assert.equal(typeof b.template.language, 'string');
      assert.deepEqual(b.missing, []);
    }],
    ['faltar o parâmetro do botão é detectado ANTES de enviar', () => {
      const b = buildTemplatePayload(tplButton, 'com_botao', 'pt_BR', { positional: ['Marina'] });
      assert.deepEqual(b.missing, ['button[0]']);
    }],
    ['com o botão informado, vai em template.buttons["0"]', () => {
      const b = buildTemplatePayload(tplButton, 'com_botao', 'pt_BR', { positional: ['Marina'], buttons: { '0': 'A-4471' } });
      assert.deepEqual(b.missing, []);
      assert.deepEqual(b.template.buttons, { '0': 'A-4471' });
    }],
    ['variável extra além do que o modelo pede é ignorada', () => {
      const b = buildTemplatePayload(tplBody2, 'boas_vindas', 'pt_BR', { positional: ['a', 'b', 'c', 'd'] });
      assert.deepEqual(b.template.body, { '1': 'a', '2': 'b' });
    }],
    ['variável vazia conta como faltando (a Meta recusa vazio)', () => {
      const b = buildTemplatePayload(tplBody2, 'boas_vindas', 'pt_BR', { positional: ['a', '   '] });
      assert.deepEqual(b.missing, ['body.2']);
    }],
    ['sanitiza quebra de linha/tab/espaços repetidos (Meta recusa)', () => {
      assert.equal(sanitizeTemplateValue('a\n\nb\t c    d'), 'a b c d');
    }],
    ['modelo NOMEADO sem valores por nome aponta o que falta', () => {
      const named: CatalogTemplate = { name: 'n', language: 'pt_BR', parameterFormat: 'NAMED', fields: [{ slot: 'body', kind: 'text', ref: 'first_name', required: true }] };
      assert.deepEqual(buildTemplatePayload(named, 'n', 'pt_BR', { positional: ['Marina'] }).missing, ['body.first_name']);
      assert.deepEqual(buildTemplatePayload(named, 'n', 'pt_BR', { body: { first_name: 'Marina' } }).template.body, { first_name: 'Marina' });
    }],
    ['cabeçalho de imagem exige link público', () => {
      const t: CatalogTemplate = { name: 'i', language: 'pt_BR', fields: [{ slot: 'header', kind: 'image', required: true }] };
      assert.deepEqual(buildTemplatePayload(t, 'i', 'pt_BR', {}).missing, ['header.media']);
      assert.deepEqual(buildTemplatePayload(t, 'i', 'pt_BR', { headerMediaLink: 'https://x/y.png' }).template.header, { media: { link: 'https://x/y.png' } });
    }],
    ['sem catálogo (indisponível) monta o que foi informado, sem validar', () => {
      const b = buildTemplatePayload(null, 'x', 'pt_BR', { positional: ['a'] });
      assert.equal(b.usedCatalog, false);
      assert.deepEqual(b.template.body, { '1': 'a' });
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Janela de 24h');
  await sequential([
    ['abre por 24h a partir da mensagem do cliente', () => {
      const t = '2026-10-08T12:00:00.000Z';
      assert.equal(windowExpiryFromInbound(t), new Date(new Date(t).getTime() + WINDOW_MS).toISOString());
    }],
    ['isWindowOpen: futuro = aberta; passado/nulo = fechada', () => {
      const now = Date.now();
      assert.equal(isWindowOpen(new Date(now + 1000), now), true);
      assert.equal(isWindowOpen(new Date(now - 1000), now), false);
      assert.equal(isWindowOpen(null, now), false);
      assert.equal(isWindowOpen('lixo', now), false);
    }],
    ['a janela nunca encolhe: escolhe o fim mais tardio', () => {
      assert.equal(latestExpiry('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z', null), '2026-01-02T00:00:00.000Z');
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Telefone (fim do "lead errado")');
  await sequential([
    ['mesmos 8 dígitos finais, DDDs diferentes → NÃO é o mesmo lead', () => {
      assert.equal(arePhonesEquivalent('+5511987654321', '+5521987654321'), false);
      assert.equal(arePhonesEquivalent('11987654321', '21987654321'), false);
    }],
    ['com/sem 55 e com/sem 9º dígito → é o mesmo', () => {
      assert.equal(arePhonesEquivalent('5511987654321', '11987654321'), true);
      assert.equal(arePhonesEquivalent('551187654321', '5511987654321'), true);
    }],
    ['fixo 3345-6789 ≠ celular 93345-6789', () => {
      assert.equal(arePhonesEquivalent('1133456789', '11933456789'), false);
    }],
    ['variações de dígitos cobrem 55 e 9º dígito (busca exata no SQL)', () => {
      const v = phoneDigitVariants('5519991802264');
      for (const x of ['5519991802264', '19991802264', '551991802264', '1991802264']) assert.ok(v.includes(x), `faltou ${x}`);
    }],
    ['normaliza para E.164', () => {
      assert.equal(normalizeE164Phone('(19) 99180-2264'), '+5519991802264');
    }],
    ['validador aceita celular BR e recusa lixo', () => {
      assert.equal(formatAndValidateE164Phone('19991802264').e164, '+5519991802264');
      assert.equal(formatAndValidateE164Phone('123').isValid, false);
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Assinatura do webhook (§A9)');
  const SECRET = 'whsec_test_secret_123';
  const sigFor = (body: string, ts: string, secret = SECRET) => 'v1=' + crypto.createHmac('sha256', secret).update(`${ts}\n${body}`).digest('hex');
  const savedSecret = process.env.FLUXO_WEBHOOK_SECRET;
  process.env.FLUXO_WEBHOOK_SECRET = SECRET;
  await sequential([
    ['assinatura válida passa', () => {
      const body = '{"id":"evt_1"}'; const ts = String(Math.floor(Date.now() / 1000));
      assert.equal(verifyFluxoWebhook(body, { 'x-fluxo-timestamp': ts, 'x-fluxo-signature': sigFor(body, ts) }).isValid, true);
    }],
    ['corpo adulterado é rejeitado', () => {
      const ts = String(Math.floor(Date.now() / 1000));
      assert.equal(verifyFluxoWebhook('{"id":"evt_2"}', { 'x-fluxo-timestamp': ts, 'x-fluxo-signature': sigFor('{"id":"evt_1"}', ts) }).isValid, false);
    }],
    ['segredo errado é rejeitado', () => {
      const body = '{}'; const ts = String(Math.floor(Date.now() / 1000));
      assert.equal(verifyFluxoWebhook(body, { 'x-fluxo-timestamp': ts, 'x-fluxo-signature': sigFor(body, ts, 'outro') }).isValid, false);
    }],
    ['timestamp velho (>300s) é rejeitado (replay)', () => {
      const body = '{}'; const ts = String(Math.floor(Date.now() / 1000) - 3600);
      assert.equal(verifyFluxoWebhook(body, { 'x-fluxo-timestamp': ts, 'x-fluxo-signature': sigFor(body, ts) }).isValid, false);
    }],
    ['durante a rotação (2 assinaturas) aceita qualquer uma', () => {
      const body = '{}'; const ts = String(Math.floor(Date.now() / 1000));
      const header = `${sigFor(body, ts, 'segredo_antigo')}, ${sigFor(body, ts)}`;
      assert.equal(verifyFluxoWebhook(body, { 'x-fluxo-timestamp': ts, 'x-fluxo-signature': header }).isValid, true);
    }],
    ['sem cabeçalhos é rejeitado', () => {
      assert.equal(verifyFluxoWebhook('{}', {}).isValid, false);
    }]
  ]);
  if (savedSecret === undefined) delete process.env.FLUXO_WEBHOOK_SECRET; else process.env.FLUXO_WEBHOOK_SECRET = savedSecret;

  // ---------------------------------------------------------------------------
  group('Assinatura das chamadas à API (§A1)');
  await sequential([
    ['reproduz exatamente a receita da documentação', () => {
      const body = JSON.stringify({ to: '+5511999999999', type: 'text', text: { body: 'Oi' } });
      const p = '/v1/instances/inst_1/messages';
      const { headers } = buildFluxoAuthHeaders('post', p, body, 'fxk_live_x', 'fxs_y');
      const signed = ['v1', headers['X-Fluxo-Timestamp'], headers['X-Fluxo-Nonce'], 'POST', p, crypto.createHash('sha256').update(body).digest('hex')].join('\n');
      assert.equal(headers['X-Fluxo-Signature'], 'v1=' + crypto.createHmac('sha256', 'fxs_y').update(signed).digest('hex'));
      assert.equal(headers['X-Fluxo-Signature'].length, 67);
    }],
    ['GET sem corpo usa o sha256 da string vazia', () => {
      const { debug } = buildFluxoAuthHeaders('GET', '/v1/instances', '', 'k', 's');
      assert.equal(debug.bodyHash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    }],
    ['a query entra na assinatura exatamente como enviada', () => {
      const a = buildFluxoAuthHeaders('GET', '/v1/x?a=1', '', 'k', 's').debug.signedStringPreview;
      assert.ok(a.includes('/v1/x?a=1'));
    }],
    ['fluxoInstancePath exige a instância (nunca cai em /v1/messages)', () => {
      const saved = process.env.FLUXO_INSTANCE_ID; delete process.env.FLUXO_INSTANCE_ID;
      assert.throws(() => fluxoInstancePath('/messages'), /FLUXO_INSTANCE_ID/);
      assert.equal(fluxoInstancePath('/messages', 'inst_9'), '/v1/instances/inst_9/messages');
      if (saved !== undefined) process.env.FLUXO_INSTANCE_ID = saved;
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Disparo: respeita o limite do plano (por MINUTO — §A10)');
  const savedRpm = process.env.FLUXO_PLAN_RPM; const savedShare = process.env.FLUXO_DISPATCH_SHARE;
  await sequential([
    ['padrão Starter: 60/min no plano → 48/min de disparo (reserva 20%)', () => {
      delete process.env.FLUXO_PLAN_RPM; delete process.env.FLUXO_DISPATCH_SHARE;
      assert.equal(planRpm(), 60);
      assert.equal(dispatchRpm(), 48);
    }],
    ['o antigo padrão de 30 msgs/s é CORTADO para o teto do plano', () => {
      delete process.env.FLUXO_PLAN_RPM; delete process.env.FLUXO_DISPATCH_SHARE;
      const eff = effectiveSpeedPerSecond(30);
      assert.ok(eff * 60 <= 60, `${eff * 60}/min estoura o plano`);
      assert.equal(Math.round(eff * 60), 48);
    }],
    ['pedido abaixo do teto é respeitado', () => {
      assert.equal(effectiveSpeedPerSecond(0.1), 0.1);
    }],
    ['plano Pro (300/min) → 240/min', () => {
      process.env.FLUXO_PLAN_RPM = '300'; delete process.env.FLUXO_DISPATCH_SHARE;
      assert.equal(dispatchRpm(), 240);
    }],
    ['FLUXO_PLAN_RPM inválido cai no padrão seguro', () => {
      process.env.FLUXO_PLAN_RPM = 'abc';
      assert.equal(planRpm(), 60);
    }],
    ['pacing: 48/min = uma mensagem a cada 1,25s', () => {
      delete process.env.FLUXO_PLAN_RPM; delete process.env.FLUXO_DISPATCH_SHARE;
      assert.equal(delayForIndex(1, maxDispatchPerSecond()), 1250);
      assert.equal(delayForIndex(48, maxDispatchPerSecond()), 60000);
    }],
    ['FluxoRateLimitedError guarda o Retry-After', () => {
      const e = new FluxoRateLimitedError(17.2);
      assert.equal(e.retryAfterSec, 18);
      assert.equal(e.name, 'FluxoRateLimitedError');
    }]
  ]);
  if (savedRpm === undefined) delete process.env.FLUXO_PLAN_RPM; else process.env.FLUXO_PLAN_RPM = savedRpm;
  if (savedShare === undefined) delete process.env.FLUXO_DISPATCH_SHARE; else process.env.FLUXO_DISPATCH_SHARE = savedShare;

  // ---------------------------------------------------------------------------
  group('Mídia (armazenamento próprio + envio)');
  const tmpUploads = fs.mkdtempSync(path.join(os.tmpdir(), 'nyroh-uploads-'));
  process.env.UPLOADS_DIR = tmpUploads;
  process.env.APP_PUBLIC_URL = 'https://nyroh.example.com';
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await sequential([
    ['extensão perigosa (.html/.svg/.js) vira .bin', () => {
      assert.equal(extensionFor(null, 'x.html'), 'bin');
      assert.equal(extensionFor('image/svg+xml', 'x.svg'), 'bin');
      assert.equal(extensionFor('image/png'), 'png');
      assert.equal(extensionFor('audio/ogg; codecs=opus'), 'ogg');
    }],
    ['salva com nome aleatório (não adivinhável) e devolve URL pública', async () => {
      const a = await saveMediaBuffer(PNG, { mime: 'image/png' });
      const b = await saveMediaBuffer(PNG, { mime: 'image/png' });
      assert.notEqual(a.fileName, b.fileName);
      assert.match(a.fileName, /^[0-9a-f]{32}\.png$/);
      assert.equal(a.publicUrl, `https://nyroh.example.com/uploads/${a.fileName}`);
      assert.ok(fs.existsSync(path.join(tmpUploads, a.fileName)));
    }],
    ['data URI de imagem vira URL pública do próprio Nyroh', async () => {
      const r = await prepareOutboundMedia(`data:image/png;base64,${PNG.toString('base64')}`, 'foto.png', 'image');
      assert.equal(r.error, undefined);
      assert.match(r.url, /^https:\/\/nyroh\.example\.com\/uploads\/[0-9a-f]{32}\.png$/);
    }],
    ['URL localhost é recusada com motivo claro (a Meta não alcança)', async () => {
      const r = await prepareOutboundMedia('http://localhost:3000/uploads/a.png', 'a.png');
      assert.equal(r.url, '');
      assert.match(r.error || '', /local|privad/i);
    }],
    ['imagem acima de 5 MB é recusada ANTES de enviar', async () => {
      const big = Buffer.alloc(5 * 1024 * 1024 + 10, 1);
      const r = await prepareOutboundMedia(`data:image/png;base64,${big.toString('base64')}`, 'g.png', 'image');
      assert.equal(r.url, '');
      assert.match(r.error || '', /grande demais/i);
    }],
    ['sem APP_PUBLIC_URL, caminho local /uploads/ é recusado com instrução', async () => {
      const saved = process.env.APP_PUBLIC_URL; delete process.env.APP_PUBLIC_URL; delete process.env.RAILWAY_PUBLIC_DOMAIN;
      const r = await prepareOutboundMedia('/uploads/abc.png', 'abc.png');
      assert.equal(r.url, '');
      assert.match(r.error || '', /APP_PUBLIC_URL/);
      process.env.APP_PUBLIC_URL = saved;
    }],
    ['arquivo vazio e base64 inválido são recusados', async () => {
      assert.ok((await prepareOutboundMedia('data:image/png;base64,', 'a.png', 'image')).error);
      assert.ok((await prepareOutboundMedia('data:image/png,abc', 'a.png', 'image')).error);
    }]
  ]);
  fs.rmSync(tmpUploads, { recursive: true, force: true });

  // ---------------------------------------------------------------------------
  group('Descadastro: palavra inteira, nunca pedaço de palavra');
  await sequential([
    ['"parece ótimo, quanto custa?" NÃO é descadastro (continha "pare")', () => {
      assert.equal(detectOptOut('parece ótimo, quanto custa?', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), false);
    }],
    ['"pare" sozinho é descadastro', () => {
      assert.equal(detectOptOut('pare', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), true);
      assert.equal(detectOptOut('PARE de me mandar mensagem', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), true);
    }],
    ['"removeram o produto do site" NÃO é descadastro', () => {
      assert.equal(detectOptOut('removeram o produto do site', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), false);
    }],
    ['"remover" como palavra é descadastro', () => {
      assert.equal(detectOptOut('quero remover meu número', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), true);
    }],
    ['frases com e sem acento funcionam igual', () => {
      assert.equal(detectOptOut('não tenho interesse', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), true);
      assert.equal(detectOptOut('nao tenho interesse', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), true);
      assert.equal(detectOptOut('nao quero', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), true);
    }],
    ['mensagem comum não descadastra', () => {
      assert.equal(detectOptOut('bom dia, pode me mandar o orçamento?', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), false);
      assert.equal(detectOptOut('comparei com o concorrente', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), false);
      assert.equal(detectOptOut('', ['pare', 'parar', 'remover', 'bloquear', 'descadastrar', 'descadastre', 'cancelar', 'stop', 'não quero', 'não tenho interesse']), false);
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Disparo: variável de modelo não é mais cortada');
  await sequential([
    ['link longo chega inteiro (antes era cortado em 160 caracteres)', () => {
      const url = 'https://nyroh.com.br/proposta/' + 'a'.repeat(200);
      assert.equal(sanitizeTemplateVariable(url), url);
      assert.ok(sanitizeTemplateVariable(url).length > 160);
    }],
    ['quebra de linha e espaço repetido são limpos (exigência da Meta)', () => {
      assert.equal(sanitizeTemplateVariable('oi\n\nTudo   bem'), 'oi Tudo bem');
      assert.equal(sanitizeTemplateVariable('  texto \t fim  '), 'texto fim');
    }],
    ['valor vazio ou nulo vira string vazia', () => {
      assert.equal(sanitizeTemplateVariable(''), '');
      assert.equal(sanitizeTemplateVariable(undefined as any), '');
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Tokens da copy: campos do lead e do vendedor (resolvidos antes do envio)');
  {
    const ctx = { leadName: 'Marcelo Silva', sellerName: 'Thomas', publicUrl: 'https://p.nyroh.com.br/x', website: 'https://antigo.com.br', phoneNumber: '+5531999990000', niche: 'Marcenaria', now: new Date(2026, 10, 6, 9, 30) };

    test('copy sobre o modelo: cada índice vira uma variável do lead', () => {
      const ctx = { firstName: 'Roberto', company: 'Padaria Estrela', seller: 'Thomas', url: 'https://x.app/p' };
      assert.equal(fillLeadTokens('{nome}, {empresa} com {vendedor}', ctx), 'Roberto, Padaria Estrela com Thomas');
      const r = buildTemplateVariables({ 1: 'Oi {nome}', 2: '{site_novo}' }, ctx);
      assert.deepEqual(r.variables, { '1': 'Oi Roberto', '2': 'https://x.app/p' });
      assert.deepEqual(r.empty, []);
    });

    test('copy sobre o modelo: índice vazio é reportado e não vai para o envio', () => {
      const ctx = { firstName: 'Ana', company: 'X', seller: 'T', url: 'u' };
      const r = buildTemplateVariables({ 1: 'Oi {nome}', 2: '   ' }, ctx);
      assert.deepEqual(r.empty, [2]);
    });

    test('modelo com 4 variáveis: todas entram na copy e no envio (não cai em 1..3)', () => {
      const ctx = { firstName: 'Ana', company: 'Loja X', seller: 'Thomas', url: 'https://x.app/a' };
      const body = 'Oi {{1}}, {{2}} na {{3}}. Veja {{4}}';
      assert.deepEqual(templateVarIndexes(body), [1, 2, 3, 4]);
      const r = buildTemplateVariables({ 1: 'Oi {nome}', 2: 'Falo da {empresa}', 3: '{vendedor}', 4: '{site_novo}' }, ctx);
      assert.deepEqual(r.variables, { '1': 'Oi Ana', '2': 'Falo da Loja X', '3': 'Thomas', '4': 'https://x.app/a' });
      assert.deepEqual(r.empty, []);
    });

    test('modelo com 4 variáveis: a 4ª vazia bloqueia o lead (vai para empty)', () => {
      const ctx = { firstName: 'Ana', company: 'Loja X', seller: 'Thomas', url: 'u' };
      const r = buildTemplateVariables({ 1: 'Oi {nome}', 2: 'a', 3: 'b', 4: '  ' }, ctx);
      assert.deepEqual(r.empty, [4]);
    });

    test('modelo com 4 variáveis: texto final sai com os valores no lugar certo', () => {
      const out = renderTemplateBody('Oi {{1}}, {{2}}. {{3}} {{4}}', { 1: 'Ana', 2: 'tudo bem', 3: 'Sim', 4: 'ok' });
      assert.equal(out.text, 'Oi Ana, tudo bem. Sim ok');
      assert.deepEqual(out.missing, []);
    });

    test('modelo Meta: separa texto fixo de variável na ordem certa', () => {
      assert.deepEqual(parseTemplateBody('Oi {{1}}, tudo bem? {{2}}'), [
        { kind: 'text', text: 'Oi ' }, { kind: 'var', index: 1 }, { kind: 'text', text: ', tudo bem? ' }, { kind: 'var', index: 2 }
      ]);
      assert.deepEqual(templateVarIndexes('{{2}} x {{1}} y {{2}}'), [1, 2]);
    });

    test('modelo Meta: renderiza preview e avisa variável sem valor', () => {
      const ok = renderTemplateBody('Oi {{1}}!', { 1: 'Roberto' });
      assert.equal(ok.text, 'Oi Roberto!');
      assert.deepEqual(ok.missing, []);
      const falta = renderTemplateBody('Oi {{1}} de {{2}}', { 1: 'Ana' });
      assert.equal(falta.text, 'Oi Ana de {{2}}');
      assert.deepEqual(falta.missing, [2]);
    });

    test('áudio FluxoAPI: nota de voz só com a flag ligada', () => {
      assert.deepEqual(buildFluxoAudioMedia('https://x/a.ogg', false), { url: 'https://x/a.ogg' });
      assert.deepEqual(buildFluxoAudioMedia('https://x/a.ogg', true), { url: 'https://x/a.ogg' });
      assert.equal(isFluxoAudioVoiceEnabled({ FLUXO_AUDIO_VOICE: 'true' } as any), true);
      assert.equal(isFluxoAudioVoiceEnabled({} as any), true);
      assert.equal(isFluxoAudioVoiceEnabled({ FLUXO_AUDIO_VOICE: 'false' } as any), false);
    });

    test('status FluxoAPI: lista variáveis faltando na ordem certa', () => {
      assert.deepEqual(missingFluxoVars({ key: true, secret: true, instanceId: true, webhookSecret: true }), []);
      assert.deepEqual(
        missingFluxoVars({ key: false, secret: true, instanceId: false, webhookSecret: true }),
        ['FLUXO_KEY', 'FLUXO_INSTANCE_ID']
      );
    });

    test('status FluxoAPI: instância No ar é reconhecida pelo id', () => {
      const list = [{ id: 'inst_outra', status: 'connected' }, { id: 'inst_1', status: 'CONNECTED', name: 'NYROH', phone: '5531' }];
      const r = summarizeFluxoInstance(list, 'inst_1');
      assert.equal(r.found, true);
      assert.equal(r.status, 'no_ar');
      assert.equal(r.name, 'NYROH');
    });

    test('status FluxoAPI: instância ausente ou sem id não passa como conectada', () => {
      assert.equal(summarizeFluxoInstance([{ id: 'inst_x' }], 'inst_1').found, false);
      assert.equal(summarizeFluxoInstance([], '').status, 'sem_id');
      const off = summarizeFluxoInstance([{ id: 'inst_1', status: 'disconnected' }], 'inst_1');
      assert.equal(off.found, true);
      assert.notEqual(off.status, 'no_ar');
    });

    test('tokens legados: {nome} vira primeiro nome, {empresa} vira nome do lead', () => {
      const r = resolveLeadTokens('{nome}! Falo com o responsável pela {empresa}?', ctx);
      assert.equal(r.text, 'Marcelo! Falo com o responsável pela Marcelo Silva?');
    });
    test('tokens legados: {vendedor} e {site_novo}', () => {
      const r = resolveLeadTokens('Eu sou {vendedor}: {site_novo}', ctx);
      assert.equal(r.text, 'Eu sou Thomas: https://p.nyroh.com.br/x');
    });
    test('fallbacks legados: lead sem nome vira "Cliente" e "sua empresa"', () => {
      const r = resolveLeadTokens('Oi {nome}, sobre a {empresa}', { ...ctx, leadName: 'Cliente' });
      assert.equal(r.text, 'Oi Cliente, sobre a sua empresa');
    });
    test('fallback legado: sem link de prévia usa o endereço padrão', () => {
      const r = resolveLeadTokens('{site_novo}', { ...ctx, publicUrl: undefined });
      assert.equal(r.text, 'https://nyroh.app/preview');
    });
    test('token em maiúsculas também é reconhecido', () => {
      assert.equal(resolveLeadTokens('{NOME}', ctx).text, 'Marcelo');
    });
    test('campos novos: {site_antigo}, {telefone}, {nicho} e {data} vêm do lead', () => {
      const r = resolveLeadTokens('{site_antigo} {telefone} {nicho} {data}', ctx);
      assert.equal(r.text, 'https://antigo.com.br +5531999990000 Marcenaria 06/11/2026');
    });
    test('campo vazio é reportado (não some em silêncio)', () => {
      const r = resolveLeadTokens('site: {site_antigo}', { ...ctx, website: undefined });
      assert.deepEqual(r.empty, ['site_antigo']);
    });
    test('token desconhecido fica no texto e é reportado (ex.: {cidade}, que não existe no lead)', () => {
      const r = resolveLeadTokens('Estamos em {cidade}', ctx);
      assert.deepEqual(r.unknown, ['cidade']);
      assert.equal(r.text, 'Estamos em {cidade}');
    });
    test('troca é de uma passada: valor do lead com "{vendedor}" não é expandido de novo', () => {
      const r = resolveLeadTokens('{empresa}', { ...ctx, leadName: 'Loja {vendedor}' });
      assert.equal(r.text, 'Loja {vendedor}');
    });
    test('lista de tokens conhecidos inclui os campos novos', () => {
      for (const t of ['nome', 'empresa', 'vendedor', 'site_novo', 'site_antigo', 'telefone', 'data', 'nicho']) {
        assert.ok((TOKEN_NAMES as readonly string[]).includes(t), `falta ${t}`);
      }
    });
  }

  group('Modelos: regras de criação e envio (categoria, botões, exemplos, variáveis)');
  {
    test('categoria fora de MARKETING/UTILITY é recusada (não vira UTILITY em silêncio)', () => {
      assert.equal(validateTemplateCategory('MARKETING').ok, true);
      assert.equal(validateTemplateCategory('UTILITY').ok, true);
      assert.equal(validateTemplateCategory(undefined).ok, true);
      const r = validateTemplateCategory('AUTHENTICATION');
      assert.equal(r.ok, false);
      assert.match(r.error || '', /AUTHENTICATION/);
    });
    test('botão de link vira URL, não resposta rápida', () => {
      const b = buildMetaButtons([{ text: 'Acessar link', type: 'URL', url: 'https://exemplo.com.br' }]);
      assert.deepEqual(b, [{ type: 'URL', text: 'Acessar link', url: 'https://exemplo.com.br' }]);
    });
    test('botão de telefone vira PHONE_NUMBER; texto simples vira resposta rápida', () => {
      const b = buildMetaButtons([{ text: 'Ligar', type: 'PHONE_NUMBER', phone_number: '+5531999990000' }, 'Parar mensagem']);
      assert.deepEqual(b, [
        { type: 'PHONE_NUMBER', text: 'Ligar', phone_number: '+5531999990000' },
        { type: 'QUICK_REPLY', text: 'Parar mensagem' }
      ]);
    });
    test('botão de URL sem endereço é descartado (não manda botão inválido para a Meta)', () => {
      assert.deepEqual(buildMetaButtons([{ text: 'Acessar', type: 'URL' }]), []);
    });
    test('exemplos padrão são neutros: sem nomes reais, sem código fictício, sem link de demo', () => {
      for (const cat of ['UTILITY', 'MARKETING'] as const) {
        const ex = defaultExamples(cat, 3).join(' | ');
        assert.doesNotMatch(ex, /Caio|Marcelo|883921|nyroh\.com\.br\/demo/);
      }
      assert.equal(defaultExamples('UTILITY', 2).length, 2);
    });
    test('conta variáveis {{n}} distintas do corpo', () => {
      assert.equal(countBodyVariables('Oi {{1}}, veja {{2}} e {{1}}'), 2);
      assert.equal(countBodyVariables('sem variável'), 0);
    });
    test('valida variáveis antes do envio: quantidade e valor vazio', () => {
      const body = 'Oi {{1}}, código {{2}}';
      assert.equal(validateTemplateVariables(body, { '1': 'Ana', '2': '123' }).ok, true);
      const faltando = validateTemplateVariables(body, { '1': 'Ana' });
      assert.equal(faltando.ok, false);
      assert.deepEqual(faltando.missing, ['2']);
      const vazio = validateTemplateVariables(body, { '1': 'Ana', '2': '  ' });
      assert.deepEqual(vazio.missing, ['2']);
    });
  }

  group('Auditoria de site: não alcança endereço interno (SSRF)');
  await sequential([
    ['site público comum é permitido', () => {
      assert.equal(isPubliclyFetchableUrl('https://nyroh.com.br').ok, true);
      assert.equal(isPubliclyFetchableUrl('cliente.com.br').ok, true);
    }],
    ['localhost e 127.0.0.1 são recusados', () => {
      assert.equal(isPubliclyFetchableUrl('http://localhost:3000').ok, false);
      assert.equal(isPubliclyFetchableUrl('http://127.0.0.1/admin').ok, false);
    }],
    ['rede interna e metadados da nuvem são recusados', () => {
      assert.equal(isPubliclyFetchableUrl('http://10.0.0.5').ok, false);
      assert.equal(isPubliclyFetchableUrl('http://192.168.0.1').ok, false);
      assert.equal(isPubliclyFetchableUrl('http://169.254.169.254/latest/meta-data').ok, false);
      assert.equal(isPubliclyFetchableUrl('http://servico.internal').ok, false);
    }],
    ['outros protocolos são recusados', () => {
      assert.equal(isPubliclyFetchableUrl('file:///etc/passwd').ok, false);
      assert.equal(isPubliclyFetchableUrl('ftp://exemplo.com').ok, false);
    }]
  ]);

  // ---------------------------------------------------------------------------
  group('Webhook sem segredo: recusa em produção');
  await sequential([
    ['sem FLUXO_WEBHOOK_SECRET em produção, o evento é RECUSADO', () => {
      const savedSecret = process.env.FLUXO_WEBHOOK_SECRET;
      const savedEnv = process.env.NODE_ENV;
      delete process.env.FLUXO_WEBHOOK_SECRET;
      process.env.NODE_ENV = 'production';
      const r = verifyFluxoWebhook('{"id":"evt_1"}', {});
      assert.equal(r.isValid, false);
      assert.match(r.reason || '', /FLUXO_WEBHOOK_SECRET/);
      if (savedSecret === undefined) delete process.env.FLUXO_WEBHOOK_SECRET;
      else process.env.FLUXO_WEBHOOK_SECRET = savedSecret;
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
    }],
    ['fora de produção, segue aceitando (ambiente local recém-criado)', () => {
      const savedSecret = process.env.FLUXO_WEBHOOK_SECRET;
      const savedEnv = process.env.NODE_ENV;
      const savedRailway = process.env.RAILWAY_ENVIRONMENT;
      delete process.env.FLUXO_WEBHOOK_SECRET;
      delete process.env.RAILWAY_ENVIRONMENT;
      process.env.NODE_ENV = 'development';
      assert.equal(verifyFluxoWebhook('{"id":"evt_1"}', {}).isValid, true);
      if (savedSecret === undefined) delete process.env.FLUXO_WEBHOOK_SECRET;
      else process.env.FLUXO_WEBHOOK_SECRET = savedSecret;
      if (savedEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedEnv;
      if (savedRailway !== undefined) process.env.RAILWAY_ENVIRONMENT = savedRailway;
    }]
  ]);


  // ---------------------------------------------------------------------------
  group('WhatsApp Cloud API direta da Meta (metaClient)');
  const fetchCalls: Array<{ url: string; init: any }> = [];
  const realFetch = globalThis.fetch;
  const mockFetch = (handler: (url: string, init: any) => any) => {
    (globalThis as any).fetch = async (url: string, init: any = {}) => {
      fetchCalls.push({ url, init });
      const r = handler(url, init);
      return new Response(r.body === undefined ? '' : (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)), {
        status: r.status ?? 200,
        headers: r.headers || { 'content-type': 'application/json' }
      });
    };
  };
  const resetFetch = () => { fetchCalls.length = 0; (globalThis as any).fetch = realFetch; };
  const envBackup = { ...process.env };
  const setEnv = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  const withMetaEnv = () => {
    setEnv('META_ACCESS_TOKEN', 'TOKEN_ENV');
    setEnv('META_PHONE_NUMBER_ID', '111');
    setEnv('META_WABA_ID', 'WABA_ENV');
    setEnv('META_APP_SECRET', 'SEGREDO_APP');
    setEnv('META_TOKEN_ENCRYPTION_KEY', 'chave-de-teste-com-tamanho-suficiente');
  };

  await sequential([
    ['assinatura do webhook: HMAC correto passa, adulterado não', () => {
      const body = '{"entry":[]}';
      const sig = 'sha256=' + crypto.createHmac('sha256', 'SEGREDO_APP').update(body, 'utf8').digest('hex');
      assert.equal(verifyMetaSignature(body, sig, 'SEGREDO_APP').isValid, true);
      assert.equal(verifyMetaSignature(body + ' ', sig, 'SEGREDO_APP').isValid, false);
    }],
    ['assinatura do webhook: sem App Secret, recusa (falha fechada)', () => {
      const r = verifyMetaSignature('{}', 'sha256=abc', '');
      assert.equal(r.isValid, false);
    }],
    ['token criptografado: ida e volta, e texto cifrado não contém o token', () => {
      setEnv('META_TOKEN_ENCRYPTION_KEY', 'chave-de-teste-com-tamanho-suficiente');
      const enc = encryptMetaToken('EAAG_token_secreto_123');
      assert.ok(!enc.includes('EAAG_token_secreto_123'));
      assert.equal(decryptMetaToken(enc), 'EAAG_token_secreto_123');
    }],
    ['token criptografado: adulterar o texto cifrado é detectado', () => {
      setEnv('META_TOKEN_ENCRYPTION_KEY', 'chave-de-teste-com-tamanho-suficiente');
      const enc = encryptMetaToken('abc');
      const parts = enc.split(':');
      parts[3] = Buffer.from('lixo').toString('base64');
      assert.throws(() => decryptMetaToken(parts.join(':')));
    }],
    ['token criptografado: sem chave configurada, recusa guardar', () => {
      setEnv('META_TOKEN_ENCRYPTION_KEY', undefined);
      assert.throws(() => encryptMetaToken('abc'), /META_TOKEN_ENCRYPTION_KEY/);
      setEnv('META_TOKEN_ENCRYPTION_KEY', 'chave-de-teste-com-tamanho-suficiente');
    }],
    ['envio de texto: vai para o número do ambiente com o token do ambiente', async () => {
      withMetaEnv();
      setMetaRegistry([], []);
      mockFetch(() => ({ body: { messages: [{ id: 'wamid.X' }] } }));
      const r = await metaSendText('+55 (31) 98765-4321', 'oi');
      assert.equal(r.success, true);
      assert.ok(fetchCalls[0].url.endsWith('/111/messages'));
      assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer TOKEN_ENV');
      const body = JSON.parse(fetchCalls[0].init.body);
      assert.equal(body.to, '5531987654321');
      assert.equal(body.text.body, 'oi');
      resetFetch();
    }],
    ['roteamento: número de outra BM usa o token DESSA BM', async () => {
      withMetaEnv();
      setMetaRegistry(
        [{ id: 'bm_2', name: 'Outra BM', wabaId: 'WABA_2', accessToken: 'TOKEN_BM2' }],
        [{ phoneNumberId: '222', accountId: 'bm_2', displayPhoneNumber: '+55 31 0000-0000' }]
      );
      mockFetch(() => ({ body: { messages: [{ id: 'wamid.Y' }] } }));
      await metaSendText('5531999999999', 'olá', '222');
      assert.ok(fetchCalls[0].url.endsWith('/222/messages'));
      assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer TOKEN_BM2');
      assert.equal(resolveMetaSender('222').accountId, 'bm_2');
      setMetaRegistry([], []);
      resetFetch();
    }],
    ['roteamento: número desconhecido cai no ambiente', () => {
      withMetaEnv();
      setMetaRegistry([], []);
      const r = resolveMetaSender('999');
      assert.equal(r.accountId, 'env');
      assert.equal(r.accessToken, 'TOKEN_ENV');
    }],
    ['template: variáveis numéricas viram parâmetros do corpo em ordem', async () => {
      withMetaEnv();
      setMetaRegistry([], []);
      mockFetch(() => ({ body: { messages: [{ id: 'wamid.T' }] } }));
      await metaSendTemplate({ to: '5531999999999', name: 'promo', variables: { '2': 'b', '1': 'a' } });
      const body = JSON.parse(fetchCalls[0].init.body);
      assert.equal(body.type, 'template');
      assert.deepEqual(body.template.components[0].parameters.map((p: any) => p.text), ['a', 'b']);
      resetFetch();
    }],
    ['marcar como lido: envia status read com o id da mensagem', async () => {
      withMetaEnv();
      setMetaRegistry([], []);
      mockFetch(() => ({ body: { success: true } }));
      await metaMarkRead('wamid.Z');
      const body = JSON.parse(fetchCalls[0].init.body);
      assert.equal(body.status, 'read');
      assert.equal(body.message_id, 'wamid.Z');
      resetFetch();
    }],
    ['download de mídia: pega a URL na Graph API e baixa com o token da conta', async () => {
      withMetaEnv();
      setMetaRegistry([], []);
      let step = 0;
      mockFetch((url) => {
        step++;
        if (url.includes('/media_123')) return { body: { url: 'https://lookaside.fbsbx.com/arquivo', mime_type: 'image/jpeg' } };
        return { body: 'BINARIO', headers: { 'content-type': 'image/jpeg' } };
      });
      const r = await metaDownloadMedia('media_123');
      assert.equal(r.success, true);
      assert.equal(r.contentType, 'image/jpeg');
      assert.equal(fetchCalls[1].init.headers.Authorization, 'Bearer TOKEN_ENV');
      assert.equal(step, 2);
      resetFetch();
    }],
    ['modelo: criar na BM escolhida usa a WABA e o token DESSA BM', async () => {
      withMetaEnv();
      setMetaRegistry([{ id: 'bm_2', name: 'Outra BM', wabaId: 'WABA_2', accessToken: 'TOKEN_BM2' }], []);
      mockFetch(() => ({ body: { success: true } }));
      await metaCreateTemplate({ name: 'x', language: 'pt_BR', category: 'UTILITY', components: [] }, 'bm_2');
      assert.ok(fetchCalls[0].url.endsWith('/WABA_2/message_templates'));
      assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer TOKEN_BM2');
      resetFetch();
      setMetaRegistry([], []);
    }],
    ['modelo: apagar e listar usam a BM escolhida (e o ambiente por padrão)', async () => {
      withMetaEnv();
      setMetaRegistry([{ id: 'bm_2', name: 'Outra BM', wabaId: 'WABA_2', accessToken: 'TOKEN_BM2' }], []);
      mockFetch(() => ({ body: { data: [] } }));
      await metaDeleteTemplate('x', 'bm_2');
      await metaListTemplates();
      assert.ok(fetchCalls[0].url.includes('/WABA_2/message_templates?name=x'));
      assert.equal(fetchCalls[0].init.method, 'DELETE');
      assert.ok(fetchCalls[1].url.includes('/WABA_ENV/message_templates'));
      assert.equal(fetchCalls[1].init.headers.Authorization, 'Bearer TOKEN_ENV');
      resetFetch();
      setMetaRegistry([], []);
    }],
    ['webhook: evento real da Meta -> número que recebeu -> leitura e resposta saem pelo token DA BM', async () => {
      withMetaEnv();
      setMetaRegistry(
        [{ id: 'bm_2', name: 'Outra BM', wabaId: 'WABA_2', accessToken: 'TOKEN_BM2' }],
        [{ phoneNumberId: '222', accountId: 'bm_2', displayPhoneNumber: '+55 31 0000-0000' }]
      );
      const event = {
        object: 'whatsapp_business_account',
        entry: [{ id: 'WABA_2', changes: [{ field: 'messages', value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '553100000000', phone_number_id: '222' },
          contacts: [{ profile: { name: 'Cliente' }, wa_id: '5531999999999' }],
          messages: [{ from: '5531999999999', id: 'wamid.ABC', timestamp: '1700000000', type: 'text', text: { body: 'oi' } }]
        } }] }]
      };
      const pid = receivingPhoneNumberId(event);
      assert.equal(pid, '222');
      mockFetch(() => ({ body: { messages: [{ id: 'wamid.OUT' }], success: true } }));
      await metaMarkRead('wamid.ABC', pid);
      await metaSendText('5531999999999', 'resposta', pid);
      assert.ok(fetchCalls[0].url.endsWith('/222/messages'));
      assert.equal(JSON.parse(fetchCalls[0].init.body).status, 'read');
      assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer TOKEN_BM2');
      assert.ok(fetchCalls[1].url.endsWith('/222/messages'));
      assert.equal(fetchCalls[1].init.headers.Authorization, 'Bearer TOKEN_BM2');
      resetFetch();
      setMetaRegistry([], []);
    }],
    ['webhook sem metadata: sem número, cai no padrão do ambiente', () => {
      withMetaEnv();
      setMetaRegistry([], []);
      assert.equal(receivingPhoneNumberId({ entry: [{ changes: [{ value: {} }] }] }), undefined);
      assert.equal(resolveMetaSender(undefined).accountId, 'env');
    }],
    ['coexistência: echo de texto vira mensagem enviada pelo celular, com o número do cliente', () => {
      const out = parseCoexistenceEchoes({ message_echoes: [{ from: '5531000000000', to: '+55 31 99999-9999', id: 'wamid.E1', timestamp: '1700000000', type: 'text', text: { body: 'oi, tudo bem?' } }] });
      assert.equal(out.length, 1);
      assert.equal(out[0].phone, '5531999999999');
      assert.equal(out[0].text, 'oi, tudo bem?');
      assert.equal(out[0].messageId, 'wamid.E1');
      assert.equal(out[0].eventTimestamp, new Date(1700000000 * 1000).toISOString());
    }],
    ['coexistência: echo de mídia vira rótulo de texto (o arquivo não vem nesse evento)', () => {
      const out = parseCoexistenceEchoes({ message_echoes: [{ to: '5531999999999', id: 'wamid.E2', type: 'image' }] });
      assert.equal(out[0].text, '[Imagem enviada pelo celular]');
    }],
    ['coexistência: sem echoes não gera nada', () => {
      assert.deepEqual(parseCoexistenceEchoes({}), []);
    }],
    ['erro da Meta vira falha com a mensagem dela (não derruba)', async () => {
      withMetaEnv();
      setMetaRegistry([], []);
      mockFetch(() => ({ status: 400, body: { error: { message: 'Template não aprovado' } } }));
      const r = await metaSendTemplate({ to: '5531999999999', name: 'x' });
      assert.equal(r.success, false);
      assert.equal(r.error, 'Template não aprovado');
      resetFetch();
    }]
  ]);

  // Restaura o ambiente depois dos testes da Meta
  for (const k of Object.keys(process.env)) if (!(k in envBackup)) delete process.env[k];
  Object.assign(process.env, envBackup);
  void realFetch;


  group('Automações de resposta (motor puro, sem rede)');
  const base: Automacao = { nome: 'Clicou', gatilho: { evento: 'cliente_clicou', filtro: { texto_igual: 'Acessar Link' } }, passos: [{ acao: 'enviar_texto', params: { texto: 'Link: {site_novo}' } }] };
  test('automação válida passa sem erros nem conflitos', () => {
    const r = validarAutomacao(base, [], 'x');
    assert.deepEqual(r.erros, []);
    assert.deepEqual(r.conflitos, []);
  });
  test('variável que não existe no projeto bloqueia o salvamento', () => {
    const r = validarAutomacao({ ...base, passos: [{ acao: 'enviar_texto', params: { texto: 'Oi {link}' } }] }, [], 'x');
    assert.ok(r.erros.some((e) => e.includes('{link} não existe')));
  });
  test('texto final acima de 1024 caracteres bloqueia (conta o valor de exemplo, não o modelo)', () => {
    const r = validarAutomacao({ ...base, passos: [{ acao: 'enviar_texto', params: { texto: 'a'.repeat(1030) } }] }, [], 'x');
    assert.ok(r.erros.some((e) => e.includes('1024')));
  });
  test('espera zero ou acima de 30 dias bloqueia', () => {
    const zero = validarAutomacao({ ...base, passos: [{ acao: 'esperar', params: { valor: 0, unidade: 'horas' } }] }, [], 'x');
    const longa = validarAutomacao({ ...base, passos: [{ acao: 'esperar', params: { valor: 31, unidade: 'dias' } }] }, [], 'x');
    assert.ok(zero.erros.length > 0);
    assert.ok(longa.erros.some((e) => e.includes('30 dias')));
  });
  test('variável com fallback vazio vira aviso (não bloqueia salvar)', () => {
    const r = validarAutomacao({ ...base, passos: [{ acao: 'enviar_texto', params: { texto: 'Cnpj {telefone}' } }] }, [], 'x');
    assert.deepEqual(r.erros, []);
    assert.ok(r.avisos.some((a) => a.includes('{telefone}')));
  });
  test('conflito: envia texto x opt-out no mesmo gatilho, com automação ativa, bloqueia ativação', () => {
    const outra = { id: 'o', status: 'ativa', def: { nome: 'Pede parar', gatilho: { evento: 'cliente_clicou' as const }, passos: [{ acao: 'marcar_optout' as const }] } };
    const r = validarAutomacao(base, [outra], 'x');
    assert.ok(r.conflitos.some((c) => c.includes('Pede parar')));
  });
  test('conflito só vale para automação ATIVA (rascunho não bloqueia)', () => {
    const outra = { id: 'o', status: 'rascunho', def: { nome: 'Pede parar', gatilho: { evento: 'cliente_clicou' as const }, passos: [{ acao: 'marcar_optout' as const }] } };
    assert.deepEqual(validarAutomacao(base, [outra], 'x').conflitos, []);
  });
  test('texto de confirmação depois do opt-out é permitido (ordem define o efeito)', () => {
    const r = validarAutomacao({ ...base, gatilho: { evento: 'cliente_pediu_parar' }, passos: [{ acao: 'marcar_optout' }, { acao: 'enviar_texto', params: { texto: 'Tudo certo, {nome}.' } }] }, [], 'x');
    assert.deepEqual(r.erros, []);
  });
  test('lógica em palavras e conversa simulada usam os valores de exemplo do projeto', () => {
    const linhas = logicaEmPalavras(base);
    assert.ok(linhas[0].includes('clicou no botão'));
    assert.ok(linhas.some((l) => l.includes('https://site-do-cliente.com.br')));
    const conv = conversaSimulada(base);
    assert.equal(conv[0].quem, 'cliente');
    assert.equal(conv[1].quem, 'automacao');
    assert.equal(renderPrevia('Oi {nome} de {empresa}'), 'Oi Roberto de Padaria Estrela');
    assert.deepEqual(tokensDesconhecidos('{nome} {xpto}'), ['xpto']);
  });


group('Planejador de automações (sem envio)');
test('planeja só regras ativas do mesmo evento, com tempo acumulado', () => {
  const regras: RegistroAutomacao[] = [
    { id: 'a', status: 'ativa', def: { nome: 'A', gatilho: { evento: 'cliente_respondeu' }, passos: [
      { acao: 'esperar', params: { valor: 2, unidade: 'horas' } },
      { acao: 'enviar_texto', params: { texto: 'Oi {nome}' } },
    ] } },
    { id: 'b', status: 'rascunho', def: { nome: 'B', gatilho: { evento: 'cliente_respondeu' }, passos: [{ acao: 'revisao', params: { motivo: 'x' } }] } },
    { id: 'c', status: 'ativa', def: { nome: 'C', gatilho: { evento: 'cliente_ameacou' }, passos: [{ acao: 'pausar_lead' }] } },
  ];
  const planos = planejarEvento('cliente_respondeu', regras, {}, (t) => t.replace('{nome}', 'Ana'));
  assert.equal(planos.length, 1, 'só a ativa do evento');
  assert.equal(planos[0].passos[0].horasDesdeEvento, 2, 'espera acumulada');
  assert.equal(planos[0].passos[1].texto, 'Oi Ana', 'variável resolvida pelo lead');
});
test('filtro de texto e condição de opt-out são respeitados', () => {
  const regras: RegistroAutomacao[] = [
    { id: 'l', status: 'ativa', def: { nome: 'Link', gatilho: { evento: 'cliente_clicou', filtro: { texto_igual: 'Acessar Link' } },
      condicoes: [{ var: 'lead.optout', op: 'falso' }], passos: [{ acao: 'enviar_texto', params: { texto: 'link' } }] } },
  ];
  assert.equal(planejarEvento('cliente_clicou', regras, { texto: 'Outro' }).length, 0, 'texto diferente não dispara');
  assert.equal(planejarEvento('cliente_clicou', regras, { texto: 'Acessar Link', optout: true }).length, 0, 'opt-out bloqueia');
  assert.equal(planejarEvento('cliente_clicou', regras, { texto: 'Acessar Link', optout: false }).length, 1, 'caso normal dispara');
});

group('Backup do banco (exportação)');
test('colunas de senha, hash, token e chave nunca entram no backup', () => {
  for (const c of ['password_hash', 'password_salt', 'access_token', 'api_key', 'secret_value']) {
    assert.equal(colunaPermitida(c), false, c);
  }
  for (const c of ['name', 'phone', 'created_at', 'message_text']) {
    assert.equal(colunaPermitida(c), true, c);
  }
});
test('tabelas de tokens e chaves ficam fora da exportação', () => {
  assert.equal((TABELAS_BACKUP as readonly string[]).includes('auth_sessions'), false);
  assert.equal((TABELAS_BACKUP as readonly string[]).includes('system_settings'), false);
});

group('Agenda e palavra-chave das automações');
test('espera personalizada soma no horário certo (ex.: 1h30 = 90 minutos)', () => {
  const agora = new Date('2026-11-10T10:00:00-03:00');
  assert.equal(quandoExecutar(agora, 1.5).toISOString(), '2026-11-10T14:30:00.000Z');
  assert.equal(quandoExecutar(agora, 0).getTime(), agora.getTime());
  assert.equal(estaVencido(quandoExecutar(agora, 2), agora), false);
  assert.equal(estaVencido(agora, agora), true);
});
test('palavra-chave ignora maiúscula e acento', () => {
  assert.equal(contemPalavra('Quero PREÇO, pode mandar', 'preco'), true);
  assert.equal(contemPalavra('não tenho interesse', 'preco'), false);
  assert.equal(contemPalavra('qualquer coisa', '   '), false);
});
test('planejador usa texto_contem como filtro do gatilho', () => {
  const regras: RegistroAutomacao[] = [
    { id: 'k', status: 'ativa', def: { nome: 'Preço', gatilho: { evento: 'cliente_respondeu', filtro: { texto_contem: 'preço' } },
      passos: [{ acao: 'enviar_texto', params: { texto: 'Segue o valor' } }] } },
  ];
  assert.equal(planejarEvento('cliente_respondeu', regras, { texto: 'Qual o PRECO?' }).length, 1);
  assert.equal(planejarEvento('cliente_respondeu', regras, { texto: 'oi' }).length, 0);
});

group('Recebimento de resposta (agenda, sem envio)');
test('eventoDaResposta mapeia botão, parada e texto livre', () => {
  assert.equal(eventoDaResposta('Acessar Link', false), 'cliente_clicou');
  assert.equal(eventoDaResposta('Parar Mensagens', true), 'cliente_pediu_parar');
  assert.equal(eventoDaResposta('quero saber o preço', false), 'cliente_respondeu');
});
test('com a flag desligada, nada é gravado na fila', async () => {
  delete process.env.NYROH_AUTOMACOES_EXECUCAO;
  let gravados = 0;
  const deps: DepsRecebimento = {
    carregarRegras: async () => [{ id: 'x', status: 'ativa', def: { nome: 'X', gatilho: { evento: 'cliente_respondeu' }, passos: [{ acao: 'enviar_texto', params: { texto: 'oi' } }] } }],
    gravarFila: async () => { gravados++; },
  };
  const n = await registrarEventoCliente({ leadId: 'l1', texto: 'oi', optout: false }, new Date(), deps);
  assert.equal(n, 0);
  assert.equal(gravados, 0);
});
test('com a flag ligada, agenda os passos com o texto-modelo e não envia', async () => {
  process.env.NYROH_AUTOMACOES_EXECUCAO = 'true';
  let fila: any[] = [];
  const deps: DepsRecebimento = {
    carregarRegras: async () => [{ id: 'x', status: 'ativa', def: { nome: 'X', gatilho: { evento: 'cliente_respondeu' }, passos: [
      { acao: 'esperar', params: { valor: 90, unidade: 'minutos' } },
      { acao: 'enviar_texto', params: { texto: 'Oi {nome}' } },
    ] } }],
    gravarFila: async (itens) => { fila = itens; },
  };
  const agora = new Date('2026-11-10T13:00:00Z');
  const n = await registrarEventoCliente({ leadId: 'l1', texto: 'quero preço', optout: false }, agora, deps);
  delete process.env.NYROH_AUTOMACOES_EXECUCAO;
  assert.equal(n, 2);
  assert.equal(fila[1].texto, 'Oi {nome}', 'guarda o modelo, sem preencher variáveis');
  assert.equal(fila[1].executarEm.toISOString(), '2026-11-10T14:30:00.000Z');
});

group('Processador da fila (sem envio)');
test('processa só os vencidos: espera ok, texto simulado com dados reais, sem envio', async () => {
  const fila = [
    { id: 'e1', automacaoId: 'a', leadId: 'L1', passoOrdem: 1, acao: 'esperar' as const, texto: null, executarEm: new Date() },
    { id: 'e2', automacaoId: 'a', leadId: 'L1', passoOrdem: 2, acao: 'enviar_texto' as const, texto: 'Oi {nome}, veja {empresa}', executarEm: new Date() },
  ];
  const marcados: Array<{ id: string; status: string; resultado: string; texto: string | null }> = [];
  const deps: DepsWorker = {
    buscarVencidos: async () => fila,
    reservar: async () => true,
    contextoDoLead: async () => ({ leadName: 'Ana Souza', sellerName: 'Thomas', ultimaMensagemDoCliente: new Date('2026-11-10T12:00:00Z') }),
    marcarResultado: async (id, status, resultado, texto) => { marcados.push({ id, status, resultado, texto }); },
  };
  const r = await processarVencidos(new Date('2026-11-10T13:00:00Z'), deps);
  assert.equal(r.processados, 2);
  assert.equal(marcados[0].resultado, 'Espera concluída');
  assert.equal(marcados[1].status, 'executado');
  assert.match(marcados[1].resultado, /nada foi enviado/);
  assert.equal(marcados[1].texto, 'Oi Ana, veja Ana Souza');
});
test('passo com variável sem dado do lead é cancelado com o motivo', async () => {
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    reservar: async () => true,
    buscarVencidos: async () => [{ id: 'x', automacaoId: 'a', leadId: 'L2', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'Tel {telefone}', executarEm: new Date() }],
    contextoDoLead: async () => ({ leadName: 'Bia' }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
  };
  await processarVencidos(new Date(), deps);
  assert.equal(marcados[0].status, 'cancelado');
  assert.match(marcados[0].resultado, /telefone/);
});
test('item que outro ciclo já reservou não é executado nem marcado', async () => {
  const marcados: string[] = [];
  let contexto = 0;
  const deps: DepsWorker = {
    buscarVencidos: async () => [{ id: 'r1', automacaoId: 'a', leadId: 'L3', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'Oi {nome}', executarEm: new Date() }],
    reservar: async () => false,
    contextoDoLead: async () => { contexto++; return { leadName: 'Caio' }; },
    marcarResultado: async (id) => { marcados.push(id); },
  };
  const r = await processarVencidos(new Date(), deps);
  assert.equal(r.ignorados, 1);
  assert.equal(r.processados, 0);
  assert.equal(marcados.length, 0);
  assert.equal(contexto, 0, 'nem lê o lead quando não reservou');
});
test('lead com opt-out não recebe o passo, mesmo já na fila', async () => {
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    buscarVencidos: async () => [{ id: 'o1', automacaoId: 'a', leadId: 'L4', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'Oi {nome}', executarEm: new Date() }],
    reservar: async () => true,
    contextoDoLead: async () => ({ leadName: 'Dani', optout: true }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
  };
  const r = await processarVencidos(new Date(), deps);
  assert.equal(marcados[0].status, 'cancelado');
  assert.match(marcados[0].resultado, /opt-out/);
  assert.equal(r.simulados, 0);
});

group('Estado do lead e prioridades (seção 7)');
test('opt-out vence: clique depois de pedir para parar não executa nada', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  let e = estadoInicial();
  const parar = decidirEvento(e, 'cliente_pediu_parar', agora);
  assert.equal(parar.estado.statusGeral, 'optout');
  const clique = decidirEvento(parar.estado, 'cliente_clicou', agora, { id: 'r1', versao: 1 });
  assert.equal(clique.pode, false);
  assert.match(clique.motivo, /opt-out/);
});
test('ameaça pausa o lead, e a regra não dispara depois', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const a = decidirEvento(estadoInicial(), 'cliente_ameacou', agora);
  assert.equal(a.estado.statusGeral, 'revisao');
  const b = decidirEvento(a.estado, 'cliente_clicou', agora, { id: 'r1', versao: 1 });
  assert.equal(b.pode, false);
  assert.match(b.motivo, /só revisão/);
});
test('repetição não executa de novo: mesma regra na mesma versão é ignorada', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const r = { id: 'r1', versao: 1 };
  const primeira = decidirEvento(estadoInicial(), 'cliente_clicou', agora, r);
  assert.equal(primeira.pode, true);
  const segunda = decidirEvento(primeira.estado, 'cliente_clicou', agora, r);
  assert.equal(segunda.pode, false);
  assert.match(segunda.motivo, /já executou/);
});
test('nova versão da regra pode executar de novo para quem já recebeu a anterior', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const v1 = decidirEvento(estadoInicial(), 'cliente_clicou', agora, { id: 'r1', versao: 1 });
  const v2 = decidirEvento(v1.estado, 'cliente_clicou', agora, { id: 'r1', versao: 2 });
  assert.equal(v2.pode, true);
});
test('pausa manual não reverte opt-out, e liberar só vale para pausa', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const optout = decidirEvento(estadoInicial(), 'cliente_pediu_parar', agora).estado;
  assert.equal(pausarLead(optout, 'pausado').statusGeral, 'optout');
  assert.equal(liberarLead(optout).statusGeral, 'optout');
  const pausado = pausarLead(estadoInicial(), 'pausado');
  assert.equal(liberarLead(pausado).statusGeral, 'ativo');
});
test('a decisão não altera o estado original (sem efeito colateral)', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const inicial = estadoInicial();
  decidirEvento(inicial, 'cliente_pediu_parar', agora);
  assert.equal(inicial.statusGeral, 'ativo');
  assert.deepEqual(inicial.regrasExecutadas, {});
});

group('Catálogo completo (fase C)');
test('catálogo traz os gatilhos, condições e ações do blueprint', () => {
  const ev = new Set(EVENTOS.map((e) => e.v));
  for (const v of ['cliente_clicou', 'cliente_pediu_parar', 'cliente_ameacou', 'cliente_respondeu', 'sem_resposta', 'falha_envio', 'resposta_automatica', 'passo_falhou']) {
    assert.ok(ev.has(v as never), `gatilho ${v} ausente`);
  }
  const ac = new Set(ACOES.map((a) => a.v));
  for (const v of ['enviar_texto', 'enviar_template', 'marcar_optout', 'pausar_lead', 'revisao', 'etiqueta', 'remover_etiqueta', 'cancelar_passos']) {
    assert.ok(ac.has(v as never), `ação ${v} ausente`);
  }
  assert.ok(CONDICOES.length >= 5);
});
test('validação recusa condição fora do catálogo e operador errado', () => {
  const base = { nome: 'x', gatilho: { evento: 'cliente_clicou' }, passos: [{ acao: 'enviar_texto', params: { texto: 'oi' } }] };
  const r1 = validarAutomacao({ ...base, condicoes: [{ var: 'lead.inventada', op: 'falso' }] }, [], 'self');
  assert.ok(r1.erros.some((e) => /não existe no catálogo/.test(e)));
  const r2 = validarAutomacao({ ...base, condicoes: [{ var: 'lead.pausado', op: 'igual' }] }, [], 'self');
  assert.ok(r2.erros.some((e) => /operador/.test(e)));
  const ok = validarAutomacao({ ...base, condicoes: [{ var: 'lead.optout', op: 'falso' }] }, [], 'self');
  assert.equal(ok.erros.length, 0);
});
test('ações novas passam na validação', () => {
  const r = validarAutomacao({ nome: 'n', gatilho: { evento: 'sem_resposta' }, passos: [{ acao: 'enviar_template', params: { nome: 'modelo_1' } }, { acao: 'cancelar_passos' }] }, [], 'self');
  assert.equal(r.erros.length, 0);
});

group('Limites, pausa geral, versão e auditoria (fase D)');
test('limite diário bloqueia o 4º envio em 24h, com motivo', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const envios = [1, 2, 3].map((h) => new Date(agora.getTime() - h * 3600_000));
  const r = dentroDosLimites(envios, agora, LIMITES_TESTE);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /diário/);
});
test('limite semanal bloqueia mesmo fora das 24h', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  // 10 envios entre 25h e 133h atrás: fora das 24h, dentro dos 7 dias.
  const envios = Array.from({ length: 10 }, (_, k) => new Date(agora.getTime() - (25 + 12 * k) * 3600_000));
  const r = dentroDosLimites(envios, agora, LIMITES_TESTE);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /semanal/);
});
test('lead dentro dos limites pode receber', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  assert.equal(dentroDosLimites([], agora).ok, true);
});
test('pausa geral só vale com a variável exata', () => {
  assert.equal(pausaGeralAtiva({ NYROH_AUTOMACOES_PAUSA_GERAL: 'true' }), true);
  assert.equal(pausaGeralAtiva({ NYROH_AUTOMACOES_PAUSA_GERAL: 'sim' }), false);
  assert.equal(pausaGeralAtiva({}), false);
});
test('versão começa em 1 e sobe a cada alteração', () => {
  assert.equal(proximaVersao(undefined), 1);
  assert.equal(proximaVersao(1), 2);
  assert.equal(proximaVersao(7), 8);
});
test('registro de auditoria guarda decisão, motivo e alvo', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const r = registroAuditoria('bloqueou', 'Limite diário atingido', agora, { leadId: 'L1', regraId: 'a', versao: 2 });
  assert.equal(r.decisao, 'bloqueou');
  assert.equal(r.leadId, 'L1');
  assert.equal(r.versao, 2);
  assert.equal(r.quando, '2026-11-10T13:00:00.000Z');
});
test('pausa geral para a fila sem tocar em nenhum item', async () => {
  let buscou = false;
  const deps: DepsWorker = {
    buscarVencidos: async () => { buscou = true; return []; },
    reservar: async () => true,
    contextoDoLead: async () => null,
    marcarResultado: async () => {},
  };
  const r = await processarVencidos(new Date(), deps, 50, { pausaGeral: true });
  assert.equal(r.pausado, true);
  assert.equal(buscou, false, 'nem busca os itens quando pausado');
});
test('item bloqueado pelo limite vira cancelado com motivo e entra na auditoria', async () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    buscarVencidos: async () => [{ id: 'lim1', automacaoId: 'a', leadId: 'L9', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'Oi', executarEm: agora, limites: { porDia: 3 } }],
    reservar: async () => true,
    contextoDoLead: async () => ({ leadName: 'Eva', ultimaMensagemDoCliente: agora }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
    enviosRecentes: async () => [1, 2, 3].map((h) => new Date(agora.getTime() - h * 3600_000)),
  };
  const r = await processarVencidos(agora, deps);
  assert.equal(marcados[0].status, 'cancelado');
  assert.match(marcados[0].resultado, /Limite/);
  assert.equal(r.auditoria[0].decisao, 'bloqueou');
});

group('Versão, condições reais e leituras (fases C, D e E)');
test('salvar gera versão nova e guarda a anterior no histórico, sem aceitar versão do cliente', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const v1 = aplicarVersao(null, { nome: 'a', versao: 99, historico: [{ x: 1 }] }, agora);
  assert.equal(v1.versao, 1, 'primeira versão, ignora a do cliente');
  assert.deepEqual(v1.historico, []);
  const v2 = aplicarVersao(v1, { nome: 'a editada' }, agora);
  assert.equal(v2.versao, 2);
  assert.equal((v2.historico as unknown[]).length, 1);
  assert.equal((v2.historico as Array<{ versao: number }>)[0].versao, 1);
});
test('histórico de versões fica limitado a 20 entradas', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  let d: Record<string, unknown> | null = null;
  for (let i = 0; i < 30; i++) d = aplicarVersao(d, { nome: `v${i}` }, agora);
  assert.equal((d as { versao: number }).versao, 30);
  assert.equal(((d as { historico: unknown[] }).historico).length, 20);
});
test('condições reais: lead em opt-out não passa em lead.optout falso', () => {
  const ctx = { optout: true, pausado: false, janela24h: true, agora: new Date('2026-11-10T13:00:00Z'), ultimoComando: null };
  const r = avaliarCondicoes([{ var: 'lead.optout', op: 'falso' }], ctx);
  assert.equal(r.ok, false);
  assert.deepEqual(r.falhas, ['lead.optout falso']);
});
test('condições reais: janela de 24h e comando do lead', () => {
  const ctx = { optout: false, pausado: false, janela24h: false, agora: new Date('2026-11-10T13:00:00Z'), ultimoComando: 'cliente_clicou' as const };
  assert.equal(avaliarCondicoes([{ var: 'janela_24h', op: 'verdadeiro' }], ctx).ok, false);
  assert.equal(avaliarCondicoes([{ var: 'ultimo_comando', op: 'igual', valor: 'cliente_clicou' }], ctx).ok, true);
  assert.equal(avaliarCondicoes([{ var: 'ultimo_comando', op: 'igual', valor: 'sem_resposta' }], ctx).ok, false);
});
test('condição desconhecida é falsa, nunca dispara por engano', () => {
  const ctx = { optout: false, pausado: false, janela24h: true, agora: new Date('2026-11-10T13:00:00Z'), ultimoComando: null };
  assert.equal(avaliarCondicoes([{ var: 'inventada', op: 'verdadeiro' }], ctx).ok, false);
  assert.equal(avaliarCondicoes(undefined, ctx).ok, true, 'sem condições, passa');
});

group('Simulação com as regras novas (G2)');
test('a conversa simulada mostra as condições antes dos passos', () => {
  const def: Automacao = {
    nome: 'x',
    gatilho: { evento: 'cliente_clicou' },
    condicoes: [{ var: 'lead.optout', op: 'falso' }, { var: 'ultimo_comando', op: 'igual', valor: 'cliente_clicou' }],
    passos: [{ acao: 'enviar_texto', params: { texto: 'Oi {nome}' } }],
  };
  const bolhas = conversaSimulada(def);
  assert.match(bolhas[1].texto, /Só segue se: Lead está em opt-out é falso/);
  assert.match(bolhas[2].texto, /último comando do lead é = cliente_clicou/i);
  assert.equal(bolhas[3].texto, 'Oi Roberto');
});

group('Condições avaliadas na execução (C2)');
test('passo com condição que falha é cancelado com o motivo e vai para a auditoria', async () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    buscarVencidos: async () => [{ id: 'c1', automacaoId: 'a', leadId: 'L7', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'Oi', executarEm: agora,
      condicoes: [{ var: 'ultimo_comando', op: 'igual', valor: 'cliente_clicou' }] }],
    reservar: async () => true,
    contextoDoLead: async () => ({ leadName: 'Gil', ultimoComando: 'cliente_respondeu' }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
  };
  const r = await processarVencidos(agora, deps);
  assert.equal(marcados[0].status, 'cancelado');
  assert.match(marcados[0].resultado, /Condição não atendida/);
  assert.equal(r.auditoria[0].decisao, 'pulou');
});
test('janela de 24h sem fonte de dado falha por segurança (não envia por engano)', async () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const marcados: Array<{ status: string }> = [];
  const deps: DepsWorker = {
    buscarVencidos: async () => [{ id: 'c2', automacaoId: 'a', leadId: 'L8', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'Oi', executarEm: agora,
      condicoes: [{ var: 'janela_24h', op: 'verdadeiro' }] }],
    reservar: async () => true,
    contextoDoLead: async () => ({ leadName: 'Hugo' }),
    marcarResultado: async (_id, status) => { marcados.push({ status }); },
  };
  await processarVencidos(agora, deps);
  assert.equal(marcados[0].status, 'cancelado');
});
test('faixa de horário vem do JSON: dentro e fora, no fuso informado', () => {
  const faixa = { inicio: '08:00', fim: '18:00', fuso: 'America/Sao_Paulo' };
  assert.equal(dentroDaFaixaHoraria(new Date('2026-11-10T13:00:00Z'), faixa), true, '10h em Brasília');
  assert.equal(dentroDaFaixaHoraria(new Date('2026-11-10T22:00:00Z'), faixa), false, '19h em Brasília');
  assert.equal(dentroDaFaixaHoraria(new Date('2026-11-10T13:00:00Z'), undefined), false, 'sem faixa no JSON, falso');
  assert.equal(dentroDaFaixaHoraria(new Date('2026-11-10T13:00:00Z'), { inicio: '08:00', fim: '18:00', fuso: 'Nao/Existe' }), false, 'fuso inválido, falso');
});
test('faixa com dias: só os dias marcados no JSON', () => {
  // 2026-11-10 é terça (2). Faixa só de sábado (6) não vale.
  const faixa = { inicio: '08:00', fim: '18:00', fuso: 'America/Sao_Paulo', dias: [6] };
  assert.equal(dentroDaFaixaHoraria(new Date('2026-11-10T13:00:00Z'), faixa), false);
});
test('sem limites no JSON, a automação não tem limite', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const muitos = Array.from({ length: 50 }, (_, k) => new Date(agora.getTime() - k * 60_000));
  assert.equal(dentroDosLimites(muitos, agora, undefined).ok, true);
});


group('Janela de 24h (fonte e regra)');
test('texto livre fora da janela de 24h não sai, com motivo claro', async () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    buscarVencidos: async () => [{ id: 'j1', automacaoId: 'a', leadId: 'L10', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'Oi', executarEm: agora }],
    reservar: async () => true,
    contextoDoLead: async () => ({ leadName: 'Ivo', ultimaMensagemDoCliente: new Date('2026-11-08T13:00:00Z') }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
  };
  const r = await processarVencidos(agora, deps);
  assert.equal(marcados[0].status, 'cancelado');
  assert.match(marcados[0].resultado, /Fora da janela de 24h/);
  assert.equal(r.auditoria[0].decisao, 'bloqueou');
});
test('sem nenhuma mensagem do cliente, texto livre também não sai', async () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const marcados: Array<{ status: string }> = [];
  const deps: DepsWorker = {
    buscarVencidos: async () => [{ id: 'j2', automacaoId: 'a', leadId: 'L11', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'Oi', executarEm: agora }],
    reservar: async () => true,
    contextoDoLead: async () => ({ leadName: 'Jo', ultimaMensagemDoCliente: null }),
    marcarResultado: async (_id, status) => { marcados.push({ status }); },
  };
  await processarVencidos(agora, deps);
  assert.equal(marcados[0].status, 'cancelado');
});
test('dentro da janela (mensagem há 2h) o texto é simulado', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  assert.equal(dentroDaJanela24h(new Date('2026-11-10T11:00:00Z'), agora), true);
  assert.equal(dentroDaJanela24h(new Date('2026-11-09T12:00:00Z'), agora), false, 'mais de 24h');
});

group('JSON manda: validação de faixa e limites');
test('faixa de horário sem fuso ou com hora inválida é recusada com motivo', () => {
  const base = { nome: 'h', gatilho: { evento: 'cliente_clicou' }, passos: [{ acao: 'enviar_texto', params: { texto: 'oi' } }] };
  const sem = validarAutomacao({ ...base, condicoes: [{ var: 'horario_comercial', op: 'verdadeiro', valor: { inicio: '08:00', fim: '18:00' } }] }, [], 'self');
  assert.ok(sem.erros.some((e) => /fuso/.test(e)));
  const ruim = validarAutomacao({ ...base, condicoes: [{ var: 'horario_comercial', op: 'verdadeiro', valor: { inicio: '8h', fim: '18:00', fuso: 'America/Sao_Paulo' } }] }, [], 'self');
  assert.ok(ruim.erros.some((e) => /HH:MM/.test(e)));
});
test('limites do JSON precisam ser inteiros de pelo menos 1', () => {
  const base = { nome: 'l', gatilho: { evento: 'cliente_clicou' }, passos: [{ acao: 'enviar_texto', params: { texto: 'oi' } }] };
  assert.equal(validarAutomacao({ ...base, limites: { porDia: 0 } }, [], 'self').erros.length, 1);
  assert.equal(validarAutomacao({ ...base, limites: { porDia: 2.5 } }, [], 'self').erros.length, 1);
  assert.equal(validarAutomacao({ ...base, limites: { porDia: 2, porSemana: 9 } }, [], 'self').erros.length, 0);
  assert.equal(validarAutomacao({ ...base }, [], 'self').erros.length, 0, 'sem limites é válido');
});

group('Opt-out pelas automações do JSON (sem palavra fixa no código)');
test('sem automação de "pediu para parar" ativa, nenhuma palavra vira opt-out', () => {
  assert.equal(pedidoDePararPelasRegras('pare', []), false);
  assert.equal(pedidoDePararPelasRegras('pare', [{ id: 'x', status: 'inativa', def: { nome: 'x', gatilho: { evento: 'cliente_pediu_parar', filtro: { texto_contem: 'pare' } }, passos: [] } } as never]), false);
});
test('a palavra do JSON, numa automação ativa, marca opt-out', () => {
  const regras = [{ id: 'p', status: 'ativa', def: { nome: 'parar', gatilho: { evento: 'cliente_pediu_parar', filtro: { texto_contem: 'sair' } }, passos: [] } } as never];
  assert.equal(pedidoDePararPelasRegras('quero sair', regras), true);
  assert.equal(pedidoDePararPelasRegras('quanto custa?', regras), false);
});
group('Palavra de alerta pelas automações do JSON (sem palavra fixa no código)');
test('sem automação de "cliente_ameacou" ativa, nenhuma palavra vira alerta', () => {
  assert.equal(pedidoDeAlertaPelasRegras('vou processar', []), false);
  assert.equal(pedidoDeAlertaPelasRegras('vou processar', [{ id: 'x', status: 'inativa', def: { nome: 'x', gatilho: { evento: 'cliente_ameacou', filtro: { texto_contem: 'processar' } }, passos: [] } } as never]), false);
});
test('a palavra do JSON, numa automação de alerta ativa, marca alerta', () => {
  const regras = [{ id: 'a', status: 'ativa', def: { nome: 'alerta', gatilho: { evento: 'cliente_ameacou', filtro: { texto_contem: 'processar' } }, passos: [] } } as never];
  assert.equal(pedidoDeAlertaPelasRegras('vou te processar', regras), true);
  assert.equal(pedidoDeAlertaPelasRegras('quanto custa?', regras), false);
});
test('alerta vence texto livre, mas opt-out vence alerta', () => {
  assert.equal(eventoDaResposta('quero saber', false, true), 'cliente_ameacou');
  assert.equal(eventoDaResposta('pare', true, true), 'cliente_pediu_parar');
  assert.equal(eventoDaResposta('quero saber', false), 'cliente_respondeu');
});

group('Catálogo no JSON (blueprint v2: gatilhos, condições, ações, tempo, variáveis)');
test('catálogo tem os gatilhos, condições e ações novos do blueprint', () => {
  for (const e of ['tag_mudou', 'status_mudou', 'funil_entrou', 'agenda_horario']) assert.ok(EVENTOS.some((x) => x.v === e), e);
  for (const c of ['status.igual', 'tag.presente', 'campo.igual', 'campo.contem', 'campo.vazio', 'envios.periodo', 'tempo.desde_ultimo_envio', 'regra.ja_executou', 'cliente_respondeu_depois']) assert.ok(CONDICOES.some((x) => x.v === c), c);
  for (const a of ['esperar_ate', 'gravar_variavel', 'mudar_status', 'mudar_funil', 'encerrar']) assert.ok(ACOES.some((x) => x.v === a), a);
});
test('grupo "e", "ou" e "nao" são validados; grupo vazio ou com duas chaves é erro', () => {
  const base = { nome: 'x', gatilho: { evento: 'cliente_respondeu' as const }, passos: [{ acao: 'enviar_texto' as const, params: { texto: 'oi' } }] };
  assert.equal(validarAutomacao({ ...base, condicoes: { ou: [{ var: 'lead.pausado', op: 'falso' }, { var: 'janela_24h', op: 'verdadeiro' }] } }, [], 's').erros.length, 0);
  assert.equal(validarAutomacao({ ...base, condicoes: { nao: { var: 'lead.optout', op: 'verdadeiro' } } }, [], 's').erros.length, 0);
  assert.ok(validarAutomacao({ ...base, condicoes: { e: [] } }, [], 's').erros.length > 0);
  assert.ok(validarAutomacao({ ...base, condicoes: { e: [{ var: 'lead.pausado', op: 'falso' }], ou: [] } as never }, [], 's').erros.length > 0);
});
test('condição nova sem o dado obrigatório é erro (campo sem nome, periodo inválido, tag vazia)', () => {
  const base = { nome: 'x', gatilho: { evento: 'cliente_respondeu' as const }, passos: [{ acao: 'enviar_texto' as const, params: { texto: 'oi' } }] };
  assert.ok(validarAutomacao({ ...base, condicoes: [{ var: 'campo.igual', op: 'igual', valor: { valor: 'x' } }] }, [], 's').erros.some((e) => /campo/.test(e)));
  assert.ok(validarAutomacao({ ...base, condicoes: [{ var: 'envios.periodo', op: 'menor_que', valor: { periodo: 'mes', max: 2 } }] }, [], 's').erros.some((e) => /periodo/.test(e)));
  assert.ok(validarAutomacao({ ...base, condicoes: [{ var: 'tag.presente', op: 'verdadeiro', valor: '' }] }, [], 's').erros.some((e) => /nome/.test(e)));
  assert.equal(validarAutomacao({ ...base, condicoes: [{ var: 'envios.periodo', op: 'menor_que', valor: { periodo: 'dia', max: 2 } }] }, [], 's').erros.length, 0);
});
test('"negar" sem "se" é erro; "esperar_ate" exige hora HH:MM e fuso', () => {
  const base = { nome: 'x', gatilho: { evento: 'cliente_respondeu' as const } };
  assert.ok(validarAutomacao({ ...base, passos: [{ acao: 'enviar_texto', params: { texto: 'oi' }, negar: true }] }, [], 's').erros.some((e) => /negar/.test(e)));
  assert.ok(validarAutomacao({ ...base, passos: [{ acao: 'esperar_ate', params: { hora: '9h', fuso: 'America/Sao_Paulo' } }] }, [], 's').erros.some((e) => /hora/.test(e)));
  assert.ok(validarAutomacao({ ...base, passos: [{ acao: 'esperar_ate', params: { hora: '09:00' } }] }, [], 's').erros.some((e) => /fuso/.test(e)));
  assert.equal(validarAutomacao({ ...base, passos: [{ acao: 'esperar_ate', params: { hora: '09:00', fuso: 'America/Sao_Paulo', dias: [1, 2, 3] } }] }, [], 's').erros.length, 0);
});
test('variáveis do JSON valem como {nome} e não são tratadas como token desconhecido', () => {
  const base = { nome: 'x', gatilho: { evento: 'cliente_respondeu' as const }, passos: [{ acao: 'enviar_texto' as const, params: { texto: 'Oi {saudacao}, {nome}' } }] };
  assert.equal(validarAutomacao({ ...base, variaveis: { saudacao: 'bom dia' } }, [], 's').erros.length, 0);
  assert.ok(validarAutomacao(base, [], 's').erros.some((e) => /saudacao/.test(e)));
  assert.equal(substituirVariaveis('Oi {saudacao}', { saudacao: 'bom dia' }), 'Oi bom dia');
});
test('filtros novos do gatilho: começa com, lista e tag exigida', () => {
  const base = { nome: 'x', passos: [{ acao: 'notificar' as const, params: { mensagem: 'a' } }] };
  assert.ok(validarAutomacao({ ...base, gatilho: { evento: 'tag_mudou' } }, [], 's').erros.some((e) => /tag/.test(e)));
  assert.ok(validarAutomacao({ ...base, gatilho: { evento: 'agenda_horario' } }, [], 's').erros.some((e) => /agenda/.test(e)));
});
test('condição de grupo: "ou", "nao" e dado ausente (falso)', () => {
  const ctx = { optout: false, pausado: false, janela24h: false, agora: new Date('2026-11-10T13:00:00Z'), ultimoComando: null, tags: ['quente'] };
  assert.equal(avaliarCondicoes({ ou: [{ var: 'janela_24h', op: 'verdadeiro' }, { var: 'tag.presente', op: 'verdadeiro', valor: 'Quente' }] }, ctx).ok, true, 'ou: uma basta; tag sem acento/maiúscula');
  assert.equal(avaliarCondicoes({ nao: { var: 'tag.presente', op: 'verdadeiro', valor: 'quente' } }, ctx).ok, false, 'nao inverte');
  assert.equal(avaliarCondicoes({ e: [{ var: 'campo.igual', op: 'igual', valor: { campo: 'cidade', valor: 'BH' } }] }, ctx).ok, false, 'campo sem dado = falso');
  assert.equal(avaliarCondicoes({ e: [{ var: 'tag.presente', op: 'falso', valor: 'frio' }] }, { ...ctx, tags: undefined }).ok, false, 'tags indisponíveis = falso, nunca dispara por engano');
});
test('campo, envios no período, tempo desde o último envio e resposta depois do gatilho', () => {
  const agora = new Date('2026-11-10T13:00:00Z');
  const ctx = { optout: false, pausado: false, janela24h: true, agora, ultimoComando: null, campos: { cidade: ' Belo Horizonte ' }, status: 'INTERESSADO' };
  assert.equal(avaliarCondicoes({ e: [{ var: 'campo.igual', op: 'igual', valor: { campo: 'cidade', valor: 'belo horizonte' } }] }, ctx).ok, true, 'campo normalizado (espaço, maiúscula)');
  assert.equal(avaliarCondicoes({ e: [{ var: 'campo.contem', op: 'contem', valor: { campo: 'cidade', valor: 'horizonte' } }] }, ctx).ok, true);
  assert.equal(avaliarCondicoes({ e: [{ var: 'status.igual', op: 'igual', valor: 'interessado' }] }, ctx).ok, true);
  const envios = [new Date('2026-11-10T10:00:00Z'), new Date('2026-11-10T11:00:00Z')];
  assert.equal(avaliarCondicoes({ e: [{ var: 'envios.periodo', op: 'menor_que', valor: { periodo: 'dia', max: 3 } }] }, { ...ctx, envios }).ok, true, '2 envios < máximo 3');
  assert.equal(avaliarCondicoes({ e: [{ var: 'envios.periodo', op: 'menor_que', valor: { periodo: 'dia', max: 2 } }] }, { ...ctx, envios }).ok, false, '2 envios não é menor que 2');
  assert.equal(avaliarCondicoes({ e: [{ var: 'tempo.desde_ultimo_envio', op: 'maior_que', valor: 24 }] }, { ...ctx, envios }).ok, false, 'último envio há 2h');
  assert.equal(avaliarCondicoes({ e: [{ var: 'tempo.desde_ultimo_envio', op: 'maior_que', valor: 1 }] }, { ...ctx, envios: [] }).ok, true, 'nunca enviou = passa');
  const gatilho = new Date('2026-11-10T12:00:00Z');
  assert.equal(avaliarCondicoes({ e: [{ var: 'cliente_respondeu_depois', op: 'verdadeiro' }] }, { ...ctx, eventoEm: gatilho, ultimaMensagemDoCliente: new Date('2026-11-10T12:30:00Z') }).ok, true);
  assert.equal(avaliarCondicoes({ e: [{ var: 'cliente_respondeu_depois', op: 'falso' }] }, { ...ctx, eventoEm: gatilho, ultimaMensagemDoCliente: new Date('2026-11-10T11:00:00Z') }).ok, true, 'não respondeu depois = passa no "falso"');
  assert.equal(avaliarCondicoes({ e: [{ var: 'regra.ja_executou', op: 'falso' }] }, ctx).ok, false, 'sem dado = falso');
});
test('próxima ocorrência de um horário no fuso do JSON', () => {
  // 09:00 de São Paulo = 12:00Z. Depois de 12:30Z, o próximo 10:00 SP é 13:00Z do mesmo dia.
  const p = proximaOcorrencia(new Date('2026-11-10T12:30:00Z'), { hora: '10:00', fuso: 'America/Sao_Paulo' });
  assert.equal(p?.toISOString(), '2026-11-10T13:00:00.000Z');
  // Só segundas (1): 10/11/2026 é terça; a próxima segunda às 10:00 SP é 16/11 13:00Z.
  const seg = proximaOcorrencia(new Date('2026-11-10T12:30:00Z'), { hora: '10:00', fuso: 'America/Sao_Paulo', dias: [1] });
  assert.equal(seg?.toISOString(), '2026-11-16T13:00:00.000Z');
  assert.equal(proximaOcorrencia(new Date(), { hora: 'x', fuso: 'America/Sao_Paulo' }), null);
});
test('planejamento: "esperar até" calcula o tempo e o "se" com "negar" vira condição do passo', () => {
  const em = new Date('2026-11-10T12:30:00Z');
  const regra = { id: 'r1', status: 'ativa', def: {
    nome: 'r', gatilho: { evento: 'cliente_respondeu' as const }, variaveis: { saudacao: 'Olá' },
    passos: [
      { acao: 'esperar_ate' as const, params: { hora: '10:00', fuso: 'America/Sao_Paulo' } },
      { acao: 'enviar_texto' as const, params: { texto: '{saudacao} {nome}' }, se: { var: 'cliente_respondeu_depois', op: 'verdadeiro' }, negar: true },
    ] } } as never;
  const planos = planejarEvento('cliente_respondeu', [regra], { texto: 'oi', em }, (t) => t);
  assert.equal(planos.length, 1);
  assert.equal(planos[0].passos[0].horasDesdeEvento, 0.5, 'de 12:30Z até 13:00Z = 0,5 h');
  assert.equal(planos[0].passos[1].texto, 'Olá {nome}', 'variável do JSON já trocada');
  const cond = planos[0].passos[1].condicoes;
  assert.equal(avaliarNo(cond, { optout: false, pausado: false, janela24h: true, agora: em, ultimoComando: null, eventoEm: em, ultimaMensagemDoCliente: null }), true, 'cliente não respondeu: segue');
});
test('planejamento: filtro de etiqueta, status e lista de palavras', () => {
  const r = (filtro: object, evento = 'tag_mudou' as const) => ({ id: 'f', status: 'ativa', def: { nome: 'f', gatilho: { evento, filtro }, passos: [{ acao: 'notificar' as const, params: { mensagem: 'x' } }] } } as never);
  assert.equal(planejarEvento('tag_mudou', [r({ tag: 'quente' })], { tag: 'Quente' }).length, 1);
  assert.equal(planejarEvento('tag_mudou', [r({ tag: 'quente' })], { tag: 'frio' }).length, 0);
  assert.equal(planejarEvento('cliente_respondeu', [{ id: 'l', status: 'ativa', def: { nome: 'l', gatilho: { evento: 'cliente_respondeu', filtro: { texto_lista: ['preço', 'quanto'] } }, passos: [{ acao: 'notificar' as const, params: { mensagem: 'x' } }] } } as never], { texto: 'Quanto custa?' }).length, 1);
});
group('Worker das ações novas (sem executor = cancela com motivo)');
test('ação sem executor é cancelada com motivo, nunca "sucesso" em silêncio', async () => {
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    reservar: async () => true,
    buscarVencidos: async () => [{ id: 'g', automacaoId: 'a', leadId: 'L', passoOrdem: 1, acao: 'etiqueta' as const, texto: null, executarEm: new Date() }],
    contextoDoLead: async () => ({ leadName: 'Bia' }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
  };
  await processarVencidos(new Date(), deps);
  assert.equal(marcados[0].status, 'cancelado');
  assert.match(marcados[0].resultado, /Sem executor/);
});
test('enviar_template fica desligado nesta fase (fase H)', async () => {
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    reservar: async () => true,
    buscarVencidos: async () => [{ id: 't', automacaoId: 'a', leadId: 'L', passoOrdem: 1, acao: 'enviar_template' as const, texto: null, executarEm: new Date() }],
    contextoDoLead: async () => ({ leadName: 'Bia' }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
  };
  await processarVencidos(new Date(), deps);
  assert.equal(marcados[0].status, 'cancelado');
  assert.match(marcados[0].resultado, /fase H/);
});
test('com executor, a ação roda e o resultado é o do executor', async () => {
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    reservar: async () => true,
    buscarVencidos: async () => [{ id: 'v', automacaoId: 'a', leadId: 'L', passoOrdem: 1, acao: 'gravar_variavel' as const, texto: null, executarEm: new Date() }],
    contextoDoLead: async () => ({ leadName: 'Bia' }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
    aplicarAcao: async () => ({ ok: true, resultado: 'Variável gravada' }),
  };
  await processarVencidos(new Date(), deps);
  assert.equal(marcados[0].status, 'executado');
  assert.equal(marcados[0].resultado, 'Variável gravada');
});

group('Executores das ações (banco com lista branca, falha com motivo)');
function bancoFake(opts: { linhas?: number; tabelaTags?: boolean } = {}) {
  const sqls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    sqls,
    db: {
      query: async (sql: string, params: unknown[] = []) => {
        sqls.push({ sql, params });
        if (sql.includes('to_regclass')) return { rows: [{ ok: opts.tabelaTags === true }], rowCount: 1 };
        return { rows: [], rowCount: opts.linhas ?? 1 };
      },
    },
  };
}
const itemAcao = (acao: string, params: Record<string, unknown>) => ({ id: 'i', automacaoId: 'a1', leadId: 'L1', passoOrdem: 1, acao: acao as never, texto: null, executarEm: new Date(), params });
test('mudar status: só valores permitidos; grava no leads', async () => {
  const b = bancoFake();
  const ex = criarExecutorAcoes(b.db);
  assert.equal((await ex(itemAcao('mudar_status', { status: 'INTERESSADO' }), {} as never)).ok, true);
  assert.match(b.sqls[0].sql, /UPDATE leads SET status/);
  const ruim = await ex(itemAcao('mudar_status', { status: "x'; DROP TABLE leads;--" }), {} as never);
  assert.equal(ruim.ok, false);
  assert.equal(b.sqls.length, 1, 'valor inválido não chega ao banco');
});
test('mudar funil: coluna só da lista; etapa vai para sub_status', async () => {
  const b = bancoFake();
  const ex = criarExecutorAcoes(b.db);
  assert.equal((await ex(itemAcao('mudar_funil', { funil: 'Fechado', etapa: 'Enviou proposta' }), {} as never)).ok, true);
  assert.deepEqual(b.sqls[0].params, ['L1', 'Fechado', 'Enviou proposta']);
  assert.equal((await ex(itemAcao('mudar_funil', { funil: 'Outra' }), {} as never)).ok, false);
});
test('definir campo: coluna própria para os campos da lista, o resto vai para variaveis_json', async () => {
  const b = bancoFake();
  const ex = criarExecutorAcoes(b.db);
  await ex(itemAcao('definir_campo', { campo: 'niche', valor: 'padaria' }), {} as never);
  assert.match(b.sqls[0].sql, /SET niche = \$2/);
  await ex(itemAcao('definir_campo', { campo: 'cidade', valor: 'BH' }), {} as never);
  assert.match(b.sqls[1].sql, /variaveis_json/);
  assert.deepEqual(b.sqls[1].params, ['L1', 'cidade', 'BH']);
  assert.equal((await ex(itemAcao('definir_campo', { campo: "a'b", valor: 'x' }), {} as never)).ok, false, 'nome inválido recusado');
  assert.equal((await ex(itemAcao('definir_campo', { campo: 'cidade', valor: { x: 1 } }), {} as never)).ok, false, 'objeto recusado');
});
test('etiqueta sem tabela lead_tags: falha com motivo, nada gravado', async () => {
  const b = bancoFake({ tabelaTags: false });
  const r = await criarExecutorAcoes(b.db)(itemAcao('etiqueta', { nome: 'quente' }), {} as never);
  assert.equal(r.ok, false);
  assert.match(r.resultado, /fase I/);
  assert.equal(b.sqls.some((x) => /INSERT INTO lead_tags/.test(x.sql)), false);
});
test('etiqueta com tabela: adiciona e remove', async () => {
  const b = bancoFake({ tabelaTags: true });
  const ex = criarExecutorAcoes(b.db);
  assert.equal((await ex(itemAcao('etiqueta', { nome: 'quente' }), {} as never)).ok, true);
  assert.equal((await ex(itemAcao('remover_etiqueta', { nome: 'quente' }), {} as never)).ok, true);
  assert.ok(b.sqls.some((x) => /INSERT INTO lead_tags/.test(x.sql)));
  assert.ok(b.sqls.some((x) => /DELETE FROM lead_tags/.test(x.sql)));
});
test('opt-out pela automação: status DESCARTADO e cancela os passos pendentes', async () => {
  const b = bancoFake();
  const r = await criarExecutorAcoes(b.db)(itemAcao('marcar_optout', {}), {} as never);
  assert.equal(r.ok, true);
  assert.match(b.sqls[0].sql, /status = 'DESCARTADO'/);
  assert.match(b.sqls[1].sql, /automacoes_fila SET status = 'cancelado'/);
});
test('ações que dependem da fase I falham com motivo, sem gravar nada', async () => {
  const b = bancoFake();
  const r = await criarExecutorAcoes(b.db)(itemAcao('pausar_lead', {}), {} as never);
  assert.equal(r.ok, false);
  assert.equal(b.sqls.some((x) => /^\s*(INSERT|UPDATE|DELETE)/.test(x.sql)), false, 'nada gravado');
});
test('encerrar cancela só os passos desta automação para o lead', async () => {
  const b = bancoFake({ linhas: 2 });
  const r = await criarExecutorAcoes(b.db)(itemAcao('encerrar', {}), {} as never);
  assert.equal(r.ok, true);
  assert.deepEqual(b.sqls[0].params, ['L1', 'a1']);
});
test('campos do lead: variaveis_json mais as colunas úteis', () => {
  const c = camposDoLead({ variaveis_json: { cidade: 'BH' }, niche: 'padaria', column_status: 'Leads' });
  assert.equal(c.cidade, 'BH');
  assert.equal(c.niche, 'padaria');
  assert.equal(c.column_status, 'Leads');
});

group('Pausa, revisão e aviso (fase I para gravar, falha com motivo até lá)');
test('pausar sem leads_estado: falha com motivo e não grava', async () => {
  const b = bancoFake({ tabelaTags: false });
  const r = await criarExecutorAcoes(b.db)(itemAcao('pausar_lead', {}), {} as never);
  assert.equal(r.ok, false);
  assert.match(r.resultado, /fase I/);
  assert.equal(b.sqls.some((x) => /leads_estado/.test(x.sql)), false);
});
test('pausar com tabela: grava "pausado" sem tirar opt-out', async () => {
  const b = bancoFake({ tabelaTags: true });
  const r = await criarExecutorAcoes(b.db)(itemAcao('pausar_lead', {}), {} as never);
  assert.equal(r.ok, true);
  const sql = b.sqls.find((x) => /INSERT INTO leads_estado/.test(x.sql))!;
  assert.deepEqual(sql.params.slice(0, 2), ['L1', 'pausado']);
  assert.match(sql.sql, /status_geral <> 'optout'/, 'opt-out vence pausa');
});
test('revisão grava estado "revisao" e uma linha de auditoria com o motivo', async () => {
  const b = bancoFake({ tabelaTags: true });
  const r = await criarExecutorAcoes(b.db)(itemAcao('revisao', { motivo: 'cliente irritado' }), {} as never);
  assert.equal(r.ok, true);
  assert.equal(b.sqls.find((x) => /INSERT INTO leads_estado/.test(x.sql))!.params[1], 'revisao');
  const aud = b.sqls.find((x) => /automacoes_auditoria/.test(x.sql))!;
  assert.match(String(aud.params[1]), /cliente irritado/);
});
test('aviso fica na auditoria, não envia mensagem a ninguém', async () => {
  const b = bancoFake({ tabelaTags: true });
  const r = await criarExecutorAcoes(b.db)(itemAcao('notificar', { mensagem: 'lead quente' }), {} as never);
  assert.equal(r.ok, true);
  assert.ok(b.sqls.some((x) => /automacoes_auditoria/.test(x.sql)));
  assert.equal(b.sqls.some((x) => /INSERT INTO leads_estado|UPDATE leads/.test(x.sql)), false);
});
test('aviso sem tabela de auditoria: falha com motivo', async () => {
  const b = bancoFake({ tabelaTags: false });
  const r = await criarExecutorAcoes(b.db)(itemAcao('notificar', { mensagem: 'x' }), {} as never);
  assert.equal(r.ok, false);
  assert.match(r.resultado, /fase I/);
});
test('worker: lead pausado não recebe texto automático', async () => {
  const marcados: Array<{ status: string; resultado: string }> = [];
  const deps: DepsWorker = {
    reservar: async () => true,
    buscarVencidos: async () => [{ id: 'p', automacaoId: 'a', leadId: 'L', passoOrdem: 1, acao: 'enviar_texto' as const, texto: 'oi', executarEm: new Date() }],
    contextoDoLead: async () => ({ leadName: 'Bia', pausado: true, ultimaMensagemDoCliente: new Date() }),
    marcarResultado: async (_id, status, resultado) => { marcados.push({ status, resultado }); },
  };
  await processarVencidos(new Date(), deps);
  assert.equal(marcados[0].status, 'cancelado');
  assert.match(marcados[0].resultado, /pausado/);
});

group('Regra já executou (condição lida do estado do lead)');
test('regra executada no passado: "regra.ja_executou" verdadeiro; outra regra: falso', async () => {
  const marcados: string[] = [];
  const base = { id: 'x', automacaoId: 'regra-A', leadId: 'L', passoOrdem: 1, acao: 'notificar' as const, texto: null, executarEm: new Date(), condicoes: { e: [{ var: 'regra.ja_executou', op: 'verdadeiro' }] } as never };
  const deps: DepsWorker = {
    reservar: async () => true,
    buscarVencidos: async () => [base],
    contextoDoLead: async () => ({ leadName: 'Bia', regrasExecutadas: { 'regra-A': '2026-11-01T00:00:00Z' } }),
    marcarResultado: async (_id, status) => { marcados.push(status); },
    aplicarAcao: async () => ({ ok: true, resultado: 'ok' }),
  };
  await processarVencidos(new Date(), deps);
  assert.equal(marcados[0], 'executado', 'já executou: segue');
  marcados.length = 0;
  deps.buscarVencidos = async () => [{ ...base, automacaoId: 'regra-B' }];
  await processarVencidos(new Date(), deps);
  assert.equal(marcados[0], 'cancelado', 'outra regra: não executou ainda, não segue');
});
test('execução registra que a regra executou para o lead', async () => {
  const registros: string[] = [];
  const deps: DepsWorker = {
    reservar: async () => true,
    buscarVencidos: async () => [{ id: 'r', automacaoId: 'regra-C', leadId: 'L9', passoOrdem: 1, acao: 'notificar' as const, texto: null, executarEm: new Date() }],
    contextoDoLead: async () => ({ leadName: 'Bia' }),
    marcarResultado: async () => undefined,
    aplicarAcao: async () => ({ ok: true, resultado: 'ok' }),
    registrarRegraExecutada: async (leadId, regraId) => { registros.push(`${leadId}:${regraId}`); },
  };
  await processarVencidos(new Date(), deps);
  assert.deepEqual(registros, ['L9:regra-C']);
});

  await Promise.all(pending);

  console.log(`\n=====================================================`);
  console.log(`📊 TESTES UNITÁRIOS: ${passed} passaram, ${failed} falharam`);
  console.log(`=====================================================`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
