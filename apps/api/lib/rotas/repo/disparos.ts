/**
 * Consultas SQL do módulo disparos (item 4.1 g / B7). Texto movido sem alteração das rotas.
 */

export const SQL_SELECT_CAMPAIGN_LEADS = `
          SELECT 
            b.id,
            b.name,
            b.total_leads AS "totalLeads",
            b.valid_mobiles AS "validMobiles",
            b.landlines AS "landlines",
            b.with_nyroh_url AS "withNyrohUrl",
            b.with_website AS "withWebsite",
            b.status,
            b.template_name AS "templateName",
            b.quarantine_hours AS "quarantineHours",
            b.quarantine_started_at AS "quarantineStartedAt",
            b.quarantine_ends_at AS "quarantineEndsAt",
            b.allowed_closers AS "allowedClosers",
            b.hot_retained_by_admin AS "hotLeadsRetainedByAdmin",
            b.quarantine_on_reply AS "onReplyAction",
            b.quarantine_on_expire AS "onExpireAction",
            b.dispatched_count AS "dispatchedCount",
            (SELECT COUNT(*) FROM campaign_leads cl
               WHERE cl.batch_id = b.id AND cl.whatsapp_message_id IS NOT NULL)::int AS "acceptedCount",
            (SELECT COUNT(*) FROM campaign_leads cl
               WHERE cl.batch_id = b.id AND cl.whatsapp_message_id IS NOT NULL
                 AND EXISTS (
                   SELECT 1 FROM lead_messages m
                   WHERE m.whatsapp_message_id = cl.whatsapp_message_id
                     AND m.status IN ('delivered', 'read')
                 ))::int AS "deliveredCount",
            (SELECT COUNT(*) FROM campaign_leads cl
               WHERE cl.batch_id = b.id AND cl.status = 'FALHA')::int AS "failedCount",
            b.hot_count AS "hotCount",
            b.cold_count AS "coldCount",
            b.opt_out_count AS "optOutCount",
            (SELECT COUNT(*) FROM campaign_leads cl
               WHERE cl.batch_id = b.id AND cl.status = 'STAGING')::int AS "stagingCount",
            b.created_at AS "createdAt"
          FROM campaign_batches b
          ORDER BY b.created_at DESC
        `;

export const SQL_INSERT_CAMPAIGN_BATCHES = `INSERT INTO campaign_batches (id, name, template_name, quarantine_hours, created_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           RETURNING id, name, total_leads AS "totalLeads", valid_mobiles AS "validMobiles", 
                     landlines, with_nyroh_url AS "withNyrohUrl", with_website AS "withWebsite",
                     status, template_name AS "templateName", quarantine_hours AS "quarantineHours",
                     allowed_closers AS "allowedClosers", hot_retained_by_admin AS "hotLeadsRetainedByAdmin",
                     dispatched_count AS "dispatchedCount", hot_count AS "hotCount", 
                     cold_count AS "coldCount", opt_out_count AS "optOutCount", created_at AS "createdAt"`;

export const SQL_SELECT_CAMPAIGN_COPY_TEMPLATES = `
            SELECT id, name, description, category, var1, var2, var3, meta_template_name AS "metaTemplateName", values_json AS "values", 
                   created_at AS "createdAt", updated_at AS "updatedAt", is_default AS "isDefault"
            FROM campaign_copy_templates
            ORDER BY is_default DESC, created_at DESC
          `;

export const SQL_INSERT_CAMPAIGN_COPY_TEMPLATES = `INSERT INTO campaign_copy_templates (id, name, description, category, var1, var2, var3, is_default)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (id) DO NOTHING`;

export const SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_2 = `
              SELECT id, name, description, category, var1, var2, var3, meta_template_name AS "metaTemplateName", values_json AS "values", 
                     created_at AS "createdAt", updated_at AS "updatedAt", is_default AS "isDefault"
              FROM campaign_copy_templates
              ORDER BY is_default DESC, created_at DESC
            `;

export const SQL_INSERT_CAMPAIGN_COPY_TEMPLATES_2 = `INSERT INTO campaign_copy_templates (id, name, description, category, var1, var2, var3, meta_template_name, values_json, created_at, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, FALSE)
           ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,
               var1 = EXCLUDED.var1, var2 = EXCLUDED.var2, var3 = EXCLUDED.var3,
               meta_template_name = EXCLUDED.meta_template_name, values_json = EXCLUDED.values_json, updated_at = CURRENT_TIMESTAMP`;

export const SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_3 = `SELECT * FROM campaign_copy_templates WHERE id = $1`;

export const SQL_UPDATE_CAMPAIGN_COPY_TEMPLATES = `UPDATE campaign_copy_templates
           SET name = $1, description = $2, category = $3, var1 = $4, var2 = $5, var3 = $6,
               meta_template_name = $8, values_json = $9::jsonb, updated_at = CURRENT_TIMESTAMP
           WHERE id = $7`;

export const SQL_SELECT_CAMPAIGN_COPY_TEMPLATES_4 = `SELECT * FROM campaign_copy_templates WHERE id = $1`;

export const SQL_DELETE_CAMPAIGN_COPY_TEMPLATES = `DELETE FROM campaign_copy_templates WHERE id = $1`;

export const SQL_SELECT_SALESPEOPLE = `SELECT id, name FROM salespeople WHERE id = ANY($1::text[])`;

export const SQL_UPDATE_CAMPAIGN_BATCHES = `UPDATE campaign_batches
           SET status = 'quarantine',
               template_name = COALESCE($1, template_name),
               quarantine_hours = $2,
               quarantine_started_at = CURRENT_TIMESTAMP,
               quarantine_ends_at = $3,
               dispatched_count = dispatched_count + $4,
               copy_var1 = $6,
               copy_var2 = $7,
               copy_var3 = $8
           WHERE id = $5`;

export const SQL_UPDATE_CAMPAIGN_LEADS = `UPDATE campaign_leads
             SET assigned_salesperson_id = $1, assigned_salesperson_name = $2
             WHERE id = $3`;

export const SQL_UPDATE_CAMPAIGN_LEADS_2 = `UPDATE campaign_leads SET status = 'ERRO_VARIAVEL', notes = $2 WHERE id = $1`;

export const SQL_INSERT_LEADS = `INSERT INTO leads (
                id, name, phone_number, public_url, website, niche, column_status, sub_status,
                salesperson_id, salesperson_name, last_call_tag, call_count, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, 'Leads', 'Disparo WhatsApp Realizado (Aguardando Resposta)', $7, $8, 'WhatsApp Enviado', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              ON CONFLICT (id) DO UPDATE SET
                sub_status = 'Disparo WhatsApp Realizado (Aguardando Resposta)',
                salesperson_id = EXCLUDED.salesperson_id,
                salesperson_name = EXCLUDED.salesperson_name,
                last_call_tag = 'WhatsApp Enviado',
                updated_at = CURRENT_TIMESTAMP`;

export const SQL_UPDATE_CAMPAIGN_LEADS_3 = `UPDATE campaign_leads SET status = 'ERRO_VARIAVEL', notes = $2 WHERE id = $1`;

export const SQL_UPDATE_CAMPAIGN_LEADS_4 = `UPDATE campaign_leads
           SET status = $1,
               responded_at = CASE WHEN $1 = 'INTERESSADO' THEN CURRENT_TIMESTAMP ELSE responded_at END,
               response_preview = $2
           WHERE id = $3
           RETURNING *`;

export const SQL_INSERT_LEADS_2 = `INSERT INTO leads (
                id, name, phone_number, public_url, website, column_status, sub_status,
                salesperson_id, salesperson_name, niche, last_call_tag, call_count, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, 'Leads', 'Distribuído para Ligação Ativa (Campanha)',
                $6, $7, $8, 'Aguardando Ligação', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              )
              ON CONFLICT (id) DO UPDATE SET
                salesperson_id = EXCLUDED.salesperson_id,
                salesperson_name = EXCLUDED.salesperson_name,
                sub_status = 'Distribuído para Ligação Ativa (Campanha)',
                last_call_tag = 'Aguardando Ligação',
                updated_at = CURRENT_TIMESTAMP`;

export const SQL_UPDATE_CAMPAIGN_LEADS_5 = `UPDATE campaign_leads
               SET assigned_salesperson_id = $1, assigned_salesperson_name = $2, status = 'FRIO'
               WHERE id = $3`;

export const SQL_UPDATE_CAMPAIGN_LEADS_6 = `UPDATE campaign_leads
           SET status = 'FRIO',
               quarantine_expires_at = CURRENT_TIMESTAMP
           WHERE batch_id = $1 AND status IN ('QUARENTENA', 'DISPARADO')
           RETURNING id`;

export const SQL_UPDATE_CAMPAIGN_BATCHES_2 = `UPDATE campaign_batches
           SET status = 'completed',
               quarantine_ends_at = CURRENT_TIMESTAMP,
               cold_count = cold_count + $1
           WHERE id = $2`;

export const SQL_UPDATE_CAMPAIGN_BATCHES_3 = `UPDATE campaign_batches
           SET quarantine_hours = $1,
               allowed_closers = COALESCE($2, allowed_closers),
               hot_retained_by_admin = COALESCE($3, hot_retained_by_admin),
               quarantine_on_reply = COALESCE($5, quarantine_on_reply),
               quarantine_on_expire = COALESCE($6, quarantine_on_expire)
           WHERE id = $4`;

export const SQL_SELECT_CAMPAIGN_LEADS_2 = `SELECT COUNT(*)::int AS n FROM campaign_leads WHERE batch_id = $1 AND status = 'QUARENTENA'`;

export const SQL_UPDATE_CAMPAIGN_LEADS_7 = `UPDATE campaign_leads
            SET status = 'STAGING', sent_at = NULL, quarantine_expires_at = NULL
          WHERE batch_id = $1 AND status = 'QUARENTENA'`;

export const SQL_UPDATE_CAMPAIGN_BATCHES_4 = `UPDATE campaign_batches
            SET dispatched_count = (SELECT COUNT(*) FROM campaign_leads
                                     WHERE batch_id = $1 AND status IN ('QUARENTENA', 'INTERESSADO'))
          WHERE id = $1`;

export const SQL_UPDATE_CAMPAIGN_LEADS_8 = `UPDATE campaign_leads
           SET status = 'STAGING',
               sent_at = NULL,
               quarantine_expires_at = NULL,
               responded_at = NULL,
               response_preview = NULL
           WHERE batch_id = $1 AND is_mobile = TRUE
           RETURNING id`;

export const SQL_UPDATE_CAMPAIGN_BATCHES_5 = `UPDATE campaign_batches
           SET status = 'draft',
               dispatched_count = 0,
               hot_count = 0,
               cold_count = 0,
               quarantine_started_at = NULL,
               quarantine_ends_at = NULL
           WHERE id = $1`;

export const SQL_SELECT_CAMPAIGN_LEADS_3 = `SELECT id, name, phone_number, is_mobile, status, notes
           FROM campaign_leads
           WHERE batch_id = $1`;

export const SQL_UPDATE_CAMPAIGN_LEADS_9 = `UPDATE campaign_leads
             SET status = 'STAGING',
                 is_mobile = TRUE,
                 sent_at = NULL,
                 quarantine_expires_at = NULL,
                 notes = COALESCE(notes, '') || ' [Reciclado: Não constava no WhatsApp Web]'
             WHERE id = ANY($1::text[])`;

export const SQL_UPDATE_CAMPAIGN_LEADS_10 = `UPDATE campaign_leads
             SET status = 'DESCARTADO',
                 is_mobile = FALSE,
                 response_preview = 'Telefone fixo comercial (Sem WhatsApp) - Destinado a ligação ativa',
                 notes = COALESCE(notes, '') || ' [Fixo Comercial: Ligação Telefônica]'
             WHERE id = ANY($1::text[])`;

export const SQL_UPDATE_CAMPAIGN_LEADS_11 = `UPDATE campaign_leads
             SET status = 'QUARENTENA',
                 notes = COALESCE(notes, '') || ' [Confirmado WhatsApp Web]'
             WHERE id = ANY($1::text[]) AND status != 'INTERESSADO'`;

export const SQL_UPDATE_CAMPAIGN_BATCHES_6 = `UPDATE campaign_batches
           SET dispatched_count = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND status IN ('QUARENTENA', 'INTERESSADO')),
               valid_mobiles = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile = TRUE),
               landlines = (SELECT COUNT(*) FROM campaign_leads WHERE batch_id = $1 AND is_mobile = FALSE)
           WHERE id = $1`;

export const SQL_SELECT_CAMPAIGN_LEADS_4 = `SELECT COUNT(*)::int AS n FROM campaign_leads WHERE batch_id = $1 AND status <> 'STAGING' AND (sent_at IS NOT NULL OR status <> 'DESCARTADO')`;

export const SQL_DELETE_CAMPAIGN_LEADS = `DELETE FROM campaign_leads WHERE batch_id = $1`;

export const SQL_DELETE_ZIP_UPLOADS = `DELETE FROM zip_uploads WHERE batch_id = $1`;

export const SQL_DELETE_CAMPAIGN_BATCHES = `DELETE FROM campaign_batches WHERE id = $1`;

