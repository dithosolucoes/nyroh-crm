-- Seed default primary salesperson (Thomas)
          INSERT INTO salespeople (id, name, email, color, bg_color, is_default)
          VALUES ('seller-thomas', 'Thomas', 'thomas@empresa.com', '#0284c7', '#e0f2fe', TRUE)
          ON CONFLICT (id) DO NOTHING;
-- Backfill any leads without a salesperson
          UPDATE leads 
          SET salesperson_id = 'seller-thomas', salesperson_name = 'Thomas'
          WHERE salesperson_id IS NULL OR salesperson_id = '';
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
-- Desfazer restrição NOT NULL em phone_number se existir
          DO $$ 
          BEGIN 
            BEGIN
              ALTER TABLE lead_messages ALTER COLUMN phone_number DROP NOT NULL;
EXCEPTION 
              WHEN undefined_column THEN NULL;
END;
END $$;
-- Atualiza phone_clean retroativamente nos leads existentes
          UPDATE leads 
          SET phone_clean = regexp_replace(phone_number, '\D', '', 'g')
          WHERE (phone_clean IS NULL OR phone_clean = '') AND phone_number IS NOT NULL;
