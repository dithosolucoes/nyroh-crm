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
  status VARCHAR(16) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'executando', 'executado', 'cancelado')),
  resultado TEXT,
  texto_final TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processado_em TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS automacoes_fila_pendentes ON automacoes_fila (executar_em) WHERE status = 'pendente';
-- 'executando' = reservado por um ciclo do processador. Um ciclo que cair no meio deixa o item aqui;
-- a recuperação disso é tarefa da fase D (limites e auditoria), não desta.

-- Condições da regra, guardadas com o passo e avaliadas na execução (blueprint, seção 5).
ALTER TABLE automacoes_fila ADD COLUMN IF NOT EXISTS condicoes JSONB;
