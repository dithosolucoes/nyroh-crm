/**
 * Estado do lead no motor de automações e prioridades (blueprint, seções 3.3 e 7).
 *
 * PURO: sem banco, sem rede. Decide se um evento do cliente pode disparar uma regra.
 * Toda decisão lê o estado do lead primeiro; o evento sozinho nunca decide.
 *
 * Ordem de precedência, da mais forte para a mais fraca:
 *  1. Opt-out sempre vence (pedido de parar bloqueia qualquer envio depois disso).
 *  2. Pausa (ameaça ou revisão) vence automações: só registra o evento.
 *  3. Comando mais recente vence entre intenções conflitantes.
 *  4. Repetição não muda estado: mesmo comando ou regra já executada na mesma versão é ignorada.
 */

export type StatusGeral = 'ativo' | 'pausado' | 'optout' | 'revisao';

export type EventoLead =
  | 'cliente_clicou'
  | 'cliente_pediu_parar'
  | 'cliente_ameacou'
  | 'cliente_respondeu'
  | 'sem_resposta'
  | 'falha_envio';

export interface EstadoLead {
  statusGeral: StatusGeral;
  ultimoComando: { tipo: EventoLead; em: Date } | null;
  /** regra_id -> versão da regra que já executou para este lead. */
  regrasExecutadas: Record<string, number>;
}

export interface DecisaoLead {
  /** Pode executar a regra (ou o passo) para este lead agora. */
  pode: boolean;
  motivo: string;
  estado: EstadoLead;
}

export function estadoInicial(): EstadoLead {
  return { statusGeral: 'ativo', ultimoComando: null, regrasExecutadas: {} };
}

/**
 * Decide o efeito de um evento. `regraId` e `versao` são opcionais: sem regra, só o
 * estado geral e a repetição do comando são avaliados.
 */
export function decidirEvento(
  estadoAtual: EstadoLead,
  evento: EventoLead,
  em: Date,
  regra?: { id: string; versao: number }
): DecisaoLead {
  const estado: EstadoLead = {
    ...estadoAtual,
    regrasExecutadas: { ...estadoAtual.regrasExecutadas },
  };

  // 1. Opt-out: pedido de parar, em qualquer momento, fixa o estado.
  if (evento === 'cliente_pediu_parar') {
    const jaEra = estado.statusGeral === 'optout';
    estado.statusGeral = 'optout';
    estado.ultimoComando = { tipo: evento, em };
    return {
      pode: false,
      motivo: jaEra ? 'Já estava em opt-out: nada a fazer' : 'Pediu para parar: opt-out, nenhum envio futuro',
      estado,
    };
  }
  if (estado.statusGeral === 'optout') {
    return { pode: false, motivo: 'Lead em opt-out: nenhum envio automático', estado };
  }

  // 2. Palavra de alerta pausa o lead e manda para revisão.
  if (evento === 'cliente_ameacou') {
    estado.statusGeral = 'revisao';
    estado.ultimoComando = { tipo: evento, em };
    return { pode: false, motivo: 'Palavra de alerta: lead pausado para sua revisão', estado };
  }
  if (estado.statusGeral === 'pausado' || estado.statusGeral === 'revisao') {
    return { pode: false, motivo: `Lead ${estado.statusGeral}: só revisão, nenhuma regra dispara`, estado };
  }

  // 4. Repetição não muda estado.
  if (estado.ultimoComando?.tipo === evento && !regra) {
    return { pode: false, motivo: 'Mesmo comando repetido: ignorado', estado };
  }
  if (regra && estado.regrasExecutadas[regra.id] === regra.versao) {
    return { pode: false, motivo: `Regra ${regra.id} já executou para este lead nesta versão`, estado };
  }

  // Aceito: registra o comando e, se houver regra, marca a execução.
  estado.ultimoComando = { tipo: evento, em };
  if (regra) estado.regrasExecutadas[regra.id] = regra.versao;
  return { pode: true, motivo: regra ? `Regra ${regra.id} pode executar` : 'Evento aceito', estado };
}

export interface ContextoCondicao {
  optout: boolean;
  pausado: boolean;
  janela24h: boolean;
  /** Momento da execução. A faixa de horário vem do JSON da condição. */
  agora: Date;
  ultimoComando: EventoLead | null;
}

export interface FaixaHoraria {
  /** Início, formato "HH:MM". */
  inicio: string;
  /** Fim, formato "HH:MM". Não inclusivo. */
  fim: string;
  /** Fuso IANA, ex.: "America/Sao_Paulo". Obrigatório: o JSON define. */
  fuso: string;
  /** Dias da semana permitidos, 0 = domingo ... 6 = sábado. Opcional: sem ele, todos os dias. */
  dias?: number[];
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Verdadeiro se `agora` cai dentro da faixa, no fuso da faixa. Faixa inválida = falso. */
export function dentroDaFaixaHoraria(agora: Date, faixa: FaixaHoraria | undefined): boolean {
  if (!faixa || !HHMM.test(faixa.inicio) || !HHMM.test(faixa.fim) || !faixa.fuso) return false;
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = new Intl.DateTimeFormat('en-US', {
      timeZone: faixa.fuso, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(agora);
  } catch {
    return false; // fuso desconhecido
  }
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const minutos = Number(get('hour')) * 60 + Number(get('minute'));
  const ini = Number(faixa.inicio.slice(0, 2)) * 60 + Number(faixa.inicio.slice(3));
  const fim = Number(faixa.fim.slice(0, 2)) * 60 + Number(faixa.fim.slice(3));
  const diaSemana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  if (faixa.dias && !faixa.dias.includes(diaSemana)) return false;
  return minutos >= ini && minutos < fim;
}

export interface CondicaoDefinida {
  var: string;
  op: string;
  valor?: unknown;
}

/**
 * Avalia as condições de uma regra contra o contexto do lead. Todas precisam ser verdadeiras.
 * Condição desconhecida é falsa: nunca dispara por engano.
 */
export function avaliarCondicoes(
  condicoes: CondicaoDefinida[] | undefined,
  ctx: ContextoCondicao
): { ok: boolean; falhas: string[] } {
  const falhas: string[] = [];
  for (const c of condicoes || []) {
    let ok = false;
    if (c.var === 'lead.optout') ok = c.op === 'falso' ? !ctx.optout : c.op === 'verdadeiro' ? ctx.optout : false;
    else if (c.var === 'lead.pausado') ok = c.op === 'falso' ? !ctx.pausado : c.op === 'verdadeiro' ? ctx.pausado : false;
    else if (c.var === 'janela_24h') ok = c.op === 'verdadeiro' && ctx.janela24h;
    else if (c.var === 'horario_comercial') ok = c.op === 'verdadeiro' && dentroDaFaixaHoraria(ctx.agora, c.valor as FaixaHoraria);
    else if (c.var === 'ultimo_comando') ok = c.op === 'igual' && ctx.ultimoComando === c.valor;
    if (!ok) falhas.push(`${c.var} ${c.op}`);
  }
  return { ok: falhas.length === 0, falhas };
}

/** Pausa manual de um lead (botão de revisão). Não reverte opt-out. */
export function pausarLead(estadoAtual: EstadoLead, motivo: 'pausado' | 'revisao'): EstadoLead {
  if (estadoAtual.statusGeral === 'optout') return estadoAtual;
  return { ...estadoAtual, statusGeral: motivo };
}

/** Liberação manual pela sua revisão. Não reverte opt-out. */
export function liberarLead(estadoAtual: EstadoLead): EstadoLead {
  if (estadoAtual.statusGeral === 'optout') return estadoAtual;
  return { ...estadoAtual, statusGeral: 'ativo' };
}
