/**
 * Recuperação de leads fixos marcados como descartados por engano.
 *
 * Só volta para STAGING quem tem a marca "Telefone fixo" no histórico de resposta.
 * Nunca mexe em quem descadastrou (opt-out) nem em nenhum outro descarte: o sistema
 * não reavalia telefone de lead já validado.
 */
export interface LeadParaRecuperar {
  status: string;
  responsePreview?: string | null;
}

export function recuperarFixosDescartados<T extends LeadParaRecuperar>(leads: Iterable<T>): number {
  let recuperados = 0;
  for (const lead of leads) {
    if (lead.status === 'DESCARTADO' && String(lead.responsePreview || '').includes('Telefone fixo')) {
      lead.status = 'STAGING';
      lead.responsePreview = undefined;
      recuperados++;
    }
  }
  return recuperados;
}
