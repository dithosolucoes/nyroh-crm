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
import type { Condicoes, CondicaoDefinida, Grupo } from './automacoesEstado';
import type { AgendaHorario } from './automacoesEstado';

export const EVENTOS = [
  { v: 'cliente_clicou', label: 'Clicou no botão Acessar Link', desc: 'clicou em Acessar Link' },
  { v: 'cliente_pediu_parar', label: 'Pediu para parar', desc: 'pediu para parar (Parar Mensagens ou palavra de parar)' },
  { v: 'cliente_ameacou', label: 'Escreveu palavra de alerta', desc: 'escreveu uma palavra de alerta' },
  { v: 'cliente_respondeu', label: 'Respondeu outro texto', desc: 'respondeu com texto livre' },
  { v: 'sem_resposta', label: 'Não respondeu no prazo', desc: 'não respondeu no prazo' },
  { v: 'falha_envio', label: 'Envio falhou', desc: 'o envio falhou' },
  { v: 'resposta_automatica', label: 'Resposta automática detectada', desc: 'recebeu uma resposta automática (ausência, bot)' },
  { v: 'passo_falhou', label: 'Passo falhou', desc: 'um passo anterior falhou' },
  { v: 'tag_mudou', label: 'Etiqueta foi adicionada ou removida', desc: 'uma etiqueta do lead mudou (filtro: nome da etiqueta)' },
  { v: 'status_mudou', label: 'Status do lead mudou', desc: 'o status do lead mudou (filtro: status)' },
  { v: 'funil_entrou', label: 'Lead entrou numa etapa do funil', desc: 'entrou numa etapa do funil (filtro: funil)' },
  { v: 'agenda_horario', label: 'Horário marcado (agenda do JSON)', desc: 'chegou o horário marcado no JSON (campo "agenda")' },
] as const;

/**
 * Condições (blueprint, seção 3). `ops` são os operadores aceitos. `valor` diz o formato
 * que o JSON precisa ter. Tudo que dá para configurar mora no JSON, nada é fixo aqui.
 */
export const CONDICOES = [
  { v: 'lead.optout', label: 'Lead está em opt-out', ops: ['falso', 'verdadeiro'] },
  { v: 'lead.pausado', label: 'Lead está pausado', ops: ['falso', 'verdadeiro'] },
  { v: 'janela_24h', label: 'Dentro da janela de 24h', ops: ['verdadeiro'] },
  { v: 'horario_comercial', label: 'Dentro de uma faixa de horário (definida no JSON)', ops: ['verdadeiro'] },
  { v: 'ultimo_comando', label: 'Último comando do lead é', ops: ['igual'] },
  { v: 'status.igual', label: 'Status do lead é', ops: ['igual'] },
  { v: 'tag.presente', label: 'Lead tem a etiqueta', ops: ['verdadeiro', 'falso'] },
  { v: 'campo.igual', label: 'Campo do lead é igual a', ops: ['igual', 'diferente'] },
  { v: 'campo.contem', label: 'Campo do lead contém', ops: ['contem'] },
  { v: 'campo.vazio', label: 'Campo do lead está vazio', ops: ['verdadeiro', 'falso'] },
  { v: 'envios.periodo', label: 'Envios automáticos no período são menos que o máximo', ops: ['menor_que'] },
  { v: 'tempo.desde_ultimo_envio', label: 'Tempo desde o último envio automático passou de X horas', ops: ['maior_que'] },
  { v: 'regra.ja_executou', label: 'Esta regra já executou para o lead', ops: ['falso', 'verdadeiro'] },
  { v: 'cliente_respondeu_depois', label: 'Cliente respondeu depois do gatilho', ops: ['verdadeiro', 'falso'] },
] as const;

/** Ações (blueprint, seção 4). Ação que precisa de dado do banco só roda com executor ligado. */
export const ACOES = [
  { v: 'enviar_texto', label: 'Enviar texto', params: 'texto (até 1024 caracteres)' },
  { v: 'esperar', label: 'Esperar', params: 'valor e unidade' },
  { v: 'esperar_ate', label: 'Esperar até um horário', params: 'hora (HH:MM), fuso, dias (opcional)' },
  { v: 'marcar_optout', label: 'Marcar opt-out (nenhum envio futuro)', params: 'sem parâmetros' },
  { v: 'pausar_lead', label: 'Pausar o lead', params: 'sem parâmetros' },
  { v: 'revisao', label: 'Mandar para minha revisão', params: 'motivo' },
  { v: 'etiqueta', label: 'Adicionar etiqueta', params: 'op e nome' },
  { v: 'remover_etiqueta', label: 'Remover etiqueta', params: 'op e nome' },
  { v: 'notificar', label: 'Avisar você', params: 'mensagem' },
  { v: 'definir_campo', label: 'Definir campo', params: 'campo e valor' },
  { v: 'gravar_variavel', label: 'Gravar variável do lead', params: 'nome e valor' },
  { v: 'mudar_status', label: 'Mudar status do lead', params: 'status' },
  { v: 'mudar_funil', label: 'Mudar de funil ou etapa', params: 'funil e etapa' },
  { v: 'enviar_template', label: 'Enviar modelo aprovado (fora da janela de 24h)', params: 'nome do modelo' },
  { v: 'cancelar_passos', label: 'Cancelar passos agendados deste lead', params: 'sem parâmetros' },
  { v: 'encerrar', label: 'Encerrar esta automação para o lead', params: 'sem parâmetros' },
] as const;

export type EventoV = (typeof EVENTOS)[number]['v'];
export type AcaoV = (typeof ACOES)[number]['v'];

export interface Passo {
  acao: AcaoV;
  params?: Record<string, unknown>;
  /** Só executa o passo se o grupo for verdadeiro. */
  se?: Grupo | CondicaoDefinida;
  /** Com "negar": o passo executa quando o "se" for falso (ramo "senão"). */
  negar?: boolean;
}

export interface Automacao {
  nome: string;
  gatilho: {
    evento: EventoV;
    filtro?: {
      texto_igual?: string;
      texto_contem?: string;
      texto_comeca?: string;
      texto_lista?: string[];
      tag?: string;
      status?: string;
      funil?: string;
    };
    /** Só para o evento agenda_horario. */
    agenda?: AgendaHorario;
  };
  /** Condições da regra: lista (todas) ou grupo "e"/"ou"/"nao". */
  condicoes?: Condicoes;
  /** Variáveis do próprio JSON, com valor padrão. Trocam {nome} antes dos dados do lead. */
  variaveis?: Record<string, string>;
  /** Limites de envio automático para cada lead. Sem eles, a automação não tem limite. */
  limites?: { porDia?: number; porSemana?: number };
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
const LIMITE_PROFUNDIDADE = 6;

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

/** Troca {nome} pelas variáveis do JSON (antes dos dados do lead). */
export function substituirVariaveis(texto: string, variaveis?: Record<string, string>): string {
  let out = String(texto || '');
  for (const [nome, valor] of Object.entries(variaveis || {})) {
    out = out.split(`{${nome}}`).join(String(valor));
  }
  return out;
}

/** Substitui {campo} pelos valores de exemplo (para prévia e contagem de caracteres). */
export function renderPrevia(texto: string, variaveis?: Record<string, string>): string {
  let out = substituirVariaveis(texto, variaveis);
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

/** Tokens usados num texto que não existem no projeto nem nas variáveis do JSON. */
export function tokensDesconhecidos(texto: string, variaveis?: Record<string, string>): string[] {
  const achados = String(texto || '').match(/\{[a-zA-Z_]+\}/g) || [];
  return achados
    .map((s) => s.slice(1, -1))
    .filter((n) => !(TOKEN_NAMES as readonly string[]).includes(n) && !(variaveis && n in variaveis));
}

function eventoValido(v: unknown): v is EventoV {
  return EVENTOS.some((e) => e.v === v);
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Folhas aninhadas de um grupo, para mostrar e validar. */
function ehFolhaDef(n: unknown): n is CondicaoDefinida {
  return !!n && typeof (n as CondicaoDefinida).var === 'string';
}

/** Valida uma condição (folha ou grupo). Devolve mensagens de erro. */
export function validarCondicao(n: unknown, rotulo: string, profundidade = 0): string[] {
  const erros: string[] = [];
  if (profundidade > LIMITE_PROFUNDIDADE) return [`${rotulo}: grupos aninhados demais.`];
  if (!n || typeof n !== 'object') return [`${rotulo}: condição inválida.`];
  if (!ehFolhaDef(n)) {
    const g = n as Record<string, unknown>;
    const chaves = ['e', 'ou', 'nao'].filter((k) => k in g);
    if (chaves.length !== 1) return [`${rotulo}: um grupo precisa de exatamente um de "e", "ou" ou "nao".`];
    if (chaves[0] === 'nao') return validarCondicao(g.nao, rotulo, profundidade + 1);
    const lista = g[chaves[0]];
    if (!Array.isArray(lista) || lista.length === 0) return [`${rotulo}: o grupo "${chaves[0]}" precisa de pelo menos uma condição.`];
    lista.forEach((x, i) => erros.push(...validarCondicao(x, `${rotulo}.${i + 1}`, profundidade + 1)));
    return erros;
  }
  const c = n as CondicaoDefinida;
  const def = CONDICOES.find((x) => x.v === c.var);
  if (!def) return [`${rotulo}: "${c.var}" não existe no catálogo.`];
  if (!(def.ops as readonly string[]).includes(c.op)) return [`${rotulo}: operador "${c.op}" não serve para "${def.label}".`];
  const v = (c.valor ?? {}) as Record<string, unknown>;
  const texto = (x: unknown) => typeof x === 'string' && x.trim().length > 0;
  switch (c.var) {
    case 'horario_comercial': {
      const f = (c.valor || {}) as Record<string, unknown>;
      if (!HHMM.test(String(f.inicio)) || !HHMM.test(String(f.fim))) erros.push(`${rotulo}: a faixa de horário precisa de "inicio" e "fim" no formato HH:MM.`);
      if (!f.fuso) erros.push(`${rotulo}: a faixa de horário precisa de "fuso" (ex.: America/Sao_Paulo).`);
      break;
    }
    case 'tag.presente':
    case 'status.igual':
      if (!texto(c.valor)) erros.push(`${rotulo}: informe o nome no valor.`);
      break;
    case 'campo.igual':
    case 'campo.contem':
      if (!texto(v.campo)) erros.push(`${rotulo}: informe o "campo" no valor.`);
      if (v.valor === undefined || v.valor === null) erros.push(`${rotulo}: informe o "valor" a comparar.`);
      break;
    case 'campo.vazio':
      if (!texto(v.campo)) erros.push(`${rotulo}: informe o "campo" no valor.`);
      break;
    case 'envios.periodo':
      if (!['dia', 'semana'].includes(String(v.periodo))) erros.push(`${rotulo}: "periodo" precisa ser "dia" ou "semana".`);
      if (!Number.isInteger(v.max) || (v.max as number) < 1) erros.push(`${rotulo}: "max" precisa ser um inteiro de pelo menos 1.`);
      break;
    case 'tempo.desde_ultimo_envio':
      if (!Number.isFinite(Number(c.valor)) || Number(c.valor) <= 0) erros.push(`${rotulo}: informe as horas (número maior que zero).`);
      break;
    default:
      break;
  }
  return erros;
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
  if (filtro) {
    for (const campo of ['texto_contem', 'texto_comeca', 'texto_igual'] as const) {
      if (filtro[campo] !== undefined && !String(filtro[campo]).trim()) erros.push(`O filtro "${campo}" está vazio.`);
    }
    if (filtro.texto_lista !== undefined && (!Array.isArray(filtro.texto_lista) || filtro.texto_lista.some((x) => !String(x).trim()))) {
      erros.push('O filtro "texto_lista" precisa ser uma lista de palavras não vazias.');
    }
  }
  if (d.gatilho?.evento === 'tag_mudou' && !String(filtro?.tag || '').trim()) erros.push('Gatilho "etiqueta mudou": informe a etiqueta em filtro.tag.');
  if (d.gatilho?.evento === 'status_mudou' && !String(filtro?.status || '').trim()) erros.push('Gatilho "status mudou": informe o status em filtro.status.');
  if (d.gatilho?.evento === 'funil_entrou' && !String(filtro?.funil || '').trim()) erros.push('Gatilho "entrou no funil": informe o funil em filtro.funil.');
  if (d.gatilho?.evento === 'agenda_horario') {
    const ag = d.gatilho.agenda;
    if (!ag || !HHMM.test(String(ag.hora)) || !ag.fuso) erros.push('Gatilho "agenda": informe "agenda.hora" (HH:MM) e "agenda.fuso".');
    // A agenda só atinge os leads de um funil indicado. Sem isso, a regra não dispara (proteção contra envio em massa).
    if (!String(filtro?.funil || '').trim()) erros.push('Gatilho "agenda": informe o funil em filtro.funil (para quais leads vale).');
  }

  if (d.variaveis !== undefined) {
    if (typeof d.variaveis !== 'object' || Array.isArray(d.variaveis)) erros.push('"variaveis" precisa ser um objeto nome: valor.');
    else
      for (const [nome, valor] of Object.entries(d.variaveis)) {
        if (!/^[a-zA-Z_]+$/.test(nome)) erros.push(`Variável "${nome}": use só letras e _.`);
        if (typeof valor !== 'string') erros.push(`Variável "${nome}": o valor precisa ser texto.`);
      }
  }

  if (d.condicoes !== undefined) {
    erros.push(...validarCondicao(Array.isArray(d.condicoes) ? { e: d.condicoes } : d.condicoes, 'Condições'));
  }
  if (d.limites !== undefined) {
    for (const campo of ['porDia', 'porSemana'] as const) {
      const v = (d.limites as Record<string, unknown>)[campo];
      if (v !== undefined && (!Number.isInteger(v) || (v as number) < 1)) {
        erros.push(`Limite ${campo}: precisa ser um número inteiro de pelo menos 1.`);
      }
    }
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
    if (p.se !== undefined) erros.push(...validarCondicao(p.se, `Passo ${n}, se`));
    if (p.negar !== undefined && typeof p.negar !== 'boolean') erros.push(`Passo ${n}: "negar" precisa ser verdadeiro ou falso.`);
    if (p.negar && p.se === undefined) erros.push(`Passo ${n}: "negar" só faz sentido com "se".`);
    const pr = (p.params || {}) as Record<string, unknown>;
    if (p.acao === 'enviar_texto') {
      const texto = String(pr.texto || '');
      if (!texto.trim()) erros.push(`Passo ${n}: a mensagem está vazia.`);
      for (const t of tokensDesconhecidos(texto, d.variaveis)) erros.push(`Passo ${n}: {${t}} não existe no projeto.`);
      const final = renderPrevia(texto, d.variaveis);
      if (final.length > LIMITE_TEXTO) erros.push(`Passo ${n}: o texto final passa de ${LIMITE_TEXTO} caracteres.`);
      for (const nome of (texto.match(/\{[a-zA-Z_]+\}/g) || []).map((x) => x.slice(1, -1))) {
        if (d.variaveis && nome in d.variaveis) continue;
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
    if (p.acao === 'esperar_ate') {
      if (!HHMM.test(String(pr.hora))) erros.push(`Passo ${n}: "hora" precisa ser HH:MM.`);
      if (!pr.fuso) erros.push(`Passo ${n}: falta o "fuso" (ex.: America/Sao_Paulo).`);
      if (pr.dias !== undefined && (!Array.isArray(pr.dias) || pr.dias.some((x) => !Number.isInteger(x) || x < 0 || x > 6))) {
        erros.push(`Passo ${n}: "dias" precisa ser uma lista de 0 (domingo) a 6 (sábado).`);
      }
    }
    if (p.acao === 'etiqueta' && !String(pr.nome || '').trim()) erros.push(`Passo ${n}: falta o nome da etiqueta.`);
    if (p.acao === 'remover_etiqueta' && !String(pr.nome || '').trim()) erros.push(`Passo ${n}: falta o nome da etiqueta.`);
    if (p.acao === 'gravar_variavel' && (!String(pr.nome || '').trim() || pr.valor === undefined)) erros.push(`Passo ${n}: "gravar_variavel" precisa de nome e valor.`);
    if (p.acao === 'mudar_status' && !String(pr.status || '').trim()) erros.push(`Passo ${n}: informe o status.`);
    if (p.acao === 'mudar_funil' && !String(pr.funil || '').trim()) erros.push(`Passo ${n}: informe o funil.`);
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

/** Uma condição em português, para a conversa simulada e a lógica. */
export function descreverNo(n: unknown): string {
  if (!n || typeof n !== 'object') return '?';
  if (!ehFolhaDef(n)) {
    const g = n as Record<string, unknown>;
    if ('nao' in g) return `não (${descreverNo(g.nao)})`;
    const k = 'e' in g ? 'e' : 'ou';
    return `(${((g[k] as unknown[]) || []).map(descreverNo).join(k === 'e' ? ' e ' : ' ou ')})`;
  }
  const rot = CONDICOES.find((x) => x.v === n.var)?.label ?? n.var;
  if (n.op === 'falso') return `${rot} é falso`;
  if (n.op === 'verdadeiro') return `${rot} é verdadeiro`;
  if (n.valor !== undefined) return `${rot} = ${typeof n.valor === 'object' ? JSON.stringify(n.valor) : String(n.valor)}`;
  return rot;
}

/** Linhas de "Lógica em palavras", em português simples. */
export function logicaEmPalavras(def: Automacao): string[] {
  const linhas: string[] = [];
  const ev = EVENTOS.find((e) => e.v === def.gatilho?.evento);
  linhas.push(`Gatilho: ${(ev?.label || 'nenhum evento escolhido').toLowerCase()}.`);
  if (def.condicoes !== undefined) linhas.push(`Só segue se: ${descreverNo(Array.isArray(def.condicoes) ? { e: def.condicoes } : def.condicoes)}.`);
  let horas = 0;
  (def.passos || []).forEach((p, i) => {
    const pr = (p.params || {}) as Record<string, unknown>;
    let t: string;
    if (p.acao === 'enviar_texto') t = `envia a mensagem “${renderPrevia(String(pr.texto || '(vazia)'), def.variaveis)}”`;
    else if (p.acao === 'esperar') {
      t = `espera ${pr.valor} ${pr.unidade}`;
      const v = Number(pr.valor) || 0;
      horas += pr.unidade === 'dias' ? v * 24 : pr.unidade === 'horas' ? v : v / 60;
    } else t = (ACOES.find((a) => a.v === p.acao)?.label || p.acao).toLowerCase();
    if (p.se !== undefined) t += p.negar ? ` (só se NÃO: ${descreverNo(p.se)})` : ` (só se: ${descreverNo(p.se)})`;
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
    resposta_automatica: '(resposta automática)',
    passo_falhou: '(passo anterior falhou)',
    tag_mudou: '(etiqueta mudou)',
    status_mudou: '(status mudou)',
    funil_entrou: '(entrou no funil)',
    agenda_horario: '(horário marcado)',
  };
  const out: BolhaConversa[] = [];
  const evento = def.gatilho?.evento;
  out.push({ quem: 'cliente', texto: `[${evento ? clienteDiz[evento] : 'evento'}]` });
  if (Array.isArray(def.condicoes)) {
    // Lista simples: uma bolha por condição (todas precisam ser verdade).
    for (const c of def.condicoes) out.push({ quem: 'sistema', texto: `Só segue se: ${descreverNo(c)}` });
  } else if (def.condicoes !== undefined) {
    out.push({ quem: 'sistema', texto: `Só segue se: ${descreverNo(def.condicoes)}` });
  }
  for (const p of def.passos || []) {
    const pr = (p.params || {}) as Record<string, unknown>;
    const cond = p.se !== undefined ? ` (${p.negar ? 'só se não' : 'só se'}: ${descreverNo(p.se)})` : '';
    if (p.acao === 'enviar_texto') out.push({ quem: 'automacao', texto: renderPrevia(String(pr.texto || '(texto vazio)'), def.variaveis) + cond });
    else if (p.acao === 'esperar') out.push({ quem: 'sistema', texto: `Aguarda ${pr.valor} ${pr.unidade}${cond}` });
    else if (p.acao === 'esperar_ate') out.push({ quem: 'sistema', texto: `Aguarda até ${pr.hora} (${pr.fuso})${cond}` });
    else if (p.acao === 'marcar_optout') out.push({ quem: 'sistema', texto: `Opt-out: nenhum envio futuro para este lead${cond}` });
    else if (p.acao === 'pausar_lead') out.push({ quem: 'sistema', texto: `Lead pausado${cond}` });
    else if (p.acao === 'revisao') out.push({ quem: 'sistema', texto: `Vai para sua revisão: ${pr.motivo || ''}${cond}` });
    else if (p.acao === 'notificar') out.push({ quem: 'sistema', texto: `Você recebe aviso: ${pr.mensagem || ''}${cond}` });
    else if (p.acao === 'encerrar') out.push({ quem: 'sistema', texto: `Automação encerrada para este lead${cond}` });
    else out.push({ quem: 'sistema', texto: `Ação: ${p.acao}${cond}` });
  }
  return out;
}
