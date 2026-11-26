-- Migração: contas da FluxoAPI e os números de cada uma (hierarquia: BM -> conta -> números).
-- NÃO aplicar sem backup do Postgres e OK do Thomas. Idempotente.
-- Segredos ficam CIFRADOS (AES-256-GCM, chave em NYROH_CHAVE_SEGREDOS). Nunca gravar texto puro aqui.
-- Atrás da flag NYROH_FLUXO_CONTAS: sem a flag, estas tabelas não são usadas pelo sistema.

CREATE TABLE IF NOT EXISTS fluxo_contas (
  id VARCHAR(64) PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  bm_id VARCHAR(64),
  api_key_cifrada TEXT,
  api_secret_cifrado TEXT,
  webhook_secret_cifrado TEXT,
  meta_token_cifrado TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Um registro por número. Pode vir da FluxoAPI (instance_id), da Meta (meta_phone_number_id) ou dos dois.
CREATE TABLE IF NOT EXISTS fluxo_instancias (
  id VARCHAR(64) PRIMARY KEY,
  conta_id VARCHAR(64) NOT NULL REFERENCES fluxo_contas(id) ON DELETE RESTRICT,
  instance_id VARCHAR(120) UNIQUE,
  meta_phone_number_id VARCHAR(64) UNIQUE,
  waba_id VARCHAR(64),
  bm_id VARCHAR(64),
  numero VARCHAR(32),
  marca_id VARCHAR(64),
  ignorado BOOLEAN NOT NULL DEFAULT FALSE,
  ultimo_evento_em TIMESTAMP WITH TIME ZONE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CHECK (instance_id IS NOT NULL OR meta_phone_number_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS fluxo_instancias_conta ON fluxo_instancias (conta_id);
