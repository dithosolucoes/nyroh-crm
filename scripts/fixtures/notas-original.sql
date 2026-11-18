            CREATE TABLE IF NOT EXISTS lead_notes (
              id VARCHAR(255) PRIMARY KEY,
              lead_id VARCHAR(255) NOT NULL,
              author_id VARCHAR(255),
              author_name VARCHAR(255),
              text TEXT NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes (lead_id, created_at DESC);
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
