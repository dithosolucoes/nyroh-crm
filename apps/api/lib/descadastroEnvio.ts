/**
 * Confirmação automática de descadastro (item 3.2 do checklist).
 *
 * Quando um cliente pede para parar, o sistema pode responder com o texto aprovado pelo Thomas.
 * Fica DESLIGADO por padrão: só envia com NYROH_CONFIRMACAO_DESCADASTRO=true.
 * Cada telefone recebe a confirmação no máximo uma vez por processo (memória, sem persistir).
 */
import { flagLigada } from './flagLigada.js';
import { executeFluxoRequest, fluxoInstancePath } from './fluxoClient.js';

export const TEXTO_CONFIRMACAO_DESCADASTRO =
  'Pronto, você foi removido da nossa lista e não receberá mais mensagens. Obrigado, tenha um bom dia!';

export interface CredenciaisEnvioFluxo {
  apiKey: string;
  apiSecret: string;
  instanceId: string;
}

export type ResultadoConfirmacao = 'enviada' | 'desligada' | 'ja_enviada' | 'falhou';

const jaConfirmados = new Set<string>();

/** Só para testes: limpa o registro de confirmações do processo. */
export function limparConfirmacoesDescadastro(): void {
  jaConfirmados.clear();
}

/**
 * Envia a confirmação de descadastro se a flag estiver ligada e o telefone ainda não recebeu.
 * `enviarTexto` recebe o texto e devolve true quando o envio foi aceito.
 */
export async function confirmarDescadastroSeLigada(opts: {
  telefone: string;
  ambiente?: NodeJS.ProcessEnv;
  enviarTexto: (telefone: string, texto: string) => Promise<boolean>;
}): Promise<ResultadoConfirmacao> {
  const ambiente = opts.ambiente ?? process.env;
  if (!flagLigada(ambiente.NYROH_CONFIRMACAO_DESCADASTRO)) return 'desligada';
  const chave = String(opts.telefone).replace(/\D/g, '');
  if (!chave) return 'falhou';
  if (jaConfirmados.has(chave)) return 'ja_enviada';
  jaConfirmados.add(chave); // marca antes do envio: evita dois envios no mesmo instante
  let aceito = false;
  try {
    aceito = await opts.enviarTexto(chave, TEXTO_CONFIRMACAO_DESCADASTRO);
  } catch {
    aceito = false;
  }
  if (!aceito) {
    jaConfirmados.delete(chave);
    return 'falhou';
  }
  return 'enviada';
}

/** Envio de texto simples pela FluxoAPI, usado pela confirmação. */
export async function enviarTextoFluxo(telefone: string, texto: string, credenciais: CredenciaisEnvioFluxo): Promise<boolean> {
  const resultado = await executeFluxoRequest({
    method: 'POST',
    path: fluxoInstancePath('/messages', credenciais.instanceId),
    body: { to: `+${telefone}`, type: 'text', text: { body: texto } },
    apiKey: credenciais.apiKey,
    apiSecret: credenciais.apiSecret,
  });
  return Boolean(resultado.success);
}
