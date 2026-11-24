/**
 * Consultas SQL do módulo uploads (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_INSERT_CAMPAIGN_BATCHES = `INSERT INTO campaign_batches (id, name, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`;

export const SQL_INSERT_CAMPAIGN_BATCHES_2 = `INSERT INTO campaign_batches (id, name, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING`;

export const SQL_SELECT_CAMPAIGN_LEADS = `SELECT regexp_replace(phone_number, '[^0-9]', '', 'g') AS d
               FROM campaign_leads
             UNION
             SELECT regexp_replace(phone_number, '[^0-9]', '', 'g') AS d
               FROM leads`;

export const SQL_UPDATE_CAMPAIGN_BATCHES = `UPDATE campaign_batches 
           SET total_leads = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1),
               valid_mobiles = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile = TRUE),
               landlines = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile = FALSE),
               with_nyroh_url = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND public_url != '' AND public_url IS NOT NULL),
               with_website = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND website != '' AND website IS NOT NULL)
           WHERE id = $1`;

export const SQL_INSERT_ZIP_UPLOADS = `INSERT INTO zip_uploads (id, batch_id, file_name, file_size_bytes, leads_in_zip, leads_saved, skipped_contacted, skipped_repeated, valid_mobiles, landlines)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`;

export const SQL_SELECT_ZIP_UPLOADS = `SELECT u.id, u.batch_id, u.file_name, u.file_size_bytes, u.leads_in_zip, u.leads_saved,
                u.skipped_contacted, u.skipped_repeated, u.valid_mobiles, u.landlines, u.created_at,
                b.name AS batch_name
           FROM zip_uploads u
           LEFT JOIN campaign_batches b ON b.id = u.batch_id
          ORDER BY u.created_at DESC
          LIMIT 200`;

export const SQL_SELECT_ZIP_UPLOADS_2 = `
        SELECT b.id,
               (SELECT COUNT(*)::int FROM zip_uploads u WHERE u.batch_id = b.id) AS zips,
               (SELECT COUNT(*)::int FROM campaign_leads l WHERE l.batch_id = b.id AND l.status <> 'STAGING') AS nao_staging,
               (SELECT COUNT(*)::int FROM campaign_leads l WHERE l.batch_id = b.id AND l.status = 'STAGING') AS staging
          FROM campaign_batches b
         WHERE EXISTS (SELECT 1 FROM zip_uploads u WHERE u.batch_id = b.id)`;

export const SQL_SELECT_ZIP_UPLOADS_3 = `SELECT COUNT(*)::int AS n FROM zip_uploads WHERE batch_id IS NULL OR batch_id NOT IN (SELECT id FROM campaign_batches)`;

export const SQL_DELETE_CAMPAIGN_LEADS = `DELETE FROM campaign_leads WHERE batch_id = $1 AND status = $2`;

export const SQL_DELETE_ZIP_UPLOADS = `DELETE FROM zip_uploads WHERE batch_id = $1`;

export const SQL_DELETE_CAMPAIGN_BATCHES = `DELETE FROM campaign_batches WHERE id = $1`;

export const SQL_DELETE_ZIP_UPLOADS_2 = `DELETE FROM zip_uploads WHERE batch_id IS NULL OR batch_id NOT IN (SELECT id FROM campaign_batches)`;

export const SQL_SELECT_ZIP_UPLOADS_4 = `SELECT id, batch_id, file_name FROM zip_uploads WHERE id = $1`;

export const SQL_SELECT_CAMPAIGN_LEADS_2 = `SELECT COUNT(*)::int AS n FROM campaign_leads WHERE batch_id = $1 AND status <> 'STAGING' AND (sent_at IS NOT NULL OR status <> 'DESCARTADO')`;

export const SQL_SELECT_ZIP_UPLOADS_5 = `SELECT COUNT(*)::int AS n FROM zip_uploads WHERE batch_id = $1 AND id <> $2`;

export const SQL_DELETE_CAMPAIGN_LEADS_2 = `DELETE FROM campaign_leads WHERE batch_id = $1 AND status = $2`;

export const SQL_DELETE_CAMPAIGN_BATCHES_2 = `DELETE FROM campaign_batches WHERE id = $1`;

export const SQL_DELETE_ZIP_UPLOADS_3 = `DELETE FROM zip_uploads WHERE id = $1`;

