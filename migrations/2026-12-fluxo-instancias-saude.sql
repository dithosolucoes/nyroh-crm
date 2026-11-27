-- Migração 0013: segredo de webhook por número, saúde por número e log de eventos recebidos.
-- Aditiva e idempotente: só ADD COLUMN IF NOT EXISTS e CREATE ... IF NOT EXISTS. Não apaga nada.
-- Segredos ficam CIFRADOS (AES-256-GCM, chave em NYROH_CHAVE_SEGREDOS). Nunca gravar texto puro aqui.

ALTER TABLE fluxo_instancias ADD COLUMN IF NOT EXISTS webhook_secret_cifrado TEXT;
ALTER TABLE fluxo_instancias ADD COLUMN IF NOT EXISTS status_fluxo VARCHAR(32);
ALTER TABLE fluxo_instancias ADD COLUMN IF NOT EXISTS modo_fluxo VARCHAR(16);
ALTER TABLE fluxo_instancias ADD COLUMN IF NOT EXISTS qualidade VARCHAR(16);
ALTER TABLE fluxo_instancias ADD COLUMN IF NOT EXISTS limite_24h INTEGER;
ALTER TABLE fluxo_instancias ADD COLUMN IF NOT EXISTS dias_acesso INTEGER;
ALTER TABLE fluxo_instancias ADD COLUMN IF NOT EXISTS saude_atualizada_em TIMESTAMP WITH TIME ZONE;

-- Log dos eventos aceitos pelo webhook, por número. Retenção de 30 dias (apagado pela própria aplicação).
CREATE TABLE IF NOT EXISTS fluxo_eventos (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(120) UNIQUE,
  instance_id VARCHAR(120),
  tipo VARCHAR(64) NOT NULL,
  resumo VARCHAR(300),
  recebido_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS fluxo_eventos_instancia ON fluxo_eventos (instance_id, recebido_em DESC);
