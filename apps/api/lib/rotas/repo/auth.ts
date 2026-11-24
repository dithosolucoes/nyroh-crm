/**
 * Consultas SQL do módulo auth (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_SELECT_USERS = `SELECT id, name, email, password_hash AS "passwordHash", password_salt AS "passwordSalt", role, salesperson_id AS "salespersonId", active
           FROM users
           WHERE LOWER(email) = $1`;

export const SQL_INSERT_AUTH_SESSIONS = `INSERT INTO auth_sessions (token, user_id, expires_at)
           VALUES ($1, $2, $3)`;

export const SQL_DELETE_AUTH_SESSIONS = `DELETE FROM auth_sessions WHERE token = $1`;

export const SQL_UPDATE_USERS = `UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3`;

export const SQL_DELETE_AUTH_SESSIONS_2 = `DELETE FROM auth_sessions WHERE user_id = $1 AND token <> $2`;

export const SQL_SELECT_USERS_2 = `SELECT id, name, email, role, salesperson_id AS "salespersonId", active, created_at AS "createdAt"
           FROM users
           ORDER BY created_at ASC`;

export const SQL_SELECT_USERS_3 = `SELECT id FROM users WHERE LOWER(email) = $1`;

export const SQL_INSERT_USERS = `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP)`;

export const SQL_UPDATE_USERS_2 = `UPDATE users SET active = $1 WHERE id = $2`;

export const SQL_UPDATE_USERS_3 = `UPDATE users SET name = $1 WHERE id = $2`;

export const SQL_UPDATE_USERS_4 = `UPDATE users SET role = $1 WHERE id = $2`;

export const SQL_UPDATE_USERS_5 = `UPDATE users SET salesperson_id = $1 WHERE id = $2`;

export const SQL_UPDATE_USERS_6 = `UPDATE users SET password_hash = $1, password_salt = $2 WHERE id = $3`;

export const SQL_SELECT_USERS_4 = `SELECT name, email, role FROM users WHERE id = $1`;

export const SQL_DELETE_USERS = `DELETE FROM users WHERE id = $1`;

export const SQL_SELECT_AUDIT_LOGS = `SELECT id, user_id AS "userId", user_name AS "userName", user_role AS "userRole", action, details, ip, created_at AS "createdAt"
           FROM audit_logs
           ORDER BY created_at DESC
           LIMIT 100`;

export const SQL_ALTER_CAMPAIGN_LEADS = `
        ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(255);
        ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_tag VARCHAR(100);
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INT DEFAULT 0;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS public_url TEXT;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS niche VARCHAR(255);
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS website TEXT;
      `;

