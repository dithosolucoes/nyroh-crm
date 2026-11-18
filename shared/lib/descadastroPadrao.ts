/**
 * Descadastro (O2 / D0 híbrido).
 *
 * - PALAVRAS_PARAR_FIXAS: sempre valem, mesmo se a automação for apagada ou desativada.
 * - AUTOMACAO_PARAR_PADRAO: automação que o sistema cria sozinha. Aparece na tela de
 *   Automações, pode ser editada (palavras extras), e faz o descadastro pela ação
 *   "marcar opt-out" (nenhum envio futuro).
 */
import type { Automacao } from './automacoes';

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
