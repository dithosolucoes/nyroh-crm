/**
 * Consultas SQL do módulo vendedores (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_SELECT_CUSTOM_TAGS = `SELECT id, name, color, bg_color AS "bgColor", created_at AS "createdAt"
           FROM custom_tags
           ORDER BY created_at ASC`;

export const SQL_INSERT_CUSTOM_TAGS = `INSERT INTO custom_tags (id, name, color, bg_color)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color, bg_color = EXCLUDED.bg_color
           RETURNING id, name, color, bg_color AS "bgColor", created_at AS "createdAt"`;

export const SQL_DELETE_CUSTOM_TAGS = `DELETE FROM custom_tags WHERE id = $1`;

export const SQL_SELECT_CALLS = `
          SELECT 
            s.id, 
            s.name, 
            s.email, 
            s.phone, 
            s.color, 
            s.bg_color AS "bgColor", 
            s.is_default AS "isDefault", 
            s.slug,
            COALESCE(s.active, TRUE) AS "active",
            COALESCE(s.can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf",
            COALESCE(s.whatsapp_type, 'business') AS "whatsappType",
            s.created_at AS "createdAt",
            COUNT(l.id)::int AS "totalLeads",
            COUNT(CASE WHEN l.column_status = 'Leads' AND (SELECT COUNT(*) FROM calls WHERE lead_id = l.id) = 0 THEN 1 END)::int AS "uncontactedLeads",
            COUNT(CASE WHEN l.column_status IN ('Ligação 1', 'Ligação 2', 'Ligação 3', 'Ligação 4', 'Interessado') THEN 1 END)::int AS "inProgressLeads",
            COUNT(CASE WHEN l.column_status = 'Fechado' THEN 1 END)::int AS "closedLeads",
            COUNT(CASE WHEN l.column_status = 'Recusado' THEN 1 END)::int AS "refusedLeads"
          FROM salespeople s
          LEFT JOIN leads l ON (l.salesperson_id = s.id OR (s.is_default = TRUE AND l.salesperson_id IS NULL))
          GROUP BY s.id, s.name, s.email, s.phone, s.color, s.bg_color, s.is_default, s.slug, s.active, s.can_generate_audit_pdf, s.whatsapp_type, s.created_at
          ORDER BY s.is_default DESC, s.created_at ASC
        `;

export const SQL_INSERT_SALESPEOPLE = `INSERT INTO salespeople (id, name, email, phone, color, bg_color, is_default, slug, active, whatsapp_type, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, TRUE, $8, CURRENT_TIMESTAMP)
           RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, COALESCE(whatsapp_type, 'business') AS "whatsappType", created_at AS "createdAt"`;

export const SQL_INSERT_USERS = `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
           VALUES ($1, $2, $3, $4, $5, 'salesperson', $6, TRUE, CURRENT_TIMESTAMP)
           ON CONFLICT (email) DO UPDATE
           SET name = $2, salesperson_id = $6, active = TRUE`;

export const SQL_INSERT_SALESPEOPLE_2 = `INSERT INTO salespeople (id, name, email, phone, color, bg_color, is_default, slug, active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, TRUE, CURRENT_TIMESTAMP)
             RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, created_at AS "createdAt"`;

export const SQL_INSERT_USERS_2 = `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
             VALUES ($1, $2, $3, $4, $5, 'salesperson', $6, TRUE, CURRENT_TIMESTAMP)
             ON CONFLICT (email) DO UPDATE
             SET name = $2, password_hash = $4, password_salt = $5, salesperson_id = $6, active = TRUE`;

export const SQL_UPDATE_SALESPEOPLE = `UPDATE salespeople 
           SET name = $1, email = $2, phone = $3, color = $4, bg_color = $5, slug = $6, active = $7,
               whatsapp_type = COALESCE($8, whatsapp_type, 'business')
           WHERE id = $9
           RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf", COALESCE(whatsapp_type, 'business') AS "whatsappType", created_at AS "createdAt"`;

export const SQL_UPDATE_LEADS = `UPDATE leads SET salesperson_name = $1 WHERE salesperson_id = $2`;

export const SQL_UPDATE_USERS = `UPDATE users SET active = $1, name = $2, email = $3 WHERE salesperson_id = $4`;

export const SQL_UPDATE_USERS_2 = `UPDATE users SET active = $1, name = $2 WHERE salesperson_id = $3`;

export const SQL_SELECT_SALESPEOPLE = `SELECT name, email, slug FROM salespeople WHERE id = $1`;

export const SQL_SELECT_USERS = `SELECT id, email FROM users WHERE salesperson_id = $1`;

export const SQL_UPDATE_USERS_3 = `UPDATE users SET password_hash = $1, password_salt = $2, active = TRUE WHERE id = $3`;

export const SQL_INSERT_USERS_3 = `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

export const SQL_UPDATE_SALESPEOPLE_2 = `UPDATE salespeople SET active = $1 WHERE id = $2 RETURNING id, name, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf"`;

export const SQL_UPDATE_USERS_4 = `UPDATE users SET active = $1 WHERE salesperson_id = $2`;

export const SQL_UPDATE_SALESPEOPLE_3 = `UPDATE salespeople SET can_generate_audit_pdf = $1 WHERE id = $2 RETURNING id, name, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf"`;

export const SQL_UPDATE_SALESPEOPLE_4 = `UPDATE salespeople 
           SET whatsapp_type = $1 
           WHERE id = $2 
           RETURNING id, name, active, COALESCE(whatsapp_type, 'business') AS "whatsappType"`;

export const SQL_UPDATE_LEADS_2 = `UPDATE leads SET salesperson_id = 'seller-thomas', salesperson_name = 'Thomas' WHERE salesperson_id = $1`;

export const SQL_DELETE_USERS = `DELETE FROM users WHERE salesperson_id = $1`;

export const SQL_DELETE_SALESPEOPLE = `DELETE FROM salespeople WHERE id = $1`;

export const SQL_UPDATE_SALESPEOPLE_5 = `UPDATE salespeople 
           SET pct_interessados = $1, pct_nao_interessados = $2, limite_leads_diario = $3
           WHERE id = $4`;

export const SQL_UPDATE_SALESPEOPLE_6 = `UPDATE salespeople SET leads_recebidos_hoje = 0`;

export const SQL_SELECT_LEADS = `SELECT id FROM leads 
         WHERE column_status = 'Leads'
         ORDER BY created_at DESC 
         LIMIT $1`;

export const SQL_SELECT_QUICK_REPLIES = `SELECT id, salesperson_id AS "salespersonId", shortcut, title, type, content, media_url AS "mediaUrl", created_at AS "createdAt"
           FROM quick_replies
           ORDER BY created_at ASC`;

export const SQL_INSERT_QUICK_REPLIES = `INSERT INTO quick_replies (id, salesperson_id, shortcut, title, type, content, media_url, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`;

export const SQL_DELETE_QUICK_REPLIES = `DELETE FROM quick_replies WHERE id = $1`;

