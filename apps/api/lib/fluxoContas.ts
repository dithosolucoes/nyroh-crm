import crypto from 'crypto';
import { cifrarSegredo, decifrarSegredo } from './cifraSegredos.js';

/**
 * Contas da FluxoAPI (hierarquia: BM -> conta -> números/instâncias).
 * Só funciona com a flag NYROH_FLUXO_CONTAS ligada e a migração 2026-11-fluxo-contas.sql aplicada.
 *
 * Regras:
 * - Segredos entram cifrados e NUNCA saem para a tela: a listagem devolve só "tem/não tem" e os 4 últimos caracteres.
 * - Decifrar só no servidor, na hora de usar (obterCredenciaisDaInstancia).
 */

export interface PoolSql {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface DadosConta {
  id?: string;
  nome: string;
  bmId?: string | null;
  apiKey?: string;
  apiSecret?: string;
  webhookSecret?: string;
}

export interface ContaListada {
  id: string;
  nome: string;
  bmId: string | null;
  temApiKey: boolean;
  temApiSecret: boolean;
  temWebhookSecret: boolean;
  instancias: Array<{ id: string; instanceId: string; numero: string | null; marcaId: string | null }>;
}

function novoId(prefixo: string): string {
  return `${prefixo}_${crypto.randomBytes(8).toString('hex')}`;
}

export async function listarContas(pool: PoolSql): Promise<ContaListada[]> {
  const contas = await pool.query(
    `SELECT id, nome, bm_id, api_key_cifrada IS NOT NULL AS tem_key, api_secret_cifrado IS NOT NULL AS tem_secret,
            webhook_secret_cifrado IS NOT NULL AS tem_webhook
       FROM fluxo_contas ORDER BY criado_em`
  );
  const instancias = await pool.query(
    `SELECT id, conta_id, instance_id, numero, marca_id FROM fluxo_instancias ORDER BY criado_em`
  );
  return contas.rows.map((c: any) => ({
    id: String(c.id),
    nome: String(c.nome),
    bmId: c.bm_id ?? null,
    temApiKey: Boolean(c.tem_key),
    temApiSecret: Boolean(c.tem_secret),
    temWebhookSecret: Boolean(c.tem_webhook),
    instancias: instancias.rows
      .filter((i: any) => String(i.conta_id) === String(c.id))
      .map((i: any) => ({ id: String(i.id), instanceId: String(i.instance_id), numero: i.numero ?? null, marcaId: i.marca_id ?? null })),
  }));
}

/** Cria ou atualiza uma conta. Segredos enviados são cifrados; campos não enviados mantêm o valor atual. */
export async function salvarConta(pool: PoolSql, dados: DadosConta): Promise<{ id: string }> {
  const nome = String(dados.nome || '').trim();
  if (!nome) throw new Error('Nome da conta é obrigatório.');

  // cifrarSegredo lança erro se NYROH_CHAVE_SEGREDOS faltar: nada é gravado nesse caso.
  const keyCifrada = dados.apiKey && String(dados.apiKey).trim() ? cifrarSegredo(String(dados.apiKey).trim()) : null;
  const secretCifrado = dados.apiSecret && String(dados.apiSecret).trim() ? cifrarSegredo(String(dados.apiSecret).trim()) : null;
  const webhookCifrado = dados.webhookSecret && String(dados.webhookSecret).trim() ? cifrarSegredo(String(dados.webhookSecret).trim()) : null;

  const id = dados.id || novoId('conta');
  await pool.query(
    `INSERT INTO fluxo_contas (id, nome, bm_id, api_key_cifrada, api_secret_cifrado, webhook_secret_cifrado, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       nome = EXCLUDED.nome,
       bm_id = EXCLUDED.bm_id,
       api_key_cifrada = COALESCE($4, fluxo_contas.api_key_cifrada),
       api_secret_cifrado = COALESCE($5, fluxo_contas.api_secret_cifrado),
       webhook_secret_cifrado = COALESCE($6, fluxo_contas.webhook_secret_cifrado),
       atualizado_em = CURRENT_TIMESTAMP`,
    [id, nome, dados.bmId ?? null, keyCifrada, secretCifrado, webhookCifrado]
  );
  return { id };
}

export async function registrarInstancia(
  pool: PoolSql,
  contaId: string,
  dados: { instanceId: string; numero?: string | null; marcaId?: string | null }
): Promise<{ id: string }> {
  const instanceId = String(dados.instanceId || '').trim();
  if (!instanceId) throw new Error('ID da instância é obrigatório.');
  const id = novoId('inst');
  await pool.query(
    `INSERT INTO fluxo_instancias (id, conta_id, instance_id, numero, marca_id) VALUES ($1, $2, $3, $4, $5)`,
    [id, contaId, instanceId, dados.numero ?? null, dados.marcaId ?? null]
  );
  return { id };
}

export interface CredenciaisDaInstancia {
  contaId: string;
  apiKey: string | null;
  apiSecret: string | null;
  webhookSecret: string | null;
}

/** Só para uso no servidor: decifra as credenciais da conta dona da instância. Nunca devolver para a tela. */
export async function obterCredenciaisDaInstancia(pool: PoolSql, instanceId: string): Promise<CredenciaisDaInstancia | null> {
  const r = await pool.query(
    `SELECT c.id, c.api_key_cifrada, c.api_secret_cifrado, c.webhook_secret_cifrado
       FROM fluxo_instancias i JOIN fluxo_contas c ON c.id = i.conta_id
      WHERE i.instance_id = $1`,
    [instanceId]
  );
  const linha = r.rows[0];
  if (!linha) return null;
  const abrir = (v: string | null) => (v ? decifrarSegredo(v) : null);
  return {
    contaId: String(linha.id),
    apiKey: abrir(linha.api_key_cifrada),
    apiSecret: abrir(linha.api_secret_cifrado),
    webhookSecret: abrir(linha.webhook_secret_cifrado),
  };
}
