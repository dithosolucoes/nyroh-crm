CREATE OR REPLACE VIEW vendedores AS 
              SELECT id, name AS nome, email, pct_interessados, pct_nao_interessados, 
                     limite_leads_diario, leads_recebidos_hoje, 
                     COALESCE(ativo, true) AS ativo, 
                     created_at AS criado_em 
              FROM salespeople;

            CREATE OR REPLACE VIEW respostas_rapidas AS
              SELECT id, salesperson_id AS vendedor_id, shortcut AS atalho, type AS tipo, content AS conteudo, created_at AS criado_em
              FROM quick_replies;

            CREATE OR REPLACE VIEW mensagens AS
              SELECT id, lead_id, salesperson_id AS vendedor_id, 
                     CASE WHEN sender = 'lead' THEN 'entrada' ELSE 'saida' END AS direcao,
                     CASE WHEN is_audio THEN 'audio' WHEN media_type IS NOT NULL THEN media_type ELSE 'texto' END AS tipo,
                     text AS conteudo, whatsapp_message_id AS mensagem_id_meta, created_at AS criado_em
              FROM lead_messages;
