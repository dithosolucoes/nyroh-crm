/**
 * Caminhos da API usados pela tela de disparos (item 5.2 d).
 * Cada função devolve exatamente o caminho que a tela usava antes. Os pedidos (init) continuam
 * onde estão, e as chamadas continuam em apiFetch.
 */

export const urlAdminFluxoInstances = '/api/admin/fluxo/instances';
export const urlAdminFluxoTemplates = '/api/admin/fluxo/templates';
export const urlBrands = '/api/brands';
export const urlCampaignBatches = '/api/campaign/batches';
export const urlCampaignBatchesBrandId = (p0: string | number) => `/api/campaign/batches/${p0}/brand`;
export const urlCampaignBatchesCancelId = (p0: string | number) => `/api/campaign/batches/${p0}/cancel`;
export const urlCampaignBatchesId = (p0: string | number) => `/api/campaign/batches/${p0}`;
export const urlCampaignBatchesPauseId = (p0: string | number) => `/api/campaign/batches/${p0}/pause`;
export const urlCampaignBatchesProgressId = (p0: string | number) => `/api/campaign/batches/${p0}/progress`;
export const urlCampaignBatchesQuarantineConfigId = (p0: string | number) => `/api/campaign/batches/${p0}/quarantine-config`;
export const urlCampaignBatchesReleaseQuarantineId = (p0: string | number) => `/api/campaign/batches/${p0}/release-quarantine`;
export const urlCampaignBatchesResetStagingId = (p0: string | number) => `/api/campaign/batches/${p0}/reset-staging`;
export const urlCampaignBatchesResumeId = (p0: string | number) => `/api/campaign/batches/${p0}/resume`;
export const urlCampaignBatchesReturnUnsentId = (p0: string | number) => `/api/campaign/batches/${p0}/return-unsent`;
export const urlCampaignBatchesSyncWhatsappWebId = (p0: string | number) => `/api/campaign/batches/${p0}/sync-whatsapp-web`;
export const urlCampaignCopies = '/api/campaign/copies';
export const urlCampaignCopiesId = (p0: string | number) => `/api/campaign/copies/${p0}`;
export const urlCampaignDispatch = '/api/campaign/dispatch';
export const urlCampaignDispatchSpeed = '/api/campaign/dispatch/speed';
export const urlCampaignDistribute = '/api/campaign/distribute';
export const urlCampaignImportProgressId = (p0: string | number) => `/api/campaign/import-progress/${p0}`;
export const urlCampaignImportProgressInit = '/api/campaign/import-progress/init';
export const urlCampaignLeadFieldsId = (p0: string | number) => `/api/campaign/lead-fields${p0}`;
export const urlCampaignLeadsSimulateReplyId = (p0: string | number) => `/api/campaign/leads/${p0}/simulate-reply`;
export const urlCampaignSimulateAction = '/api/campaign/simulate-action';
export const urlCampaignTestDispatch = '/api/campaign/test-dispatch';
export const urlCampaignUploads = '/api/campaign/uploads';
export const urlPhoneNumbers = '/api/phone-numbers';
export const urlRegrasContatoPrevia = '/api/regras-contato/previa';
