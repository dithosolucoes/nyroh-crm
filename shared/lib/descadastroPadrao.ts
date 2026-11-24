/**
 * Descadastro (O2 / D0 híbrido).
 *
 * - PALAVRAS_PARAR_FIXAS: sempre valem, mesmo se a automação for apagada ou desativada.
 * - AUTOMACAO_PARAR_PADRAO: automação que o sistema cria sozinha. Aparece na tela de
 *   Automações, pode ser editada (palavras extras), e faz o descadastro pela ação
 *   "marcar opt-out" (nenhum envio futuro).
 */
import type { Automacao } from './automacoes';
import { flagLigada } from './flagLigada.js';

export const PALAVRAS_PARAR_FIXAS: readonly string[] = [
  'parar',
  'pare',
  'sair',
  'cancelar',
  'descadastrar',
  'descadastre',
  'remover',
  'stop',
  'não quero',
  'não tenho interesse',
];

export const AUTOMACAO_PARAR_PADRAO: Automacao = {
  nome: 'Parar mensagens',
  gatilho: {
    evento: 'cliente_pediu_parar',
    filtro: { texto_lista: ['parar mensagens'] },
  },
  passos: [{ acao: 'marcar_optout' }],
};

/** Resposta de um clique de botão (payload `data.reply` da FluxoAPI): `{ kind, id, title, description? }`. */
export interface RespostaBotao {
  kind?: unknown;
  id?: unknown;
  title?: unknown;
}

/**
 * Item 3.1 a/b do checklist: o clique de descadastro é reconhecido pelo `reply.id`, nunca pelo texto.
 * Os ids que significam "parar" vêm de configuração (`NYROH_DESCADASTRO_BOTAO_IDS`). Sem id
 * configurado, nenhum clique conta: o valor real do botão ainda não foi confirmado (bloco H3).
 */
export function ehCliqueDescadastro(reply: RespostaBotao | null | undefined, idsConfigurados: readonly string[]): boolean {
  if (!reply || typeof reply.id !== 'string') return false;
  const id = reply.id.trim();
  return id !== '' && idsConfigurados.includes(id);
}

/** Lê a lista de ids de botão de descadastro (variável separada por vírgula). Vazia por padrão. */
export function idsDescadastroBotao(valor: string | undefined | null): string[] {
  return String(valor ?? '').split(',').map((id) => id.trim()).filter((id) => id !== '');
}

/**
 * Item 3.1 c: o webhook marca o evento como descadastro quando é um clique de botão com reply.id
 * configurado. Desligado (retorna false) sem NYROH_DESCADASTRO_POR_BOTAO=true.
 */
export function optOutPorBotaoDoWebhook(kind: string, reply: RespostaBotao | undefined, ambiente: NodeJS.ProcessEnv = process.env): boolean {
  if (!flagLigada(ambiente.NYROH_DESCADASTRO_POR_BOTAO)) return false;
  if (kind !== 'interactive' && kind !== 'button') return false;
  return ehCliqueDescadastro(reply, idsDescadastroBotao(ambiente.NYROH_DESCADASTRO_BOTAO_IDS));
}

/** Item 3.2: confirmação automática de descadastro (ver descadastroEnvio.ts). Desligada por padrão. */
export { confirmarDescadastroSeLigada, enviarTextoFluxo } from './descadastroEnvio.js';
