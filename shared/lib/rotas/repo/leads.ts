/**
 * Consultas SQL do módulo leads (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_SELECT_LEAD_NOTES = `SELECT id, author_id AS "authorId", author_name AS "authorName", text,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
           FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 100`;

export const SQL_INSERT_LEAD_NOTES = `INSERT INTO lead_notes (id, lead_id, author_id, author_name, text) VALUES ($1, $2, $3, $4, $5)`;

export const SQL_SELECT_LEADS = `SELECT l.id, l.name, l.phone_number AS "phoneNumber", l.column_status AS "columnStatus",
                l.sub_status AS "subStatus", l.niche, l.public_url AS "publicUrl",
                l.salesperson_id AS "salespersonId", l.salesperson_name AS "salespersonName",
                l.last_message_at AS "lastMessageAt", COALESCE(l.unread_count, 0) AS "unreadCount",
                l.window_expires_at AS "windowExpiresAt", l.whatsapp_replied AS "whatsappReplied",
                l.last_whatsapp_message AS "lastWhatsAppMessage",
                m.text AS "lastMessageText", m.sender AS "lastMessageSender", m.status AS "lastMessageStatus"
           FROM leads l
           LEFT JOIN LATERAL (
             SELECT text, sender, status FROM lead_messages WHERE lead_id = l.id ORDER BY timestamp DESC LIMIT 1
           ) m ON TRUE
          WHERE l.id = $1`;

export const SQL_UPDATE_LEADS = `UPDATE leads 
           SET column_status = COALESCE($1, column_status),
               sub_status = COALESCE($2, sub_status),
               loss_reason = COALESCE($3, loss_reason),
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $4 RETURNING id, name, phone_number AS "phoneNumber", column_status AS "columnStatus", sub_status AS "subStatus", loss_reason AS "lossReason", salesperson_id AS "salespersonId", salesperson_name AS "salespersonName", created_at AS "createdAt", updated_at AS "updatedAt"`;

export const SQL_UPDATE_LEADS_2 = `UPDATE leads 
           SET name = COALESCE($1, name),
               phone_number = COALESCE($2, phone_number),
               public_url = COALESCE($3, public_url),
               website = COALESCE($4, website),
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $5 RETURNING id, name, phone_number AS "phoneNumber", column_status AS "columnStatus", sub_status AS "subStatus", loss_reason AS "lossReason", salesperson_id AS "salespersonId", salesperson_name AS "salespersonName", created_at AS "createdAt", updated_at AS "updatedAt"`;
