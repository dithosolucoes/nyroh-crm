/**
 * Contratos (C1): formato das respostas das rotas críticas, compartilhado entre back e front.
 *
 * Quem muda um destes tipos quebra o build de quem usa, e isso é o objetivo.
 * Os exemplos abaixo são conferidos pelo compilador (`npm run lint`), então um campo
 * renomeado ou removido aparece como erro antes de subir.
 */

/** POST /api/campaign/upload-zip (sucesso) */
export interface RespostaUploadZipOk {
  success: true;
  jobId: string;
  batchId: string;
  totalProcessed: number;
  validMobiles: number;
  landlines: number;
  withNyrohUrl: number;
  withWebsite: number;
}

/** Resposta de erro das rotas de upload (HTTP 4xx/5xx) */
export interface RespostaErroApi {
  success?: false;
  error: string;
}

/** POST /api/campaign/upload-zip: sucesso ou erro */
export type RespostaUploadZip = RespostaUploadZipOk | RespostaErroApi;

/** Item de GET /api/campaign/uploads */
export interface UploadZipRegistro {
  id: string;
  batchId: string | null;
  batchName: string | null;
  fileName: string;
  fileSizeBytes: number;
  leadsInZip: number;
  leadsSaved: number;
  skippedContacted: number;
  skippedRepeated: number;
  validMobiles: number;
  landlines: number;
  createdAt: string;
}

/** Resposta de GET /api/campaign/uploads */
export interface RespostaListaUploads {
  uploads: UploadZipRegistro[];
}

/** Status de uma mensagem enviada pelo CRM. */
export type StatusMensagemEnviada = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

/** POST /api/leads/:leadId/messages (sucesso) */
export interface RespostaEnviarMensagem {
  success: boolean;
  replayed?: boolean;
  billable?: boolean;
  status: StatusMensagemEnviada;
  remoteMessageId?: string | null;
  message?: unknown;
}

/** Exemplos conferidos pelo compilador. Se um campo mudar de nome, o build quebra aqui. */
export const EXEMPLO_UPLOAD_ZIP = {
  success: true,
  jobId: 'job_1',
  batchId: 'batch_1',
  totalProcessed: 10,
  validMobiles: 9,
  landlines: 1,
  withNyrohUrl: 0,
  withWebsite: 0
} satisfies RespostaUploadZipOk;

export const EXEMPLO_UPLOAD_REGISTRO = {
  id: 'up_1',
  batchId: 'batch_1',
  batchName: 'Safra E2E',
  fileName: 'safra.zip',
  fileSizeBytes: 1024,
  leadsInZip: 4,
  leadsSaved: 3,
  skippedContacted: 0,
  skippedRepeated: 1,
  validMobiles: 3,
  landlines: 0,
  createdAt: '2026-11-13T18:00:00.000Z'
} satisfies UploadZipRegistro;
