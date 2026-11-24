/**
 * Consultas SQL do módulo conversas (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_SELECT_LEAD_MESSAGES = `SELECT id, status, COALESCE(status_rank, -1) AS "statusRank", whatsapp_message_id AS "remoteMessageId", error_message, error_code FROM lead_messages WHERE id = $1`;

export const SQL_INSERT_LEAD_MESSAGES = `INSERT INTO lead_messages (id, lead_id, phone_number, sender, sender_name, text, template_name, status, status_rank, is_audio, audio_url, audio_duration, media_type, media_url, media_name, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'sending', -1, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO NOTHING`;

export const SQL_UPDATE_LEAD_MESSAGES = `UPDATE lead_messages SET status = 'failed', status_rank = 9, error_message = $1, error_code = $2 WHERE id = $3`;

export const SQL_UPDATE_LEAD_MESSAGES_2 = `UPDATE lead_messages
              SET whatsapp_message_id = COALESCE($1, whatsapp_message_id),
                  status = CASE WHEN COALESCE(status_rank, -1) < 0 THEN 'queued' ELSE status END,
                  status_rank = GREATEST(COALESCE(status_rank, -1), 0)
            WHERE id = $2`;

export const SQL_UPDATE_LEADS = `UPDATE leads SET unread_count = 0 WHERE id = $1`;

export const SQL_UPDATE_LEADS_2 = `UPDATE leads SET unread_count = 0 WHERE id = $1`;

export const SQL_SELECT_LEADS = `SELECT * FROM leads WHERE id = $1`;

export const SQL_SELECT_CAMPAIGN_LEADS = `SELECT * FROM campaign_leads WHERE id = $1`;

