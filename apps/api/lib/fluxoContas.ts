import crypto from 'crypto';
import { cifrarSegredo, decifrarSegredo } from './cifraSegredos.js';

/**
 * Contas da FluxoAPI (hierarquia: BM -> conta -> números).
 * Só funciona com a flag NYROH_FLUXO_CONTAS ligada e a migração 2026-11-fluxo-contas.sql aplicada.
 *
 * Regras:
 * - Segredos entram cifrados e NUNCA saem para a tela. A listagem devolve só "tem/não tem".
 * - Decifrar só no servidor, na hora de usar (obterCredenciaisDaConta, segredosWebhookFluxo).
 * - O vínculo número -> marca é decisão do operador (salvarVinculos). A descoberta só sugere.
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
  metaToken?: string;
}

export interface NumeroVinculado {
  id: string;
  instanceId: string | null;
  metaPhoneNumberId: string | null;
  numero: string | null;
  wabaId: string | null;
  bmId: string | null;
  marcaId: string | null;
  ignorado: boolean;
  ultimoEventoEm: string | null;
}

export interface ContaListada {
  id: string;
  nome: string;
  bmId: string | null;
  temApiKey: boolean;
  temApiSecret: boolean;
  temWebhookSecret: boolean;
  temMetaToken: boolean;
  numeros: NumeroVinculado[];
}

export interface VinculoEntrada {
  instanceId?: string | null;
  metaPhoneNumberId?: string | null;
  numero?: string | null;
  wabaId?: string | null;
  bmId?: string | null;
  /** null = número ainda sem marca (aparece como pendente). */
  marcaId?: string | null;
  /** true = operador decidiu não usar este número no CRM. */
  ignorado?: boolean;
}

function novoId(prefixo: string): string {
  return `${prefixo}_${crypto.randomBytes(8).toString('hex')}`;
}

const cifrarOpcional = (v: string | undefined) => (v && String(v).trim() ? cifrarSegredo(String(v).trim()) : null);

export async function listarContas(pool: PoolSql): Promise<ContaListada[]> {
  const contas = await pool.query(
    `SELECT id, nome, bm_id, api_key_cifrada IS NOT NULL AS tem_key, api_secret_cifrado IS NOT NULL AS tem_secret,
            webhook_secret_cifrado IS NOT NULL AS tem_webhook, meta_token_cifrado IS NOT NULL AS tem_meta
       FROM fluxo_contas ORDER BY criado_em`
  );
  const numeros = await pool.query(
    `SELECT id, conta_id, instance_id, meta_phone_number_id, numero, waba_id, bm_id, marca_id, ignorado, ultimo_evento_em
       FROM fluxo_instancias ORDER BY criado_em`
  );
  return contas.rows.map((c: any) => ({
    id: String(c.id),
    nome: String(c.nome),
    bmId: c.bm_id ?? null,
    temApiKey: Boolean(c.tem_key),
    temApiSecret: Boolean(c.tem_secret),
    temWebhookSecret: Boolean(c.tem_webhook),
    temMetaToken: Boolean(c.tem_meta),
    numeros: numeros.rows
      .filter((i: any) => String(i.conta_id) === String(c.id))
      .map((i: any) => ({
        id: String(i.id),
        instanceId: i.instance_id ?? null,
        metaPhoneNumberId: i.meta_phone_number_id ?? null,
        numero: i.numero ?? null,
        wabaId: i.waba_id ?? null,
        bmId: i.bm_id ?? null,
        marcaId: i.marca_id ?? null,
        ignorado: Boolean(i.ignorado),
        ultimoEventoEm: i.ultimo_evento_em ? new Date(i.ultimo_evento_em).toISOString() : null,
      })),
  }));
}

/** Cria ou atualiza uma conta. Segredos enviados são cifrados; campos não enviados mantêm o valor atual. */
export async function salvarConta(pool: PoolSql, dados: DadosConta): Promise<{ id: string }> {
  const nome = String(dados.nome || '').trim();
  if (!nome) throw new Error('Nome da conta é obrigatório.');

  // cifrarSegredo lança erro se NYROH_CHAVE_SEGREDOS faltar: nada é gravado nesse caso.
  const keyCifrada = cifrarOpcional(dados.apiKey);
  const secretCifrado = cifrarOpcional(dados.apiSecret);
  const webhookCifrado = cifrarOpcional(dados.webhookSecret);
  const metaCifrado = cifrarOpcional(dados.metaToken);

  const id = dados.id || novoId('conta');
  await pool.query(
    `INSERT INTO fluxo_contas (id, nome, bm_id, api_key_cifrada, api_secret_cifrado, webhook_secret_cifrado, meta_token_cifrado, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       nome = EXCLUDED.nome,
       bm_id = EXCLUDED.bm_id,
       api_key_cifrada = COALESCE($4, fluxo_contas.api_key_cifrada),
       api_secret_cifrado = COALESCE($5, fluxo_contas.api_secret_cifrado),
       webhook_secret_cifrado = COALESCE($6, fluxo_contas.webhook_secret_cifrado),
       meta_token_cifrado = COALESCE($7, fluxo_contas.meta_token_cifrado),
       atualizado_em = CURRENT_TIMESTAMP`,
    [id, nome, dados.bmId ?? null, keyCifrada, secretCifrado, webhookCifrado, metaCifrado]
  );
  return { id };
}

/**
 * Grava a decisão do operador para cada número descoberto. Chave de identidade:
 * meta_phone_number_id (quando existe) ou instance_id. Repetir a operação atualiza, não duplica.
 */
export async function salvarVinculos(pool: PoolSql, contaId: string, vinculos: VinculoEntrada[]): Promise<{ gravados: number }> {
  let gravados = 0;
  for (const v of vinculos) {
    const metaId = v.metaPhoneNumberId ? String(v.metaPhoneNumberId).trim() : null;
    const instId = v.instanceId ? String(v.instanceId).trim() : null;
    if (!metaId && !instId) throw new Error('Vínculo sem identificação (metaPhoneNumberId ou instanceId).');
    const params = [
      novoId('inst'), contaId, instId, metaId,
      v.numero ?? null, v.wabaId ?? null, v.bmId ?? null, v.marcaId ?? null, Boolean(v.ignorado),
    ];
    const campos = `(id, conta_id, instance_id, meta_phone_number_id, numero, waba_id, bm_id, marca_id, ignorado, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`;
    const atualiza = `DO UPDATE SET conta_id = EXCLUDED.conta_id, instance_id = COALESCE(EXCLUDED.instance_id, fluxo_instancias.instance_id),
       meta_phone_number_id = COALESCE(EXCLUDED.meta_phone_number_id, fluxo_instancias.meta_phone_number_id),
       numero = COALESCE(EXCLUDED.numero, fluxo_instancias.numero), waba_id = COALESCE(EXCLUDED.waba_id, fluxo_instancias.waba_id),
       bm_id = COALESCE(EXCLUDED.bm_id, fluxo_instancias.bm_id), marca_id = EXCLUDED.marca_id, ignorado = EXCLUDED.ignorado,
       atualizado_em = CURRENT_TIMESTAMP`;
    if (metaId) {
      await pool.query(`INSERT INTO fluxo_instancias ${campos} ON CONFLICT (meta_phone_number_id) ${atualiza}`, params);
    } else {
      await pool.query(`INSERT INTO fluxo_instancias ${campos} ON CONFLICT (instance_id) ${atualiza}`, params);
    }
    gravados++;
  }
  return { gravados };
}

export interface CredenciaisDaConta {
  contaId: string;
  apiKey: string | null;
  apiSecret: string | null;
  webhookSecret: string | null;
  metaToken: string | null;
}

const abrir = (v: string | null) => (v ? decifrarSegredo(v) : null);

/** Só para uso no servidor: decifra as credenciais de uma conta. Nunca devolver para a tela. */
export async function obterCredenciaisDaConta(pool: PoolSql, contaId: string): Promise<CredenciaisDaConta | null> {
  const r = await pool.query(
    `SELECT id, api_key_cifrada, api_secret_cifrado, webhook_secret_cifrado, meta_token_cifrado FROM fluxo_contas WHERE id = $1`,
    [contaId]
  );
  const linha = r.rows[0];
  if (!linha) return null;
  return {
    contaId: String(linha.id),
    apiKey: abrir(linha.api_key_cifrada),
    apiSecret: abrir(linha.api_secret_cifrado),
    webhookSecret: abrir(linha.webhook_secret_cifrado),
    metaToken: abrir(linha.meta_token_cifrado),
  };
}

/** Segredos de webhook de todas as contas, decifrados. Usados para descobrir de qual conta veio um evento (pela assinatura). */
export async function segredosWebhookFluxo(pool: PoolSql): Promise<Array<{ contaId: string; segredo: string }>> {
  const r = await pool.query(`SELECT id, webhook_secret_cifrado FROM fluxo_contas WHERE webhook_secret_cifrado IS NOT NULL`);
  const saida: Array<{ contaId: string; segredo: string }> = [];
  for (const linha of r.rows) {
    try {
      saida.push({ contaId: String(linha.id), segredo: decifrarSegredo(linha.webhook_secret_cifrado) });
    } catch {
      // Segredo que não abre (chave-mestra trocada): essa conta fica fora da validação, e isso aparece no log.
      console.error(`[fluxo] segredo de webhook da conta ${linha.id} não pôde ser aberto. Regrave pelo painel.`);
    }
  }
  return saida;
}

/** Marca o último evento recebido de um número (saúde por número). */
export async function registrarEventoPorNumeroMeta(pool: PoolSql, metaPhoneNumberId: string): Promise<void> {
  await pool.query(
    `UPDATE fluxo_instancias SET ultimo_evento_em = CURRENT_TIMESTAMP WHERE meta_phone_number_id = $1`,
    [String(metaPhoneNumberId)]
  );
}

/** Conta dona de um número da Meta (pelo phone_number_id), se ele estiver cadastrado. */
export async function contaDoNumeroMeta(pool: PoolSql, metaPhoneNumberId: string): Promise<{ contaId: string; marcaId: string | null; ignorado: boolean } | null> {
  const r = await pool.query(
    `SELECT conta_id, marca_id, ignorado FROM fluxo_instancias WHERE meta_phone_number_id = $1`,
    [String(metaPhoneNumberId)]
  );
  const l = r.rows[0];
  return l ? { contaId: String(l.conta_id), marcaId: l.marca_id ?? null, ignorado: Boolean(l.ignorado) } : null;
}

/** Mantido para o cadastro manual de instância (sem descoberta). */
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
