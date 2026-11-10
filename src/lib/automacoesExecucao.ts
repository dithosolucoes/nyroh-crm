/**
 * Planejador das automações: dado um evento do cliente, calcula QUAIS regras valem e QUAIS
 * passos aconteceriam, com o tempo de cada um. Puro: não envia, não grava, não chama a FluxoAPI.
 *
 * Ainda não está ligado a nenhum disparo real. Quando for ligado, a execução usa este plano
 * e continua atrás de uma flag própria (desligada por padrão).
 */
import { renderPrevia, type Automacao, type AcaoV, type EventoV } from './automacoes';

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
    const exigeTexto = r.def.gatilho.filtro?.texto_igual;
    if (exigeTexto !== undefined && contexto.texto !== exigeTexto) continue;
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
    planos.push({ id: r.id, nome: r.def.nome, passos });
  }
  return planos;
}
