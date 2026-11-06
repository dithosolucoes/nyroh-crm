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
import { buildFluxoAuthHeaders, fluxoInstancePath, prepareOutboundMedia } from '../src/lib/fluxoClient';
import { extensionFor, saveMediaBuffer } from '../src/lib/mediaStorage';
import { effectiveSpeedPerSecond, dispatchRpm, planRpm, delayForIndex, maxDispatchPerSecond, FluxoRateLimitedError } from '../src/lib/dispatchRate';
import { detectOptOut, sanitizeTemplateVariable } from '../src/lib/leadIntent';
import { isPubliclyFetchableUrl } from '../src/lib/auditEngine';
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
      assert.equal(detectOptOut('parece ótimo, quanto custa?'), false);
    }],
    ['"pare" sozinho é descadastro', () => {
      assert.equal(detectOptOut('pare'), true);
      assert.equal(detectOptOut('PARE de me mandar mensagem'), true);
    }],
    ['"removeram o produto do site" NÃO é descadastro', () => {
      assert.equal(detectOptOut('removeram o produto do site'), false);
    }],
    ['"remover" como palavra é descadastro', () => {
      assert.equal(detectOptOut('quero remover meu número'), true);
    }],
    ['frases com e sem acento funcionam igual', () => {
      assert.equal(detectOptOut('não tenho interesse'), true);
      assert.equal(detectOptOut('nao tenho interesse'), true);
      assert.equal(detectOptOut('nao quero'), true);
    }],
    ['mensagem comum não descadastra', () => {
      assert.equal(detectOptOut('bom dia, pode me mandar o orçamento?'), false);
      assert.equal(detectOptOut('comparei com o concorrente'), false);
      assert.equal(detectOptOut(''), false);
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
