-- Migração: configuração do motor (pausa geral vira dado, não variável de ambiente).
-- NÃO aplicar sem OK do Thomas. Idempotente. Sem a tabela, vale a variável de ambiente como antes.

CREATE TABLE IF NOT EXISTS automacoes_config (
  chave VARCHAR(64) PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
