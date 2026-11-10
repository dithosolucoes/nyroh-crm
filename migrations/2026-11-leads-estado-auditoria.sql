-- Migração: estado do lead no motor e auditoria das decisões (blueprint, seções 3.3, 8 e 12).
-- NÃO aplicar sem backup do Postgres e OK do Thomas. Idempotente.
-- Sem execução ligada, as tabelas ficam vazias e nada roda.

CREATE TABLE IF NOT EXISTS leads_estado (
  lead_id VARCHAR(255) PRIMARY KEY,
  status_geral VARCHAR(16) NOT NULL DEFAULT 'ativo' CHECK (status_geral IN ('ativo', 'pausado', 'optout', 'revisao')),
  ultimo_comando VARCHAR(40),
  ultimo_comando_em TIMESTAMP WITH TIME ZONE,
  regras_executadas JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automacoes_auditoria (
  id VARCHAR(64) PRIMARY KEY,
  quando TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decisao VARCHAR(16) NOT NULL CHECK (decisao IN ('executou', 'bloqueou', 'pulou', 'agendou', 'cancelou')),
  motivo TEXT NOT NULL,
  lead_id VARCHAR(255),
  regra_id VARCHAR(64),
  versao INTEGER
);

CREATE INDEX IF NOT EXISTS automacoes_auditoria_lead ON automacoes_auditoria (lead_id, quando);
