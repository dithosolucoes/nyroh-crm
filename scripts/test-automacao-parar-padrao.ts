/**
 * Item 3.4: gravação da automação "Parar mensagens" atrás de NYROH_AUTOMACAO_PARAR_PADRAO.
 * - Flag desligada: nada é consultado nem gravado.
 * - Flag ligada (banco de teste, E2E_DATABASE_URL): criada uma vez, depois idempotente e sem
 *   sobrescrever edições. Nasce 'inativa'.
 * Rodar: npm run test:automacao-parar-padrao (o banco é opcional; sem E2E_DATABASE_URL, a parte de banco é pulada).
 */
import assert from 'node:assert/strict';
import pg from 'pg';
import { garantirAutomacaoPararPadrao, ID_AUTOMACAO_PARAR_PADRAO } from '../shared/lib/automacaoPararPadrao';
import { aplicarMigracoesArquivo, MIGRACOES_AUTOMACOES_RESPOSTAS } from '../shared/lib/migracoesArquivos';

let falhas = 0;
const testes: Array<[string, () => Promise<void>]> = [];
const test = (nome: string, fn: () => Promise<void>) => testes.push([nome, fn]);

test('flag desligada: não consulta nem grava nada', async () => {
  let chamadas = 0;
  const pool = { query: async () => { chamadas++; throw new Error('não deveria consultar'); } };
  assert.equal(await garantirAutomacaoPararPadrao(pool as any, {} as any), 'desligada');
  assert.equal(await garantirAutomacaoPararPadrao(pool as any, { NYROH_AUTOMACAO_PARAR_PADRAO: 'nao' } as any), 'desligada');
  assert.equal(chamadas, 0);
});

test('flag ligada no banco de teste: criada uma vez, depois idempotente e sem sobrescrever', async () => {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) { console.log('  (pulado: sem E2E_DATABASE_URL)'); return; }
  const pool = new pg.Pool({ connectionString: url });
  try {
    await aplicarMigracoesArquivo(pool, MIGRACOES_AUTOMACOES_RESPOSTAS);
    await pool.query('DELETE FROM automacoes_respostas WHERE id = $1', [ID_AUTOMACAO_PARAR_PADRAO]);
    const ligada = { NYROH_AUTOMACAO_PARAR_PADRAO: 'true' } as any;
    assert.equal(await garantirAutomacaoPararPadrao(pool, ligada), 'criada');
    assert.equal(await garantirAutomacaoPararPadrao(pool, ligada), 'ja_existe');
    const r = await pool.query('SELECT status, definicao FROM automacoes_respostas WHERE id = $1', [ID_AUTOMACAO_PARAR_PADRAO]);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].status, 'inativa');
    assert.equal(r.rows[0].definicao.gatilho.evento, 'cliente_pediu_parar');
    assert.equal(r.rows[0].definicao.passos[0].acao, 'marcar_optout');
    // Edição do usuário (ativar) não é sobrescrita pela próxima subida.
    await pool.query("UPDATE automacoes_respostas SET status = 'ativa' WHERE id = $1", [ID_AUTOMACAO_PARAR_PADRAO]);
    assert.equal(await garantirAutomacaoPararPadrao(pool, ligada), 'ja_existe');
    const depois = await pool.query('SELECT status FROM automacoes_respostas WHERE id = $1', [ID_AUTOMACAO_PARAR_PADRAO]);
    assert.equal(depois.rows[0].status, 'ativa');
    await pool.query('DELETE FROM automacoes_respostas WHERE id = $1', [ID_AUTOMACAO_PARAR_PADRAO]);
  } finally {
    await pool.end();
  }
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); console.log(`  ✅ ${nome}`); }
    catch (e: any) { falhas++; console.log(`  ❌ ${nome}\n     ${e?.message || e}`); }
  }
  console.log('');
  if (falhas > 0) { console.log(`${falhas} teste(s) falharam.`); process.exit(1); }
  console.log('Todos os testes de automação "Parar mensagens" passaram.');
})();
