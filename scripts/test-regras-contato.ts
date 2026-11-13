// Teste de integração do motor de regras de contato, com Postgres real.
// Uso: TEST_DATABASE_URL=postgres://... npm run test:regras
// Sem TEST_DATABASE_URL, o teste é pulado (não falha).
import pg from 'pg';
import { regrasDeContatoSql, invalidarCacheRegras } from '../shared/lib/uxRoutes.js';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log('⏭️  test:regras pulado: defina TEST_DATABASE_URL apontando para um banco de teste.');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: url });
let ok = 0, falhou = 0;
const v = (nome: string, cond: boolean, det = '') => {
  cond ? ok++ : falhou++;
  console.log(`${cond ? '✅' : '❌'} ${nome}${cond ? '' : ` — ${det}`}`);
};

async function zerar() {
  await pool.query(`TRUNCATE lead_messages, campaign_leads, campaign_batches, leads, brands RESTART IDENTITY CASCADE`);
  await pool.query(`DELETE FROM regras_contato`);
  await pool.query(`
    INSERT INTO regras_contato (id, nome, tipo, escopo, max_contatos, janela_horas, ativa) VALUES
      ('regra_um_por_dia', 'Um contato por dia', 'limite_janela', 'global', 1, NULL, TRUE),
      ('regra_pos_resposta', 'Não reenviar após resposta', 'apos_resposta', 'global', 1, NULL, TRUE)`);
  invalidarCacheRegras();
}

async function elegiveis(batch: string): Promise<string[]> {
  const sql = await regrasDeContatoSql(pool);
  const r = await pool.query(
    `SELECT id FROM campaign_leads WHERE batch_id = $1 AND status = 'STAGING' AND is_mobile = TRUE ${sql} ORDER BY id`,
    [batch]
  );
  return r.rows.map((x: any) => x.id);
}

async function main() {
  await zerar();
  await pool.query(`
    INSERT INTO brands (id, name) VALUES ('BR1', 'Nyroh'), ('BR2', 'Aquila');
    INSERT INTO campaign_batches (id, name, status, brand_id) VALUES ('S1', 'Safra Nyroh', 'draft', 'BR1'), ('S2', 'Safra Aquila', 'draft', 'BR2'), ('SH', 'Histórico', 'dispatched', 'BR1');
    INSERT INTO leads (id, name, phone_number) VALUES ('L1','Ana','31988880001'), ('L2','Bia','31988880002'), ('L3','Caio','31988880003'), ('L4','Dani','31988880004');
    -- L1: já recebeu hoje (outra safra) -> fora pela regra do dia
    INSERT INTO campaign_leads (id, batch_id, name, phone_number, is_mobile, status, sent_at) VALUES
      ('C0','SH','Ana','31988880001',TRUE,'QUARENTENA', CURRENT_TIMESTAMP),
      ('C1','S1','Ana','31988880001',TRUE,'STAGING', NULL),
      ('C2','S1','Bia','31988880002',TRUE,'STAGING', NULL),
      ('C3','S1','Caio','31988880003',TRUE,'STAGING', NULL),
      ('C4','S2','Dani','31988880004',TRUE,'STAGING', NULL);
    -- L3: respondeu há 10 dias -> fora pela regra "após resposta" (para sempre)
    INSERT INTO campaign_leads (id, batch_id, name, phone_number, is_mobile, status, sent_at, whatsapp_message_id) VALUES
      ('C5','SH','Caio','31988880003',TRUE,'QUARENTENA', CURRENT_TIMESTAMP - interval '10 days', 'wamid_x');
  `);

  console.log('\n## Regras padrão (devem reproduzir o comportamento antigo)');
  let e = await elegiveis('S1');
  v('Quem já recebeu hoje fica de fora (C1)', !e.includes('C1'), JSON.stringify(e));
  v('Quem não recebeu nada entra (C2)', e.includes('C2'), JSON.stringify(e));
  v('Quem respondeu antes fica de fora para sempre (C3)', !e.includes('C3'), JSON.stringify(e));

  console.log('\n## Limite por dia passa de 1 para 2');
  await pool.query(`UPDATE regras_contato SET max_contatos = 2 WHERE id = 'regra_um_por_dia'`);
  invalidarCacheRegras();
  e = await elegiveis('S1');
  v('Com limite 2, quem recebeu 1 hoje entra (C1)', e.includes('C1'), JSON.stringify(e));

  console.log('\n## Regra da marca: no máximo 1 por 7 dias só dentro da marca Nyroh');
  await pool.query(`UPDATE regras_contato SET max_contatos = 1 WHERE id = 'regra_um_por_dia'`);
  await pool.query(`INSERT INTO regras_contato (id, nome, tipo, escopo, marca_id, max_contatos, janela_horas, ativa)
                    VALUES ('r_marca', 'Nyroh 1 a cada 7 dias', 'limite_janela', 'marca', 'BR1', 1, 168, TRUE)`);
  // C4 (Dani) recebeu pela Aquila (BR2) há 1 dia: não conta para a regra da Nyroh
  await pool.query(`UPDATE campaign_leads SET sent_at = CURRENT_TIMESTAMP - interval '1 day', status='QUARENTENA' WHERE id = 'C4'`);
  invalidarCacheRegras();
  // C7: lead da safra Nyroh cujo telefone só recebeu da Aquila há 1 dia
  await pool.query(`INSERT INTO campaign_leads (id, batch_id, name, phone_number, is_mobile, status) VALUES ('C7','S1','Dani','31988880004',TRUE,'STAGING')`);
  e = await elegiveis('S1');
  v('Contato da Aquila não bloqueia a regra da Nyroh (C7 entra na safra Nyroh)', e.includes('C7'), JSON.stringify(e));
  // Agora C2 recebeu pela Nyroh há 2 dias: a regra da marca deve barrar
  await pool.query(`INSERT INTO campaign_leads (id, batch_id, name, phone_number, is_mobile, status, sent_at) VALUES ('C6','S1','Bia','31988880002',TRUE,'QUARENTENA', CURRENT_TIMESTAMP - interval '2 days')`);
  invalidarCacheRegras();
  e = await elegiveis('S1');
  v('Contato da própria marca nos últimos 7 dias barra (C2)', !e.includes('C2'), JSON.stringify(e));

  console.log('\n## Regra desativada não vale');
  await pool.query(`UPDATE regras_contato SET ativa = FALSE WHERE id IN ('r_marca','regra_pos_resposta')`);
  invalidarCacheRegras();
  e = await elegiveis('S1');
  v('Com a regra de resposta desligada, quem respondeu antes volta (C3)', e.includes('C3'), JSON.stringify(e));

  console.log(`\n${ok} passaram, ${falhou} falharam`);
  await pool.end();
  process.exitCode = falhou ? 1 : 0;
}

main().catch(async (err) => {
  console.error('ERRO:', err);
  await pool.end();
  process.exitCode = 1;
});
