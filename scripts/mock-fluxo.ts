/**
 * MOCK da FluxoAPI para testes locais (sem usar o número real).
 *
 * Implementa o CONTRATO da documentação (OpenAPI v1.0.0) que o Nyroh usa:
 *  - autenticação HMAC-SHA256 (confere assinatura, relógio ±300s e nonce repetido → 409)
 *  - GET  /v1/instances, /v1/instances/{id}
 *  - GET  /v1/instances/{id}/templates       (catálogo com `fields[]`)
 *  - POST /v1/instances/{id}/messages        (202 queued | 422 window_closed | idempotência)
 *  - POST /v1/instances/{id}/messages/template (202, billable)
 *  - GET  /v1/messages/{id}/media            (bytes; 410 media_expired)
 *  - POST /v1/messages/{id}/read
 *  - controles de teste em /__mock/* (janela aberta, forçar 429/503/402, estado)
 *
 * Uso:  import { startMockFluxo } from './mock-fluxo'    ou    npx tsx scripts/mock-fluxo.ts
 */
import http from 'http';
import crypto from 'crypto';

export const MOCK_KEY = 'fxk_test_mockkey000000000000';
export const MOCK_SECRET = 'fxs_mocksecret00000000000000000000';
export const MOCK_INSTANCE = 'inst_MOCK0000000000000001';

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// PNG 1x1 transparente
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

export interface MockState {
  /** Telefones (E.164) cuja janela de 24h está ABERTA. */
  openWindows: Set<string>;
  /** Mensagens aceitas (para as asserções do teste). */
  accepted: Array<{ id: string; kind: 'session' | 'template'; body: any; at: number }>;
  /** Respostas de erro forçadas para as próximas N chamadas de envio. */
  forced: Array<{ status: number; code: string; retryAfter?: number }>;
  mode: 'coexistence' | 'api_only';
  seenNonces: Map<string, number>;
  idempotency: Map<string, { id: string; body: any }>;
  counter: number;
  readMarks: string[];
  authFailures: number;
  /** Quantas chamadas de envio chegaram (inclui as recusadas). */
  sendCalls: number;
  /** Mídias "flaky" que já falharam uma vez (a 2ª tentativa funciona). */
  flakySeen: Set<string>;
}

const TEMPLATES = [
  {
    id: '1', name: 'boas_vindas', language: 'pt_BR', status: 'APPROVED', category: 'MARKETING', parameterFormat: 'POSITIONAL',
    bodyText: 'Oi {{1}}! Veja o seu site: {{2}}', sendable: true, blockedReason: null,
    fields: [
      { slot: 'body', kind: 'text', ref: '1', label: 'Nome', example: 'Marina', required: true },
      { slot: 'body', kind: 'text', ref: '2', label: 'Link', example: 'https://x.com', required: true }
    ]
  },
  {
    id: '2', name: 'dns_escassez_np4', language: 'pt_BR', status: 'APPROVED', category: 'MARKETING', parameterFormat: 'POSITIONAL',
    bodyText: '{{1}} | {{2}} | {{3}}', sendable: true, blockedReason: null,
    fields: [
      { slot: 'body', kind: 'text', ref: '1', required: true },
      { slot: 'body', kind: 'text', ref: '2', required: true },
      { slot: 'body', kind: 'text', ref: '3', required: true }
    ]
  },
  {
    id: '3', name: 'com_botao_url', language: 'pt_BR', status: 'APPROVED', category: 'UTILITY', parameterFormat: 'POSITIONAL',
    bodyText: 'Pedido {{1}} saiu', sendable: true, blockedReason: null,
    fields: [
      { slot: 'body', kind: 'text', ref: '1', required: true },
      { slot: 'button', kind: 'url_suffix', ref: '0', buttonIndex: 0, required: true }
    ]
  },
  {
    id: '4', name: 'reprovado', language: 'pt_BR', status: 'REJECTED', category: 'MARKETING', parameterFormat: 'POSITIONAL',
    bodyText: 'x', sendable: false, blockedReason: 'Modelo reprovado pela Meta.', fields: []
  }
];

function sign(secret: string, ts: string, nonce: string, method: string, pathWithQuery: string, bodyHash: string) {
  const s = ['v1', ts, nonce, method.toUpperCase(), pathWithQuery, bodyHash].join('\n');
  return 'v1=' + crypto.createHmac('sha256', secret).update(s).digest('hex');
}

export function signWebhook(secret: string, rawBody: string, timestamp: string = String(Math.floor(Date.now() / 1000))) {
  return { timestamp, signature: 'v1=' + crypto.createHmac('sha256', secret).update(`${timestamp}\n${rawBody}`).digest('hex') };
}

export function startMockFluxo(port: number): Promise<{ server: http.Server; state: MockState; url: string; close: () => Promise<void> }> {
  const state: MockState = {
    openWindows: new Set(),
    accepted: [],
    forced: [],
    mode: 'coexistence',
    seenNonces: new Map(),
    idempotency: new Map(),
    counter: 0,
    readMarks: [],
    authFailures: 0,
    sendCalls: 0,
    flakySeen: new Set()
  };

  const json = (res: http.ServerResponse, status: number, body: any, headers: Record<string, string> = {}) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'X-RateLimit-Limit': '60', 'X-RateLimit-Remaining': '59', ...headers });
    res.end(payload);
  };
  const err = (res: http.ServerResponse, status: number, code: string, message: string, extra: any = {}, headers: Record<string, string> = {}) =>
    json(res, status, { error: { code, message, request_id: `req_mock_${++state.counter}`, ...extra } }, headers);

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const url = req.url || '/';
      const [pathOnly] = url.split('?');
      const method = (req.method || 'GET').toUpperCase();

      // ---- rotas SEM assinatura ----
      if (pathOnly === '/health') return json(res, 200, { status: 'ok', db: true, redis: true, version: 'mock' });

      if (pathOnly.startsWith('/__mock/')) {
        const body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
        if (pathOnly === '/__mock/open-window') { state.openWindows.add(body.phone); return json(res, 200, { ok: true }); }
        if (pathOnly === '/__mock/close-window') { state.openWindows.delete(body.phone); return json(res, 200, { ok: true }); }
        if (pathOnly === '/__mock/force') { state.forced.push(...(Array.isArray(body) ? body : [body])); return json(res, 200, { ok: true }); }
        if (pathOnly === '/__mock/mode') { state.mode = body.mode; return json(res, 200, { ok: true }); }
        if (pathOnly === '/__mock/reset') {
          state.openWindows.clear(); state.accepted.length = 0; state.forced.length = 0; state.idempotency.clear(); state.readMarks.length = 0; state.sendCalls = 0; state.authFailures = 0; state.flakySeen.clear();
          return json(res, 200, { ok: true });
        }
        if (pathOnly === '/__mock/state') {
          return json(res, 200, { accepted: state.accepted, readMarks: state.readMarks, authFailures: state.authFailures, sendCalls: state.sendCalls, forcedPending: state.forced.length, nextMessageId: `msg_MOCK${String(state.counter + 1).padStart(8, '0')}` });
        }
        return json(res, 404, { error: 'unknown mock control' });
      }

      // ---- autenticação HMAC (§A1) ----
      const key = String(req.headers['x-fluxo-key'] || '');
      const ts = String(req.headers['x-fluxo-timestamp'] || '');
      const nonce = String(req.headers['x-fluxo-nonce'] || '');
      const sig = String(req.headers['x-fluxo-signature'] || '');
      if (!key || !ts || !nonce || !sig) { state.authFailures++; return err(res, 401, 'missing_auth_headers', 'Faltam cabeçalhos de autenticação.'); }
      if (key !== MOCK_KEY) { state.authFailures++; return err(res, 401, 'invalid_key', 'Chave inválida.'); }
      if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > 300) { state.authFailures++; return err(res, 401, 'stale_timestamp', 'Relógio fora da janela.'); }
      if (nonce.length < 8 || nonce.length > 128) { state.authFailures++; return err(res, 401, 'invalid_nonce', 'Nonce inválido.'); }
      const bodyHash = raw.length ? crypto.createHash('sha256').update(raw).digest('hex') : EMPTY_SHA;
      const expected = sign(MOCK_SECRET, ts, nonce, method, url, bodyHash);
      if (expected !== sig) { state.authFailures++; return err(res, 401, 'invalid_signature', 'A assinatura não confere.'); }
      const seen = state.seenNonces.get(nonce);
      if (seen && Date.now() - seen < 600000) return err(res, 409, 'nonce_reused', 'Este nonce já foi usado.');
      state.seenNonces.set(nonce, Date.now());

      let body: any = {};
      if (raw.length) {
        try { body = JSON.parse(raw.toString('utf8')); } catch { return err(res, 422, 'invalid_input', 'JSON inválido.'); }
      }

      // ---- instâncias ----
      const instObj = {
        id: MOCK_INSTANCE, name: 'Nyroh Mock', phone: '+5561999990000', status: 'connected', mode: state.mode,
        quality: 'green', throughput_mps: 80, messaging_limit_24h: 1000
      };
      if (method === 'GET' && pathOnly === '/v1/instances') return json(res, 200, { data: [instObj] });
      if (method === 'GET' && pathOnly === `/v1/instances/${MOCK_INSTANCE}`) return json(res, 200, { data: { ...instObj, conversations_24h: 3, messages_24h: 12 } });

      // ---- catálogo de modelos ----
      if (method === 'GET' && pathOnly === `/v1/instances/${MOCK_INSTANCE}/templates`) {
        const q = new URL(url, 'http://x').searchParams;
        const name = (q.get('name') || '').toLowerCase();
        const lang = q.get('language');
        const list = TEMPLATES.filter(t => (!name || t.name.includes(name)) && (!lang || t.language === lang));
        return json(res, 200, { data: list, waba_id: 'waba_mock', cached: false });
      }

      // ---- mídia recebida ----
      const mediaMatch = /^\/v1\/messages\/([^/]+)\/media$/.exec(pathOnly);
      if (method === 'GET' && mediaMatch) {
        const id = mediaMatch[1];
        if (id.includes('expired')) return err(res, 410, 'media_expired', 'A Meta já apagou esta mídia.');
        if (id.includes('flaky') && !state.flakySeen.has(id)) { state.flakySeen.add(id); return err(res, 502, 'media_unavailable', 'Falha momentânea.'); }
        if (id.includes('audio')) {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'X-Media-Mime-Type': 'audio/ogg; codecs=opus' });
          return res.end(Buffer.from('OggS-fake-audio-bytes-for-test'));
        }
        if (id.includes('pdf')) {
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'X-Media-Mime-Type': 'application/pdf' });
          return res.end(Buffer.from('%PDF-1.4 fake'));
        }
        res.writeHead(200, { 'Content-Type': 'image/png', 'X-Media-Mime-Type': 'image/png' });
        return res.end(PNG_1PX);
      }

      // ---- marcar como lida ----
      const readMatch = /^\/v1\/messages\/([^/]+)\/read$/.exec(pathOnly);
      if (method === 'POST' && readMatch) { state.readMarks.push(readMatch[1]); return json(res, 200, { data: { ok: true } }); }

      // ---- envio ----
      const sendMatch = /^\/v1\/instances\/([^/]+)\/messages(\/template)?$/.exec(pathOnly);
      if (method === 'POST' && sendMatch) {
        state.sendCalls++;
        if (sendMatch[1] !== MOCK_INSTANCE) return err(res, 404, 'not_found', 'Instância não encontrada.');

        const forced = state.forced.shift();
        if (forced) {
          return err(res, forced.status, forced.code, `Erro forçado (${forced.code}).`, {}, forced.retryAfter ? { 'Retry-After': String(forced.retryAfter) } : {});
        }
        if (!body.to || !/^\+\d{10,15}$/.test(String(body.to))) return err(res, 422, 'invalid_input', 'Campo "to" inválido (E.164).', { field: 'to' });

        if (body.idempotency_key && state.idempotency.has(body.idempotency_key)) {
          const prev = state.idempotency.get(body.idempotency_key)!;
          return json(res, 200, { data: { id: prev.id, status: 'queued' }, replayed: true }, { 'x-fluxo-idempotent-replay': 'true' });
        }

        const isTemplate = Boolean(sendMatch[2]);
        if (!isTemplate) {
          const t = body.type || 'text';
          if (t === 'text' && !(body.text && typeof body.text.body === 'string' && body.text.body.length)) return err(res, 422, 'invalid_input', 'text.body obrigatório.', { field: 'text.body' });
          if (['image', 'document', 'audio', 'video'].includes(t)) {
            if (!body.media || !/^https:\/\/|^http:\/\//.test(String(body.media.url || ''))) return err(res, 422, 'invalid_input', 'media.url precisa ser uma URL pública.', { field: 'media.url' });
            if (t === 'audio' && body.media.caption) return err(res, 422, 'invalid_input', 'Áudio não aceita legenda.', { field: 'media.caption' });
          }
          if (!state.openWindows.has(body.to)) {
            return err(res, 422, 'window_closed', 'O contato não escreve há mais de 24 horas. Use um modelo aprovado.', {
              window_expired_at: new Date(Date.now() - 3600000).toISOString(),
              hint: `POST /v1/instances/${MOCK_INSTANCE}/messages/template`
            });
          }
        } else {
          const tpl = body.template || {};
          const def = TEMPLATES.find(x => x.name === tpl.name && x.language === tpl.language);
          if (typeof tpl.language !== 'string') return err(res, 422, 'invalid_input', 'template.language deve ser texto (ex.: "pt_BR").', { field: 'template.language' });
          if (!def) return err(res, 404, 'template_not_found', 'Modelo inexistente nesta conta/idioma.');
          if (def.status !== 'APPROVED') return err(res, 422, 'invalid_input', `Modelo ${def.name} não está APPROVED.`);
          const bodyVars = tpl.body || tpl.variables || {};
          for (const f of def.fields as any[]) {
            if (f.slot === 'body' && !bodyVars[f.ref]) return err(res, 422, 'invalid_input', `Falta a variável do corpo {{${f.ref}}}.`, { field: `template.body.${f.ref}` });
            if (f.slot === 'button' && !(tpl.buttons && tpl.buttons[String(f.buttonIndex)])) return err(res, 422, 'invalid_input', `Falta o parâmetro do botão ${f.buttonIndex}.`, { field: `template.buttons.${f.buttonIndex}` });
          }
        }

        const id = `msg_MOCK${String(++state.counter).padStart(8, '0')}`;
        if (body.idempotency_key) state.idempotency.set(body.idempotency_key, { id, body });
        state.accepted.push({ id, kind: isTemplate ? 'template' : 'session', body, at: Date.now() });
        const preview = isTemplate
          ? String((TEMPLATES.find(x => x.name === body.template.name)?.bodyText || '')).replace(/\{\{(\w+)\}\}/g, (_m, r) => (body.template.body || body.template.variables || {})[r] ?? '')
          : undefined;
        return json(res, 202, { data: { id, status: 'queued', conversation_id: 'conv_MOCK1' }, ...(isTemplate ? { billable: true, preview } : {}) });
      }

      return err(res, 404, 'not_found', `Rota não encontrada no mock: ${method} ${pathOnly}`);
    });
  });

  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        state,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>(r => server.close(() => r()))
      });
    });
  });
}

// Execução direta: sobe o mock e fica de pé
if (process.argv[1] && /mock-fluxo\.(ts|js)$/.test(process.argv[1])) {
  const port = Number(process.env.MOCK_FLUXO_PORT) || 4010;
  startMockFluxo(port).then(m => {
    console.log(`🧪 Mock FluxoAPI em ${m.url}`);
    console.log(`   FLUXO_BASE_URL=${m.url}  FLUXO_KEY=${MOCK_KEY}  FLUXO_SECRET=${MOCK_SECRET}  FLUXO_INSTANCE_ID=${MOCK_INSTANCE}`);
  });
}
