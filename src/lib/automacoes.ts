/**
 * Motor de automações de resposta: catálogo, validação, conflitos e simulação da conversa.
 *
 * Esta camada é PURA (sem rede, sem banco, sem React). Ela só decide se uma automação pode ser
 * salva/ativada e como ela aparece na conversa simulada. Quem envia mensagem de verdade é o
 * caminho de disparo já existente; nada aqui chama a FluxoAPI.
 *
 * Variáveis de texto são as MESMAS do projeto (src/lib/leadTokens.ts): {nome}, {empresa}, etc.
 */
import { TOKEN_NAMES, buildTokenValues } from './leadTokens';

export const EVENTOS = [
  { v: 'cliente_clicou', label: 'Clicou no botão Acessar Link', desc: 'clicou em Acessar Link' },
  { v: 'cliente_pediu_parar', label: 'Pediu para parar', desc: 'pediu para parar (Parar Mensagens ou palavra de parar)' },
  { v: 'cliente_ameacou', label: 'Escreveu palavra de alerta', desc: 'escreveu uma palavra de alerta' },
  { v: 'cliente_respondeu', label: 'Respondeu outro texto', desc: 'respondeu com texto livre (vai para sua revisão)' },
  { v: 'sem_resposta', label: 'Não respondeu no prazo', desc: 'não respondeu no prazo' },
  { v: 'falha_envio', label: 'Envio falhou', desc: 'o envio falhou' },
] as const;

export const ACOES = [
  { v: 'enviar_texto', label: 'Enviar texto', params: 'texto (até 1024 caracteres)' },
  { v: 'esperar', label: 'Esperar', params: 'valor e unidade' },
  { v: 'marcar_optout', label: 'Marcar opt-out (nenhum envio futuro)', params: 'sem parâmetros' },
  { v: 'pausar_lead', label: 'Pausar o lead', params: 'sem parâmetros' },
  { v: 'revisao', label: 'Mandar para minha revisão', params: 'motivo' },
  { v: 'etiqueta', label: 'Adicionar etiqueta', params: 'op e nome' },
  { v: 'notificar', label: 'Avisar você', params: 'mensagem' },
  { v: 'definir_campo', label: 'Definir campo', params: 'campo e valor' },
] as const;

export type EventoV = (typeof EVENTOS)[number]['v'];
export type AcaoV = (typeof ACOES)[number]['v'];

export interface Passo {
  acao: AcaoV;
  params?: Record<string, unknown>;
}

export interface Automacao {
  nome: string;
  gatilho: { evento: EventoV; filtro?: { texto_igual?: string; texto_contem?: string } };
  condicoes?: Array<{ var: string; op: string; valor?: unknown }>;
  passos: Passo[];
}

export interface ResultadoValidacao {
  erros: string[];
  avisos: string[];
  conflitos: string[];
}

export const LIMITE_TEXTO = 1024;
export const LIMITE_ESPERA_HORAS = 720;
export const LIMITE_PASSOS = 20;

/** Valores de exemplo para a conversa simulada (nunca vêm de lead real). */
export const AMOSTRA = {
  nome: 'Roberto',
  empresa: 'Padaria Estrela',
  vendedor: 'Thomas',
  site_novo: 'https://site-do-cliente.com.br',
  site_antigo: 'https://padariaestrela.com.br',
  telefone: '(31) 99999-0000',
  data: '09/11/2026',
  nicho: 'padaria',
} as const;

/** Substitui {campo} pelos valores de exemplo (para prévia e contagem de caracteres). */
export function renderPrevia(texto: string): string {
  let out = String(texto || '');
  for (const nome of TOKEN_NAMES) {
    out = out.split(`{${nome}}`).join((AMOSTRA as Record<string, string>)[nome] ?? '');
  }
  return out;
}

/** Texto que o lead vê quando o campo não existe para ele (mesma regra de leadTokens). */
export function fallbackDe(nome: string): string {
  const vazio = buildTokenValues({})[nome];
  return vazio ? vazio : '(vazio: o envio é bloqueado)';
}

/** Tokens usados num texto que não existem no projeto. */
export function tokensDesconhecidos(texto: string): string[] {
  const achados = String(texto || '').match(/\{[a-zA-Z_]+\}/g) || [];
  return achados.map((s) => s.slice(1, -1)).filter((n) => !(TOKEN_NAMES as readonly string[]).includes(n));
}

function eventoValido(v: unknown): v is EventoV {
  return EVENTOS.some((e) => e.v === v);
}

/**
 * Valida UMA automação. `outras` são as demais automações do sistema; só as ATIVAS entram
 * na checagem de conflito. Erros bloqueiam salvar. Conflitos bloqueiam ativar.
 */
export function validarAutomacao(
  def: unknown,
  outras: Array<{ id: string; status: string; def: Automacao }>,
  selfId: string
): ResultadoValidacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const conflitos: string[] = [];

  if (!def || typeof def !== 'object') {
    return { erros: ['A automação precisa ser um objeto.'], avisos, conflitos };
  }
  const d = def as Partial<Automacao>;
  if (!d.nome || typeof d.nome !== 'string' || !d.nome.trim()) erros.push('Dê um nome para a automação.');
  if (!d.gatilho || !eventoValido(d.gatilho.evento)) erros.push('Escolha quando a automação acontece.');
  const filtro = d.gatilho?.filtro;
  if (filtro && filtro.texto_contem !== undefined && !String(filtro.texto_contem).trim()) {
    erros.push('A palavra-chave do gatilho está vazia.');
  }

  const passos = Array.isArray(d.passos) ? d.passos : [];
  if (passos.length === 0) erros.push('Adicione pelo menos um passo.');
  if (passos.length > LIMITE_PASSOS) erros.push(`Passou de ${LIMITE_PASSOS} passos.`);

  passos.forEach((p, i) => {
    const n = i + 1;
    const acao = ACOES.find((a) => a.v === p.acao);
    if (!acao) {
      erros.push(`Passo ${n}: ação inválida.`);
      return;
    }
    const pr = (p.params || {}) as Record<string, unknown>;
    if (p.acao === 'enviar_texto') {
      const texto = String(pr.texto || '');
      if (!texto.trim()) erros.push(`Passo ${n}: a mensagem está vazia.`);
      for (const t of tokensDesconhecidos(texto)) erros.push(`Passo ${n}: {${t}} não existe no projeto.`);
      if (renderPrevia(texto).length > LIMITE_TEXTO) erros.push(`Passo ${n}: o texto final passa de ${LIMITE_TEXTO} caracteres.`);
      for (const nome of (texto.match(/\{[a-zA-Z_]+\}/g) || []).map((s) => s.slice(1, -1))) {
        if (fallbackDe(nome).startsWith('(vazio')) {
          avisos.push(`Passo ${n}: se o lead não tiver {${nome}}, o envio é bloqueado.`);
        }
      }
    }
    if (p.acao === 'esperar') {
      const valor = Number(pr.valor);
      if (!Number.isFinite(valor) || valor < 1) erros.push(`Passo ${n}: a espera precisa ser pelo menos 1.`);
      const horas = pr.unidade === 'dias' ? valor * 24 : pr.unidade === 'horas' ? valor : valor / 60;
      if (horas > LIMITE_ESPERA_HORAS) erros.push(`Passo ${n}: espera maior que 30 dias.`);
      if (!['minutos', 'horas', 'dias'].includes(String(pr.unidade))) erros.push(`Passo ${n}: unidade inválida.`);
    }
    if (p.acao === 'etiqueta' && !String(pr.nome || '').trim()) erros.push(`Passo ${n}: falta o nome da etiqueta.`);
  });

  // Conflito com automações ATIVAS que disparam no mesmo gatilho.
  if (d.gatilho && eventoValido(d.gatilho.evento)) {
    const acoes = passos.map((p) => p.acao);
    const bloqueia = (l: string[]) => l.includes('marcar_optout') || l.includes('pausar_lead');
    for (const o of outras) {
      if (o.id === selfId || o.status !== 'ativa' || !o.def?.gatilho) continue;
      if (o.def.gatilho.evento !== d.gatilho.evento) continue;
      const oa = (o.def.passos || []).map((p) => p.acao);
      if ((acoes.includes('enviar_texto') && bloqueia(oa)) || (oa.includes('enviar_texto') && bloqueia(acoes))) {
        conflitos.push(
          `Conflita com "${o.def.nome}": mesmo gatilho; uma envia texto e a outra marca opt-out ou pausa o lead. Desative uma delas para ativar esta.`
        );
      }
    }
  }

  return { erros, avisos, conflitos };
}

/** Linhas de "Lógica em palavras", em português simples. */
export function logicaEmPalavras(def: Automacao): string[] {
  const linhas: string[] = [];
  const ev = EVENTOS.find((e) => e.v === def.gatilho?.evento);
  linhas.push(`Gatilho: ${(ev?.label || 'nenhum evento escolhido').toLowerCase()}.`);
  let horas = 0;
  (def.passos || []).forEach((p, i) => {
    const pr = (p.params || {}) as Record<string, unknown>;
    let t: string;
    if (p.acao === 'enviar_texto') t = `envia a mensagem “${renderPrevia(String(pr.texto || '(vazia)'))}”`;
    else if (p.acao === 'esperar') {
      t = `espera ${pr.valor} ${pr.unidade}`;
      const v = Number(pr.valor) || 0;
      horas += pr.unidade === 'dias' ? v * 24 : pr.unidade === 'horas' ? v : v / 60;
    } else t = (ACOES.find((a) => a.v === p.acao)?.label || p.acao).toLowerCase();
    linhas.push(`${i + 1}. ${t}.`);
  });
  linhas.push(`Tempo até o último passo: ${horas ? `${Math.round(horas * 10) / 10} horas` : 'imediato'}.`);
  return linhas;
}

export interface BolhaConversa {
  quem: 'cliente' | 'automacao' | 'sistema';
  texto: string;
}

/** Conversa simulada: o que o cliente vê, passo a passo. */
export function conversaSimulada(def: Automacao): BolhaConversa[] {
  const clienteDiz: Record<EventoV, string> = {
    cliente_clicou: 'Acessar Link',
    cliente_pediu_parar: 'Parar Mensagens',
    cliente_ameacou: '(mensagem com palavra de alerta)',
    cliente_respondeu: '(texto livre do cliente)',
    sem_resposta: '(sem resposta)',
    falha_envio: '(envio falhou)',
  };
  const out: BolhaConversa[] = [];
  const evento = def.gatilho?.evento;
  out.push({ quem: 'cliente', texto: `[${evento ? clienteDiz[evento] : 'evento'}]` });
  for (const p of def.passos || []) {
    const pr = (p.params || {}) as Record<string, unknown>;
    if (p.acao === 'enviar_texto') out.push({ quem: 'automacao', texto: renderPrevia(String(pr.texto || '(texto vazio)')) });
    else if (p.acao === 'esperar') out.push({ quem: 'sistema', texto: `Aguarda ${pr.valor} ${pr.unidade}` });
    else if (p.acao === 'marcar_optout') out.push({ quem: 'sistema', texto: 'Opt-out: nenhum envio futuro para este lead' });
    else if (p.acao === 'pausar_lead') out.push({ quem: 'sistema', texto: 'Lead pausado' });
    else if (p.acao === 'revisao') out.push({ quem: 'sistema', texto: `Vai para sua revisão: ${pr.motivo || ''}` });
    else if (p.acao === 'notificar') out.push({ quem: 'sistema', texto: `Você recebe aviso: ${pr.mensagem || ''}` });
    else out.push({ quem: 'sistema', texto: `Ação: ${p.acao}` });
  }
  return out;
}
