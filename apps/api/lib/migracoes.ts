/**
 * Runner de migrações versionadas (item 2.1 do checklist).
 *
 * - Cada migração tem uma versão única e fixa (ex.: "0001_base"). A ordem é a ordem da lista.
 * - Cada migração roda numa transação própria: se falhar, nada dela fica e ela não é registrada.
 * - O registro fica na tabela `schema_migrations`. Rodar de novo não reaplica nada.
 * - Migração já aplicada NUNCA é alterada: para mudar o banco, cria-se uma migração nova.
 */

/** Interface mínima do cliente do `pg` que o runner usa (fácil de testar). */
export interface ClienteSql {
  query: (texto: string, valores?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface Migracao {
  versao: string;
  descricao: string;
  sql: string;
}

export interface ResultadoMigracoes {
  aplicadas: string[];
  jaAplicadas: string[];
}

const VERSAO_VALIDA = /^[0-9]{4}_[a-z0-9_]+$/;

export function validarMigracoes(migracoes: Migracao[]): void {
  const vistas = new Set<string>();
  let anterior = '';
  for (const m of migracoes) {
    if (!VERSAO_VALIDA.test(m.versao)) throw new Error(`Versão de migração inválida: "${m.versao}" (use 0001_nome)`);
    if (vistas.has(m.versao)) throw new Error(`Versão de migração duplicada: ${m.versao}`);
    if (m.versao <= anterior) throw new Error(`Migrações fora de ordem: ${m.versao} vem depois de ${anterior}`);
    vistas.add(m.versao);
    anterior = m.versao;
  }
}

export async function aplicarMigracoes(
  cliente: ClienteSql,
  migracoes: Migracao[],
  iniciar: () => Promise<ClienteSql> = async () => cliente,
): Promise<ResultadoMigracoes> {
  validarMigracoes(migracoes);
  await cliente.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao TEXT PRIMARY KEY,
      descricao TEXT NOT NULL,
      aplicada_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);
  const existentes = await cliente.query('SELECT versao FROM schema_migrations');
  const jaFeitas = new Set(existentes.rows.map((r) => String(r.versao)));

  const aplicadas: string[] = [];
  const jaAplicadas: string[] = [];
  for (const m of migracoes) {
    if (jaFeitas.has(m.versao)) {
      jaAplicadas.push(m.versao);
      continue;
    }
    const t = await iniciar();
    await t.query('BEGIN');
    try {
      await t.query(m.sql);
      await t.query('INSERT INTO schema_migrations (versao, descricao) VALUES ($1, $2)', [m.versao, m.descricao]);
      await t.query('COMMIT');
      aplicadas.push(m.versao);
    } catch (erro) {
      await t.query('ROLLBACK');
      throw new Error(`Migração ${m.versao} (${m.descricao}) falhou e foi desfeita: ${(erro as Error).message}`);
    }
  }
  return { aplicadas, jaAplicadas };
}
