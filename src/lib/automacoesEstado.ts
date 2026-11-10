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

/** Grupo de condições: "e" (todas), "ou" (alguma), "nao" (inverte uma condição ou grupo). */
export type Grupo = { e: NoCondicao[] } | { ou: NoCondicao[] } | { nao: NoCondicao };
export type NoCondicao = CondicaoDefinida | Grupo;
/** Forma antiga (lista = todas) ou grupo novo. */
export type Condicoes = CondicaoDefinida[] | Grupo | undefined;

export function ehFolha(n: NoCondicao): n is CondicaoDefinida {
  return typeof (n as CondicaoDefinida).var === 'string';
}

/** Dados do lead que as condições novas leem. Ausente = dado indisponível = condição falsa. */
export interface ContextoAvaliacao extends ContextoCondicao {
  tags?: string[];
  campos?: Record<string, unknown>;
  status?: string;
  /** Datas dos envios automáticos recentes. */
  envios?: Date[];
  /** Se a regra já executou para este lead nesta versão. */
  regraExecutou?: boolean;
  /** Momento do gatilho que originou o item (para "cliente respondeu depois"). */
  eventoEm?: Date | null;
  /** Última mensagem enviada pelo cliente. */
  ultimaMensagemDoCliente?: Date | null;
}

const HORAS = (h: number) => h * 60 * 60 * 1000;
const DIA = HORAS(24);
const SEMANA = HORAS(24 * 7);

/** Texto para comparação de campos: minúsculo, sem acento. */
function norm(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Avalia UMA folha. Desconhecida ou sem dado = falsa. */
export function avaliarFolha(c: CondicaoDefinida, ctx: ContextoAvaliacao): boolean {
  const v = (c.valor ?? {}) as Record<string, unknown>;
  switch (c.var) {
    case 'lead.optout': return c.op === 'falso' ? !ctx.optout : c.op === 'verdadeiro' ? ctx.optout : false;
    case 'lead.pausado': return c.op === 'falso' ? !ctx.pausado : c.op === 'verdadeiro' ? ctx.pausado : false;
    case 'janela_24h': return c.op === 'verdadeiro' && ctx.janela24h;
    case 'horario_comercial': return c.op === 'verdadeiro' && dentroDaFaixaHoraria(ctx.agora, c.valor as FaixaHoraria);
    case 'ultimo_comando': return c.op === 'igual' && ctx.ultimoComando === c.valor;
    case 'status.igual': return c.op === 'igual' && ctx.status !== undefined && norm(ctx.status) === norm(c.valor);
    case 'tag.presente': {
      if (!ctx.tags) return false;
      const tem = ctx.tags.some((t) => norm(t) === norm(c.valor));
      return c.op === 'verdadeiro' ? tem : c.op === 'falso' ? !tem : false;
    }
    case 'campo.igual': {
      if (!ctx.campos) return false;
      const igual = norm(ctx.campos[String(v.campo)]) === norm(v.valor);
      return c.op === 'igual' ? igual : c.op === 'diferente' ? !igual : false;
    }
    case 'campo.contem': {
      if (!ctx.campos) return false;
      return c.op === 'contem' && norm(ctx.campos[String(v.campo)]).includes(norm(v.valor));
    }
    case 'campo.vazio': {
      if (!ctx.campos) return false;
      const vazio = norm(ctx.campos[String(v.campo)]) === '';
      return c.op === 'verdadeiro' ? vazio : c.op === 'falso' ? !vazio : false;
    }
    case 'envios.periodo': {
      if (!ctx.envios || c.op !== 'menor_que') return false;
      const janela = v.periodo === 'semana' ? SEMANA : DIA;
      const n = ctx.envios.filter((d) => ctx.agora.getTime() - d.getTime() < janela && d.getTime() <= ctx.agora.getTime()).length;
      return n < Number(v.max);
    }
    case 'tempo.desde_ultimo_envio': {
      if (!ctx.envios) return false;
      if (c.op !== 'maior_que') return false;
      const ultimo = ctx.envios.reduce<number>((m, d) => Math.max(m, d.getTime()), 0);
      if (!ultimo) return true; // nunca enviou
      return ctx.agora.getTime() - ultimo > HORAS(Number(c.valor));
    }
    case 'regra.ja_executou': {
      if (ctx.regraExecutou === undefined) return false;
      return c.op === 'verdadeiro' ? ctx.regraExecutou : c.op === 'falso' ? !ctx.regraExecutou : false;
    }
    case 'cliente_respondeu_depois': {
      if (!ctx.eventoEm || !ctx.ultimaMensagemDoCliente) return c.op === 'falso';
      const respondeu = ctx.ultimaMensagemDoCliente.getTime() >= ctx.eventoEm.getTime();
      return c.op === 'verdadeiro' ? respondeu : c.op === 'falso' ? !respondeu : false;
    }
    default:
      return false;
  }
}

/** Avalia um nó (folha ou grupo). */
export function avaliarNo(n: NoCondicao, ctx: ContextoAvaliacao): boolean {
  if (ehFolha(n)) return avaliarFolha(n, ctx);
  if ('e' in n) return n.e.every((x) => avaliarNo(x, ctx));
  if ('ou' in n) return n.ou.some((x) => avaliarNo(x, ctx));
  return !avaliarNo(n.nao, ctx);
}

/** Forma antiga (lista) vira grupo "e". Undefined = sem condições = passa. */
export function normalizarCondicoes(c: Condicoes): Grupo {
  if (!c) return { e: [] };
  if (Array.isArray(c)) return { e: c };
  return c;
}

/**
 * Avalia as condições. Todas precisam ser verdadeiras (ou o grupo indicado).
 * Condição desconhecida é falsa: nunca dispara por engano.
 * `falhas` lista as folhas que falharam no nível de cima, para a mensagem de cancelamento.
 */
export function avaliarCondicoes(
  condicoes: Condicoes,
  ctx: ContextoAvaliacao
): { ok: boolean; falhas: string[] } {
  const g = normalizarCondicoes(condicoes);
  const ok = avaliarNo(g, ctx);
  if (ok) return { ok: true, falhas: [] };
  const nos: NoCondicao[] = 'e' in g ? g.e : 'ou' in g ? g.ou : [g.nao];
  const falhas = nos
    .filter((n) => !avaliarNo(n, ctx))
    .map((n) => (ehFolha(n) ? `${n.var} ${n.op}` : 'grupo'));
  return { ok: false, falhas: falhas.length ? falhas : ['grupo'] };
}

/** Partes locais (minuto do dia e dia da semana) de um instante num fuso. */
function partesLocais(agora: Date, fuso: string): { minutos: number; dia: number } | null {
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(agora);
    const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
    return {
      minutos: Number(get('hour')) * 60 + Number(get('minute')),
      dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    };
  } catch {
    return null;
  }
}

export interface AgendaHorario {
  /** "HH:MM" */
  hora: string;
  fuso: string;
  /** 0 = domingo ... 6 = sábado. Sem ele, todos os dias. */
  dias?: number[];
}

/**
 * Próximo instante, depois de `apos`, em que o relógio do fuso marca `hora` nos dias permitidos.
 * Procura minuto a minuto por até 8 dias. Sem achar = null (agenda inválida).
 */
export function proximaOcorrencia(apos: Date, agenda: AgendaHorario): Date | null {
  if (!HHMM.test(agenda.hora) || !agenda.fuso) return null;
  const alvo = Number(agenda.hora.slice(0, 2)) * 60 + Number(agenda.hora.slice(3));
  const inicio = Math.floor(apos.getTime() / 60000) * 60000 + 60000;
  for (let t = inicio; t <= apos.getTime() + 8 * DIA; t += 60000) {
    const p = partesLocais(new Date(t), agenda.fuso);
    if (!p) return null;
    if (p.minutos !== alvo) continue;
    if (agenda.dias && !agenda.dias.includes(p.dia)) continue;
    return new Date(t);
  }
  return null;
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
