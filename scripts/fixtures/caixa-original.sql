CREATE OR REPLACE FUNCTION nyroh_touch_lead_on_message() RETURNS trigger AS $BODY$
            BEGIN
              UPDATE leads
                 SET last_message_at = GREATEST(COALESCE(last_message_at, NEW.timestamp), NEW.timestamp),
                     unread_count = CASE
                       WHEN NEW.sender = 'lead' THEN COALESCE(unread_count, 0) + 1
                       ELSE COALESCE(unread_count, 0)
                     END
               WHERE id = NEW.lead_id;
              RETURN NEW;
            END;
            $BODY$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_lead_messages_touch ON lead_messages;
            CREATE TRIGGER trg_lead_messages_touch
              AFTER INSERT ON lead_messages
              FOR EACH ROW EXECUTE FUNCTION nyroh_touch_lead_on_message();

            CREATE INDEX IF NOT EXISTS idx_leads_last_message_at ON leads (last_message_at DESC NULLS LAST);
            CREATE INDEX IF NOT EXISTS idx_leads_owner_last_message ON leads (salesperson_id, last_message_at DESC NULLS LAST);
