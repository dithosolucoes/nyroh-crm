/**
 * QA das pendências do checklist: API (regras e permissões) + tela (opcional).
 *
 * Pré-requisitos: CRM no ar, migração de UX aplicada e NYROH_APLICAR_MIGRACOES_UX=true.
 *
 * Rodar dentro do container do app (no PC, pasta "Nyroh Crm atualizado v2"):
 *   docker compose -f docker-compose.local.yml cp scripts/qa-tudo.ts app:/app/scripts/qa-tudo.ts
 *   docker compose -f docker-compose.local.yml exec -e QA_ADMIN_EMAIL=... -e QA_ADMIN_SENHA=... -e QA_VENDEDOR_EMAIL=... -e QA_VENDEDOR_SENHA=... app npx tsx scripts/qa-tudo.ts
 *
 * Com a parte de tela (QA_UI=1), instale o Chromium uma vez dentro do container:
 *   docker compose -f docker-compose.local.yml exec app sh -c "npm i --no-save playwright && npx playwright install --with-deps chromium"
 *   e rode de novo acrescentando -e QA_UI=1
 *
 * Saída: resumo no terminal e relatório em /app/qa-resultados/relatorio.md (+ capturas em qa-resultados/telas).
 *
 * Fora do alcance deste script: entrega real no WhatsApp (depende da Meta/FluxoAPI) e julgamento
 * estético. A tela checa o que dá para medir: tamanho mínimo de texto, rolagem horizontal no celular
 * e presença dos elementos principais.
 */
import fs from 'fs';
import path from 'path';

type Status = 'PASSOU' | 'FALHOU' | 'PENDENTE' | 'PULADO' | 'AVISO';
interface Resultado { grupo: string; nome: string; status: Status; detalhe?: string }

const resultados: Resultado[] = [];
let grupoAtual = '';
const ICONE: Record<Status, string> = { PASSOU: '✅', FALHOU: '❌', PENDENTE: '⏳', PULADO: '⏭️', AVISO: '⚠️' };

const grupo = (nome: string) => { grupoAtual = nome; console.log(`\n## ${nome}`); };
const registrar = (nome: string, status: Status, detalhe?: string) => {
  resultados.push({ grupo: grupoAtual, nome, status, detalhe });
  console.log(`  ${ICONE[status]} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
};
const verifica = (nome: string, cond: boolean, detalheFalha = '') =>
  registrar(nome, cond ? 'PASSOU' : 'FALHOU', cond ? undefined : detalheFalha);

const BASE = process.env.QA_BASE || 'http://localhost:3000';
const stamp = Date.now().toString(36);
const RESULT_DIR = path.resolve('qa-resultados');
const TAMANHOS = [20, 50, 100, 300, 500, 1000, 5000, 10000, 50000, 100000];

/** Mensagem curta de erro vinda do servidor. */
const msg = (b: any): string => (typeof b === 'string' ? b.slice(0, 160) : (b?.error || JSON.stringify(b).slice(0, 160)));

/** Pega a lista de um corpo que pode ser um array ou um objeto com um array dentro. */
const arr = (b: any): any[] => {
  if (Array.isArray(b)) return b;
  if (b && typeof b === 'object') {
    const achado = Object.values(b).find(Array.isArray);
    if (achado) return achado as any[];
  }
  return [];
};

class Sessao {
  private cookie = '';
  user: any = null;
  constructor(public nome: string) {}

  async req(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(BASE + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await res.text();
    let body: any = texto;
    try { body = JSON.parse(texto); } catch { /* resposta não é JSON */ }
    return { status: res.status, body };
  }

  async entrar(email: string, senha: string): Promise<boolean> {
    const res = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
    });
    const par = (res.headers.get('set-cookie') || '').split(';')[0];
    if (!res.ok || !par) return false;
    this.cookie = par;
    const me = await this.req('GET', '/api/auth/me');
    this.user = me.body?.user ?? me.body;
    return true;
  }
}

async function testesApi(admin: Sessao, vendedor: Sessao, vendedorLogado: boolean): Promise<boolean> {
  grupo('1. Migração de UX ligada');
  const marcas0 = await admin.req('GET', '/api/brands');
  verifica('Rotas de UX respondem (não 503)', marcas0.status === 200, `status ${marcas0.status}: ${msg(marcas0.body)}`);
  if (marcas0.status !== 200) return false;

  grupo('2. Marcas e números (N:N)');
  const n1 = await admin.req('POST', '/api/phone-numbers', { label: `QA Número 1 ${stamp}`, phoneDisplay: '+55 31 00000-0001' });
  const n2 = await admin.req('POST', '/api/phone-numbers', { label: `QA Número 2 ${stamp}`, phoneDisplay: '+55 31 00000-0002' });
  verifica('Cadastra número 1', n1.status === 201 && !!n1.body?.id, msg(n1.body));
  verifica('Cadastra número 2', n2.status === 201 && !!n2.body?.id, msg(n2.body));

  const ba = await admin.req('POST', '/api/brands', { name: `QA Marca A ${stamp}`, services: 'Site\nSEO', messageTemplates: [{ name: 'Oi', text: 'Olá' }] });
  const bb = await admin.req('POST', '/api/brands', { name: `QA Marca B ${stamp}`, services: 'Tráfego', messageTemplates: [] });
  verifica('Cadastra marca A', ba.status === 201 && !!ba.body?.id, msg(ba.body));
  verifica('Cadastra marca B', bb.status === 201 && !!bb.body?.id, msg(bb.body));

  const idN1 = n1.body?.id, idN2 = n2.body?.id, idA = ba.body?.id, idB = bb.body?.id;
  if (idN1 && idN2 && idA && idB) {
    const v1 = await admin.req('PUT', `/api/brands/${idA}/numbers`, { phoneNumberIds: [idN1, idN2] });
    const v2 = await admin.req('PUT', `/api/brands/${idB}/numbers`, { phoneNumberIds: [idN1] });
    verifica('Marca A recebe os números 1 e 2', v1.status === 200, msg(v1.body));
    verifica('Marca B recebe o número 1 (mesmo número em duas marcas)', v2.status === 200, msg(v2.body));

    const marcas = arr(((await admin.req('GET', '/api/brands')).body));
    const mA = marcas.find((m) => m.id === idA);
    const mB = marcas.find((m) => m.id === idB);
    verifica('Marca A mostra os 2 números', mA?.numberIds?.length === 2, `numberIds: ${JSON.stringify(mA?.numberIds)}`);
    verifica('Marca B mostra o número 1', !!mB?.numberIds?.includes(idN1), `numberIds: ${JSON.stringify(mB?.numberIds)}`);

    const nums = arr((await admin.req('GET', '/api/phone-numbers')).body);
    const nn1 = nums.find((n) => n.id === idN1);
    verifica('Número 1 aparece nas duas marcas (N:N nos dois sentidos)', !!nn1?.brandIds?.includes(idA) && !!nn1?.brandIds?.includes(idB), `brandIds: ${JSON.stringify(nn1?.brandIds)}`);
  }

  if (vendedorLogado) {
    const r = await vendedor.req('POST', '/api/brands', { name: 'QA não deveria criar' });
    verifica('Vendedor não cria marca (403)', r.status === 403, `status ${r.status}`);
  } else registrar('Vendedor não cria marca (403)', 'PULADO', 'sem login de vendedor');

  grupo('3. Campanha (safra) ligada à marca');
  const safras = arr((await admin.req('GET', '/api/campaign/batches')).body);
  if (!safras.length) registrar('Liga safra a uma marca', 'PULADO', 'não há safra cadastrada: suba uma safra e rode de novo');
  else if (idA) {
    const safra = safras[0];
    const r = await admin.req('PUT', `/api/campaign/batches/${safra.id}/brand`, { brandId: idA });
    verifica('Liga a safra à marca A', r.status === 200, msg(r.body));
    await admin.req('PUT', `/api/campaign/batches/${safra.id}/brand`, { brandId: null });
  }

  grupo('4. Central de leads (remessas e blocos)');
  const central = await admin.req('GET', '/api/central/remessas');
  verifica('Central responde com remessas e contagem sem remessa', central.status === 200 && Array.isArray(central.body?.remessas) && typeof central.body?.semRemessa === 'number', msg(central.body));
  verifica('Tamanhos de bloco: 20 … 100.000', JSON.stringify(central.body?.tamanhosBloco) === JSON.stringify(TAMANHOS), `recebido: ${JSON.stringify(central.body?.tamanhosBloco)}`);
  const rem = await admin.req('POST', '/api/central/remessas', { name: `QA Remessa ${stamp}` });
  verifica('Cria remessa de origem', rem.status === 201, msg(rem.body));

  const leadsAdmin = arr((await admin.req('GET', '/api/leads')).body);
  const ids20 = leadsAdmin.map((l) => l.id).slice(0, 20);
  if (ids20.length < 20) registrar('Bloco de 20 leads por ID', 'PULADO', `só ${ids20.length} leads na base; precisa de 20`);
  else {
    const sel = await admin.req('POST', '/api/central/selections', { name: `QA bloco 20 ${stamp}`, size: 20, leadIds: ids20 });
    verifica('Cria bloco de 20 leads por ID', sel.status === 201, msg(sel.body));
  }
  const fora = await admin.req('POST', '/api/central/selections', { size: 7, leadIds: ['x1', 'x2', 'x3'] });
  verifica('Recusa tamanho de bloco fora da lista (7 com 3 IDs)', fora.status === 400, `status ${fora.status}`);

  grupo('5. Bloqueio com motivo, sugestão e aprovação');
  if (!vendedorLogado) {
    registrar('Fluxo de bloqueio', 'PULADO', 'sem login de vendedor');
  } else {
    const leadsV = arr((await vendedor.req('GET', '/api/leads')).body);
    const meu = leadsV[0];
    if (!meu) registrar('Fluxo de bloqueio', 'PULADO', 'vendedor sem leads atribuídos');
    else {
      const motivoInvalido = await vendedor.req('POST', `/api/leads/${meu.id}/block-requests`, { reasonCode: 'xyz' });
      verifica('Recusa motivo inexistente (400)', motivoInvalido.status === 400, `status ${motivoInvalido.status}`);
      const outroSemTexto = await vendedor.req('POST', `/api/leads/${meu.id}/block-requests`, { reasonCode: 'outro', reasonText: '' });
      verifica('Motivo "Outro" exige descrição (400)', outroSemTexto.status === 400, `status ${outroSemTexto.status}`);

      const pedido = await vendedor.req('POST', `/api/leads/${meu.id}/block-requests`, { reasonCode: 'sem_whatsapp' });
      verifica('Vendedor sugere bloqueio no próprio lead (pendente)', pedido.status === 201 && pedido.body?.status === 'pendente', msg(pedido.body));
      const idPedido = pedido.body?.id;

      const pendentes = arr((await admin.req('GET', '/api/block-requests?status=pendente')).body);
      verifica('Admin vê o pedido na fila de pendentes', pendentes.some((p) => p.id === idPedido));

      const historico = arr((await vendedor.req('GET', `/api/leads/${meu.id}/block-requests`)).body);
      verifica('Histórico do lead mostra o pedido', historico.some((h) => h.id === idPedido));

      const decideVendedor = await vendedor.req('PATCH', `/api/block-requests/${idPedido}`, { decision: 'aprovar' });
      verifica('Vendedor não aprova bloqueio (403)', decideVendedor.status === 403, `status ${decideVendedor.status}`);

      const aprova = await admin.req('PATCH', `/api/block-requests/${idPedido}`, { decision: 'aprovar', note: 'QA' });
      verifica('Admin aprova o bloqueio', aprova.status === 200, msg(aprova.body));
      const aprovaDeNovo = await admin.req('PATCH', `/api/block-requests/${idPedido}`, { decision: 'aprovar' });
      verifica('Pedido já decidido não muda de novo (409)', aprovaDeNovo.status === 409, `status ${aprovaDeNovo.status}`);

      const visiveis = arr((await vendedor.req('GET', '/api/leads')).body);
      verifica('Lead bloqueado some da lista do vendedor', !visiveis.some((l) => l.id === meu.id));

      const histAdmin = arr((await admin.req('GET', `/api/leads/${meu.id}/block-requests`)).body);
      verifica('Histórico guarda o status "aprovado"', histAdmin.some((h) => h.status === 'aprovado'));

      const segundo = leadsV[1];
      if (!segundo) registrar('Recusar pedido mantém o lead', 'PULADO', 'vendedor tem só 1 lead');
      else {
        const p2 = await vendedor.req('POST', `/api/leads/${segundo.id}/block-requests`, { reasonCode: 'ja_atendido' });
        const rec = await admin.req('PATCH', `/api/block-requests/${p2.body?.id}`, { decision: 'recusar', note: 'QA' });
        verifica('Admin recusa pedido (200)', rec.status === 200, msg(rec.body));
        const aindaVisivel = arr((await vendedor.req('GET', '/api/leads')).body);
        verifica('Pedido recusado mantém o lead na base', aindaVisivel.some((l) => l.id === segundo.id));
      }

      const todosAdmin = arr((await admin.req('GET', '/api/leads')).body);
      const alheio = todosAdmin.find((l) => l.salespersonId && l.salespersonId !== vendedor.user?.salespersonId);
      if (!alheio) registrar('Vendedor não sugere bloqueio em lead de outro (403)', 'PULADO', 'não há lead de outro vendedor na base');
      else {
        const r = await vendedor.req('POST', `/api/leads/${alheio.id}/block-requests`, { reasonCode: 'sem_whatsapp' });
        verifica('Vendedor não sugere bloqueio em lead de outro (403)', r.status === 403, `status ${r.status}`);
      }
    }
  }

  grupo('6. Vendedor vê só os próprios leads');
  const meuSp = vendedor.user?.salespersonId;
  if (!vendedorLogado) registrar('Lista do vendedor', 'PULADO', 'sem login de vendedor');
  else if (!meuSp) registrar('Lista do vendedor', 'PULADO', 'não achei salespersonId em /api/auth/me');
  else {
    const ls = arr((await vendedor.req('GET', '/api/leads')).body);
    verifica('Todos os leads do vendedor são dele', ls.every((l) => l.salespersonId === meuSp), 'há lead de outro vendedor na lista');
  }

  grupo('7. Regras pedidas e ainda não implementadas');
  registrar(
    'Um contato por lead por dia, somando todas as marcas',
    'PENDENTE',
    'não implementado: nada no servidor impede abordar o mesmo lead por duas marcas no mesmo dia'
  );

  grupo('8. Disparo: falhou, entregue, lido');
  const cl = arr((await admin.req('GET', '/api/campaign/leads?limit=5')).body);
  if (!cl.length) registrar('Leads de campanha trazem estado de entrega', 'PULADO', 'sem leads de campanha para checar');
  else verifica('Leads de campanha trazem estado de entrega (deliveryStatus)', cl.every((i) => 'deliveryStatus' in i), 'campo deliveryStatus ausente na resposta');
  registrar('Transição real para entregue / lido / falhou', 'PULADO', 'depende de envio real pela FluxoAPI/Meta: fora do alcance deste teste');

  return true;
}

async function testesTela(emailAdmin: string, senhaAdmin: string, emailVend: string, senhaVend: string): Promise<void> {
  grupo('9. Tela (navegador)');
  let pw: any;
  try {
    const nomeModulo = 'playwright';
    pw = await import(nomeModulo);
  } catch {
    registrar('Playwright instalado', 'PULADO', 'rode o comando de instalação do Chromium (veja o topo do arquivo)');
    return;
  }
  const pasta = path.join(RESULT_DIR, 'telas');
  fs.mkdirSync(pasta, { recursive: true });
  const browser = await pw.chromium.launch();

  const entrar = async (page: any, email: string, senha: string): Promise<boolean> => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(senha);
    await page.getByRole('button', { name: /entrar no sistema/i }).click();
    await page.waitForTimeout(3000);
    return (await page.locator('input[type="password"]').count()) === 0;
  };

  const rolagemHorizontal = async (page: any): Promise<number> =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  const textosPequenos = async (page: any): Promise<number> =>
    page.evaluate(() => {
      let n = 0;
      document.querySelectorAll('body *').forEach((el) => {
        const temTexto = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim());
        if (!temTexto) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (parseFloat(getComputedStyle(el).fontSize) < 12) n++;
      });
      return n;
    });

  try {
    // ---- Admin ----
    const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pa = await ctxA.newPage();
    const logouAdmin = await entrar(pa, emailAdmin, senhaAdmin);
    verifica('Tela: admin entra', logouAdmin, 'continua na tela de login');
    if (logouAdmin) {
      await pa.screenshot({ path: path.join(pasta, '01-admin-inicio.png') });

      const pertoDeTexto = async (re: RegExp) => pa.getByText(re).first().isVisible().catch(() => false);

      await pa.getByText(/^Estrutura$/).first().click().catch(() => {});
      await pa.waitForTimeout(800);
      verifica('Tela: aba Estrutura abre', await pertoDeTexto(/central de leads/i));
      for (const aba of ['Central de leads', 'Marcas', 'Números', 'Bloqueios pendentes']) {
        verifica(`Tela: Estrutura tem a aba "${aba}"`, await pertoDeTexto(new RegExp(aba, 'i')));
      }
      await pa.screenshot({ path: path.join(pasta, '02-estrutura.png') });

      await pa.getByText(/disparos?/i).first().click().catch(() => {});
      await pa.waitForTimeout(800);
      for (const passo of ['Subir', 'Montar', 'Disparar']) {
        verifica(`Tela: disparos mostra o passo "${passo}"`, await pertoDeTexto(new RegExp(`^${passo}$`, 'i')));
      }
      await pa.screenshot({ path: path.join(pasta, '03-disparos.png') });

      await pa.keyboard.press('Control+k');
      await pa.waitForTimeout(500);
      const busca = pa.getByPlaceholder(/buscar|pesquisar/i).first();
      verifica('Tela: ⌘K / Ctrl+K abre a busca', await busca.isVisible().catch(() => false));
      await pa.screenshot({ path: path.join(pasta, '04-busca-ctrl-k.png') });
      await pa.keyboard.press('Escape');

      const pequenos = await textosPequenos(pa);
      if (pequenos === 0) registrar('Tela: nenhum texto menor que 12px (desktop)', 'PASSOU');
      else registrar('Tela: textos menores que 12px (desktop)', 'AVISO', `${pequenos} elementos: revisar legibilidade`);

      await pa.setViewportSize({ width: 390, height: 844 });
      await pa.waitForTimeout(800);
      const estoura = await rolagemHorizontal(pa);
      verifica('Tela: sem rolagem horizontal no celular (390px)', estoura <= 1, `a página passa ${estoura}px da largura`);
      await pa.screenshot({ path: path.join(pasta, '05-admin-celular.png') });
    }

    // ---- Vendedor ----
    if (!emailVend || !senhaVend) {
      registrar('Tela: vendedor', 'PULADO', 'defina QA_VENDEDOR_EMAIL e QA_VENDEDOR_SENHA');
    } else {
      const ctxV = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const pv = await ctxV.newPage();
      const logouVend = await entrar(pv, emailVend, senhaVend);
      verifica('Tela: vendedor entra', logouVend, 'continua na tela de login');
      if (logouVend) {
        await pv.screenshot({ path: path.join(pasta, '06-vendedor-inicio.png') });
        verifica('Tela: vendedor não vê "Estrutura"', (await pv.getByText(/^Estrutura$/).count()) === 0);

        await pv.getByText(/meu dia/i).first().click().catch(() => {});
        await pv.waitForTimeout(800);
        verifica('Tela: "Meu dia" abre', await pv.getByText(/ligar hoje|sem contato ainda|interessados/i).first().isVisible().catch(() => false));
        await pv.screenshot({ path: path.join(pasta, '07-meu-dia.png') });

        const sugerir = pv.getByRole('button', { name: /sugerir bloqueio/i }).first();
        if ((await sugerir.count()) === 0) registrar('Tela: "Sugerir bloqueio" no Meu dia', 'PULADO', 'nenhum lead em Meu dia para testar');
        else {
          await sugerir.click();
          await pv.waitForTimeout(500);
          const caixa = pv.getByRole('dialog').first();
          verifica('Tela: "Sugerir bloqueio" abre a caixa de motivo', await caixa.isVisible().catch(() => false));
          await pv.screenshot({ path: path.join(pasta, '08-sugerir-bloqueio.png') });
          await pv.keyboard.press('Escape');
        }

        await pv.setViewportSize({ width: 390, height: 844 });
        await pv.waitForTimeout(800);
        const estouraV = await rolagemHorizontal(pv);
        verifica('Tela: vendedor sem rolagem horizontal no celular', estouraV <= 1, `a página passa ${estouraV}px da largura`);
        await pv.screenshot({ path: path.join(pasta, '09-vendedor-celular.png') });
      }
    }

    registrar('Revisão visual de espaçamento e hierarquia', 'PENDENTE', 'o script não julga estética: abra as capturas em qa-resultados/telas e confira');
    registrar('Modal de detalhe do lead (abas e campos)', 'PENDENTE', 'não automatizado: conferir manualmente');
  } finally {
    await browser.close();
  }
}

function gravarRelatorio(): void {
  fs.mkdirSync(RESULT_DIR, { recursive: true });
  const linhas: string[] = [`# Relatório de QA — ${new Date().toISOString()}`, '', `Base: ${BASE}`, ''];
  const grupos = [...new Set(resultados.map((r) => r.grupo))];
  for (const g of grupos) {
    linhas.push(`## ${g}`, '', '| Status | Teste | Detalhe |', '| --- | --- | --- |');
    for (const r of resultados.filter((x) => x.grupo === g)) {
      linhas.push(`| ${ICONE[r.status]} ${r.status} | ${r.nome} | ${r.detalhe ?? ''} |`);
    }
    linhas.push('');
  }
  fs.writeFileSync(path.join(RESULT_DIR, 'relatorio.md'), linhas.join('\n'), 'utf8');
}

function finalizar(): void {
  const cont = (s: Status) => resultados.filter((r) => r.status === s).length;
  console.log('\n==============================');
  console.log(`✅ passaram: ${cont('PASSOU')}   ❌ falharam: ${cont('FALHOU')}   ⏳ pendentes: ${cont('PENDENTE')}   ⚠️ avisos: ${cont('AVISO')}   ⏭️ pulados: ${cont('PULADO')}`);
  gravarRelatorio();
  console.log(`Relatório: ${path.join(RESULT_DIR, 'relatorio.md')}`);
  process.exitCode = cont('FALHOU') > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const emailAdmin = process.env.QA_ADMIN_EMAIL || '';
  const senhaAdmin = process.env.QA_ADMIN_SENHA || '';
  const emailVend = process.env.QA_VENDEDOR_EMAIL || '';
  const senhaVend = process.env.QA_VENDEDOR_SENHA || '';

  grupo('0. Acesso');
  if (!emailAdmin || !senhaAdmin) {
    registrar('Login do admin', 'PULADO', 'defina QA_ADMIN_EMAIL e QA_ADMIN_SENHA');
    return finalizar();
  }
  const admin = new Sessao('admin');
  let okAdmin = false;
  try {
    okAdmin = await admin.entrar(emailAdmin, senhaAdmin);
  } catch {
    registrar('Servidor responde', 'FALHOU', `não consegui falar com ${BASE}: o CRM está ligado? (QA_BASE)`);
    return finalizar();
  }
  verifica('Login do admin', okAdmin, 'não entrou: confira e-mail e senha');
  if (!okAdmin) return finalizar();

  const vendedor = new Sessao('vendedor');
  const vendedorLogado = !!emailVend && !!senhaVend && (await vendedor.entrar(emailVend, senhaVend));
  registrar('Login do vendedor', vendedorLogado ? 'PASSOU' : 'PULADO', vendedorLogado ? undefined : 'defina QA_VENDEDOR_EMAIL e QA_VENDEDOR_SENHA');

  const apiOk = await testesApi(admin, vendedor, vendedorLogado);

  if (process.env.QA_UI === '1' && apiOk) await testesTela(emailAdmin, senhaAdmin, emailVend, senhaVend);
  else if (process.env.QA_UI === '1') registrar('Tela', 'PULADO', 'a API não respondeu; corrija antes');

  finalizar();
}

main().catch((e) => {
  console.error('Erro inesperado no teste:', e);
  process.exitCode = 1;
});
