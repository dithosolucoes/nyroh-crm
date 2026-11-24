/**
 * Consultas SQL do módulo leadsRestantes (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_SELECT_LEADS = `SELECT name, website FROM leads WHERE id = $1`;

export const SQL_SELECT_SALESPEOPLE = `SELECT name FROM salespeople WHERE id = $1`;

export const SQL_UPDATE_LEADS = `UPDATE leads 
           SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = ANY($3::varchar[])`;

export const SQL_SELECT_SALESPEOPLE_2 = `SELECT name FROM salespeople WHERE id = $1`;

export const SQL_UPDATE_LEADS_2 = `UPDATE leads SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, name, phone_number AS "phoneNumber", column_status AS "columnStatus", sub_status AS "subStatus", loss_reason AS "lossReason", salesperson_id AS "salespersonId", salesperson_name AS "salespersonName", created_at AS "createdAt", updated_at AS "updatedAt"`;

export const SQL_SELECT_SALESPEOPLE_3 = `SELECT id, name, color, bg_color AS "bgColor" FROM salespeople WHERE id = $1`;

export const SQL_UPDATE_LEADS_3 = `UPDATE leads 
           SET salesperson_id = $1, salesperson_name = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = ANY($3::text[])`;

export const SQL_SELECT_CALLS = `
          SELECT c.lead_id, c.comment, c.tag, l.phone_number AS current_phone
          FROM calls c
          JOIN leads l ON c.lead_id = l.id
          WHERE l.phone_number = '(Sem telefone)' OR l.phone_number = '' OR l.phone_number IS NULL
        `;

export const SQL_UPDATE_LEADS_4 = `UPDATE leads SET phone_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;

export const SQL_SELECT_LEADS_2 = `
          SELECT id, name, public_url FROM leads 
          WHERE phone_number = '(Sem telefone)' OR phone_number = '' OR phone_number IS NULL
        `;

export const SQL_UPDATE_LEADS_5 = `UPDATE leads SET phone_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;

export const SQL_SELECT_LEADS_3 = `
          SELECT id, public_url, categories, niche 
          FROM leads 
          WHERE website IS NULL OR website = '' OR website = '-'
        `;

export const SQL_UPDATE_LEADS_6 = `UPDATE leads SET website = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;

export const SQL_SELECT_CALLS_2 = `
          SELECT c.lead_id, c.comment, l.website
          FROM calls c
          JOIN leads l ON c.lead_id = l.id
          WHERE l.website IS NULL OR l.website = '' OR l.website = '-'
        `;

export const SQL_UPDATE_LEADS_7 = `UPDATE leads SET website = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;

export const SQL_SELECT_LEADS_4 = `SELECT id, name, phone_number AS "phoneNumber", column_status AS "columnStatus" FROM leads`;

export const SQL_UPDATE_LEADS_8 = `UPDATE leads SET column_status = $1, website = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`;

export const SQL_UPDATE_LEADS_9 = `UPDATE leads SET column_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`;

export const SQL_INSERT_CALLS = `INSERT INTO calls (id, lead_id, tag, comment, duration_seconds, created_at)
                 VALUES ($1, $2, $3, $4, 0, CURRENT_TIMESTAMP)`;

export const SQL_SELECT_CALLS_3 = `SELECT id, lead_id AS "leadId", tag, comment, duration_seconds AS "durationSeconds", follow_up_at AS "followUpAt", created_at AS "createdAt"
           FROM calls
           WHERE lead_id = $1
           ORDER BY created_at DESC`;

export const SQL_INSERT_CALLS_2 = `INSERT INTO calls (id, lead_id, tag, comment, duration_seconds, follow_up_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`;

export const SQL_UPDATE_LEADS_10 = `UPDATE leads SET updated_at = CURRENT_TIMESTAMP, next_follow_up_at = $2 WHERE id = $1`;

export const SQL_UPDATE_LEADS_11 = `UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`;

export const SQL_DELETE_LEADS = `DELETE FROM leads WHERE id = $1`;

export const SQL_DELETE_LEADS_2 = `DELETE FROM leads WHERE id = ANY($1::varchar[])`;

