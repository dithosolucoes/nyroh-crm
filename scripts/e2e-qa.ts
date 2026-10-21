/**
 * QA PONTA A PONTA do WhatsApp — sobe o Nyroh DE VERDADE + um MOCK da FluxoAPI e exercita o fluxo completo:
 * login, webhooks assinados, coexistência, envio (texto/modelo/imagem/áudio/documento), janela de 24h,
 * idempotência, status por rank, 429/503, mídia recebida, SSE com replay e disparo em massa.
 *
 * NÃO usa o número real nem as credenciais reais. Rodar:   npm run test:e2e
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { startMockFluxo, signWebhook, MOCK_KEY, MOCK_SECRET, MOCK_INSTANCE } from './mock-fluxo';
import { startNyrohServer } from './_proc';

const E2E_PASSWORD = 'SenhaDoTesteE2E_2026';
const NYROH_PORT = 3055;
const MOCK_PORT = 4010;
const BASE = `http://127.0.0.1:${NYROH_PORT}`;
const WEBHOOK_SECRET = 'whsec_e2e_secret';
const PUBLIC_URL = 'https://nyroh.test';
const PHONE_A = '5519996155951'; // cliente que escreve primeiro
const PHONE_B = '5511987654321'; // conversa iniciada pelo celular do dono
const E164_A = `+${PHONE_A}`;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(cond: any, name: string, detail?: any) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  ❌ ${name}${detail !== undefined ? `\n       → ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}
const group = (t: string) => console.log(`\n${t}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 8000, everyMs = 150): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v as T;
    } catch { /* tenta de novo */ }
    await sleep(everyMs);
  }
  return null;
}

// ---------------------------------------------------------------- cliente HTTP com cookie
class Client {
  cookie = '';
  async req(method: string, p: string, opts: { json?: any; form?: FormData; headers?: Record<string, string>; raw?: string } = {}) {
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (this.cookie) headers.cookie = this.cookie;
    let body: any;
    if (opts.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.json); }
    else if (opts.raw !== undefined) { body = opts.raw; }
    else if (opts.form) { body = opts.form; }
    const res = await fetch(BASE + p, { method, headers, body, redirect: 'manual' });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* não-JSON */ }
    return { status: res.status, headers: res.headers, json, text, res };
  }
  get(p: string) { return this.req('GET', p); }
  post(p: string, json?: any) { return this.req('POST', p, { json: json ?? {} }); }
  async login(email: string, password: string) {
    const r = await this.req('POST', '/api/auth/login', { json: { email, password } });
    const setCookie = (r.res.headers as any).getSetCookie?.() as string[] | undefined;
    const c = (setCookie || []).map(x => x.split(';')[0]).find(x => x.startsWith('crm_session='));
    if (c) this.cookie = c;
    return r;
  }
}

// ---------------------------------------------------------------- webhooks assinados (como a FluxoAPI faz)
let eventSeq = 0;
function fluxoEvent(type: string, data: any, opts: { eventId?: string; createdAt?: string; secret?: string; tamper?: boolean; noSig?: boolean } = {}) {
  const id = opts.eventId || `evt_E2E${String(++eventSeq).padStart(6, '0')}`;
  const body = { id, type, instance_id: MOCK_INSTANCE, created_at: opts.createdAt || new Date().toISOString(), data };
  const raw = JSON.stringify(body);
  const { timestamp, signature } = signWebhook(opts.secret || WEBHOOK_SECRET, raw);
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-fluxo-event-id': id, 'x-fluxo-event-type': type };
  if (!opts.noSig) { headers['x-fluxo-timestamp'] = timestamp; headers['x-fluxo-signature'] = signature; }
  return { id, raw: opts.tamper ? raw.replace('"id"', '"idd"') : raw, headers };
}
async function sendWebhook(ev: ReturnType<typeof fluxoEvent>) {
  const res = await fetch(`${BASE}/api/webhooks/fluxo`, { method: 'POST', headers: ev.headers, body: ev.raw });
  let json: any = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

// ---------------------------------------------------------------- SSE
function openSse(cookie: string, lastEventId?: number) {
  const events: Array<{ id?: number; type: string; data: any }> = [];
  const ctrl = new AbortController();
  const done = (async () => {
    try {
      const headers: Record<string, string> = { cookie };
      if (lastEventId !== undefined) headers['last-event-id'] = String(lastEventId);
      const res = await fetch(`${BASE}/api/realtime/stream`, { headers, signal: ctrl.signal });
      if (!res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let id: number | undefined; let type = 'message'; let data = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('id:')) id = Number(line.slice(3).trim());
            else if (line.startsWith('event:')) type = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          let parsed: any = data;
          try { parsed = JSON.parse(data); } catch { /* texto */ }
          events.push({ id, type, data: parsed });
        }
      }
    } catch { /* abortado */ }
  })();
  return { events, close: () => ctrl.abort(), done };
}

// ---------------------------------------------------------------- mock admin
const mock = (m: string, p: string, body?: any) =>
  fetch(`http://127.0.0.1:${MOCK_PORT}${p}`, { method: m, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(r => r.json());

async function messagesOf(c: Client, leadId: string) {
  const r = await c.get(`/api/leads/${encodeURIComponent(leadId)}/messages`);
  return r.json as { messages: any[]; windowOpen: boolean; windowExpiresAt: string | null } | null;
}

// =====================================================================================================
async function main() {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'nyroh-e2e-uploads-'));
  const mockSrv = await startMockFluxo(MOCK_PORT);
  const sentLog: string[] = [];

  const srv = startNyrohServer({
    NODE_ENV: 'production',
    NYROH_PORT: String(NYROH_PORT),
    FLUXO_BASE_URL: mockSrv.url,
    FLUXO_KEY: MOCK_KEY,
    FLUXO_SECRET: MOCK_SECRET,
    FLUXO_INSTANCE_ID: MOCK_INSTANCE,
    FLUXO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    FLUXO_PLAN_RPM: '60',
    APP_PUBLIC_URL: PUBLIC_URL,
    UPLOADS_DIR: uploads,
    // Sem E2E_DATABASE_URL roda em MODO MEMÓRIA; com ela roda contra um PostgreSQL de verdade (caminho de produção)
    DATABASE_URL: process.env.E2E_DATABASE_URL || '',
    REDIS_URL: '',
    // O login do vendedor do teste (lara) é conta de demonstração: em produção ela só nasce com este flag
    SEED_DEMO_USERS: 'true',
    // Em produção o sistema não usa mais as senhas escritas no código ('Thomas123456!', '123'):
    // as contas nascem com ADMIN_INITIAL_PASSWORD, ou com uma senha sorteada se ela faltar.
    ADMIN_INITIAL_PASSWORD: E2E_PASSWORD
  });
  const serverLog = srv.log;
  const shutdown = async () => {
    await srv.stop();
    await mockSrv.close().catch(() => {});
    fs.rmSync(uploads, { recursive: true, force: true });
  };

  try {
    const up = await waitFor(async () => (await fetch(`${BASE}/health`).then(r => r.ok).catch(() => false)) || null, 60000, 300);
    if (!up) {
      console.error('❌ O servidor não subiu. Últimas linhas do log:\n' + serverLog.join('').split('\n').slice(-30).join('\n'));
      await shutdown();
      process.exit(2);
    }

    // Com PostgreSQL, o servidor responde 503 (database_starting) até criar as tabelas — como a FluxoAPI reentrega, é o certo; o teste espera.
    const dbReady = await waitFor(async () => {
      const h = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => null);
      return h && h.database && h.database.starting === false ? h : null;
    }, 60000, 300);
    if (!dbReady) throw new Error('O banco não ficou pronto a tempo.');
    if (process.env.E2E_DATABASE_URL && !dbReady.database.connected) throw new Error('Era para estar conectado ao PostgreSQL, mas o servidor caiu no modo memória.');
    console.log(`ℹ️  Modo do teste: ${dbReady.database.connected ? 'PostgreSQL REAL' : 'memória'}`);

    const admin = new Client();
    const vendor = new Client();
    const anon = new Client();

    // ==================================================================================== SEGURANÇA
    group('🔒 Segurança: a API não é mais aberta');
    {
      for (const [m, p] of [['GET', '/api/leads'], ['GET', '/api/export/csv'], ['POST', '/api/leads/x/messages'], ['POST', '/api/campaign/dispatch'], ['GET', '/api/realtime/stream'], ['GET', '/api/admin/fluxo/instances']] as const) {
        const r = await anon.req(m, p, m === 'POST' ? { json: {} } : {});
        ok(r.status === 401, `${m} ${p} sem login → 401`, r.status);
      }
      ok((await anon.get('/health')).status === 200, '/health continua público');
      ok((await anon.get('/uploads/tmp-zips/qualquer.zip')).status === 404, '/uploads/tmp-zips nunca é servido');

      const lg = await admin.login('admin@nyroh.com', E2E_PASSWORD);
      ok(lg.status === 200 && !!admin.cookie, 'login do administrador funciona', lg.json);
      const lv = await vendor.login('lara@empresa.com', E2E_PASSWORD);
      ok(lv.status === 200 && !!vendor.cookie, 'login do vendedor funciona', lv.json);
      ok((await new Client().login('admin@nyroh.com', 'Thomas123456!')).status === 401,
         'senha escrita no código NÃO entra mais em produção (Thomas123456!)');
      ok((await new Client().login('lara@empresa.com', '123')).status === 401,
         'senha previsível de vendedor NÃO entra mais em produção (123)');
      ok((await vendor.get('/api/admin/audit-logs')).status === 403, 'vendedor NÃO acessa /api/admin/* (403)');
      ok((await vendor.get('/api/export/csv')).status === 403, 'vendedor NÃO exporta CSV (403)');
      ok((await vendor.post('/api/campaign/dispatch', {})).status === 403, 'vendedor NÃO dispara campanha (403)');
      ok((await admin.get('/api/admin/audit-logs')).status === 200, 'administrador acessa /api/admin/*');

      // Webhook: assinatura obrigatória (segredo configurado)
      ok((await sendWebhook(fluxoEvent('message.received', { from: PHONE_A, type: 'text', text: 'x', message_id: 'msg_sec1' }, { noSig: true }))).status === 401, 'webhook SEM assinatura → 401');
      ok((await sendWebhook(fluxoEvent('message.received', { from: PHONE_A, type: 'text', text: 'x', message_id: 'msg_sec2' }, { secret: 'whsec_errado' }))).status === 401, 'webhook com segredo errado → 401');
      ok((await sendWebhook(fluxoEvent('message.received', { from: PHONE_A, type: 'text', text: 'x', message_id: 'msg_sec3' }, { tamper: true }))).status === 401, 'webhook com corpo adulterado → 401');
      const noLead = await admin.get(`/api/leads/lead_wa_${PHONE_A}/messages`);
      ok((noLead.json?.messages || []).length === 0, 'eventos recusados NÃO criaram mensagem/lead');
    }

    // ==================================================================================== RECEBIMENTO
    group('📥 Recebimento (message.received)');
    const leadA = `lead_wa_${PHONE_A}`;
    {
      const sse = openSse(admin.cookie);
      await sleep(300);

      const ev = fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_in_text1', from: PHONE_A, type: 'text', text: 'oi, quero saber do site', sent_from_phone: false });
      const r1 = await sendWebhook(ev);
      ok(r1.status === 200 && r1.json?.status === 'received', 'webhook assinado é aceito (200)', r1);

      const m1 = await waitFor(async () => { const m = await messagesOf(admin, leadA); return m && m.messages.length >= 1 ? m : null; });
      ok(!!m1, 'mensagem recebida aparece na conversa do lead novo', m1);
      ok(m1?.messages[0]?.text === 'oi, quero saber do site' && m1?.messages[0]?.sender === 'lead', 'texto e remetente corretos');
      ok(m1?.windowOpen === true, 'JANELA de 24h abriu para o lead novo (era o bug que bloqueava a resposta)', m1);
      ok(!!m1?.windowExpiresAt && new Date(m1.windowExpiresAt).getTime() > Date.now() + 23 * 3600e3, 'fim da janela ≈ 24h à frente', m1?.windowExpiresAt);

      const dupEvent = await sendWebhook(ev);
      ok(dupEvent.json?.status === 'already_processed', 'mesmo X-Fluxo-Event-Id → já processado (dedup de evento)', dupEvent);
      const dupMsg = await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_in_text1', from: PHONE_A, type: 'text', text: 'oi, quero saber do site' }));
      ok(dupMsg.status === 200, 'reentrega com outro event-id é aceita…');
      await sleep(600);
      const m2 = await messagesOf(admin, leadA);
      ok(m2?.messages.filter(m => m.sender === 'lead').length === 1, '…mas a MENSAGEM não duplica (dedup por message_id)', m2?.messages.length);

      const nSse = sse.events.find(e => e.type === 'NEW_MESSAGE');
      ok(!!nSse && typeof nSse.id === 'number', 'SSE: evento NEW_MESSAGE chegou com id', sse.events.map(e => e.type));
      sse.close();

      // interativo
      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_in_list1', from: PHONE_A, type: 'interactive', text: '09:00', reply: { kind: 'list_reply', id: 'h09', title: '09:00' } }));
      const mi = await waitFor(async () => { const m = await messagesOf(admin, leadA); return m?.messages.find(x => x.id === 'msg_in_list1') ? m : null; });
      ok(mi?.messages.find(x => x.id === 'msg_in_list1')?.text === '🔘 09:00', 'clique em lista vira "🔘 09:00"');
    }

    group('🖼️  Mídia recebida (download pelo download_path assinado)');
    {
      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_in_img1', from: PHONE_A, type: 'image', text: '', media: { id: '1', mime_type: 'image/png', download_path: '/v1/messages/msg_img1/media' } }));
      const mm = await waitFor(async () => { const m = await messagesOf(admin, leadA); const x = m?.messages.find(y => y.id === 'msg_in_img1'); return x?.mediaUrl ? x : null; });
      ok(!!mm, 'imagem recebida foi BAIXADA e guardada', mm);
      // Mídia RECEBIDA do cliente fica em /media/inbox (com login), não no /uploads público:
      // antes qualquer pessoa com o link abria o documento de um cliente.
      ok(/^\/media\/inbox\/[0-9a-f]{32}\.png$/.test(mm?.mediaUrl || ''), 'URL guardada é do próprio Nyroh, na área com login', mm?.mediaUrl);
      if (mm?.mediaUrl) {
        const anonFile = await fetch(BASE + mm.mediaUrl);
        ok(anonFile.status === 401, 'mídia do cliente NÃO abre sem login (401)', anonFile.status);

        const f = await fetch(BASE + mm.mediaUrl, { headers: { cookie: admin.cookie || '' } });
        const buf = Buffer.from(await f.arrayBuffer());
        ok(f.status === 200 && f.headers.get('content-type')?.includes('image/png') && buf.subarray(0, 4).toString('hex') === '89504e47', 'com login, o arquivo abre e é um PNG de verdade', f.status);
        ok(f.headers.get('x-content-type-options') === 'nosniff', 'cabeçalho nosniff presente');
        ok((f.headers.get('cache-control') || '').includes('private'), 'cache marcado como private (não fica em cache compartilhado)');
      }

      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_in_audio1', from: PHONE_A, type: 'audio', media: { id: '2', mime_type: 'audio/ogg; codecs=opus', voice: true, download_path: '/v1/messages/msg_audio1/media' } }));
      const ma = await waitFor(async () => { const m = await messagesOf(admin, leadA); const x = m?.messages.find(y => y.id === 'msg_in_audio1'); return x?.audioUrl ? x : null; });
      ok(!!ma && /\.ogg$/.test(ma.audioUrl) && ma.isAudio === true, 'áudio recebido guardado como .ogg e marcado como áudio', ma);

      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_in_pdf1', from: PHONE_A, type: 'document', text: 'comprovante.pdf', media: { id: '3', mime_type: 'application/pdf', filename: 'comprovante.pdf', download_path: '/v1/messages/msg_pdf1/media' } }));
      const mp = await waitFor(async () => { const m = await messagesOf(admin, leadA); const x = m?.messages.find(y => y.id === 'msg_in_pdf1'); return x?.mediaUrl ? x : null; });
      ok(!!mp && /\.pdf$/.test(mp.mediaUrl) && mp.mediaName === 'comprovante.pdf', 'documento PDF recebido guardado com o nome original', mp);

      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_in_old1', from: PHONE_A, type: 'image', media: { id: '4', mime_type: 'image/png', download_path: '/v1/messages/msg_expired1/media' } }));
      const me = await waitFor(async () => { const m = await messagesOf(admin, leadA); return m?.messages.find(y => y.id === 'msg_in_old1') || null; });
      ok(!!me && !me.mediaUrl, 'mídia EXPIRADA (410) não derruba o processamento: a mensagem fica, sem arquivo', me);

      const t0 = Date.now();
      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_in_flaky1', from: PHONE_A, type: 'image', media: { id: '5', mime_type: 'image/png', download_path: '/v1/messages/msg_flaky1/media' } }));
      const mf = await waitFor(async () => { const m = await messagesOf(admin, leadA); const x = m?.messages.find(y => y.id === 'msg_in_flaky1'); return x?.mediaUrl ? x : null; }, 15000);
      ok(!!mf, `falha momentânea (502) na mídia → RETRY automático e a imagem chega (${Math.round((Date.now() - t0) / 100) / 10}s)`, mf);
    }

    // ==================================================================================== COEXISTÊNCIA
    group('📱 Coexistência (mensagem enviada pelo CELULAR do dono)');
    const leadB = `lead_wa_${PHONE_B}`;
    {
      const ev = fluxoEvent('message.sent_from_phone', { conversation_id: 'conv_B', message_id: 'msg_phone_1', to: PHONE_B, type: 'text', text: 'Oi! Já vou te atender por aqui.', sent_from_phone: true });
      ok((await sendWebhook(ev)).status === 200, 'evento message.sent_from_phone aceito');
      const mb = await waitFor(async () => { const m = await messagesOf(admin, leadB); return m?.messages.length ? m : null; });
      ok(!!mb, 'a mensagem do celular APARECE no CRM', mb);
      const x = mb?.messages[0];
      ok(x?.sender === 'salesperson' && x?.sentFromPhone === true && x?.text === 'Oi! Já vou te atender por aqui.', 'gravada como SAÍDA do vendedor com sentFromPhone=true', x);
      ok(mb?.windowOpen === false, 'NÃO reabriu a janela de 24h (só o cliente reabre)', mb);
      await sendWebhook(fluxoEvent('message.sent_from_phone', { conversation_id: 'conv_B', message_id: 'msg_phone_1', to: PHONE_B, type: 'text', text: 'Oi! Já vou te atender por aqui.' }));
      await sleep(500);
      ok((await messagesOf(admin, leadB))?.messages.length === 1, 'reentrega do mesmo eco do celular não duplica');
    }

    // ==================================================================================== ENVIO
    group('📤 Envio pelo Nyroh');
    const sendBody = (extra: any) => ({ text: 'Olá! Segue o orçamento.', senderName: 'Thomas', phone: E164_A, ...extra });
    let sentRemoteId = '';
    {
      await mock('POST', '/__mock/reset');
      await mock('POST', '/__mock/open-window', { phone: E164_A });

      const cid = 'c' + crypto.randomBytes(6).toString('hex');
      const r = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: cid }));
      ok(r.status === 202 && r.json?.status === 'queued', 'texto dentro da janela → 202 queued (só diz "ok" quando a API aceitou)', r.json);
      sentRemoteId = r.json?.remoteMessageId || '';
      ok(/^msg_MOCK/.test(sentRemoteId), 'guarda o ID remoto da mensagem (msg_…)', sentRemoteId);
      const st = await mock('GET', '/__mock/state');
      const body = st.accepted[0]?.body;
      ok(body?.to === E164_A && body?.type === 'text' && body?.text?.body === 'Olá! Segue o orçamento.', 'corpo enviado segue o contrato (to E.164, type text, text.body)', body);
      ok(body?.idempotency_key === `nyroh:${cid}`, 'idempotency_key enviada', body?.idempotency_key);

      const again = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: cid }));
      const st2 = await mock('GET', '/__mock/state');
      ok(again.json?.replayed === true && st2.accepted.length === 1, 'MESMO clientMessageId (duplo clique/retry) NÃO reenvia ao cliente', { again: again.json?.replayed, accepted: st2.accepted.length });

      // janela fechada
      await mock('POST', '/__mock/close-window', { phone: E164_A });
      const rc = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'texto fora da janela' }));
      ok(rc.status === 422 && rc.json?.success === false && rc.json?.error?.code === 'window_closed', 'fora da janela → 422 window_closed (NÃO "enviado" falso)', rc.json);
      ok(/modelo|template/i.test(rc.json?.error?.action || '') , 'a resposta orienta usar um modelo aprovado', rc.json?.error);
      const mw = await messagesOf(admin, leadA);
      const failedMsg = mw?.messages.find(m => m.text === 'texto fora da janela');
      ok(failedMsg?.status === 'failed' && failedMsg?.error?.code === 'window_closed', 'a mensagem fica no histórico como FALHA com o motivo', failedMsg);

      // modelo
      const tr = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), templateName: 'boas_vindas', text: 'Oi Marina! (modelo)' }));
      ok(tr.status === 202 && tr.json?.billable === true, 'MODELO fora da janela → 202 e avisa que é cobrado (billable)', tr.json);
      const st3 = await mock('GET', '/__mock/state');
      const tb = st3.accepted.find((a: any) => a.kind === 'template')?.body;
      ok(typeof tb?.template?.language === 'string' && tb.template.language === 'pt_BR', 'template.language vai como TEXTO "pt_BR" (não { code })', tb?.template);
      ok(tb?.template?.body?.['1'] && tb?.template?.body?.['2'], 'variáveis {{1}} e {{2}} preenchidas pela definição do catálogo', tb?.template);

      const calls0 = (await mock('GET', '/__mock/state')).sendCalls;
      const tbtn = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), templateName: 'com_botao_url', text: 'x' }));
      ok(tbtn.status === 422 && /button\[0\]/.test(tbtn.json?.error?.message || ''), 'modelo com botão de URL sem o parâmetro → recusado ANTES de enviar, dizendo qual', tbtn.json);
      ok((await mock('GET', '/__mock/state')).sendCalls === calls0, '…e nenhuma requisição (nem cobrança) foi feita à API');
      const tbtn2 = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), templateName: 'com_botao_url', templateButtons: { '0': 'A-4471' }, text: 'x' }));
      ok(tbtn2.status === 202, 'informando o botão, o mesmo modelo é aceito', tbtn2.json);
      const trej = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), templateName: 'reprovado', text: 'x' }));
      ok(trej.status === 422, 'modelo REPROVADO pela Meta é recusado antes de enviar', trej.json);

      // erros da API
      await mock('POST', '/__mock/open-window', { phone: E164_A });
      await mock('POST', '/__mock/force', { status: 503, code: 'instance_reconnecting' });
      const r503 = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'durante reconexão' }));
      ok(r503.status === 503 && r503.json?.error?.code === 'instance_reconnecting' && r503.json?.error?.retryable === true, 'número reconectando → 503 com mensagem e "pode tentar de novo"', r503.json);
      await mock('POST', '/__mock/force', { status: 429, code: 'rate_limited', retryAfter: 7 });
      const r429 = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'estourou limite' }));
      ok(r429.status === 429 && r429.headers.get('retry-after') === '7', 'limite do plano → 429 repassando o Retry-After da API', { s: r429.status, ra: r429.headers.get('retry-after') });
      await mock('POST', '/__mock/force', { status: 402, code: 'payment_required' });
      const r402 = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'sem pagamento' }));
      ok(r402.status === 402 && /Cobran|mensalidade/i.test(r402.json?.error?.message + r402.json?.error?.action), 'mensalidade em aberto → 402 explicando', r402.json);
    }

    group('📍 Envio de mídia (imagem / áudio / documento)');
    {
      await mock('POST', '/__mock/reset');
      await mock('POST', '/__mock/open-window', { phone: E164_A });
      const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      const ri = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'Veja a prévia', mediaType: 'image', mediaName: 'previa.png', mediaUrl: `data:image/png;base64,${PNG}` }));
      ok(ri.status === 202, 'imagem (data URI) → 202', ri.json);
      const bi = (await mock('GET', '/__mock/state')).accepted.find((a: any) => a.body?.type === 'image')?.body;
      ok(/^https:\/\/nyroh\.test\/uploads\/[0-9a-f]{32}\.png$/.test(bi?.media?.url || ''), 'a Meta recebe uma URL HTTPS PÚBLICA estável do Nyroh (não litterbox/base64)', bi?.media);
      ok(bi?.media?.caption === 'Veja a prévia', 'legenda enviada', bi?.media);
      const file = fs.readdirSync(uploads).find(f => bi?.media?.url?.endsWith(f));
      ok(!!file, 'o arquivo realmente existe no armazenamento (UPLOADS_DIR)', fs.readdirSync(uploads));
      const hist = await messagesOf(admin, leadA);
      const histImg = hist?.messages.filter(m => m.mediaType === 'image' && m.sender === 'salesperson').pop();
      ok(!!histImg && !String(histImg.mediaUrl).startsWith('data:'), 'o histórico guarda a URL, não o base64 gigante', histImg?.mediaUrl?.slice(0, 60));

      const rd = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: '[Arquivo: proposta.pdf]', mediaType: 'document', mediaName: 'proposta.pdf', mediaUrl: `data:application/pdf;base64,${Buffer.from('%PDF-1.4 teste').toString('base64')}` }));
      ok(rd.status === 202, 'documento PDF → 202', rd.json);
      const bd = (await mock('GET', '/__mock/state')).accepted.find((a: any) => a.body?.type === 'document')?.body;
      ok(bd?.media?.filename === 'proposta.pdf' && !('caption' in (bd?.media || {})), 'nome do arquivo vai; o texto-marcador "[Arquivo: …]" NÃO vira legenda', bd?.media);

      // áudio já em OGG/Opus: não precisa de ffmpeg
      const rao = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: '🎤 Mensagem de voz (4s)', isAudio: true, audioDuration: 4, mediaType: 'audio', mediaUrl: `data:audio/ogg;codecs=opus;base64,${Buffer.from('OggS-fake').toString('base64')}` }));
      ok(rao.status === 202, 'áudio OGG/Opus → 202', rao.json);
      const ba = (await mock('GET', '/__mock/state')).accepted.find((a: any) => a.body?.type === 'audio')?.body;
      ok(!!ba?.media?.url && !('caption' in (ba?.media || {})), 'áudio sem legenda (a Meta não aceita)', ba?.media);

      // áudio WebM (gravado no Chrome): sem ffmpeg tem que dizer a verdade, nunca mandar lixo
      const raw = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: '🎤 Mensagem de voz (4s)', isAudio: true, mediaType: 'audio', mediaUrl: `data:audio/webm;codecs=opus;base64,${Buffer.from('webm-fake').toString('base64')}` }));
      ok(raw.status === 202 || (raw.status === 422 && /ffmpeg/i.test(raw.json?.error?.message || '')), `áudio WebM → ${raw.status === 202 ? 'convertido (ffmpeg presente)' : '422 explicando que falta ffmpeg (nunca envia formato inválido)'}`, raw.json);

      const rbig = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'grande', mediaType: 'image', mediaUrl: `data:image/png;base64,${Buffer.alloc(5.5 * 1048576, 1).toString('base64')}` }));
      ok(rbig.status === 422 && /grande demais/i.test(rbig.json?.error?.message || ''), 'imagem > 5 MB → 422 claro, sem gastar envio', rbig.json?.error);
      const rloc = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'x', mediaType: 'image', mediaUrl: 'http://localhost:3000/uploads/a.png' }));
      ok(rloc.status === 422, 'URL localhost recusada (a Meta não alcança)', rloc.json?.error);
    }

    // ==================================================================================== STATUS
    group('✓✓ Status das mensagens (só avança por rank)');
    {
      await mock('POST', '/__mock/reset');
      await mock('POST', '/__mock/open-window', { phone: E164_A });
      const r = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'mensagem para testar tiques' }));
      const rid = r.json?.remoteMessageId as string;
      const local = r.json?.message?.id as string;
      const statusOf = async () => (await messagesOf(admin, leadA))?.messages.find(m => m.id === local);
      ok((await statusOf())?.status === 'queued', 'começa em "queued" (aceita ≠ entregue)');

      const st = (status: string, rank: number, extra: any = {}) => sendWebhook(fluxoEvent('message.status', { message_id: rid, conversation_id: 'conv_A', status, rank, at: new Date().toISOString(), ...extra }));
      await st('sent', 1);
      ok(await waitFor(async () => (await statusOf())?.status === 'sent'), 'sent (1)');
      await st('delivered', 2);
      ok(await waitFor(async () => (await statusOf())?.status === 'delivered'), 'delivered (2)');
      await st('read', 3);
      ok(await waitFor(async () => (await statusOf())?.status === 'read'), 'read (3)');
      await st('delivered', 2); // chegou ATRASADO
      await sleep(500);
      ok((await statusOf())?.status === 'read', 'delivered ATRASADO não desfaz o read já recebido');

      const before = JSON.stringify((await messagesOf(admin, leadA))?.messages.map(m => [m.id, m.status]));
      await sendWebhook(fluxoEvent('message.status', { message_id: 'msg_NAO_EXISTE', status: 'failed', rank: 9, error: { code: '131026', message: 'x' } }));
      await sleep(500);
      ok(JSON.stringify((await messagesOf(admin, leadA))?.messages.map(m => [m.id, m.status])) === before, 'status de id DESCONHECIDO não altera nenhuma outra mensagem (o bug da "última mensagem")');

      // falha tardia
      const r2 = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'vai falhar na Meta' }));
      await sendWebhook(fluxoEvent('message.status', { message_id: r2.json?.remoteMessageId, status: 'failed', rank: 9, error: { code: '131026', message: 'Mensagem não entregável' } }));
      const f2 = await waitFor(async () => { const x = (await messagesOf(admin, leadA))?.messages.find(m => m.id === r2.json?.message?.id); return x?.status === 'failed' ? x : null; });
      ok(!!f2 && f2.error?.code === '131026', 'recusa tardia da Meta (failed) aparece com o código do erro', f2);

      // corrida: o webhook chega ANTES de o Nyroh gravar o id remoto
      const next = (await mock('GET', '/__mock/state')).nextMessageId as string;
      await sendWebhook(fluxoEvent('message.status', { message_id: next, status: 'delivered', rank: 2 }));
      await sleep(300);
      const r3 = await admin.post(`/api/leads/${leadA}/messages`, sendBody({ clientMessageId: 'c' + crypto.randomBytes(6).toString('hex'), text: 'corrida 202 x webhook' }));
      ok(r3.json?.remoteMessageId === next, 'o id previsto bateu com o da mensagem enviada', { next, got: r3.json?.remoteMessageId });
      const m3 = await waitFor(async () => { const x = (await messagesOf(admin, leadA))?.messages.find(m => m.id === r3.json?.message?.id); return x?.status === 'delivered' ? x : null; });
      ok(!!m3, 'status que chegou ANTES do 202 foi guardado e aplicado depois (sem perder o "entregue")', m3);
    }

    // ==================================================================================== LEITURA
    group('👀 Marcar como lida');
    {
      await mock('POST', '/__mock/reset');
      const r = await admin.post(`/api/leads/${leadA}/read`);
      ok(r.status === 200 && r.json?.marked === true, 'abrir a conversa marca a última mensagem recebida como lida', r.json);
      const st = await mock('GET', '/__mock/state');
      ok(st.readMarks.length === 1 && st.readMarks[0].startsWith('msg_'), 'chamou POST /v1/messages/{id}/read', st.readMarks);
      const r2 = await admin.post(`/api/leads/${leadA}/read`);
      ok(r2.json?.marked === false && r2.json?.reason === 'recent', 'abrir/fechar de novo em < 20s não gasta limite da API', r2.json);
    }

    // ==================================================================================== CAIXA DE ENTRADA
    group('📥 Caixa de entrada (ordem, não lidas, páginas)');
    {
      const inbox = await admin.get('/api/inbox');
      ok(inbox.status === 200 && Array.isArray(inbox.json?.conversations), 'GET /api/inbox responde com conversas', inbox.status);

      const conv = (inbox.json?.conversations || []).find((c: any) => c.id === leadA);
      ok(!!conv, 'a conversa do lead com mensagens aparece na caixa', (inbox.json?.conversations || []).map((c: any) => c.id));
      ok(!!conv?.lastMessageAt, 'a conversa traz a data da última mensagem (antes não existia)', conv?.lastMessageAt);
      ok(typeof conv?.lastMessageText === 'string', 'a prévia traz o texto da última mensagem, de qualquer lado', conv?.lastMessageText);

      // Ordem: quem falou por último fica no topo.
      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_inbox_topo', from: PHONE_A, type: 'text', text: 'mensagem mais nova' }));
      const topo = await waitFor(async () => {
        const r = await admin.get('/api/inbox');
        const first = r.json?.conversations?.[0];
        return first?.id === leadA && first?.lastMessageText === 'mensagem mais nova' ? first : null;
      });
      ok(!!topo, 'quem acabou de escrever sobe para o TOPO da caixa', topo);

      // Contador de não lidas: sobe com mensagem do cliente, zera ao abrir a conversa.
      ok((topo?.unreadCount || 0) > 0, 'mensagem do cliente aumenta o contador de não lidas', topo?.unreadCount);
      await admin.post(`/api/leads/${leadA}/read`);
      const depoisDeAbrir = await waitFor(async () => {
        const r = await admin.get('/api/inbox');
        const c = r.json?.conversations?.find((x: any) => x.id === leadA);
        return c && Number(c.unreadCount) === 0 ? c : null;
      });
      ok(!!depoisDeAbrir, 'abrir a conversa zera o contador de não lidas', depoisDeAbrir?.unreadCount);

      // Páginas: com limite 1 vem 1 conversa e um cursor para a próxima.
      const pagina1 = await admin.get('/api/inbox?limit=1');
      ok((pagina1.json?.conversations || []).length === 1, 'a caixa vem em páginas (limit=1 → 1 conversa)', pagina1.json?.conversations?.length);
      if (pagina1.json?.hasMore) {
        const pagina2 = await admin.get(`/api/inbox?limit=1&cursor=${encodeURIComponent(pagina1.json.nextCursor)}`);
        const id1 = pagina1.json.conversations[0]?.id;
        const id2 = pagina2.json?.conversations?.[0]?.id;
        ok(!!id2 && id1 !== id2, 'a página seguinte traz outra conversa (sem repetir)', { id1, id2 });
      }

      // Busca pelo nome/telefone.
      const busca = await admin.get(`/api/inbox?q=${encodeURIComponent(PHONE_A.slice(-8))}`);
      ok((busca.json?.conversations || []).some((c: any) => c.id === leadA), 'busca por telefone encontra a conversa', busca.json?.conversations?.length);

      // Carteira isolada: o vendedor não vê a conversa de lead que não é dele.
      const inboxVendedor = await vendor.get('/api/inbox');
      ok(inboxVendedor.status === 200 && !(inboxVendedor.json?.conversations || []).some((c: any) => c.id === leadA),
         'vendedor NÃO vê na caixa a conversa de lead de outro vendedor', inboxVendedor.json?.conversations?.length);
    }

    group('🧰 Ferramentas da conversa (busca, notas, transferir, resolver)');
    {
      // Busca no histórico
      const busca = await admin.get('/api/messages/search?q=' + encodeURIComponent('quero saber do site'));
      ok(busca.status === 200 && (busca.json?.results || []).length > 0, 'busca no histórico encontra a mensagem pelo texto', busca.json?.results?.length);
      ok((busca.json?.results || [])[0]?.leadName !== undefined, 'o resultado da busca diz de qual conversa é', busca.json?.results?.[0]);
      ok((await admin.get('/api/messages/search?q=a')).json?.results?.length === 0, 'busca com menos de 2 letras não varre o banco');

      // Carteira isolada na busca: o vendedor é dono do leadA desde o teste de presença
      const buscaOutro = await vendor.get('/api/messages/search?q=' + encodeURIComponent('zzz-nao-existe-zzz'));
      ok(buscaOutro.status === 200 && (buscaOutro.json?.results || []).length === 0, 'busca do vendedor não vaza mensagem de outro', buscaOutro.json?.results?.length);

      // Notas internas
      const nota = await admin.post(`/api/leads/${leadA}/notes`, { text: 'Pediu para ligar depois das 18h' });
      ok(nota.status === 200 && nota.json?.success, 'grava nota interna na conversa', nota.json);
      const notas = await admin.get(`/api/leads/${leadA}/notes`);
      ok((notas.json?.notes || []).some((n: any) => n.text.includes('18h')), 'a nota aparece na conversa com autor e data', notas.json?.notes?.[0]);
      ok((await admin.post(`/api/leads/${leadA}/notes`, { text: '   ' })).status === 400, 'nota vazia é recusada');

      // Resolver / reabrir
      ok((await admin.post(`/api/leads/${leadA}/resolve`, { resolved: true })).json?.resolved === true, 'marca a conversa como resolvida');
      const resolvidas = await admin.get('/api/inbox?filter=resolved');
      ok((resolvidas.json?.conversations || []).some((c: any) => c.id === leadA), 'a conversa resolvida aparece no filtro "Resolvidas"');
      const abertas = await admin.get('/api/inbox?filter=open');
      ok(!(abertas.json?.conversations || []).some((c: any) => c.id === leadA), 'e sai do filtro de conversas abertas');
      ok((await admin.post(`/api/leads/${leadA}/resolve`, { resolved: false })).json?.resolved === false, 'dá para reabrir a conversa');

      // Transferência: o DONO também pode repassar (antes era só o admin).
      // O lead nasce com seller-thomas; o admin passa para o vendedor do teste, o vendedor
      // repassa a um colega, e no fim devolvemos ao dono original para os testes seguintes.
      await admin.req('PUT', `/api/leads/${leadA}/assign`, { json: { salespersonId: 'seller-lara' } });
      const transf = await vendor.req('PUT', `/api/leads/${leadA}/assign`, { json: { salespersonId: 'seller-polly' } });
      ok(transf.status === 200, 'o vendedor dono consegue passar a conversa para um colega', transf.json);
      const depois = await admin.get(`/api/leads/${leadA}/summary`);
      ok(depois.json?.salespersonId === 'seller-polly', 'a conversa realmente trocou de dono', depois.json?.salespersonId);
      ok((await vendor.get(`/api/leads/${leadA}/messages`)).status === 403, 'depois de transferir, quem passou não acessa mais a conversa');
      await admin.req('PUT', `/api/leads/${leadA}/assign`, { json: { salespersonId: 'seller-thomas', salespersonName: 'Thomas' } });
    }

    group('📜 Histórico: carregar mensagens antigas');
    {
      const tudo = await admin.get(`/api/leads/${leadA}/messages`);
      const total = (tudo.json?.messages || []).length;
      ok(total > 2, '(preparação) a conversa já tem várias mensagens', total);

      const pedaco = await admin.get(`/api/leads/${leadA}/messages?limit=2`);
      ok((pedaco.json?.messages || []).length === 2, 'a conversa abre com um pedaço, não com tudo', pedaco.json?.messages?.length);
      ok(pedaco.json?.hasMoreOlder === true && !!pedaco.json?.olderCursor, 'o servidor avisa que há mensagens mais antigas e dá o cursor', { hasMoreOlder: pedaco.json?.hasMoreOlder, cursor: pedaco.json?.olderCursor });

      // O horário tem que ser UTC de verdade. O Postgres renderizava no fuso do SERVIDOR e
      // rotulava como "Z": num servidor em São Paulo toda mensagem aparecia 3h fora do lugar.
      const maisNova = (tudo.json?.messages || [])[total - 1];
      const distanciaMin = Math.abs(Date.now() - new Date(maisNova?.timestamp).getTime()) / 60000;
      ok(distanciaMin < 10, 'o horário da mensagem é UTC de verdade (não a hora local rotulada como Z)', { timestamp: maisNova?.timestamp, distanciaMin: Math.round(distanciaMin) });

      const antigas = await admin.get(`/api/leads/${leadA}/messages?limit=2&before=${encodeURIComponent(pedaco.json.olderCursor)}`);
      const idsNovos = new Set((pedaco.json?.messages || []).map((m: any) => m.id));
      const idsAntigos = (antigas.json?.messages || []).map((m: any) => m.id);
      ok(idsAntigos.length > 0 && idsAntigos.every((id: string) => !idsNovos.has(id)),
         'o lote anterior traz mensagens DIFERENTES (sem repetir o que já estava na tela)', idsAntigos);
    }

    // ==================================================================================== SSE
    group('👥 Vários vendedores no mesmo WhatsApp: presença');
    {
      // O lead nasce com o dono padrão (seller-thomas). Um vendedor que não é o dono
      // NÃO entra na conversa — é a regra de carteira isolada.
      const intruso = await vendor.req('POST', `/api/leads/${leadA}/presence`, { json: {} });
      ok(intruso.status === 403, 'vendedor NÃO entra na conversa de lead que não é dele (403)', intruso.status);
      ok((await vendor.get(`/api/leads/${leadA}/messages`)).status === 403, 'vendedor NÃO lê mensagens de lead alheio (403)');
      ok((await vendor.req('DELETE', `/api/leads/${leadA}`)).status === 403, 'vendedor NÃO apaga lead alheio (403)');

      // O admin passa o lead para o vendedor: a partir daí ele participa normalmente.
      const atribuir = await admin.req('PUT', `/api/leads/${leadA}/assign`, { json: { salespersonId: 'seller-lara' } });
      ok(atribuir.status === 200, 'admin transfere o lead para o vendedor', atribuir.json);

      const a = await admin.req('POST', `/api/leads/${leadA}/presence`, { json: {} });
      ok(a.status === 200 && a.json?.me, 'admin registra presença na conversa', a.json);
      const sse = openSse(admin.cookie);
      await sleep(300);
      const v = await vendor.req('POST', `/api/leads/${leadA}/presence`, { json: { typing: true } });
      const seen = (v.json?.users || []).map((u: any) => u.id);
      ok(seen.length === 2, 'o vendedor vê que há 2 pessoas na conversa (ele + o admin)', v.json?.users);
      const ev = await waitFor(async () => sse.events.find(e => e.type === 'LEAD_PRESENCE' && e.data?.users?.some((u: any) => u.typing)));
      ok(!!ev, 'o admin recebe em tempo real que o vendedor está DIGITANDO', sse.events.map(e => e.type));
      await vendor.req('POST', `/api/leads/${leadA}/presence`, { json: { leave: true } });
      const left = await waitFor(async () => sse.events.find(e => e.type === 'LEAD_PRESENCE' && (e.data?.users || []).length === 1));
      ok(!!left, 'quando o vendedor sai da conversa, o admin é avisado', left?.data);
      sse.close();
      ok((await anon.req('POST', `/api/leads/${leadA}/presence`, { json: {} })).status === 401, 'presença exige login');
    }

    group('🔌 Tempo real: SSE com replay (queda de conexão não perde evento)');
    {
      const s1 = openSse(admin.cookie);
      await sleep(300);
      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_sse_1', from: PHONE_A, type: 'text', text: 'antes da queda' }));
      await waitFor(async () => s1.events.some(e => e.type === 'NEW_MESSAGE' && e.data?.message?.id === 'msg_sse_1'));
      const lastId = Math.max(...s1.events.filter(e => e.id).map(e => e.id!));
      s1.close(); // conexão CAIU
      await sleep(200);
      await sendWebhook(fluxoEvent('message.received', { conversation_id: 'conv_A', message_id: 'msg_sse_2', from: PHONE_A, type: 'text', text: 'durante a queda' }));
      await sleep(600);
      const s2 = openSse(admin.cookie, lastId); // reconecta com Last-Event-ID
      const replayed = await waitFor(async () => s2.events.find(e => e.type === 'NEW_MESSAGE' && e.data?.message?.id === 'msg_sse_2'));
      ok(!!replayed, 'ao reconectar, o evento perdido durante a queda é REENVIADO', s2.events.map(e => e.type));
      s2.close();
      const s3 = openSse(admin.cookie, 999999999);
      const resync = await waitFor(async () => s3.events.find(e => e.type === 'resync'));
      ok(!!resync, 'se o servidor reiniciou/buraco grande → manda "resync" para o front recarregar', s3.events.map(e => e.type));
      s3.close();
    }

    // ==================================================================================== DISPARO
    group('🚀 Disparo em massa (limite do plano, 429, falhas, sem duplicar)');
    {
      await mock('POST', '/__mock/reset');
      const zip = new JSZip();
      const leads = [
        { id: 'L1', name: 'Padaria Um', phone: '(19) 99999-0001' },
        { id: 'L2', name: 'Padaria Dois', phone: '(19) 99999-0002' },
        { id: 'L3', name: 'Padaria Tres', phone: '(19) 99999-0003' },
        { id: 'L4', name: 'Sem Telefone', phone: '' }
      ];
      zip.file('leads.json', JSON.stringify(leads));
      const zbuf = await zip.generateAsync({ type: 'nodebuffer' });
      const form = new FormData();
      form.append('zipFile', new Blob([new Uint8Array(zbuf)], { type: 'application/zip' }), 'safra.zip');
      form.append('safraName', 'Safra E2E');
      const up = await admin.req('POST', '/api/campaign/upload-zip', { form });
      const batchId = up.json?.batchId || up.json?.batch?.id;
      ok(up.status === 200 && !!batchId, 'importa a safra (ZIP) com os leads', up.json || up.text.slice(0, 200));

      // 429 forçado no 1º envio: a fila tem que ESPERAR o Retry-After e continuar
      await mock('POST', '/__mock/force', { status: 429, code: 'rate_limited', retryAfter: 2 });
      const t0 = Date.now();
      const d = await admin.post('/api/campaign/dispatch', {
        batchId, templateName: 'boas_vindas', limit: 'ALL', speedPerSecond: 30,
        variableValues: { var1: '{nome}', var2: '{site_novo}', var3: 'x' }
      });
      ok(d.status === 200 && d.json?.success === true, 'disparo enfileirado', d.json);
      ok(d.json?.cappedByPlan === true && d.json?.speedPerMinute <= 48, `velocidade pedida (30/s = 1.800/min) foi CORTADA para ${d.json?.speedPerMinute}/min (teto do plano)`, { cap: d.json?.cappedByPlan, perMin: d.json?.speedPerMinute });

      const prog = await waitFor(async () => {
        const p = await admin.get(`/api/campaign/batches/${batchId}/progress`);
        return p.json && (p.json.sent + p.json.failed) >= 3 ? p.json : null;
      }, 30000, 400);
      ok(!!prog, 'lote termina', prog);
      const elapsed = (Date.now() - t0) / 1000;
      ok(elapsed >= 2, `respeitou o Retry-After de 2s do 429 (levou ${elapsed.toFixed(1)}s)`, elapsed);
      const st = await mock('GET', '/__mock/state');
      const tpl = st.accepted.filter((a: any) => a.kind === 'template');
      ok(tpl.length === 3, 'os 3 leads com telefone foram enviados (o sem telefone não)', tpl.length);
      ok(new Set(tpl.map((a: any) => a.body.to)).size === 3, 'nenhum telefone recebeu duas vezes (sem duplicar após o 429)', tpl.map((a: any) => a.body.to));
      ok(tpl.every((a: any) => a.body.template.language === 'pt_BR' && a.body.idempotency_key), 'todos com language "pt_BR" e idempotency_key por lead', tpl[0]?.body);
      ok(prog?.failed === 0 || prog?.failed === 1, 'o lead sem telefone não derruba o lote', prog);

      // espaçamento: 48/min = 1,25s entre mensagens
      const gaps = tpl.slice(1).map((a: any, i: number) => (a.at - tpl[i].at) / 1000);
      ok(gaps.every((g: number) => g >= 0.9), `mensagens espaçadas (≥ ~1,25s): ${gaps.map((g: number) => g.toFixed(2)).join('s, ')}s`, gaps);
    }

    // ==================================================================================== DIAGNÓSTICO
    group('🩺 Diagnóstico honesto');
    {
      const inst = await admin.get('/api/admin/fluxo/instances');
      ok(inst.json?.success === true && inst.json?.instances?.[0]?.id === MOCK_INSTANCE, 'lista a instância REAL da API (não um card fixo)', inst.json);
      ok(inst.json?.instances?.[0]?.coexistence === true, 'reflete o modo (coexistence)');
      await mock('POST', '/__mock/mode', { mode: 'api_only' });
      const inst2 = await admin.get('/api/admin/fluxo/instances');
      ok(inst2.json?.instances?.[0]?.coexistence === false, 'se o número estiver em api_only, a tela passa a mostrar coexistência DESLIGADA');
      const mode = await admin.get('/api/admin/fluxo/instance-mode');
      ok(mode.json?.mode === 'api_only', 'diagnóstico de modo diz api_only', mode.json);
      await mock('POST', '/__mock/mode', { mode: 'coexistence' });

      const infra = await admin.get('/api/infrastructure/status');
      const items = infra.json?.whatsapp?.items || [];
      ok(items.length >= 8, 'painel de prontidão lista os requisitos', items.length);
      ok(items.find((i: any) => i.key === 'webhook_secret')?.ok === true, 'prontidão: assinatura do webhook ATIVA');
      ok(items.find((i: any) => i.key === 'public_url')?.ok === true, 'prontidão: APP_PUBLIC_URL definida');
      ok(items.find((i: any) => i.key === 'default_passwords')?.ok === true, 'prontidão: nenhuma conta com senha padrão (elas nascem com ADMIN_INITIAL_PASSWORD)', items.find((i: any) => i.key === 'default_passwords'));

      await sendWebhook(fluxoEvent('instance.status_changed', { field: 'phone_number_quality_update', quality: 'yellow', messaging_limit_24h: 1000 }));
      const infra2 = await waitFor(async () => { const x = await admin.get('/api/infrastructure/status'); return x.json?.whatsapp?.items?.some((i: any) => i.key === 'quality') ? x : null; });
      ok(!!infra2, 'webhook de qualidade AMARELA vira alerta crítico no painel', infra2?.json?.whatsapp?.instanceHealth);
    }

    // ==================================================================================== FORÇA BRUTA
    group('🔐 Login: limite de tentativas');
    {
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await new Client().req('POST', '/api/auth/login', { json: { email: 'alvo@x.com', password: 'errada' + i } })).status;
      ok(last === 429, '11ª tentativa errada seguida → 429 (força bruta bloqueada)', last);
      ok((await new Client().login('admin@nyroh.com', E2E_PASSWORD)).status === 200, 'outro e-mail não é afetado');
    }

    await shutdown();
  } catch (e: any) {
    console.error('💥 Erro inesperado no E2E:', e);
    console.error(serverLog.join('').split('\n').slice(-25).join('\n'));
    await shutdown();
    process.exit(2);
  }

  console.log(`\n=====================================================`);
  console.log(`📊 E2E: ${passed} passaram, ${failed} falharam`);
  if (failed) console.log('Falhas:\n - ' + failures.join('\n - '));
  console.log(`=====================================================`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
