/**
 * Consultas SQL do módulo demais (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_SELECT_SALESPEOPLE = `SELECT name FROM salespeople WHERE id = $1`;

export const SQL_INSERT_LEADS = `INSERT INTO leads (
            id, name, phone_number, public_url, website, niche, column_status, sub_status,
            salesperson_id, salesperson_name, last_call_tag, call_count, notes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO UPDATE SET
            sub_status = EXCLUDED.sub_status,
            last_call_tag = EXCLUDED.last_call_tag,
            call_count = leads.call_count + 1,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id, name, phone_number AS "phoneNumber", public_url AS "publicUrl", website, niche, column_status AS "columnStatus", sub_status AS "subStatus", salesperson_id AS "salespersonId", salesperson_name AS "salespersonName", last_call_tag AS "lastCallTag", call_count AS "callCount", notes, created_at AS "createdAt", updated_at AS "updatedAt"`;

export const SQL_INSERT_LEAD_MESSAGES = `INSERT INTO lead_messages (id, lead_id, phone_number, sender, sender_name, text, template_name, status, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'delivered', CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO NOTHING`;

export const SQL_INSERT_LEADS_2 = `INSERT INTO leads (id, name, phone_number, public_url, column_status)
           VALUES ($1, $2, $3, $4, 'Leads')
           ON CONFLICT (id) DO NOTHING`;

export const SQL_UPDATE_CAMPAIGN_LEADS = `
          UPDATE campaign_leads
          SET status = 'STAGING', response_preview = NULL
          WHERE status = 'DESCARTADO' AND response_preview LIKE '%Telefone fixo%'
        `;

