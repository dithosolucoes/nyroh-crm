import { isUiFlagOn } from '@shared/lib/uiFlags';
import { User } from '@shared/types';

export const SHOW_LAB = isUiFlagOn(import.meta.env.VITE_MOSTRAR_LAB);
export interface AdminWhatsAppFluxoViewProps {
  currentUser: User;
  onShowToast: (msg: string) => void;
}

export interface MetaTemplateItem {
  id: string;
  name: string;
  accountId?: string;
  accountName?: string;
  /** Vem da Meta como texto (MARKETING, UTILITY, AUTHENTICATION...). Não é só as duas do CRM. */
  category: string;
  language: string;
  /** Estados da Meta além dos quatro do CRM (PAUSED, DISABLED...): texto livre. */
  status: string;
  components: any[];
  usageCount?: number;
  qualityScore?: string;
  rejectedReason?: string | null;
  createdAt?: string;
  submittedToMeta?: boolean;
}

export interface WebhookEventItem {
  id: string;
  receivedAt: string;
  type: string;
  summary: string;
  payload: any;
}

