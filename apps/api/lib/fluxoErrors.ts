/**
 * Tradução dos erros da FluxoAPI (§A12) para mensagens em português e ações sugeridas.
 * Regra da API: programar pelo `code`, mostrar a `message`, guardar o `request_id`.
 */

export interface FluxoErrorInfo {
  code: string;
  /** Texto pronto para mostrar a uma pessoa (pt-BR). */
  message: string;
  /** O que fazer a respeito. */
  action: string;
  /** HTTP que o Nyroh deve devolver ao front. */
  httpStatus: number;
  /** Vale tentar de novo mais tarde (sem intervenção humana)? */
  retryable: boolean;
  requestId?: string;
  retryAfterSec?: number;
  requiredScope?: string;
  windowExpiredAt?: string | null;
  metaCode?: number | null;
}

interface Rule {
  message: string;
  action: string;
  httpStatus: number;
  retryable: boolean;
}

const RULES: Record<string, Rule> = {
  missing_credentials: {
    message: 'As credenciais da FluxoAPI não estão configuradas.',
    action: 'Defina FLUXO_KEY, FLUXO_SECRET e FLUXO_INSTANCE_ID no ambiente (Railway) ou na tela do WhatsApp.',
    httpStatus: 500,
    retryable: false
  },
  missing_auth_headers: {
    message: 'Requisição sem cabeçalhos de autenticação.',
    action: 'Erro interno de assinatura. Reporte ao suporte técnico com o request_id.',
    httpStatus: 500,
    retryable: false
  },
  stale_timestamp: {
    message: 'O relógio do servidor está fora da janela de 5 minutos.',
    action: 'Sincronize o relógio do servidor por NTP.',
    httpStatus: 500,
    retryable: true
  },
  invalid_nonce: {
    message: 'Nonce inválido na requisição.',
    action: 'Erro interno de assinatura. Tente novamente.',
    httpStatus: 500,
    retryable: true
  },
  nonce_reused: {
    message: 'Requisição repetida (nonce já usado).',
    action: 'Tente novamente; um novo nonce é gerado a cada envio.',
    httpStatus: 409,
    retryable: true
  },
  invalid_key: {
    message: 'A chave da FluxoAPI é inválida ou foi revogada.',
    action: 'Gere uma nova credencial no painel da FluxoAPI e atualize FLUXO_KEY/FLUXO_SECRET.',
    httpStatus: 502,
    retryable: false
  },
  invalid_signature: {
    message: 'A assinatura da requisição não confere.',
    action: 'Confira se FLUXO_SECRET está correto (sem espaços) e se o relógio do servidor está sincronizado.',
    httpStatus: 502,
    retryable: false
  },
  too_many_failures: {
    message: 'Muitas falhas de autenticação seguidas; a origem foi bloqueada temporariamente.',
    action: 'Corrija as credenciais e aguarde alguns minutos.',
    httpStatus: 429,
    retryable: true
  },
  rate_limited: {
    message: 'Limite de requisições por minuto do plano FluxoAPI atingido.',
    action: 'Aguarde o tempo indicado (Retry-After) ou reduza a velocidade do disparo.',
    httpStatus: 429,
    retryable: true
  },
  insufficient_scope: {
    message: 'A chave da FluxoAPI não tem a permissão necessária para esta ação.',
    action: 'Gere uma credencial com o escopo indicado em required_scope.',
    httpStatus: 403,
    retryable: false
  },
  not_found: {
    message: 'Recurso não encontrado na FluxoAPI (ou fora do alcance desta chave).',
    action: 'Confira o FLUXO_INSTANCE_ID e se a chave está presa a esta instância.',
    httpStatus: 404,
    retryable: false
  },
  invalid_input: {
    message: 'A FluxoAPI recusou os dados enviados.',
    action: 'Revise o campo indicado na mensagem de erro.',
    httpStatus: 422,
    retryable: false
  },
  window_closed: {
    message: 'A janela de 24h está fechada: o contato não escreve há mais de 24 horas.',
    action: 'Envie um modelo (template) aprovado pela Meta para reabrir a conversa.',
    httpStatus: 422,
    retryable: false
  },
  payment_required: {
    message: 'A mensalidade da instância na FluxoAPI está em aberto; os envios estão pausados.',
    action: 'Regularize em Cobrança no painel da FluxoAPI. Receber continua funcionando.',
    httpStatus: 402,
    retryable: false
  },
  instance_reconnecting: {
    message: 'O número está reconectando à Meta.',
    action: 'Aguarde alguns instantes e tente de novo.',
    httpStatus: 503,
    retryable: true
  },
  instance_not_connected: {
    message: 'O número do WhatsApp não está conectado.',
    action: 'Reconecte o número pelo painel da FluxoAPI.',
    httpStatus: 503,
    retryable: false
  },
  instance_required: {
    message: 'É preciso informar a instância (número) para esta operação.',
    action: 'Defina FLUXO_INSTANCE_ID.',
    httpStatus: 422,
    retryable: false
  },
  meta_error: {
    message: 'A Meta recusou a mensagem.',
    action: 'Veja o meta_code no detalhe; costuma ser modelo não aprovado, número inválido ou mídia rejeitada.',
    httpStatus: 422,
    retryable: false
  },
  template_not_found: {
    message: 'Modelo (template) não encontrado nesta conta/idioma.',
    action: 'Confira o nome e o idioma (ex.: pt_BR) do template aprovado.',
    httpStatus: 404,
    retryable: false
  },
  range_too_wide: {
    message: 'Período de consulta maior que 90 dias.',
    action: 'Reduza a janela da consulta.',
    httpStatus: 422,
    retryable: false
  },
  unknown_stage: {
    message: 'Etapa do funil desconhecida.',
    action: 'Use uma etapa existente do funil da FluxoAPI.',
    httpStatus: 422,
    retryable: false
  },
  reason_required: {
    message: 'É preciso informar o motivo para mover a oportunidade para esta etapa.',
    action: 'Envie o campo "reason".',
    httpStatus: 422,
    retryable: false
  },
  stage_mismatch: {
    message: 'A oportunidade já foi movida por outra pessoa/processo.',
    action: 'Recarregue e tente de novo (veja current_stage).',
    httpStatus: 409,
    retryable: false
  },
  not_readable: {
    message: 'Esta mensagem não pode ser marcada como lida.',
    action: 'Só mensagens recebidas, com wamid, podem ser marcadas como lidas.',
    httpStatus: 422,
    retryable: false
  },
  media_expired: {
    message: 'A mídia expirou na Meta (mais de 30 dias).',
    action: 'Não é mais possível baixar este arquivo.',
    httpStatus: 410,
    retryable: false
  },
  media_unavailable: {
    message: 'A Meta recusou o download da mídia.',
    action: 'Tente novamente em instantes.',
    httpStatus: 502,
    retryable: true
  },
  server_error: {
    message: 'Erro interno na FluxoAPI.',
    action: 'Tente novamente; se persistir, informe o request_id ao suporte da FluxoAPI.',
    httpStatus: 502,
    retryable: true
  },
  network_error: {
    message: 'Não foi possível conectar à FluxoAPI.',
    action: 'Verifique a conexão do servidor e o status em https://api.fluxoapi.com.br/health.',
    httpStatus: 502,
    retryable: true
  }
};

const FALLBACK: Rule = {
  message: 'Falha ao enviar a mensagem pela FluxoAPI.',
  action: 'Tente novamente. Se persistir, informe o request_id ao suporte.',
  httpStatus: 502,
  retryable: false
};

/**
 * Converte o erro cru da FluxoAPI (`{ code, message, request_id, ... }`) numa estrutura
 * única e amigável. `httpStatus` é o HTTP que a API devolveu (usado como pista quando não há `code`).
 */
export function describeFluxoError(err: any, httpStatus?: number): FluxoErrorInfo {
  const raw = err && typeof err === 'object' ? err : { message: typeof err === 'string' ? err : undefined };
  let code = String(raw.code || '').trim();

  if (!code || !RULES[code]) {
    if (httpStatus === 429) code = 'rate_limited';
    else if (httpStatus === 402) code = 'payment_required';
    else if (httpStatus === 403) code = 'insufficient_scope';
    else if (httpStatus === 404 && !code) code = 'not_found';
    else if (httpStatus && httpStatus >= 500 && !code) code = 'server_error';
  }

  const rule = RULES[code] || FALLBACK;
  // A `message` da FluxoAPI já vem em português e é específica (ex.: diz qual campo faltou).
  // Para `invalid_input` e `meta_error` ela é mais útil que o texto genérico.
  const preferApiMessage = (code === 'invalid_input' || code === 'meta_error' || !RULES[code]) && raw.message;

  return {
    code: code || 'send_failed',
    message: preferApiMessage ? String(raw.message) : rule.message,
    // O `hint` da API é técnico (ex.: "POST /v1/instances/…/messages/template"): para quem atende, vale a nossa orientação
    action: String(RULES[code] ? rule.action : (raw.hint || rule.action)),
    httpStatus: rule.httpStatus,
    retryable: rule.retryable,
    requestId: raw.request_id ? String(raw.request_id) : undefined,
    requiredScope: raw.required_scope ? String(raw.required_scope) : undefined,
    windowExpiredAt: raw.window_expired_at ?? undefined,
    metaCode: typeof raw.meta_code === 'number' ? raw.meta_code : undefined
  };
}

/** Códigos que a documentação lista no enum de erros (usado nos testes de cobertura). */
export const KNOWN_FLUXO_ERROR_CODES = Object.keys(RULES);
