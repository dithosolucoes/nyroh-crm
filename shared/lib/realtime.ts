/**
 * Conexão de tempo real ÚNICA por aba.
 *
 * Antes cada tela abria o seu próprio EventSource: a tela principal e a do chat mantinham
 * DUAS conexões por aba, mais um poll de 5s e outro de presença de 8s. Com o CRM aberto em
 * três abas o navegador estourava o limite de 6 conexões por domínio em HTTP/1.1 e o sistema
 * simplesmente parava de atualizar — sem erro visível, só "travado".
 *
 * Aqui há um único EventSource compartilhado. Quem precisa se inscreve; quando o último
 * ouvinte sai, a conexão fecha.
 */

type Handler = (data: any, raw: MessageEvent) => void;

const handlers = new Map<string, Set<Handler>>();
let source: EventSource | null = null;
let connected = false;
let hadError = false;
const connectionListeners = new Set<(online: boolean) => void>();

function emit(type: string, data: any, raw: MessageEvent) {
  const set = handlers.get(type);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(data, raw);
    } catch (err) {
      console.error(`[realtime] erro no ouvinte de ${type}:`, err);
    }
  }
}

/** Eventos que o servidor envia. Qualquer um novo só precisa ser adicionado aqui. */
const EVENT_TYPES = [
  'NEW_MESSAGE',
  'NEW_LEAD',
  'LEAD_UPDATED',
  'LEAD_HOT_REPLY',
  'LEAD_ASSIGNED',
  'LEAD_PRESENCE',
  'MESSAGE_STATUS_UPDATE',
  'HUMAN_TAKEOVER',
  'SALESPEOPLE_UPDATED',
  'QUICK_REPLY_CREATED',
  'QUICK_REPLY_DELETED',
  'INSTANCE_STATUS',
  'INSTANCE_ACCESS_EXPIRING',
  'TEMPLATE_STATUS_UPDATE',
  'DISPATCH_QUEUED',
  // Disparo em massa (espelhados da fila para o SSE pelo servidor)
  'CAMPAIGN_BATCH_PROGRESS',
  'DISPATCH_COMPLETED',
  'CAMPAIGN_SPEED_CHANGED',
  'CAMPAIGN_IMPORT_PROGRESS',
  'ZIP_IMPORT_COMPLETED',
  'CAMPAIGN_BATCH_UPDATED',
  'CAMPAIGN_BATCH_DELETED',
  'CAMPAIGN_LEAD_DISPATCHED',
  'resync'
];

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  for (const fn of connectionListeners) {
    try {
      fn(value);
    } catch {
      /* ignora */
    }
  }
}

function ensureConnection() {
  if (source) return;
  try {
    const es = new EventSource('/api/realtime/stream');
    source = es;

    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (evt: MessageEvent) => {
        let data: any = null;
        try {
          data = evt.data ? JSON.parse(evt.data) : null;
        } catch {
          data = null;
        }
        emit(type, data, evt);
      });
    }

    es.onopen = () => {
      setConnected(true);
      if (hadError) {
        hadError = false;
        // Voltou de uma queda: quem escuta decide o que recarregar.
        emit('reconnected', null, {} as MessageEvent);
      }
    };
    es.onerror = () => {
      hadError = true;
      setConnected(false);
    };
  } catch (err) {
    console.warn('[realtime] não foi possível abrir a conexão:', err);
    setConnected(false);
  }
}

function closeIfIdle() {
  const temOuvinte = Array.from(handlers.values()).some(set => set.size > 0);
  if (temOuvinte || connectionListeners.size > 0) return;
  source?.close();
  source = null;
  setConnected(false);
}

/** Inscreve-se num evento. Devolve a função que cancela a inscrição. */
export function onRealtime(type: string, handler: Handler): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  ensureConnection();
  return () => {
    handlers.get(type)?.delete(handler);
    closeIfIdle();
  };
}

/** Acompanha o estado da conexão (para o indicador "em tempo real"). */
export function onRealtimeConnection(handler: (online: boolean) => void): () => void {
  connectionListeners.add(handler);
  ensureConnection();
  handler(connected);
  return () => {
    connectionListeners.delete(handler);
    closeIfIdle();
  };
}

export function isRealtimeConnected(): boolean {
  return connected;
}


/**
 * Notificação do sistema quando a aba NÃO está na frente.
 *
 * Antes só havia o toast dentro da tela e um som: com o CRM numa aba de fundo o vendedor
 * simplesmente não via o cliente responder. Pedimos a permissão uma vez, no primeiro clique
 * do usuário (navegador não deixa pedir sozinho).
 */
let permissaoPedida = false;

export function prepararNotificacoes() {
  if (permissaoPedida || typeof Notification === 'undefined') return;
  permissaoPedida = true;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

export function notificarSeEmSegundoPlano(titulo: string, corpo: string, aoClicar?: () => void) {
  try {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(titulo, { body: corpo.slice(0, 120), tag: 'nyroh-mensagem' });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignora */
      }
      aoClicar?.();
      n.close();
    };
  } catch {
    /* navegador sem suporte ou permissão revogada */
  }
}
