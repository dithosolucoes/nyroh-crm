CREATE TABLE IF NOT EXISTS salespeople (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(100),
            color VARCHAR(100) NOT NULL DEFAULT '#0284c7',
            bg_color VARCHAR(100) NOT NULL DEFAULT '#e0f2fe',
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS leads (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone_number VARCHAR(100) NOT NULL,
            public_url TEXT,
            column_status VARCHAR(100) NOT NULL DEFAULT 'Leads',
            salesperson_id VARCHAR(255) DEFAULT 'seller-thomas',
            salesperson_name VARCHAR(255) DEFAULT 'Thomas',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS calls (
            id VARCHAR(255) PRIMARY KEY,
            lead_id VARCHAR(255) NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
            tag VARCHAR(100) NOT NULL,
            comment TEXT,
            duration_seconds INT DEFAULT 0,
            follow_up_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 0;
          ALTER TABLE calls ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesperson_id VARCHAR(255) DEFAULT 'seller-thomas';
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesperson_name VARCHAR(255) DEFAULT 'Thomas';
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS niche VARCHAR(255);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS categories TEXT;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS sub_status VARCHAR(255);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS loss_reason VARCHAR(255);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS website TEXT;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS can_generate_audit_pdf BOOLEAN DEFAULT TRUE;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS whatsapp_type VARCHAR(50) DEFAULT 'business';

          CREATE TABLE IF NOT EXISTS custom_tags (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            color VARCHAR(100) NOT NULL,
            bg_color VARCHAR(100) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          -- Seed default primary salesperson (Thomas)
          INSERT INTO salespeople (id, name, email, color, bg_color, is_default)
          VALUES ('seller-thomas', 'Thomas', 'thomas@empresa.com', '#0284c7', '#e0f2fe', TRUE)
          ON CONFLICT (id) DO NOTHING;

          -- Backfill any leads without a salesperson
          UPDATE leads 
          SET salesperson_id = 'seller-thomas', salesperson_name = 'Thomas'
          WHERE salesperson_id IS NULL OR salesperson_id = '';

          -- Performance Indexes for Railway PostgreSQL
          CREATE INDEX IF NOT EXISTS idx_leads_salesperson_id ON leads(salesperson_id);
          CREATE INDEX IF NOT EXISTS idx_leads_column_status ON leads(column_status);
          CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up_at);
          CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
          CREATE INDEX IF NOT EXISTS idx_calls_lead_created ON calls(lead_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number);

          -- Security, Users, Roles and Audit Logs
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            password_salt VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'salesperson',
            salesperson_id VARCHAR(255),
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS audit_logs (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255),
            user_name VARCHAR(255),
            user_role VARCHAR(50),
            action VARCHAR(255) NOT NULL,
            details TEXT,
            ip VARCHAR(100),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS auth_sessions (
            token VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
          CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
          CREATE INDEX IF NOT EXISTS idx_leads_salesperson ON leads(salesperson_id);
          CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(column_status);
          CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_calls_lead ON calls(lead_id);
          CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at DESC);

          CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS meta_templates (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            category VARCHAR(50) NOT NULL,
            language VARCHAR(50) NOT NULL DEFAULT 'pt_BR',
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            components JSONB NOT NULL,
            usage_count INT NOT NULL DEFAULT 0,
            quality_score VARCHAR(50) NOT NULL DEFAULT 'GREEN',
            rejected_reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          ALTER TABLE meta_templates ADD COLUMN IF NOT EXISTS usage_count INT NOT NULL DEFAULT 0;
          ALTER TABLE meta_templates ADD COLUMN IF NOT EXISTS quality_score VARCHAR(50) NOT NULL DEFAULT 'GREEN';
          ALTER TABLE meta_templates ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

          CREATE TABLE IF NOT EXISTS meta_accounts (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            waba_id VARCHAR(64) NOT NULL,
            business_id VARCHAR(64),
            access_token_enc TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS lead_meta_routes (
            lead_id VARCHAR(255) PRIMARY KEY,
            phone_number_id VARCHAR(64) NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS meta_numbers (
            phone_number_id VARCHAR(64) PRIMARY KEY,
            account_id VARCHAR(64) NOT NULL REFERENCES meta_accounts(id) ON DELETE CASCADE,
            display_phone_number VARCHAR(64),
            verified_name VARCHAR(255),
            quality_rating VARCHAR(32),
            status VARCHAR(64),
            synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS campaign_batches (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            total_leads INT DEFAULT 0,
            valid_mobiles INT DEFAULT 0,
            landlines INT DEFAULT 0,
            with_nyroh_url INT DEFAULT 0,
            with_website INT DEFAULT 0,
            status VARCHAR(50) DEFAULT 'draft',
            template_name VARCHAR(255) DEFAULT 'notificacao_pedido_atendimento',
            quarantine_hours INT DEFAULT 4,
            quarantine_started_at TIMESTAMP WITH TIME ZONE,
            quarantine_ends_at TIMESTAMP WITH TIME ZONE,
            allowed_closers JSONB DEFAULT '["seller-thomas"]'::jsonb,
            hot_retained_by_admin BOOLEAN DEFAULT TRUE,
            dispatched_count INT DEFAULT 0,
            hot_count INT DEFAULT 0,
            cold_count INT DEFAULT 0,
            opt_out_count INT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS zip_uploads (
            id VARCHAR(255) PRIMARY KEY,
            batch_id VARCHAR(255),
            file_name VARCHAR(500),
            file_size_bytes BIGINT DEFAULT 0,
            leads_in_zip INT DEFAULT 0,
            leads_saved INT DEFAULT 0,
            skipped_contacted INT DEFAULT 0,
            skipped_repeated INT DEFAULT 0,
            valid_mobiles INT DEFAULT 0,
            landlines INT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_zip_uploads_created ON zip_uploads(created_at DESC);

          CREATE TABLE IF NOT EXISTS link_clicks (
            token VARCHAR(64) PRIMARY KEY,
            lead_id VARCHAR(255),
            target_url TEXT NOT NULL,
            click_count INT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            first_clicked_at TIMESTAMP WITH TIME ZONE,
            last_clicked_at TIMESTAMP WITH TIME ZONE
          );
          CREATE INDEX IF NOT EXISTS idx_link_clicks_lead ON link_clicks(lead_id);

          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS selected_copy_id VARCHAR(255);
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS copy_var1 TEXT;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS copy_var2 TEXT;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS copy_var3 TEXT;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS with_nyroh_url INT DEFAULT 0;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS with_website INT DEFAULT 0;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS quarantine_hours INT DEFAULT 4;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS quarantine_started_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS quarantine_ends_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS allowed_closers JSONB DEFAULT '["seller-thomas"]'::jsonb;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS hot_retained_by_admin BOOLEAN DEFAULT TRUE;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS quarantine_on_reply TEXT DEFAULT 'lock_closer';
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS quarantine_on_expire TEXT DEFAULT 'manual_pool';
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS dispatched_count INT DEFAULT 0;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS hot_count INT DEFAULT 0;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS cold_count INT DEFAULT 0;
          ALTER TABLE campaign_batches ADD COLUMN IF NOT EXISTS opt_out_count INT DEFAULT 0;

          CREATE TABLE IF NOT EXISTS campaign_copy_templates (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(50) DEFAULT 'prospeccao',
            var1 TEXT NOT NULL,
            var2 TEXT NOT NULL,
            var3 TEXT NOT NULL,
            is_default BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          -- Inserir templates padrão na tabela se ainda não existirem
          INSERT INTO campaign_copy_templates (id, name, description, category, var1, var2, var3, is_default)
          VALUES 
            (
              'tpl_prospeccao_proativo',
              'Abordagem Proativa do Site sem Pedir (Padrão Oficial Meta)',
              'Quebra de padrão provocativa com link Nyroh e solicitação de feedback, 100% dentro dos limites da Meta.',
              'prospeccao',
              '{nome}! Bom diaaa! Ótima semana 😄 Falo com o responsável pela {empresa}?',
              'Eu sou {vendedor} e queria te fazer uma pergunta: você ficaria chateado se eu tivesse criado um site para a {empresa} sem pedir? 😂',
              'Desenvolvi uma prévia exclusiva para vocês: 🔗 {site_novo}',
              TRUE
            ),
            (
              'tpl_redesign_moderno',
              'Redesign Moderno & Velocidade no Celular',
              'Foco em clientes que precisam de versão rápida para celular e botão WhatsApp direto.',
              'prospeccao',
              '{nome}! Tudo bem por aí? Falo com a liderança da {empresa}?',
              'Aqui é o {vendedor}. Redesenhei uma versão nova do site de vocês para carregar instantâneo no celular!',
              'Dá uma olhada no comparativo direto: 🔗 {site_novo}',
              FALSE
            ),
            (
              'tpl_reativacao_curta',
              'Abordagem Direta & Curta (Objetiva)',
              'Mensagem ultra-rápida e direta ao ponto para alta taxa de resposta.',
              'prospeccao',
              '{nome}, tudo bem? Aqui é o {vendedor}, falo com o dono da {empresa}?',
              'Desenvolvi uma prévia exclusiva para a {empresa} com foco em atrair mais clientes no WhatsApp.',
              'Acesse a prévia aqui: 🔗 {site_novo}',
              FALSE
            )
          ON CONFLICT (id) DO NOTHING;

          CREATE TABLE IF NOT EXISTS campaign_leads (
            id VARCHAR(255) PRIMARY KEY,
            batch_id VARCHAR(255) REFERENCES campaign_batches(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            phone_number VARCHAR(100) NOT NULL,
            is_mobile BOOLEAN DEFAULT TRUE,
            public_url TEXT,
            website TEXT,
            niche VARCHAR(255),
            status VARCHAR(50) DEFAULT 'STAGING',
            quarantine_expires_at TIMESTAMP WITH TIME ZONE,
            sent_at TIMESTAMP WITH TIME ZONE,
            responded_at TIMESTAMP WITH TIME ZONE,
            response_preview TEXT,
            assigned_salesperson_id VARCHAR(255),
            assigned_salesperson_name VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS is_mobile BOOLEAN DEFAULT TRUE;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS raw_data JSONB;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS public_url TEXT;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS website TEXT;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS niche VARCHAR(255);
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS quarantine_expires_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS response_preview TEXT;
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS assigned_salesperson_id VARCHAR(255);
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS assigned_salesperson_name VARCHAR(255);
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(255);
          ALTER TABLE campaign_leads ADD COLUMN IF NOT EXISTS notes TEXT;

          CREATE TABLE IF NOT EXISTS lead_messages (
            id VARCHAR(255) PRIMARY KEY,
            lead_id VARCHAR(255) NOT NULL,
            sender VARCHAR(50) NOT NULL,
            sender_name VARCHAR(255),
            text TEXT NOT NULL,
            template_name VARCHAR(255),
            status VARCHAR(50) DEFAULT 'delivered',
            is_audio BOOLEAN DEFAULT FALSE,
            audio_url TEXT,
            audio_duration INT,
            media_type VARCHAR(50),
            media_url TEXT,
            media_name VARCHAR(255),
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          -- Desfazer restrição NOT NULL em phone_number se existir
          DO $$ 
          BEGIN 
            BEGIN
              ALTER TABLE lead_messages ALTER COLUMN phone_number DROP NOT NULL;
            EXCEPTION 
              WHEN undefined_column THEN NULL;
            END;
          END $$;

          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS phone_number VARCHAR(100);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS instance_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS error_message TEXT;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS lead_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS sender VARCHAR(50) DEFAULT 'lead';
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS text TEXT DEFAULT '';
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS template_name VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'delivered';
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS is_audio BOOLEAN DEFAULT FALSE;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS audio_url TEXT;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS audio_duration INT;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS media_name VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
          -- Posto do status (queued 0 → sent 1 → delivered 2 → read 3; failed 9): o status só avança, nunca retrocede
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS status_rank INT DEFAULT -1;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS error_code VARCHAR(100);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_wamid ON lead_messages (whatsapp_message_id);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_lead_ts ON lead_messages (lead_id, timestamp);

          ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_clean VARCHAR(50);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_replied BOOLEAN DEFAULT FALSE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_whatsapp_message TEXT;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS unread_count INT DEFAULT 0;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS variaveis_json JSONB DEFAULT '{}'::jsonb;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultima_interacao_cliente TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_call_tag VARCHAR(100);
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_count INT DEFAULT 0;
          ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;

          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS pct_interessados NUMERIC(5,2) DEFAULT 50.00;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS pct_nao_interessados NUMERIC(5,2) DEFAULT 50.00;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS limite_leads_diario INT DEFAULT 30;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS leads_recebidos_hoje INT DEFAULT 0;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
          ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS ativo_roleta BOOLEAN DEFAULT TRUE;

          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS salesperson_id VARCHAR(255);
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS sent_from_phone BOOLEAN DEFAULT FALSE;
          ALTER TABLE lead_messages ADD COLUMN IF NOT EXISTS reply_to_wamid VARCHAR(255);

          CREATE TABLE IF NOT EXISTS quick_replies (
            id VARCHAR(255) PRIMARY KEY,
            salesperson_id VARCHAR(255),
            shortcut VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            type VARCHAR(50) DEFAULT 'text',
            content TEXT NOT NULL,
            media_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          -- Atualiza phone_clean retroativamente nos leads existentes
          UPDATE leads 
          SET phone_clean = regexp_replace(phone_number, '\D', '', 'g')
          WHERE (phone_clean IS NULL OR phone_clean = '') AND phone_number IS NOT NULL;

          CREATE INDEX IF NOT EXISTS idx_campaign_leads_batch ON campaign_leads(batch_id);
          CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_lead_id ON lead_messages(lead_id);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_phone ON lead_messages(phone_number);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_timestamp ON lead_messages(timestamp ASC);
          CREATE INDEX IF NOT EXISTS idx_lead_messages_wamid ON lead_messages(whatsapp_message_id);
          CREATE INDEX IF NOT EXISTS idx_leads_phone_clean ON leads(phone_clean);
          CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_replied ON leads(whatsapp_replied);
          CREATE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON quick_replies(shortcut);
