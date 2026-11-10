/**
 * Limites por lead, pausa geral, versão e auditoria das automações (blueprint, seção 8).
 * PURO: sem banco, sem rede.
 *
 * Os limites vêm SEMPRE do JSON da automação. Sem limite no JSON, o motor não aplica limite.
 */

export interface LimitesLead {
  /** Máximo de mensagens automáticas em 24 horas. Opcional: sem ele, não há limite diário. */
  porDia?: number;
  /** Máximo de mensagens automáticas em 7 dias corridos. Opcional: sem ele, não há limite semanal. */
  porSemana?: number;
}

const HORA = 60 * 60 * 1000;

/** Confere os envios automáticos recentes de um lead contra os limites. */
export function dentroDosLimites(
  envios: Date[],
  agora: Date,
  limites?: LimitesLead
): { ok: boolean; motivo: string } {
  const t = agora.getTime();
  const noDia = envios.filter((d) => t - d.getTime() < 24 * HORA && d.getTime() <= t).length;
  const naSemana = envios.filter((d) => t - d.getTime() < 7 * 24 * HORA && d.getTime() <= t).length;
  if (limites?.porDia !== undefined && noDia >= limites.porDia) {
    return { ok: false, motivo: `Limite diário atingido (${noDia}/${limites.porDia} em 24h)` };
  }
  if (limites?.porSemana !== undefined && naSemana >= limites.porSemana) {
    return { ok: false, motivo: `Limite semanal atingido (${naSemana}/${limites.porSemana} em 7 dias)` };
  }
  return { ok: true, motivo: 'Dentro dos limites' };
}

/**
 * Pausa geral (kill switch). Ligada por variável de ambiente, para parar a fila sem apagar nada.
 * Enquanto ligada, o processador não reserva nem executa nenhum item.
 */
export function pausaGeralAtiva(env: Record<string, string | undefined> = process.env): boolean {
  return env.NYROH_AUTOMACOES_PAUSA_GERAL === 'true';
}

/** Próxima versão de uma regra. A versão anterior continua guardada no histórico. */
export function proximaVersao(atual?: number): number {
  return Number.isInteger(atual) && (atual as number) >= 1 ? (atual as number) + 1 : 1;
}

/**
 * Aplica a versão a uma definição ao salvar. A versão e o histórico vêm do servidor, nunca do cliente:
 * a definição anterior entra no histórico (máximo de 20 entradas) e a nova recebe a próxima versão.
 */
export function aplicarVersao(
  anteriorDb: Record<string, unknown> | null | undefined,
  nova: Record<string, unknown>,
  agora: Date
): Record<string, unknown> {
  const versaoAnterior = typeof anteriorDb?.versao === 'number' ? (anteriorDb.versao as number) : undefined;
  const historico: unknown[] = Array.isArray(anteriorDb?.historico) ? [...(anteriorDb!.historico as unknown[])] : [];
  if (anteriorDb && versaoAnterior !== undefined) {
    const { historico: _h, ...definicaoAnterior } = anteriorDb;
    historico.push({ versao: versaoAnterior, salvoEm: agora.toISOString(), definicao: definicaoAnterior });
  }
  return { ...nova, versao: proximaVersao(versaoAnterior), historico: historico.slice(-20) };
}

export type DecisaoMotor = 'executou' | 'bloqueou' | 'pulou' | 'agendou' | 'cancelou';

export interface RegistroAuditoria {
  quando: string;
  decisao: DecisaoMotor;
  motivo: string;
  leadId: string | null;
  regraId: string | null;
  versao: number | null;
}

/** Registro de uma decisão do motor, com o motivo. Vai para a auditoria (persistência na fase E). */
export function registroAuditoria(
  decisao: DecisaoMotor,
  motivo: string,
  agora: Date,
  alvo: { leadId?: string | null; regraId?: string | null; versao?: number | null } = {}
): RegistroAuditoria {
  return {
    quando: agora.toISOString(),
    decisao,
    motivo,
    leadId: alvo.leadId ?? null,
    regraId: alvo.regraId ?? null,
    versao: alvo.versao ?? null,
  };
}
