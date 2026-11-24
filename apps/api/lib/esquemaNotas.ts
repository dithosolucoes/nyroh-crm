/**
 * Notas internas da conversa e marcação de "resolvida" (item 2.2a-2 b do checklist).
 * Antes ficavam no boot (initDatabase) e eram recriadas a cada subida. Agora rodam uma vez pelo runner.
 * Para mudar a tabela, criar migração nova (não editar esta).
 */
import { type Migracao } from './migracoes.js';

export const NOTAS_E_RESOLVIDA: Migracao = {
  versao: '0003_notas_e_resolvida',
  descricao: 'notas internas da conversa (lead_notes) e coluna leads.resolved_at',
  sql: '\n' + '            CREATE TABLE IF NOT EXISTS lead_notes (\n              id VARCHAR(255) PRIMARY KEY,\n              lead_id VARCHAR(255) NOT NULL,\n              author_id VARCHAR(255),\n              author_name VARCHAR(255),\n              text TEXT NOT NULL,\n              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n            );\n            CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes (lead_id, created_at DESC);\n            ALTER TABLE leads ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;\n' + '\n',
};
