/**
 * Executores das ações que mudam dados do lead. Cada ação escreve SÓ nas colunas e tabelas
 * permitidas aqui, com lista branca de valores. Qualquer coisa fora disso falha com motivo.
 *
 * Ligado no worker só com NYROH_AUTOMACOES_EXECUCAO=true. Sem flag, nada chama este código.
 *
 * Tabelas: `leads` (já existe). Etiquetas por lead precisam de tabela nova (`lead_tags`), que só
 * existe depois da migração da fase I. Enquanto não existe, a etiqueta falha com motivo.
 */
import type { ItemFila } from './automacoesExecucao';
import type { ContextoLeadWorker } from './automacoesWorker';

export interface ConsultaSql {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** Status do lead que a automação pode definir. Mesmos valores que o funil já usa. */
export const STATUS_DO_LEAD = ['INTERESSADO', 'FRIO', 'DESCARTADO'] as const;
/** Colunas do funil (kanban) que a automação pode mover. */
export const COLUNAS_DO_FUNIL = ['Leads', 'Interessado', 'Fechado', 'Recusado'] as const;
/** Campos que têm coluna própria em `leads`. Os demais vão para `variaveis_json`. */
export const CAMPOS_DA_TABELA = ['niche', 'website', 'public_url', 'sub_status', 'loss_reason'] as const;

const NOME_VALIDO = /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/;
const TEXTO_MAX = 1000;

export interface ResultadoAcao {
  ok: boolean;
  resultado: string;
}

/** Campos do lead que as condições leem: campos livres + colunas úteis. */
export function camposDoLead(x: Record<string, any>): Record<string, unknown> {
  const livres = x.variaveis_json && typeof x.variaveis_json === 'object' ? x.variaveis_json : {};
  return {
    ...livres,
    niche: x.niche ?? null,
    website: x.website ?? null,
    public_url: x.public_url ?? null,
    sub_status: x.sub_status ?? null,
    loss_reason: x.loss_reason ?? null,
    column_status: x.column_status ?? null,
  };
}

/** Verdadeiro se a tabela existe no banco (sem erro se ainda não foi criada). */
export async function tabelaExiste(db: ConsultaSql, nome: string): Promise<boolean> {
  const r = await db.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${nome}`]);
  return r.rows[0]?.ok === true;
}

/** Texto de um valor do JSON (string, número ou verdadeiro/falso). Outros tipos = inválido. */
function textoDoValor(v: unknown): string | null {
  if (typeof v === 'string') return v.length <= TEXTO_MAX ? v : null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

export function criarExecutorAcoes(db: ConsultaSql) {
  return async (it: ItemFila, _ctx: ContextoLeadWorker): Promise<ResultadoAcao> => {
    const pr = (it.params || {}) as Record<string, unknown>;
    const leadId = it.leadId;
    const falha = (resultado: string): ResultadoAcao => ({ ok: false, resultado });

    switch (it.acao) {
      case 'mudar_status': {
        const status = String(pr.status ?? '');
        if (!(STATUS_DO_LEAD as readonly string[]).includes(status)) return falha(`Status "${status}" não é permitido para automação`);
        const r = await db.query(`UPDATE leads SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [leadId, status]);
        if (!r.rowCount) return falha('Lead não encontrado');
        return { ok: true, resultado: `Status do lead alterado para ${status}` };
      }

      case 'mudar_funil': {
        const funil = pr.funil === undefined ? null : String(pr.funil);
        const etapa = pr.etapa === undefined ? null : String(pr.etapa);
        if (funil === null && etapa === null) return falha('Informe o funil ou a etapa');
        if (funil !== null && !(COLUNAS_DO_FUNIL as readonly string[]).includes(funil)) return falha(`Funil "${funil}" não existe`);
        if (etapa !== null && etapa.length > 255) return falha('Etapa com mais de 255 caracteres');
        const r = await db.query(
          `UPDATE leads SET column_status = COALESCE($2, column_status), sub_status = COALESCE($3, sub_status), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [leadId, funil, etapa]
        );
        if (!r.rowCount) return falha('Lead não encontrado');
        return { ok: true, resultado: `Funil atualizado${funil ? ` para ${funil}` : ''}${etapa ? ` (etapa: ${etapa})` : ''}` };
      }

      case 'definir_campo':
      case 'gravar_variavel': {
        const nome = String(pr.campo ?? pr.nome ?? '');
        if (!NOME_VALIDO.test(nome)) return falha(`Nome de campo "${nome}" inválido (use letras, números e _)`);
        const valor = textoDoValor(pr.valor);
        if (valor === null) return falha(`Valor do campo "${nome}" precisa ser texto, número ou verdadeiro/falso (até ${TEXTO_MAX} caracteres)`);
        if ((CAMPOS_DA_TABELA as readonly string[]).includes(nome)) {
          // Nome vem da lista acima: é seguro montar a coluna no SQL.
          const r = await db.query(`UPDATE leads SET ${nome} = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [leadId, valor]);
          if (!r.rowCount) return falha('Lead não encontrado');
        } else {
          const r = await db.query(
            `UPDATE leads SET variaveis_json = COALESCE(variaveis_json, '{}'::jsonb) || jsonb_build_object($2::text, $3::text), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [leadId, nome, valor]
          );
          if (!r.rowCount) return falha('Lead não encontrado');
        }
        return { ok: true, resultado: `Campo "${nome}" gravado` };
      }

      case 'etiqueta':
      case 'remover_etiqueta': {
        const nome = String(pr.nome ?? '').trim();
        if (!nome) return falha('Informe o nome da etiqueta');
        if (!(await tabelaExiste(db, 'lead_tags'))) {
          return falha('Etiquetas por lead ainda não têm tabela (migração pendente, fase I): nada foi aplicado');
        }
        if (it.acao === 'etiqueta') {
          await db.query(`INSERT INTO lead_tags (lead_id, tag) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [leadId, nome]);
          return { ok: true, resultado: `Etiqueta "${nome}" adicionada` };
        }
        await db.query(`DELETE FROM lead_tags WHERE lead_id = $1 AND tag = $2`, [leadId, nome]);
        return { ok: true, resultado: `Etiqueta "${nome}" removida` };
      }

      case 'marcar_optout': {
        // Mesmo sinal que o recebimento já usa para opt-out: status DESCARTADO. Cancela os passos pendentes.
        const r = await db.query(`UPDATE leads SET status = 'DESCARTADO', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [leadId]);
        if (!r.rowCount) return falha('Lead não encontrado');
        await db.query(
          `UPDATE automacoes_fila SET status = 'cancelado', resultado = 'Opt-out marcado pela automação', processado_em = CURRENT_TIMESTAMP WHERE lead_id = $1 AND status = 'pendente'`,
          [leadId]
        );
        return { ok: true, resultado: 'Opt-out marcado: nenhum envio futuro, passos pendentes cancelados' };
      }

      case 'cancelar_passos': {
        const r = await db.query(
          `UPDATE automacoes_fila SET status = 'cancelado', resultado = 'Cancelado por passo de automação', processado_em = CURRENT_TIMESTAMP WHERE lead_id = $1 AND status = 'pendente'`,
          [leadId]
        );
        return { ok: true, resultado: `${r.rowCount ?? 0} passo(s) pendente(s) cancelado(s)` };
      }

      case 'encerrar': {
        const r = await db.query(
          `UPDATE automacoes_fila SET status = 'cancelado', resultado = 'Automação encerrada para o lead', processado_em = CURRENT_TIMESTAMP WHERE lead_id = $1 AND automacao_id = $2 AND status = 'pendente'`,
          [leadId, it.automacaoId]
        );
        return { ok: true, resultado: `Automação encerrada para o lead (${r.rowCount ?? 0} passo(s) cancelado(s))` };
      }

      default:
        // Pausar, revisão e aviso dependem da tabela de estado do lead (fase I) ou de um canal de aviso.
        return falha(`"${it.acao}" ainda não tem executor: depende da fase I ou de canal de aviso`);
    }
  };
}
