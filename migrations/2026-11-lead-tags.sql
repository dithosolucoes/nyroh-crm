-- Migração: etiquetas por lead (executor "etiqueta" das automações, blueprint fase I).
-- NÃO aplicar sem backup do Postgres e OK do Thomas. Idempotente.
-- Sem esta tabela, a ação "etiqueta" falha com motivo e nada é gravado.

CREATE TABLE IF NOT EXISTS lead_tags (
  lead_id VARCHAR(255) NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag VARCHAR(100) NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lead_id, tag)
);
CREATE INDEX IF NOT EXISTS lead_tags_por_tag ON lead_tags (tag);
