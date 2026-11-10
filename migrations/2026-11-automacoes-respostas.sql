-- Migração: automações de resposta (persistência).
-- NÃO aplicar em produção sem backup do Postgres e OK do Thomas.
-- Idempotente (IF NOT EXISTS) e sem apagar dados.
-- Também é aplicada por src/lib/automacoesRoutes.ts quando NYROH_AUTOMACOES_PERSISTENCIA=true.

CREATE TABLE IF NOT EXISTS automacoes_respostas (
  id VARCHAR(64) PRIMARY KEY,
  status VARCHAR(16) NOT NULL CHECK (status IN ('ativa', 'inativa', 'rascunho')),
  definicao JSONB NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
