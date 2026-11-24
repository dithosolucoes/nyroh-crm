/**
 * Consultas SQL do módulo fluxoMeta (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_INSERT_SYSTEM_SETTINGS = `INSERT INTO system_settings (key, value, updated_at) VALUES ('fluxo_api_key', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;

export const SQL_INSERT_SYSTEM_SETTINGS_2 = `INSERT INTO system_settings (key, value, updated_at) VALUES ('fluxo_api_secret', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;

export const SQL_INSERT_SYSTEM_SETTINGS_3 = `INSERT INTO system_settings (key, value, updated_at) VALUES ('fluxo_instance_id', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;

export const SQL_INSERT_SYSTEM_SETTINGS_4 = `INSERT INTO system_settings (key, value, updated_at) VALUES ('meta_access_token', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;

export const SQL_INSERT_SYSTEM_SETTINGS_5 = `INSERT INTO system_settings (key, value, updated_at) VALUES ('meta_waba_id', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;

export const SQL_INSERT_SYSTEM_SETTINGS_6 = `INSERT INTO system_settings (key, value, updated_at) VALUES ('meta_phone_number_id', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;

export const SQL_INSERT_SYSTEM_SETTINGS_7 = `INSERT INTO system_settings (key, value, updated_at) VALUES ('meta_verify_token', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;

export const SQL_SELECT_META_TEMPLATES = `SELECT id, name, category, language, status, components, usage_count, quality_score, rejected_reason, created_at 
           FROM meta_templates 
           ORDER BY created_at DESC`;

export const SQL_INSERT_META_TEMPLATES = `INSERT INTO meta_templates (id, name, category, language, status, components, usage_count, quality_score, rejected_reason, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                   ON CONFLICT (name) DO UPDATE SET
                     status = EXCLUDED.status,
                     category = EXCLUDED.category,
                     language = EXCLUDED.language,
                     components = EXCLUDED.components,
                     quality_score = EXCLUDED.quality_score,
                     rejected_reason = EXCLUDED.rejected_reason`;

export const SQL_INSERT_META_TEMPLATES_2 = `INSERT INTO meta_templates (id, name, category, language, status, components, usage_count, quality_score, rejected_reason, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
               ON CONFLICT (name) DO UPDATE SET
                 status = EXCLUDED.status,
                 category = EXCLUDED.category,
                 language = EXCLUDED.language,
                 components = EXCLUDED.components,
                 quality_score = EXCLUDED.quality_score,
                 rejected_reason = EXCLUDED.rejected_reason`;

export const SQL_INSERT_META_TEMPLATES_3 = `INSERT INTO meta_templates (id, name, category, language, status, components, usage_count, quality_score, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
           ON CONFLICT (name) DO UPDATE SET
             category = EXCLUDED.category,
             language = EXCLUDED.language,
             status = EXCLUDED.status,
             components = EXCLUDED.components,
             quality_score = EXCLUDED.quality_score`;

export const SQL_UPDATE_META_TEMPLATES = `UPDATE meta_templates SET 
             status = $1, 
             quality_score = COALESCE($2, quality_score), 
             rejected_reason = COALESCE($3, rejected_reason) 
           WHERE LOWER(name) = LOWER($4)`;

export const SQL_DELETE_META_TEMPLATES = `DELETE FROM meta_templates WHERE LOWER(name) = LOWER($1) OR id = $1`;

export const SQL_UPDATE_META_TEMPLATES_2 = `UPDATE meta_templates SET usage_count = COALESCE(usage_count, 0) + 1 WHERE LOWER(name) = LOWER($1)`;

export const SQL_INSERT_META_ACCOUNTS = `INSERT INTO meta_accounts (id, name, waba_id, business_id, access_token_enc) VALUES ($1, $2, $3, $4, $5)`;

export const SQL_SELECT_META_ACCOUNTS = `SELECT id FROM meta_accounts WHERE waba_id = $1 LIMIT 1`;

export const SQL_UPDATE_META_ACCOUNTS = `UPDATE meta_accounts SET access_token_enc = $1 WHERE id = $2`;

export const SQL_INSERT_META_ACCOUNTS_2 = `INSERT INTO meta_accounts (id, name, waba_id, business_id, access_token_enc) VALUES ($1, $2, $3, $4, $5)`;

export const SQL_SELECT_META_NUMBERS = `SELECT 1 FROM meta_numbers WHERE phone_number_id = $1`;

export const SQL_DELETE_META_ACCOUNTS = `DELETE FROM meta_accounts WHERE id = $1`;

export const SQL_SELECT_META_TEMPLATES_2 = `SELECT id, name, category, language, status, components, usage_count, quality_score, created_at
           FROM meta_templates
           WHERE status = 'APPROVED'
           ORDER BY usage_count DESC, created_at DESC`;

