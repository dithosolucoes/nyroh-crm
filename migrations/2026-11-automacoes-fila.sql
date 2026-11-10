-- Migração: fila das automações (esperas agendadas).
-- NÃO aplicar sem backup do Postgres e OK do Thomas. Idempotente.
-- Sem execução ligada, a tabela fica vazia e nada roda.

CREATE TABLE IF NOT EXISTS automacoes_fila (
  id VARCHAR(64) PRIMARY KEY,
  automacao_id VARCHAR(64) NOT NULL,
  lead_id VARCHAR(255) NOT NULL,
  passo_ordem INTEGER NOT NULL,
  acao VARCHAR(40) NOT NULL,
  texto TEXT,
  executar_em TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'executado', 'cancelado')),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS automacoes_fila_pendentes ON automacoes_fila (executar_em) WHERE status = 'pendente';
