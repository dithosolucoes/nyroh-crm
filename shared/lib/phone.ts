/**
 * Utilidades para tratamento de números de telefone e URLs
 */

// Extrai somente os dígitos numéricos
export function extractDigits(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * REGRA CRUCIAL DE NEGÓCIO:
 * Na discagem do celular e no link do QR Code, o número deve ter SEMPRE o ZERO na frente do DDD (ex: 031991503721).
 * O botão de copiar número mantém a visualização legível.
 */
export function getDialerTelLink(phone: string): string {
  const digits = extractDigits(phone);
  if (!digits) return 'tel:';
  const dialDigits = digits.startsWith('0') ? digits : `0${digits}`;
  return `tel:${dialDigits}`;
}

export function getQrTelLink(phone: string): string {
  return getDialerTelLink(phone);
}

/**
 * URL do WhatsApp Web/API limpando caracteres especiais, adicionando DDI 55 e mensagem opcional
 */
export const DEFAULT_WHATSAPP_TEMPLATE = "Aqui, o site que te falei: {site}";

export function getStoredWhatsAppTemplate(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('crm_whatsapp_template') || DEFAULT_WHATSAPP_TEMPLATE;
  }
  return DEFAULT_WHATSAPP_TEMPLATE;
}

export function formatWhatsAppMessage(
  template: string,
  params: { name?: string; site?: string; salesperson?: string }
): string {
  let msg = template || DEFAULT_WHATSAPP_TEMPLATE;
  msg = msg.replace(/\{site\}/gi, params.site || '');
  msg = msg.replace(/\{nome\}/gi, params.name || '');
  msg = msg.replace(/\{lead\}/gi, params.name || '');
  msg = msg.replace(/\{vendedor\}/gi, params.salesperson || '');
  return msg.trim();
}

export type WhatsAppAppType = 'business' | 'normal' | 'ask';

export function getStoredWhatsAppAppType(): WhatsAppAppType {
  if (typeof window !== 'undefined') {
    const val = localStorage.getItem('crm_whatsapp_app_type');
    if (val === 'business' || val === 'normal' || val === 'ask') {
      return val;
    }
  }
  return 'business';
}

export function setStoredWhatsAppAppType(type: WhatsAppAppType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('crm_whatsapp_app_type', type);
  }
}

/**
 * Retorna a URL direta ou Deep Link do WhatsApp.
 * No Android, permite direcionar especificamente para o WhatsApp Business (com.whatsapp.w4b)
 * ou WhatsApp Normal (com.whatsapp) evitando que o celular fique preso no app errado.
 */
export function getWhatsAppTargetUrl(phone: string, text?: string, appType?: WhatsAppAppType): string {
  let digits = extractDigits(phone);
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  const cleanPhone = `55${digits}`;
  const encodedText = text ? encodeURIComponent(text) : '';
  const currentType = appType || getStoredWhatsAppAppType();

  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isAndroid) {
    if (currentType === 'business') {
      // Intent nativo para o WhatsApp Business Android (com.whatsapp.w4b)
      return `intent://send?phone=${cleanPhone}${encodedText ? `&text=${encodedText}` : ''}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`;
    }
    if (currentType === 'normal') {
      // Intent nativo para o WhatsApp Normal Android (com.whatsapp)
      return `intent://send?phone=${cleanPhone}${encodedText ? `&text=${encodedText}` : ''}#Intent;package=com.whatsapp;scheme=whatsapp;end`;
    }
    // 'ask': usa protocolo whatsapp:// que abre o seletor do Android
    return `whatsapp://send?phone=${cleanPhone}${encodedText ? `&text=${encodedText}` : ''}`;
  }

  if (isMobile) {
    // iOS
    return `whatsapp://send?phone=${cleanPhone}${encodedText ? `&text=${encodedText}` : ''}`;
  }

  // Desktop / Web browser
  return `https://api.whatsapp.com/send?phone=${cleanPhone}${encodedText ? `&text=${encodedText}` : ''}`;
}

export function openWhatsApp(phone: string, text?: string, appType?: WhatsAppAppType): void {
  const currentType = appType || getStoredWhatsAppAppType();
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const targetUrl = getWhatsAppTargetUrl(phone, text, currentType);

  if (isMobile) {
    // Em celulares, redirecionar aciona o aplicativo específico instalado instantaneamente
    window.location.href = targetUrl;
  } else {
    // No computador / desktop, abre o WhatsApp Web em uma aba
    window.open(targetUrl, 'whatsapp');
  }
}

export function getWhatsAppUrl(phone: string, text?: string): string {
  let digits = extractDigits(phone);
  // Se começar com 0 (ex: 031...), remove para o formato internacional do WhatsApp (5531...)
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  let url = `https://api.whatsapp.com/send?phone=55${digits}`;
  if (text) {
    url += `&text=${encodeURIComponent(text)}`;
  }
  return url;
}

/**
 * Normaliza qualquer número brasileiro para o formato internacional E.164 (+55DDDNÚMERO).
 * Garante consistência em casamento de leads sem depender de sufixos de 8 dígitos (§A3, T24).
 */
export function normalizeE164Phone(raw: string): string {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  // Se já tiver DDI 55
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`;
  }
  // Se for DDD + 8 ou 9 dígitos (10 ou 11 dígitos)
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    return `+55${digits}`;
  }
  if (digits.startsWith('55')) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

/**
 * Compara dois números de telefone considerando DDD e opcionalmente o nono dígito móvel.
 * NUNCA casa telefones de DDDs diferentes mesmo que tenham os mesmos 8 dígitos finais (T24).
 */
export function arePhonesEquivalent(phoneA: string, phoneB: string): boolean {
  if (!phoneA || !phoneB) return false;
  let digitsA = String(phoneA).replace(/\D/g, '');
  let digitsB = String(phoneB).replace(/\D/g, '');
  if (!digitsA || !digitsB) return false;
  if (digitsA === digitsB) return true;

  // Normalizar removendo DDI 55 se presente
  if (digitsA.startsWith('55') && digitsA.length >= 12) digitsA = digitsA.slice(2);
  if (digitsB.startsWith('55') && digitsB.length >= 12) digitsB = digitsB.slice(2);

  if (digitsA === digitsB) return true;

  // Comparar se ambos têm DDD (mínimo 10 dígitos)
  if (digitsA.length >= 10 && digitsB.length >= 10) {
    const dddA = digitsA.slice(0, 2);
    const dddB = digitsB.slice(0, 2);
    // DDDs diferentes NUNCA são o mesmo lead!
    if (dddA !== dddB) return false;

    const numA = digitsA.slice(2);
    const numB = digitsB.slice(2);
    if (numA === numB) return true;

    // Tratar 9º dígito: um tem 9 dígitos começando com 9 e outro tem 8 dígitos.
    // O 9 só foi acrescentado a CELULARES (que começam com 6-9); fixo (2-5) nunca é equivalente.
    if (numA.length === 9 && numA[0] === '9' && numB.length === 8 && /^[6-9]/.test(numB) && numA.slice(1) === numB) return true;
    if (numB.length === 9 && numB[0] === '9' && numA.length === 8 && /^[6-9]/.test(numA) && numB.slice(1) === numA) return true;
  }

  return false;
}

/**
 * Todas as formas de dígitos de um MESMO número brasileiro (com/sem DDI 55, com/sem o 9º dígito
 * de celular). Serve para busca EXATA no banco (`= ANY($1)`), nunca por sufixo.
 */
export function phoneDigitVariants(raw: string): string[] {
  let d = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return [];
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  const bases = new Set<string>([local]);
  if (local.length === 11 && local[2] === '9') bases.add(local.slice(0, 2) + local.slice(3)); // sem o 9
  if (local.length === 10 && /^[6-9]/.test(local.slice(2))) bases.add(local.slice(0, 2) + '9' + local.slice(2)); // com o 9
  const out = new Set<string>([d]);
  for (const b of bases) {
    out.add(b);
    out.add(`55${b}`);
  }
  return Array.from(out);
}

export interface PhoneValidationResult {
  isValid: boolean;
  e164: string;
  rawDigits: string;
  ddd?: string;
  number?: string;
  isLandline: boolean;
  isMobile: boolean;
  error?: string;
}

/**
 * Validação estrita e formatação oficial E.164 (+55DDDNÚMERO) para WhatsApp (T13).
 * Garante 12 dígitos (fixo BR) ou 13 dígitos (celular BR).
 * Barreia números inválidos antes de chamadas HTTP (§A13).
 */
export function formatAndValidateE164Phone(raw: string): PhoneValidationResult {
  if (!raw || typeof raw !== 'string') {
    return {
      isValid: false,
      e164: '',
      rawDigits: '',
      isLandline: false,
      isMobile: false,
      error: 'Telefone não informado.'
    };
  }

  let digits = raw.replace(/\D/g, '');
  if (!digits) {
    return {
      isValid: false,
      e164: '',
      rawDigits: '',
      isLandline: false,
      isMobile: false,
      error: 'Telefone não contém dígitos válidos.'
    };
  }

  // Se começar com 0 na frente do DDD (ex: 011988216073), remove o zero
  if (digits.startsWith('0') && digits.length >= 11) {
    digits = digits.slice(1);
  }

  // Se não começar com 55 e tiver 10 ou 11 dígitos (DDD + número), prefixa com 55
  if (!digits.startsWith('55')) {
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    } else {
      return {
        isValid: false,
        e164: '',
        rawDigits: digits,
        isLandline: false,
        isMobile: false,
        error: `Comprimento de telefone inválido (${digits.length} dígitos). Esperado 10 ou 11 dígitos com DDD.`
      };
    }
  }

  // Agora digits começa com 55. Deve ter 12 (fixo) ou 13 (celular)
  if (digits.length !== 12 && digits.length !== 13) {
    return {
      isValid: false,
      e164: '',
      rawDigits: digits,
      isLandline: false,
      isMobile: false,
      error: `Telefone brasileiro com DDI 55 deve ter 12 dígitos (fixo) ou 13 dígitos (celular). Encontrado: ${digits.length}.`
    };
  }

  const ddd = digits.slice(2, 4);
  const number = digits.slice(4);

  // Validar DDD brasileiro (11 a 99)
  const dddNum = parseInt(ddd, 10);
  if (isNaN(dddNum) || dddNum < 11 || dddNum > 99) {
    return {
      isValid: false,
      e164: '',
      rawDigits: digits,
      ddd,
      number,
      isLandline: false,
      isMobile: false,
      error: `DDD inválido: ${ddd}.`
    };
  }

  // Fixo: 8 dígitos, começando com 2, 3, 4 ou 5
  const isLandline = number.length === 8 && ['2', '3', '4', '5'].includes(number[0]);
  // Celular: 9 dígitos, começando com 9
  const isMobile = number.length === 9 && number[0] === '9';

  if (!isLandline && !isMobile) {
    return {
      isValid: false,
      e164: '',
      rawDigits: digits,
      ddd,
      number,
      isLandline,
      isMobile,
      error: `Formato de número inválido para o DDD ${ddd}: ${number} (celular deve ter 9 dígitos iniciando com 9; fixo deve ter 8 dígitos iniciando com 2-5).`
    };
  }

  return {
    isValid: true,
    e164: `+${digits}`,
    rawDigits: digits,
    ddd,
    number,
    isLandline,
    isMobile
  };
}


