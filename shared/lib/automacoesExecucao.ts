/**
 * Planejador das automações: dado um evento do cliente, calcula QUAIS regras valem e QUAIS
 * passos aconteceriam, com o tempo de cada um. Puro: não envia, não grava, não chama a FluxoAPI.
 *
 * Ainda não está ligado a nenhum disparo real. Quando for ligado, a execução usa este plano
 * e continua atrás de uma flag própria (desligada por padrão).
 */
import { renderPrevia, substituirVariaveis, type Automacao, type AcaoV, type EventoV } from './automacoes';
import { contemPalavra, quandoExecutar } from './automacoesFila';
import { randomUUID } from 'crypto';
import { normalizarCondicoes, proximaOcorrencia, type Condicoes, type Grupo, type AgendaHorario } from './automacoesEstado';
import { detectOptOut } from './leadIntent';
import { PALAVRAS_PARAR_FIXAS } from './descadastroPadrao';

export interface ContextoEvento {
  /** Texto exato que o cliente mandou (ex.: "Acessar Link"), quando o gatilho exige. */
  texto?: string;
  /** Se o lead já está em opt-out. */
  optout?: boolean;
  /** Momento do gatilho. Base para "esperar até" e para "cliente respondeu depois". */
  em?: Date;
  /** Filtros extras do gatilho (tag, status, funil) quando o evento os usa. */
  tag?: string;
  status?: string;
  funil?: string;
}

export interface PassoPlanejado {
  ordem: number;
  acao: AcaoV;
  /** Texto final já com as variáveis do lead (ou null quando a ação não envia texto). */
  texto: string | null;
  /** Horas acumuladas desde o evento até este passo. */
  horasDesdeEvento: number;
  /** Condição deste passo: a da regra E a do próprio passo (se houver, com "negar" invertido). */
  condicoes: Grupo;
  /** Parâmetros do passo, como estão no JSON (ex.: nome e valor de uma etiqueta). */
  params?: Record<string, unknown>;
}

export interface PlanoAutomacao {
  id: string;
  nome: string;
  passos: PassoPlanejado[];
  /** Condições da regra. Avaliadas de novo na execução, com o estado atual do lead. */
  condicoes: Condicoes;
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

const ms = (h: number) => h * 60 * 60 * 1000;

/** Filtros do gatilho que não são texto: etiqueta, status e funil. Sem o dado, não dispara. */
function filtrosEventoOk(def: Automacao, ctx: ContextoEvento): boolean {
  const f = def.gatilho.filtro || {};
  if (def.gatilho.evento === 'tag_mudou' && norm(ctx.tag) !== norm(f.tag)) return false;
  if (def.gatilho.evento === 'status_mudou' && norm(ctx.status) !== norm(f.status)) return false;
  if (def.gatilho.evento === 'funil_entrou' && norm(ctx.funil) !== norm(f.funil)) return false;
  return true;
}

const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Quais automações ATIVAS disparam para este evento e o que fariam.
 * `resolver` troca {campo} pelos dados do lead real; por padrão usa os valores de exemplo.
 * Variáveis do próprio JSON são trocadas antes do resolver.
 */
export function planejarEvento(
  evento: EventoV,
  regras: RegistroAutomacao[],
  contexto: ContextoEvento = {},
  resolver: (texto: string) => string = renderPrevia
): PlanoAutomacao[] {
  const planos: PlanoAutomacao[] = [];
  const em = contexto.em ?? new Date(0);
  for (const r of regras) {
    if (r.status !== 'ativa' || !r.def?.gatilho || r.def.gatilho.evento !== evento) continue;
    const filtro = r.def.gatilho.filtro;
    if (filtro?.texto_igual !== undefined && contexto.texto !== filtro.texto_igual) continue;
    if (filtro?.texto_contem !== undefined && !contemPalavra(contexto.texto || '', filtro.texto_contem)) continue;
    if (filtro?.texto_comeca !== undefined && !norm(contexto.texto).startsWith(norm(filtro.texto_comeca))) continue;
    if (filtro?.texto_lista !== undefined && !filtro.texto_lista.some((p) => contemPalavra(contexto.texto || '', p))) continue;
    if (!filtrosEventoOk(r.def, contexto)) continue;
    const regraCond: Grupo = normalizarCondicoes(r.def.condicoes) as Grupo;
    const pulaSeOptout = Array.isArray(r.def.condicoes) && r.def.condicoes.some((c) => c.var === 'lead.optout' && c.op === 'falso');
    if (pulaSeOptout && contexto.optout) continue;

    let horas = 0;
    const passos: PassoPlanejado[] = [];
    (r.def.passos || []).forEach((p, i) => {
      const pr = (p.params || {}) as Record<string, unknown>;
      if (p.acao === 'esperar') horas += emHoras(pr.valor, pr.unidade);
      if (p.acao === 'esperar_ate') {
        const agenda: AgendaHorario = { hora: String(pr.hora), fuso: String(pr.fuso), dias: Array.isArray(pr.dias) ? (pr.dias as number[]) : undefined };
        const prox = proximaOcorrencia(new Date(em.getTime() + ms(horas)), agenda);
        if (prox) horas = (prox.getTime() - em.getTime()) / ms(1);
      }
      const passoCond: Grupo = p.se === undefined
        ? { e: [] }
        : p.negar
          ? { nao: p.se as Grupo }
          : (p.se as Grupo);
      passos.push({
        ordem: i + 1,
        acao: p.acao,
        texto: p.acao === 'enviar_texto' ? resolver(substituirVariaveis(String(pr.texto || ''), r.def.variaveis)) : null,
        horasDesdeEvento: horas,
        condicoes: { e: [regraCond, passoCond] } as Grupo,
        params: pr,
      });
    });
    planos.push({ id: r.id, nome: r.def.nome, passos, condicoes: r.def.condicoes, limites: r.def.limites });
  }
  return planos;
}

/**
 * O cliente pediu para parar? As palavras vêm SOMENTE dos gatilhos "pediu para parar" das
 * automações ativas no JSON. Sem essas automações, ninguém é marcado como opt-out pelo texto.
 */
export function pedidoDePararPelasRegras(texto: string, regras: RegistroAutomacao[]): boolean {
  // Palavras fixas do código valem sempre (não dependem de automação cadastrada).
  const palavras: string[] = [...PALAVRAS_PARAR_FIXAS];
  for (const r of regras) {
    if (r.status !== 'ativa' || r.def?.gatilho?.evento !== 'cliente_pediu_parar') continue;
    const f = r.def.gatilho.filtro;
    if (f?.texto_contem) palavras.push(f.texto_contem);
    if (f?.texto_igual) palavras.push(f.texto_igual);
    if (Array.isArray(f?.texto_lista)) palavras.push(...f.texto_lista);
  }
  return detectOptOut(texto, palavras);
}

/** Palavras de alerta vêm só das automações ativas no JSON (gatilho "cliente_ameacou"). */
export function pedidoDeAlertaPelasRegras(texto: string, regras: RegistroAutomacao[]): boolean {
  const palavras: string[] = [];
  for (const r of regras) {
    if (r.status !== 'ativa' || r.def?.gatilho?.evento !== 'cliente_ameacou') continue;
    const f = r.def.gatilho.filtro;
    if (f?.texto_contem) palavras.push(f.texto_contem);
    if (f?.texto_igual) palavras.push(f.texto_igual);
  }
  return detectOptOut(texto, palavras);
}

/** Evento do cliente a partir da resposta recebida. */
export function eventoDaResposta(texto: string, optout: boolean, alerta = false): EventoV {
  if (optout) return 'cliente_pediu_parar';
  if (alerta) return 'cliente_ameacou';
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
  /** Condições do item (regra + passo), avaliadas na execução. Itens antigos, sem o campo, não têm condições. */
  condicoes?: Condicoes;
  /** Quando o gatilho aconteceu (ISO). Base para "cliente respondeu depois do gatilho". */
  eventoEm?: string;
  /** Parâmetros do passo, do JSON (nome, valor, status, funil...). */
  params?: Record<string, unknown>;
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
  contexto: { leadId: string; texto: string; optout: boolean; alerta?: boolean },
  agora: Date,
  deps: DepsRecebimento
): Promise<number> {
  const evento = eventoDaResposta(contexto.texto, contexto.optout, contexto.alerta === true);
  return registrarEventoGeral(evento, contexto.leadId, { texto: contexto.texto, optout: contexto.optout }, agora, deps);
}

/**
 * Registra QUALQUER evento de um lead (etiqueta, status, funil, agenda) e enfileira os passos
 * das automações ativas que casam. Sem a flag de execução, não faz nada.
 */
export async function registrarEventoGeral(
  evento: EventoV,
  leadId: string,
  contexto: ContextoEvento,
  agora: Date,
  deps: DepsRecebimento
): Promise<number> {
  if (process.env.NYROH_AUTOMACOES_EXECUCAO !== 'true') return 0;
  const regras = await deps.carregarRegras();
  // Identidade: guarda o modelo. As variáveis são preenchidas só na execução, com o lead real.
  const planos = planejarEvento(evento, regras, { ...contexto, em: agora }, (t) => t);
  const itens: ItemFila[] = [];
  for (const plano of planos) {
    for (const passo of plano.passos) {
      itens.push({
        id: randomUUID(),
        automacaoId: plano.id,
        leadId,
        passoOrdem: passo.ordem,
        acao: passo.acao,
        texto: passo.texto,
        executarEm: quandoExecutar(agora, passo.horasDesdeEvento),
        condicoes: passo.condicoes,
        eventoEm: agora.toISOString(),
        params: passo.params,
        limites: plano.limites,
      });
    }
  }
  if (itens.length > 0) await deps.gravarFila(itens);
  return itens.length;
}
