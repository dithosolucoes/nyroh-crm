CREATE INDEX IF NOT EXISTS idx_lead_messages_text ON lead_messages USING gin (to_tsvector('portuguese', coalesce(text, '')));
