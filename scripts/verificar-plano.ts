/**
 * Verificação do "Plano 100% — Automações e backup". SOMENTE LEITURA.
 * Não altera banco, fila, flags nem dados.
 *
 * Uso no shell do serviço no Railway (usa DATABASE_URL do próprio serviço):
 *   npx tsx scripts/verificar-plano.ts
 */
import pg from 'pg';

const ok = (msg: string) => console.log(`  OK     ${msg}`);
const falta = (msg: string) => console.log(`  FALTA  ${msg}`);
const info = (msg: string) => console.log(`  --     ${msg}`);
const manual = (msg: string) => console.log(`  MANUAL ${msg}`);
const ligada = (v?: string) => String(v ?? '').trim().toLowerCase() === 'true';

const TABELAS = [
  'leads_estado',
  'automacoes_auditoria',
  'automacoes_fila',
  'automacoes_respostas',
  'automacoes_config',
  'lead_tags',
];

async function main() {
  let falhas = 0;
  console.log('\n== 1. Variáveis de ambiente (valor exibido, sem segredos) ==');
  const flags = [
    'NYROH_AUTOMACOES_PERSISTENCIA',
    'NYROH_AUTOMACOES_EXECUCAO',
    'NYROH_AUTOMACOES_PAUSA_GERAL',
    'VITE_MOSTRAR_AUTOMACOES',
  ];
  for (const f of flags) {
    const v = process.env[f];
    info(`${f} = ${v === undefined ? '(ausente)' : JSON.stringify(v)}`);
  }
  if (ligada(process.env.NYROH_AUTOMACOES_PERSISTENCIA)) ok('Persistência de automações ligada');
  else { falha(); falta('NYROH_AUTOMACOES_PERSISTENCIA não é true (ausente ou diferente de true)'); }
  if (ligada(process.env.NYROH_AUTOMACOES_PAUSA_GERAL)) info('Pausa geral LIGADA: o processador não executa nada');
  else ok('Pausa geral desligada');
  if (ligada(process.env.NYROH_AUTOMACOES_EXECUCAO)) info('Execução LIGADA (decisão sua, fase H4)');
  else ok('Execução desligada (padrão seguro)');

  console.log('\n== 2. Banco de dados ==');
  const url = process.env.DATABASE_URL;
  if (!url) {
    falha();
    falta('DATABASE_URL ausente: não dá para checar o banco daqui');
  } else {
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
      max: 1,
    });
    try {
      const existentes = await pool.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [TABELAS]
      );
      const nomes = new Set(existentes.rows.map((r: any) => r.table_name));
      for (const t of TABELAS) {
        if (!nomes.has(t)) { falha(); falta(`tabela ${t} não existe`); continue; }
        const c = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
        ok(`tabela ${t} existe (${c.rows[0].n} linha(s))`);
      }

      const colRaw = await pool.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = 'campaign_leads' AND column_name = 'raw_data'`
      );
      if (colRaw.rowCount) ok('campaign_leads.raw_data existe (campos do JSON do lead)');
      else { falha(); falta('campaign_leads.raw_data não existe'); }

      const porStatus = await pool.query(
        `SELECT status, COUNT(*)::int AS n FROM campaign_leads GROUP BY status ORDER BY status`
      );
      info('campaign_leads por status: ' + porStatus.rows.map((r: any) => `${r.status}=${r.n}`).join(', '));

      const ultimasAuditorias = await pool.query(
        `SELECT COUNT(*)::int AS n FROM automacoes_auditoria WHERE criado_em > now() - interval '7 days'`
      ).catch(() => null);
      if (ultimasAuditorias) info(`auditoria: ${ultimasAuditorias.rows[0].n} registro(s) nos últimos 7 dias`);
    } catch (e: any) {
      falha();
      falta(`erro ao consultar o banco: ${e.message}`);
    } finally {
      await pool.end();
    }
  }

  console.log('\n== 3. Itens que não dá para verificar daqui (decisão ou tela) ==');
  manual('F1: decisões da seção 13 do blueprint (só você)');
  manual('F2: quais ações podem enviar mensagem de fato (só você)');
  manual('I1: backup do Postgres confirmado por você');
  manual('E6: teste da tela com dados reais (a checar na tela)');
  manual('H1-H4: envio, fora até aprovação específica');

  console.log('\n== 4. Testes e build (rode no repo, fora deste script) ==');
  info('npm test  → esperado: 0 falhando');
  info('npx tsc --noEmit && npm run build');

  console.log(`\nResultado: ${falhas === 0 ? 'nenhuma falha automática' : `${falhas} falha(s) automática(s)`}`);
  function falha() { falhas++; }
}

main().catch(e => {
  console.error('Erro na verificação:', e);
  process.exit(1);
});
