/**
 * Caixa de entrada (item 2.2a-2 c do checklist): gatilho que mantém leads.last_message_at e unread_count
 * e os índices de ordenação da lista. Antes ficava no boot (initDatabase). Agora roda uma vez pelo runner.
 * Para mudar o gatilho, criar migração nova (não editar esta).
 */
import { type Migracao } from './migracoes.js';

export const CAIXA_DE_ENTRADA: Migracao = {
  versao: '0004_caixa_de_entrada',
  descricao: 'gatilho nyroh_touch_lead_on_message (última mensagem e não lidas) e índices de leads',
  sql: '\n' + "            CREATE OR REPLACE FUNCTION nyroh_touch_lead_on_message() RETURNS trigger AS $BODY$\n            BEGIN\n              UPDATE leads\n                 SET last_message_at = GREATEST(COALESCE(last_message_at, NEW.timestamp), NEW.timestamp),\n                     unread_count = CASE\n                       WHEN NEW.sender = 'lead' THEN COALESCE(unread_count, 0) + 1\n                       ELSE COALESCE(unread_count, 0)\n                     END\n               WHERE id = NEW.lead_id;\n              RETURN NEW;\n            END;\n            $BODY$ LANGUAGE plpgsql;\n\n            DROP TRIGGER IF EXISTS trg_lead_messages_touch ON lead_messages;\n            CREATE TRIGGER trg_lead_messages_touch\n              AFTER INSERT ON lead_messages\n              FOR EACH ROW EXECUTE FUNCTION nyroh_touch_lead_on_message();\n\n            CREATE INDEX IF NOT EXISTS idx_leads_last_message_at ON leads (last_message_at DESC NULLS LAST);\n            CREATE INDEX IF NOT EXISTS idx_leads_owner_last_message ON leads (salesperson_id, last_message_at DESC NULLS LAST);\n" + '\n',
};
