/**
 * E2E da trilha de descadastro (item 3.3 do checklist), com as flags LIGADAS:
 *  - clique de botão com reply.id configurado: vira descadastro, sem balão, e recebe a confirmação;
 *  - clique com id desconhecido: vira mensagem comum (balão), sem descadastro;
 *  - texto comum: mensagem comum, sem confirmação;
 *  - palavra "parar": descadastro, e a confirmação sai uma vez só.
 * Roda contra o FluxoAPI simulado (scripts/mock-fluxo.ts). Nada é enviado de verdade.
 *   npm run test:e2e-descadastro   (com E2E_DATABASE_URL, roda no PostgreSQL de teste)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockFluxo, signWebhook, MOCK_KEY, MOCK_SECRET, MOCK_INSTANCE } from './mock-fluxo';
import { startNyrohServer } from './_proc';
import { TEXTO_CONFIRMACAO_DESCADASTRO } from '../shared/lib/descadastroEnvio';

const E2E_PASSWORD = 'SenhaDoTesteE2E_2026';
const NYROH_PORT = 3056;
const MOCK_PORT = 4011;
const BASE = `http://127.0.0.1:${NYROH_PORT}`;
const WEBHOOK_SECRET = 'whsec_e2e_descadastro';
const PHONE_CLICK = '5519996100001';
const PHONE_COMUM = '5519996100002';
const PHONE_DESCONHECIDO = '5519996100003';
const PHONE_PALAVRA = '5519996100004';
const ID_BOTAO = 'parar_teste_e2e';

let passed = 0;
let failed = 0;
function ok(cond: any, nome: string, detalhe?: any) {
  if (cond) { passed++; console.log(`  ✅ ${nome}`); }
  else { failed++; console.error(`  ❌ ${nome}${detalhe !== undefined ? `\n       → ${JSON.stringify(detalhe).slice(0, 300)}` : ''}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperar<T>(fn: () => Promise<T | null | undefined | false>, ms = 8000): Promise<T | null> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try { const v = await fn(); if (v) return v as T; } catch { /* tenta de novo */ }
    await sleep(150);
  }
  return null;
}
let seq = 0;
function evento(tipo: string, data: any) {
  const id = `evt_DESC${String(++seq).padStart(6, '0')}`;
  const raw = JSON.stringify({ id, type: tipo, instance_id: MOCK_INSTANCE, created_at: new Date().toISOString(), data });
  const { timestamp, signature } = signWebhook(WEBHOOK_SECRET, raw);
  return { raw, headers: { 'content-type': 'application/json', 'x-fluxo-event-id': id, 'x-fluxo-event-type': tipo, 'x-fluxo-timestamp': timestamp, 'x-fluxo-signature': signature } };
}
async function enviarWebhook(data: any) {
  const ev = evento('message.received', data);
  const res = await fetch(`${BASE}/api/webhooks/fluxo`, { method: 'POST', headers: ev.headers, body: ev.raw });
  return res.status;
}
const mock = (m: string, p: string, body?: any) =>
  fetch(`http://127.0.0.1:${MOCK_PORT}${p}`, { method: m, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());
const enviosDeTexto = async (telefone: string, texto: string) => {
  const st = await mock('GET', '/__mock/state');
  return (st.accepted as any[]).filter((a) => a.body?.text?.body === texto && String(a.body?.to || '').replace(/\D/g, '') === telefone);
};
async function mensagensDoLead(cookie: string, phone: string) {
  const r = await fetch(`${BASE}/api/leads/${encodeURIComponent(`lead_wa_${phone}`)}/messages`, { headers: { cookie } });
  const j: any = await r.json().catch(() => null);
  return (j?.messages || []) as Array<{ text: string; sender: string }>;
}

async function main() {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'nyroh-e2e-desc-'));
  const mockSrv = await startMockFluxo(MOCK_PORT);
  const srv = startNyrohServer({
    NODE_ENV: 'production',
    NYROH_PORT: String(NYROH_PORT),
    FLUXO_BASE_URL: mockSrv.url,
    FLUXO_KEY: MOCK_KEY,
    FLUXO_SECRET: MOCK_SECRET,
    FLUXO_INSTANCE_ID: MOCK_INSTANCE,
    FLUXO_WEBHOOK_SECRET: WEBHOOK_SECRET,
    FLUXO_PLAN_RPM: '60',
    APP_PUBLIC_URL: 'https://nyroh.test',
    UPLOADS_DIR: uploads,
    DATABASE_URL: process.env.E2E_DATABASE_URL || '',
    ADMIN_INITIAL_PASSWORD: E2E_PASSWORD,
    // Flags da trilha de descadastro, LIGADAS só neste teste
    NYROH_DESCADASTRO_POR_BOTAO: 'true',
    NYROH_DESCADASTRO_BOTAO_IDS: ID_BOTAO,
    NYROH_CONFIRMACAO_DESCADASTRO: 'true',
  });
  const parar = async () => { await srv.stop(); await mockSrv.close().catch(() => {}); fs.rmSync(uploads, { recursive: true, force: true }); };

  try {
    const subiu = await esperar(async () => (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) || null, 60000);
    if (!subiu) throw new Error('O servidor não subiu.');
    await esperar(async () => {
      const h: any = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
      return h && h.database && h.database.starting === false ? h : null;
    }, 60000);

    const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@nyroh.com', password: E2E_PASSWORD }) });
    const cookie = (((login.headers as any).getSetCookie?.() as string[]) || []).map((x) => x.split(';')[0]).find((x) => x.startsWith('crm_session=')) || '';
    ok(Boolean(cookie), 'admin consegue entrar para conferir os leads');

    await mock('POST', '/__mock/reset');
    for (const tel of [PHONE_CLICK, PHONE_COMUM, PHONE_DESCONHECIDO, PHONE_PALAVRA]) await mock('POST', '/__mock/open-window', { phone: `+${tel}` });

    console.log('\nClique com reply.id configurado');
    const s1 = await enviarWebhook({ conversation_id: 'conv_c', message_id: 'msg_click_1', from: PHONE_CLICK, type: 'interactive', text: 'Parar Mensagens', reply: { kind: 'list_reply', id: ID_BOTAO, title: 'Parar Mensagens' } });
    ok(s1 === 200, 'webhook do clique aceito (200)', s1);
    const conf1 = await esperar(async () => (await enviosDeTexto(PHONE_CLICK, TEXTO_CONFIRMACAO_DESCADASTRO)).length > 0 || null);
    ok(Boolean(conf1), 'confirmação aprovada é enviada para quem clicou');
    const msgsClick = await esperar(async () => (await mensagensDoLead(cookie, PHONE_CLICK)).length > 0 ? true : null, 3000);
    const baloesClick = (await mensagensDoLead(cookie, PHONE_CLICK)).filter((m) => m.sender === 'lead' && String(m.text).includes('Parar Mensagens'));
    ok(baloesClick.length === 0, 'clique de descadastro não aparece como balão do cliente', baloesClick);

    console.log('\nClique com id desconhecido (não é descadastro)');
    const s2 = await enviarWebhook({ conversation_id: 'conv_d', message_id: 'msg_click_3', from: PHONE_DESCONHECIDO, type: 'interactive', text: 'Parar Mensagens', reply: { kind: 'list_reply', id: 'outro_id', title: 'Parar Mensagens' } });
    ok(s2 === 200, 'webhook com id desconhecido aceito (200)', s2);
    const balaoDesc = await esperar(async () => (await mensagensDoLead(cookie, PHONE_DESCONHECIDO)).some((m) => String(m.text).includes('Parar Mensagens')) || null);
    ok(Boolean(balaoDesc), 'id desconhecido vira balão normal', await mensagensDoLead(cookie, PHONE_DESCONHECIDO));
    ok((await enviosDeTexto(PHONE_DESCONHECIDO, TEXTO_CONFIRMACAO_DESCADASTRO)).length === 0, 'id desconhecido não recebe confirmação');

    console.log('\nTexto comum');
    await enviarWebhook({ conversation_id: 'conv_e', message_id: 'msg_txt_2', from: PHONE_COMUM, type: 'text', text: 'Quero saber o preço, obrigado' });
    const balaoComum = await esperar(async () => (await mensagensDoLead(cookie, PHONE_COMUM)).some((m) => String(m.text).includes('Quero saber')) || null);
    ok(Boolean(balaoComum), 'texto comum aparece no chat');
    ok((await enviosDeTexto(PHONE_COMUM, TEXTO_CONFIRMACAO_DESCADASTRO)).length === 0, 'texto comum não recebe confirmação');

    console.log('\nPalavra "parar" (caminho antigo) com confirmação uma vez só');
    await enviarWebhook({ conversation_id: 'conv_f', message_id: 'msg_word_4', from: PHONE_PALAVRA, type: 'text', text: 'parar' });
    const conf2 = await esperar(async () => (await enviosDeTexto(PHONE_PALAVRA, TEXTO_CONFIRMACAO_DESCADASTRO)).length > 0 || null);
    ok(Boolean(conf2), 'palavra "parar" recebe a confirmação');
    await enviarWebhook({ conversation_id: 'conv_f', message_id: 'msg_word_5', from: PHONE_PALAVRA, type: 'text', text: 'parar' });
    await sleep(800);
    ok((await enviosDeTexto(PHONE_PALAVRA, TEXTO_CONFIRMACAO_DESCADASTRO)).length === 1, 'segunda "parar" não repete a confirmação');
    void msgsClick;
  } catch (e: any) {
    failed++;
    console.error('ERRO no E2E de descadastro:', e?.message || e);
  } finally {
    await parar();
  }
  console.log(`\nE2E descadastro: ${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
