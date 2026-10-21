export interface WebhookEventPayload {
  id: string;
  receivedAt: string;
  type: string;
  summary: string;
  payload: any;
}

export interface IncomingWhatsAppMessageParams {
  phone: string;
  text: string;
  senderName?: string;
  messageId?: string;
  timestamp?: string;
}

export interface DeliveryStatusUpdateParams {
  phone: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  messageId?: string;
}
