/**
 * Item 3.4: grava a automação "Parar mensagens" (AUTOMACAO_PARAR_PADRAO) na tabela
 * automacoes_respostas, atrás da flag NYROH_AUTOMACAO_PARAR_PADRAO (padrão desligada).
 *
 * - Com a flag desligada, não encosta no banco.
 * - Idempotente: ON CONFLICT DO NOTHING. Se a linha já existe, não mexe (preserva edições do usuário).
 * - Nasce 'inativa'. Ativar em produção é a decisão H4 do checklist, não deste código.
 */
import type pg from 'pg';
import { flagLigada } from './flagLigada.js';
import { AUTOMACAO_PARAR_PADRAO } from './descadastroPadrao.js';
import { aplicarVersao } from './automacoesLimites.js';

export const ID_AUTOMACAO_PARAR_PADRAO = 'parar_mensagens_padrao';

export type ResultadoAutomacaoPararPadrao = 'desligada' | 'criada' | 'ja_existe';

export async function garantirAutomacaoPararPadrao(
  pool: Pick<pg.Pool, 'query'>,
  ambiente: NodeJS.ProcessEnv = process.env
): Promise<ResultadoAutomacaoPararPadrao> {
  if (!flagLigada(ambiente.NYROH_AUTOMACAO_PARAR_PADRAO)) return 'desligada';
  const def = aplicarVersao(null, AUTOMACAO_PARAR_PADRAO as unknown as Record<string, unknown>, new Date());
  const r = await pool.query(
    `INSERT INTO automacoes_respostas (id, status, definicao, atualizado_em)
     VALUES ($1, 'inativa', $2, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    [ID_AUTOMACAO_PARAR_PADRAO, JSON.stringify(def)]
  );
  return (r.rowCount ?? 0) > 0 ? 'criada' : 'ja_existe';
}
