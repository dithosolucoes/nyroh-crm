import crypto from 'crypto';

/**
 * Valida a assinatura oficial do Webhook da FluxoAPI conforme especificação §A9:
 * Cabeçalhos:
 * - X-Fluxo-Timestamp: Unix timestamp em segundos
 * - X-Fluxo-Signature: v1=<hex> (ou v1=<hex1>,v1=<hex2> em rotação)
 * Assinatura calculada:
 *   HMAC-SHA256(secret, `${timestamp}\n${rawBody}`)
 */
export function verifyFluxoWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  customSecret?: string
): { isValid: boolean; reason?: string } {
  const secret = (customSecret || process.env.FLUXO_WEBHOOK_SECRET || '').trim();

  // Sem segredo configurado:
  //  - em produção, RECUSA. Antes aceitava qualquer requisição, e qualquer pessoa que
  //    descobrisse a URL podia injetar "mensagens recebidas" e criar leads falsos.
  //  - fora de produção, segue aceitando para não travar um ambiente local recém-criado.
  if (!secret) {
    const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);
    if (isProduction) {
      return {
        isValid: false,
        reason: 'FLUXO_WEBHOOK_SECRET não configurado: em produção o webhook não aceita eventos sem assinatura.'
      };
    }
    return { isValid: true, reason: 'Nenhum FLUXO_WEBHOOK_SECRET configurado; verificação ignorada (ambiente local).' };
  }

  // Normalizar cabeçalhos (case-insensitive)
  const getHeader = (name: string): string => {
    const val = headers[name] || headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0] || '';
    return typeof val === 'string' ? val : '';
  };

  const timestamp = getHeader('x-fluxo-timestamp');
  const signatureHeader = getHeader('x-fluxo-signature');

  if (!timestamp) {
    return { isValid: false, reason: 'Cabeçalho X-Fluxo-Timestamp ausente.' };
  }

  if (!signatureHeader) {
    return { isValid: false, reason: 'Cabeçalho X-Fluxo-Signature ausente.' };
  }

  // Verificar idade do timestamp (máximo ±300s conforme §A1 e §A9)
  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum)) {
    return { isValid: false, reason: 'X-Fluxo-Timestamp não é um número válido.' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > 300) {
    return { isValid: false, reason: `Timestamp expirado ou fora da janela de 300s (Delta: ${Math.abs(nowSec - tsNum)}s).` };
  }

  // Calcular assinatura esperada
  const payloadToSign = `${timestamp}\n${rawBody}`;
  const computedHash = crypto
    .createHmac('sha256', secret)
    .update(payloadToSign)
    .digest('hex');
  const expectedSig = `v1=${computedHash}`;

  // Separar assinaturas do header (pode vir separadas por vírgula em caso de rotação de segredo)
  const receivedSignatures = signatureHeader
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  let matched = false;
  for (const sig of receivedSignatures) {
    if (sig.length === expectedSig.length) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
          matched = true;
          break;
        }
      } catch {
        // Ignorar mismatch de buffer length
      }
    }
  }

  if (!matched) {
    return { isValid: false, reason: 'Assinatura HMAC inválida.' };
  }

  return { isValid: true };
}
