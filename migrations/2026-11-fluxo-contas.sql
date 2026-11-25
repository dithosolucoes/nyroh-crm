-- Migração: contas da FluxoAPI e suas instâncias (hierarquia: conta -> números).
-- NÃO aplicar sem backup do Postgres e OK do Thomas. Idempotente.
-- Segredos ficam CIFRADOS (AES-256-GCM, chave em NYROH_CHAVE_SEGREDOS). Nunca gravar texto puro aqui.
-- Atrás da flag NYROH_FLUXO_CONTAS: sem a flag, esta tabela não é criada nem usada.

CREATE TABLE IF NOT EXISTS fluxo_contas (
  id VARCHAR(64) PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  bm_id VARCHAR(64),
  api_key_cifrada TEXT,
  api_secret_cifrado TEXT,
  webhook_secret_cifrado TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fluxo_instancias (
  id VARCHAR(64) PRIMARY KEY,
  conta_id VARCHAR(64) NOT NULL REFERENCES fluxo_contas(id) ON DELETE RESTRICT,
  instance_id VARCHAR(120) NOT NULL UNIQUE,
  numero VARCHAR(32),
  marca_id VARCHAR(64),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS fluxo_instancias_conta ON fluxo_instancias (conta_id);
