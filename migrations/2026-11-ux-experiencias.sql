-- Migração: experiências de UX (marcas, números, central de leads, bloqueio com aprovação).
-- NÃO aplicar em produção sem OK. Idempotente (IF NOT EXISTS) e sem apagar dados.
-- Também é aplicada pelo módulo src/lib/uxRoutes.ts quando NYROH_APLICAR_MIGRACOES_UX=true.

CREATE TABLE IF NOT EXISTS brands (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  services TEXT DEFAULT '',
  message_templates JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phone_numbers (
  id VARCHAR(255) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  phone_display VARCHAR(100),
  meta_phone_number_id VARCHAR(100),
  fluxo_instance_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vínculo N:N: um número serve várias marcas; uma marca usa vários números.
CREATE TABLE IF NOT EXISTS brand_numbers (
  brand_id VARCHAR(255) NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  phone_number_id VARCHAR(255) NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
  PRIMARY KEY (brand_id, phone_number_id)
);

-- Remessa: cada upload de leads. Todo lead passa a apontar para a remessa de origem.
CREATE TABLE IF NOT EXISTS remessas (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS remessa_id VARCHAR(255) REFERENCES remessas(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_remessa ON leads(remessa_id);

-- Seleções por ID (blocos de 20, 50, 100… leads). Guardam IDs, não cópias.
CREATE TABLE IF NOT EXISTS lead_selections (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  size INT NOT NULL,
  lead_ids JSONB NOT NULL,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Pedido de bloqueio: sugerido pelo vendedor, decidido pelo admin. Fica no histórico do lead.
CREATE TABLE IF NOT EXISTS lead_block_requests (
  id VARCHAR(255) PRIMARY KEY,
  lead_id VARCHAR(255) NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  requested_by VARCHAR(255),
  reason_code VARCHAR(100) NOT NULL,
  reason_text TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  decided_by VARCHAR(255),
  decision_note TEXT,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_block_requests_status ON lead_block_requests(status);

-- Safra (campanha) ligada a uma marca. Os números usados vêm do vínculo marca ↔ número.
ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS brand_id VARCHAR(255) REFERENCES brands(id);

-- Contagem de disparos do dia por lead (card do Pipeline).
CREATE INDEX IF NOT EXISTS idx_campaign_leads_sent_at ON campaign_leads (sent_at);
