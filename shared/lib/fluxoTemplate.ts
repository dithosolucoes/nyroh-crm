/**
 * Montagem do corpo de envio de modelo (§A4/§A5) a partir da definição REAL do modelo.
 *
 * O catálogo (`GET /v1/instances/{id}/templates`) traz `fields[]`: exatamente o que precisa ser
 * preenchido. Faltar o parâmetro de UM botão faz a Meta recusar a mensagem inteira — por isso
 * este módulo preenche cada `field` e devolve `missing` quando algo obrigatório ficou sem valor,
 * para o chamador falhar ANTES de gastar uma requisição (e uma cobrança).
 */

export interface TemplateField {
  slot: 'header' | 'body' | 'button' | 'card_header' | 'card_body' | 'card_button' | 'offer' | string;
  kind: 'text' | 'image' | 'video' | 'document' | 'location' | 'url_suffix' | 'coupon_code' | 'flow_token' | 'otp_code' | 'expiration_ms' | string;
  ref?: string;
  label?: string;
  example?: string;
  buttonIndex?: number;
  cardIndex?: number;
  required?: boolean;
}

export interface CatalogTemplate {
  id?: string;
  name: string;
  language: string;
  status?: string;
  category?: string;
  parameterFormat?: 'NAMED' | 'POSITIONAL';
  fields?: TemplateField[];
  sendable?: boolean;
  blockedReason?: string | null;
  bodyText?: string | null;
}

export interface TemplateValues {
  /** Variáveis do corpo por referência: { "1": "Marina" } ou { first_name: "Marina" }. */
  body?: Record<string, string>;
  /** Variáveis do corpo por posição (1ª, 2ª…); usado quando `body` não traz a chave. */
  positional?: string[];
  headerText?: Record<string, string>;
  /** URL pública (HTTPS) do arquivo do cabeçalho (imagem/vídeo/documento). */
  headerMediaLink?: string;
  headerMediaFilename?: string;
  headerLocation?: { latitude: string; longitude: string; name?: string; address?: string };
  /** Por índice (zero-based, contando TODOS os botões): trecho de URL, cupom ou token. */
  buttons?: Record<string, string>;
  cards?: Record<string, { headerLink?: string; body?: Record<string, string>; buttons?: Record<string, string> }>;
  /** Modelos de autenticação: o mesmo código vai no corpo e no botão. */
  code?: string;
  offerExpirationMs?: number;
}

export interface BuiltTemplate {
  /** Objeto `template` pronto para o corpo do POST /messages/template. */
  template: Record<string, any>;
  /** Campos obrigatórios que ficaram sem valor (ex.: "button[0]"). Vazio = pode enviar. */
  missing: string[];
  /** true se usou a definição real do catálogo; false se montou às cegas (catálogo indisponível). */
  usedCatalog: boolean;
}

/** A Meta recusa variável com quebra de linha, tab ou 4+ espaços seguidos, e vazia. */
export function sanitizeTemplateValue(value: unknown, maxLen = 1024): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizeRecord(rec?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec || {})) {
    const clean = sanitizeTemplateValue(v);
    if (clean) out[k] = clean;
  }
  return out;
}

function positionalToBody(list?: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  (list || []).forEach((v, i) => {
    const clean = sanitizeTemplateValue(v);
    if (clean) out[String(i + 1)] = clean;
  });
  return out;
}

export function buildTemplatePayload(
  def: CatalogTemplate | null | undefined,
  name: string,
  language: string,
  values: TemplateValues
): BuiltTemplate {
  const template: Record<string, any> = { name, language };
  const missing: string[] = [];
  const fields = def?.fields;

  const bodyValues: Record<string, string> = { ...positionalToBody(values.positional), ...sanitizeRecord(values.body) };

  // Sem catálogo (indisponível): monta o que foi informado, sem validar.
  if (!def || !fields || fields.length === 0) {
    if (Object.keys(bodyValues).length) template.body = bodyValues;
    const btns = sanitizeRecord(values.buttons);
    if (Object.keys(btns).length) template.buttons = btns;
    if (values.headerMediaLink) {
      template.header = { media: { link: values.headerMediaLink, ...(values.headerMediaFilename ? { filename: values.headerMediaFilename } : {}) } };
    }
    if (values.code) template.code = sanitizeTemplateValue(values.code, 15);
    return { template, missing, usedCatalog: false };
  }

  const isRequired = (f: TemplateField) => f.required !== false;

  for (const f of fields) {
    switch (f.slot) {
      case 'body': {
        if (f.kind !== 'text') break;
        const ref = String(f.ref ?? '');
        const value = bodyValues[ref];
        if (value) {
          template.body = template.body || {};
          template.body[ref] = value;
        } else if (isRequired(f)) {
          missing.push(`body.${ref}`);
        }
        break;
      }
      case 'header': {
        if (f.kind === 'text') {
          const ref = String(f.ref ?? '');
          const value = sanitizeTemplateValue(values.headerText?.[ref]);
          if (value) {
            template.header = template.header || {};
            template.header.text = template.header.text || {};
            template.header.text[ref] = value;
          } else if (isRequired(f)) {
            missing.push(`header.${ref}`);
          }
        } else if (f.kind === 'image' || f.kind === 'video' || f.kind === 'document') {
          if (values.headerMediaLink) {
            template.header = template.header || {};
            template.header.media = {
              link: values.headerMediaLink,
              ...(values.headerMediaFilename ? { filename: values.headerMediaFilename } : {})
            };
          } else if (isRequired(f)) {
            missing.push('header.media');
          }
        } else if (f.kind === 'location') {
          if (values.headerLocation) {
            template.header = template.header || {};
            template.header.location = values.headerLocation;
          } else if (isRequired(f)) {
            missing.push('header.location');
          }
        }
        break;
      }
      case 'button': {
        const idx = String(f.buttonIndex ?? f.ref ?? '0');
        const value = sanitizeTemplateValue(values.buttons?.[idx], 256);
        if (value) {
          template.buttons = template.buttons || {};
          template.buttons[idx] = value;
        } else if (f.kind === 'otp_code' && values.code) {
          // autenticação: o código no botão é preenchido via `code`
        } else if (isRequired(f)) {
          missing.push(`button[${idx}]`);
        }
        break;
      }
      case 'card_header': {
        const ci = String(f.cardIndex ?? 0);
        const link = values.cards?.[ci]?.headerLink;
        if (link) {
          template.cards = template.cards || {};
          template.cards[ci] = template.cards[ci] || {};
          template.cards[ci].header = { link };
        } else if (isRequired(f)) {
          missing.push(`cards[${ci}].header`);
        }
        break;
      }
      case 'card_body': {
        const ci = String(f.cardIndex ?? 0);
        const ref = String(f.ref ?? '');
        const value = sanitizeTemplateValue(values.cards?.[ci]?.body?.[ref]);
        if (value) {
          template.cards = template.cards || {};
          template.cards[ci] = template.cards[ci] || {};
          template.cards[ci].body = template.cards[ci].body || {};
          template.cards[ci].body[ref] = value;
        } else if (isRequired(f)) {
          missing.push(`cards[${ci}].body.${ref}`);
        }
        break;
      }
      case 'card_button': {
        const ci = String(f.cardIndex ?? 0);
        const bi = String(f.buttonIndex ?? f.ref ?? '0');
        const value = sanitizeTemplateValue(values.cards?.[ci]?.buttons?.[bi], 256);
        if (value) {
          template.cards = template.cards || {};
          template.cards[ci] = template.cards[ci] || {};
          template.cards[ci].buttons = template.cards[ci].buttons || {};
          template.cards[ci].buttons[bi] = value;
        } else if (isRequired(f)) {
          missing.push(`cards[${ci}].button[${bi}]`);
        }
        break;
      }
      case 'offer': {
        if (f.kind === 'expiration_ms') {
          if (typeof values.offerExpirationMs === 'number') template.offer_expiration_ms = values.offerExpirationMs;
          else if (isRequired(f)) missing.push('offer_expiration_ms');
        }
        break;
      }
      default:
        break;
    }

    if (f.kind === 'otp_code' && values.code) {
      template.code = sanitizeTemplateValue(values.code, 15);
    }
    if (f.kind === 'expiration_ms' && f.slot !== 'offer' && typeof values.offerExpirationMs === 'number') {
      template.offer_expiration_ms = values.offerExpirationMs;
    }
  }

  return { template, missing: Array.from(new Set(missing)), usedCatalog: true };
}
