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
