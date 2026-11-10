/**
 * Planejador das automações: dado um evento do cliente, calcula QUAIS regras valem e QUAIS
 * passos aconteceriam, com o tempo de cada um. Puro: não envia, não grava, não chama a FluxoAPI.
 *
 * Ainda não está ligado a nenhum disparo real. Quando for ligado, a execução usa este plano
 * e continua atrás de uma flag própria (desligada por padrão).
 */
import { renderPrevia, type Automacao, type AcaoV, type EventoV } from './automacoes';
import { contemPalavra, quandoExecutar } from './automacoesFila';
import { randomUUID } from 'crypto';
import type { CondicaoDefinida } from './automacoesEstado';
import { detectOptOut } from './leadIntent';

export interface ContextoEvento {
  /** Texto exato que o cliente mandou (ex.: "Acessar Link"), quando o gatilho exige. */
  texto?: string;
  /** Se o lead já está em opt-out. */
  optout?: boolean;
}

export interface PassoPlanejado {
  ordem: number;
  acao: AcaoV;
  /** Texto final já com as variáveis do lead (ou null quando a ação não envia texto). */
  texto: string | null;
  /** Horas acumuladas desde o evento até este passo. */
  horasDesdeEvento: number;
}

export interface PlanoAutomacao {
  id: string;
  nome: string;
  passos: PassoPlanejado[];
  /** Condições da regra. Avaliadas de novo na execução, com o estado atual do lead. */
  condicoes: CondicaoDefinida[];
  /** Limites da regra, do JSON. Sem eles, não há limite. */
  limites?: { porDia?: number; porSemana?: number };
}

export interface RegistroAutomacao {
  id: string;
  status: string;
  def: Automacao;
}

const emHoras = (valor: unknown, unidade: unknown): number => {
  const v = Number(valor) || 0;
  if (unidade === 'dias') return v * 24;
  if (unidade === 'horas') return v;
  return v / 60;
};

/**
 * Quais automações ATIVAS disparam para este evento e o que fariam.
 * `resolver` troca {campo} pelos dados do lead real; por padrão usa os valores de exemplo.
 */
export function planejarEvento(
  evento: EventoV,
  regras: RegistroAutomacao[],
  contexto: ContextoEvento = {},
  resolver: (texto: string) => string = renderPrevia
): PlanoAutomacao[] {
  const planos: PlanoAutomacao[] = [];
  for (const r of regras) {
    if (r.status !== 'ativa' || !r.def?.gatilho || r.def.gatilho.evento !== evento) continue;
    const filtro = r.def.gatilho.filtro;
    if (filtro?.texto_igual !== undefined && contexto.texto !== filtro.texto_igual) continue;
    if (filtro?.texto_contem !== undefined && !contemPalavra(contexto.texto || '', filtro.texto_contem)) continue;
    const pulaSeOptout = (r.def.condicoes || []).some((c) => c.var === 'lead.optout' && c.op === 'falso');
    if (pulaSeOptout && contexto.optout) continue;

    let horas = 0;
    const passos: PassoPlanejado[] = [];
    (r.def.passos || []).forEach((p, i) => {
      const pr = (p.params || {}) as Record<string, unknown>;
      if (p.acao === 'esperar') horas += emHoras(pr.valor, pr.unidade);
      passos.push({
        ordem: i + 1,
        acao: p.acao,
        texto: p.acao === 'enviar_texto' ? resolver(String(pr.texto || '')) : null,
        horasDesdeEvento: horas,
      });
    });
    planos.push({ id: r.id, nome: r.def.nome, passos, condicoes: r.def.condicoes || [], limites: r.def.limites });
  }
  return planos;
}

/**
 * O cliente pediu para parar? As palavras vêm SOMENTE dos gatilhos "pediu para parar" das
 * automações ativas no JSON. Sem essas automações, ninguém é marcado como opt-out pelo texto.
 */
export function pedidoDePararPelasRegras(texto: string, regras: RegistroAutomacao[]): boolean {
  const palavras: string[] = [];
  for (const r of regras) {
    if (r.status !== 'ativa' || r.def?.gatilho?.evento !== 'cliente_pediu_parar') continue;
    const f = r.def.gatilho.filtro;
    if (f?.texto_contem) palavras.push(f.texto_contem);
    if (f?.texto_igual) palavras.push(f.texto_igual);
  }
  return detectOptOut(texto, palavras);
}

/** Evento do cliente a partir da resposta recebida. */
export function eventoDaResposta(texto: string, optout: boolean): EventoV {
  if (optout) return 'cliente_pediu_parar';
  if (String(texto || '').trim() === 'Acessar Link') return 'cliente_clicou';
  return 'cliente_respondeu';
}

export interface ItemFila {
  id: string;
  automacaoId: string;
  leadId: string;
  passoOrdem: number;
  acao: AcaoV;
  /** Texto AINDA COM {variáveis}. Quem preenche é a execução, com os dados reais do lead. */
  texto: string | null;
  executarEm: Date;
  /** Condições da regra, avaliadas na execução. Itens antigos, sem o campo, não têm condições. */
  condicoes?: CondicaoDefinida[];
  /** Limites da regra, do JSON. Sem eles, não há limite. */
  limites?: { porDia?: number; porSemana?: number };
}

export interface DepsRecebimento {
  carregarRegras: () => Promise<RegistroAutomacao[]>;
  gravarFila: (itens: ItemFila[]) => Promise<void>;
}

/**
 * Chamado quando chega resposta do cliente. Com NYROH_AUTOMACOES_EXECUCAO desligada (padrão),
 * não faz nada. Ligada, só agenda os passos na fila. Nunca envia.
 */
export async function registrarEventoCliente(
  contexto: { leadId: string; texto: string; optout: boolean },
  agora: Date,
  deps: DepsRecebimento
): Promise<number> {
  if (process.env.NYROH_AUTOMACOES_EXECUCAO !== 'true') return 0;
  const evento = eventoDaResposta(contexto.texto, contexto.optout);
  const regras = await deps.carregarRegras();
  // Identidade: guarda o modelo. As variáveis são preenchidas só na execução, com o lead real.
  const planos = planejarEvento(evento, regras, { texto: contexto.texto, optout: contexto.optout }, (t) => t);
  const itens: ItemFila[] = [];
  for (const plano of planos) {
    for (const passo of plano.passos) {
      itens.push({
        id: randomUUID(),
        automacaoId: plano.id,
        leadId: contexto.leadId,
        passoOrdem: passo.ordem,
        acao: passo.acao,
        texto: passo.texto,
        executarEm: quandoExecutar(agora, passo.horasDesdeEvento),
        condicoes: plano.condicoes,
        limites: plano.limites,
      });
    }
  }
  if (itens.length > 0) await deps.gravarFila(itens);
  return itens.length;
}
