/**
 * B6 (item 4.1 f): vendedores, etiquetas e respostas rápidas extraídos de server.ts.
 */
import type { Express } from 'express';

import { hashPassword, isUserAdmin } from '../serverAuth.js';
import type { CustomTag, QuickReply, Salesperson } from '../../types.js';
import type { RespostaDistribuicaoRoleta, RespostaEtiquetaSalva, RespostaListaEtiquetas, RespostaListaRespostasRapidas, RespostaListaVendedores, RespostaLoteVendedores, RespostaOk, RespostaRespostaRapidaCriada, RespostaRespostaRapidaExcluida, RespostaRoletaConfig, RespostaSenhaVendedor, RespostaSucesso, RespostaVendedorAtualizado, RespostaVendedorCriado, RespostaVendedorStatus, RequisicaoDistribuicaoRoleta } from '../../contracts/rotas.js';
export interface DependenciasVendedores {
  readonly MIN_PASSWORD_LENGTH: number;
  readonly assignLeadViaRoulette: any;
  readonly broadcastSSE: any;
  readonly getSalespersonCredentials: any;
  readonly isAdminSalesperson: any;
  readonly logAudit: any;
  readonly memoryCallLogsMap: Map<string, any[]>;
  readonly memoryLeadsMap: Map<string, any>;
  readonly memoryQuickRepliesMap: Map<string, any>;
  readonly memorySalespeopleMap: Map<string, any>;
  readonly memoryTagsMap: Map<string, any>;
  readonly memoryUsersMap: Map<string, any>;
  readonly pgPool: any;
  readonly usePostgres: boolean;
}

let D: DependenciasVendedores;

export function configurarVendedores(deps: DependenciasVendedores): void {
  D = deps;
}

export function registrarVendedores(app: Express): void {
  // Tags Endpoints: GET, POST, DELETE
  app.get('/api/tags', async (req, res) => {
    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `SELECT id, name, color, bg_color AS "bgColor", created_at AS "createdAt"
           FROM custom_tags
           ORDER BY created_at ASC`
        );
        return res.json(result.rows satisfies RespostaListaEtiquetas);
      } else {
        return res.json(Array.from(D.memoryTagsMap.values()) satisfies RespostaListaEtiquetas);
      }
    } catch (error) {
      console.error('Error fetching custom tags:', error);
      res.status(500).json({ error: 'Erro ao buscar etiquetas customizadas.' });
    }
  });

  app.post('/api/tags', async (req, res) => {
    const { name, color, bgColor } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome da etiqueta é obrigatório.' });
    }

    const nameTrim = name.trim();
    const tagColor = color || '#15803d';
    const tagBgColor = bgColor || '#dcfce7';
    const tagId = `tag-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `INSERT INTO custom_tags (id, name, color, bg_color)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color, bg_color = EXCLUDED.bg_color
           RETURNING id, name, color, bg_color AS "bgColor", created_at AS "createdAt"`,
          [tagId, nameTrim, tagColor, tagBgColor]
        );
        return res.status(201).json(result.rows[0] satisfies RespostaEtiquetaSalva);
      } else {
        const existingTag = Array.from(D.memoryTagsMap.values()).find(t => t.name.toLowerCase() === nameTrim.toLowerCase());
        if (existingTag) {
          existingTag.color = tagColor;
          existingTag.bgColor = tagBgColor;
          return res.json(existingTag satisfies RespostaEtiquetaSalva);
        }
        const newTag: CustomTag = {
          id: tagId,
          name: nameTrim,
          color: tagColor,
          bgColor: tagBgColor,
          createdAt: new Date().toISOString()
        };
        D.memoryTagsMap.set(tagId, newTag);
        return res.status(201).json(newTag satisfies RespostaEtiquetaSalva);
      }
    } catch (error: any) {
      console.error('Error creating tag:', error);
      res.status(500).json({ error: `Erro ao criar etiqueta: ${error.message}` });
    }
  });

  app.delete('/api/tags/:id', async (req, res) => {
    const { id } = req.params;
    try {
      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(`DELETE FROM custom_tags WHERE id = $1`, [id]);
        return res.json({ success: true } satisfies RespostaOk);
      } else {
        D.memoryTagsMap.delete(id);
        return res.json({ success: true } satisfies RespostaOk);
      }
    } catch (error) {
      console.error('Error deleting tag:', error);
      res.status(500).json({ error: 'Erro ao deletar etiqueta.' });
    }
  });

  // 1. Get all salespeople with their lead stats
  app.get('/api/salespeople', async (req, res) => {
    try {
      if (D.usePostgres && D.pgPool) {
        const spRes = await D.pgPool.query(`
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
        `);
        const listaBancoVendedores: RespostaListaVendedores = spRes.rows;
        return res.json(listaBancoVendedores);
      } else {
        const allLeads = Array.from(D.memoryLeadsMap.values());
        const sellers = Array.from(D.memorySalespeopleMap.values()).map(s => {
          const myLeads = allLeads.filter(l => (l.salespersonId || 'seller-thomas') === s.id);
          const uncontacted = myLeads.filter(l => {
            if (l.columnStatus !== 'Leads') return false;
            const calls = D.memoryCallLogsMap.get(l.id) || [];
            return calls.length === 0;
          }).length;
          const inProgress = myLeads.filter(l => ['Ligação 1', 'Ligação 2', 'Ligação 3', 'Ligação 4', 'Interessado'].includes(l.columnStatus)).length;
          const closed = myLeads.filter(l => l.columnStatus === 'Fechado').length;
          const refused = myLeads.filter(l => l.columnStatus === 'Recusado').length;

          return {
            ...s,
            slug: s.slug || undefined,
            active: s.active !== undefined ? s.active : true,
            canGenerateAuditPdf: s.canGenerateAuditPdf !== undefined ? s.canGenerateAuditPdf : true,
            whatsappType: s.whatsappType || 'business',
            totalLeads: myLeads.length,
            uncontactedLeads: uncontacted,
            inProgressLeads: inProgress,
            closedLeads: closed,
            refusedLeads: refused
          };
        });
        const listaMemoriaVendedores: RespostaListaVendedores = sellers;
        return res.json(listaMemoriaVendedores);
      }
    } catch (error) {
      console.error('Error fetching salespeople:', error);
      res.status(500).json({ error: 'Erro ao buscar vendedores.' });
    }
  });

  // 2. Create new salesperson
  app.post('/api/salespeople', async (req, res) => {
    const { name, email, phone, color, bgColor, whatsappType } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome do vendedor(a) é obrigatório.' });
    }

    const nameTrim = name.trim();
    const sellerId = `seller-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const sellerColor = color || '#0284c7';
    const sellerBgColor = bgColor || '#e0f2fe';
    const sellerWhatsAppType = ['business', 'normal', 'ask'].includes(whatsappType) ? whatsappType : 'business';
    const creds = D.getSalespersonCredentials(nameTrim, email);
    const sellerEmail = creds.email;
    const sellerPhone = phone ? phone.trim() : '';
    const createdAt = new Date().toISOString();
    const cleanSlug = nameTrim.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const hashedPass = hashPassword(creds.defaultPassword);
    const userId = `user-${sellerId}`;

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `INSERT INTO salespeople (id, name, email, phone, color, bg_color, is_default, slug, active, whatsapp_type, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, TRUE, $8, CURRENT_TIMESTAMP)
           RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, COALESCE(whatsapp_type, 'business') AS "whatsappType", created_at AS "createdAt"`,
          [sellerId, nameTrim, sellerEmail, sellerPhone, sellerColor, sellerBgColor, cleanSlug, sellerWhatsAppType]
        );

        // Auto-cria conta de acesso de login do vendedor
        await D.pgPool.query(
          `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
           VALUES ($1, $2, $3, $4, $5, 'salesperson', $6, TRUE, CURRENT_TIMESTAMP)
           ON CONFLICT (email) DO UPDATE
           SET name = $2, salesperson_id = $6, active = TRUE`,
          [userId, nameTrim, sellerEmail, hashedPass.hash, hashedPass.salt, sellerId]
        );

        const criadoBanco: RespostaVendedorCriado = {
          ...result.rows[0],
          totalLeads: 0,
          uncontactedLeads: 0,
          inProgressLeads: 0,
          closedLeads: 0,
          refusedLeads: 0,
          loginEmail: sellerEmail,
          initialPassword: creds.defaultPassword
        };
        return res.status(201).json(criadoBanco);
      } else {
        const newSeller: Salesperson = {
          id: sellerId,
          name: nameTrim,
          email: sellerEmail,
          phone: sellerPhone,
          color: sellerColor,
          bgColor: sellerBgColor,
          isDefault: false,
          slug: cleanSlug,
          active: true,
          whatsappType: sellerWhatsAppType,
          createdAt
        };
        D.memorySalespeopleMap.set(sellerId, newSeller);

        D.memoryUsersMap.set(userId, {
          id: userId,
          name: nameTrim,
          email: sellerEmail,
          passwordHash: hashedPass.hash,
          passwordSalt: hashedPass.salt,
          role: 'salesperson',
          salespersonId: sellerId,
          active: true,
          createdAt
        });

        const criadoMemoria: RespostaVendedorCriado = {
          ...newSeller,
          totalLeads: 0,
          uncontactedLeads: 0,
          inProgressLeads: 0,
          closedLeads: 0,
          refusedLeads: 0,
          loginEmail: sellerEmail,
          initialPassword: creds.defaultPassword
        };
        return res.status(201).json(criadoMemoria);
      }
    } catch (error: any) {
      console.error('Error creating salesperson:', error);
      res.status(500).json({ error: `Erro ao cadastrar vendedor: ${error.message}` });
    }
  });

  // 2.1 Batch create multiple salespeople via JSON
  app.post('/api/salespeople/batch', async (req, res) => {
    try {
      let items = req.body;
      if (items && !Array.isArray(items)) {
        items = items.salespeople || items.vendedores || items.items || items.data || [];
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Nenhum vendedor fornecido no lote JSON.' });
      }

      const paletteList = [
        { color: '#0284c7', bgColor: '#e0f2fe' },
        { color: '#059669', bgColor: '#d1fae5' },
        { color: '#7c3aed', bgColor: '#ede9fe' },
        { color: '#db2777', bgColor: '#fce7f3' },
        { color: '#d97706', bgColor: '#fef3c7' },
        { color: '#4f46e5', bgColor: '#e0e7ff' },
        { color: '#0891b2', bgColor: '#cffafe' },
        { color: '#475569', bgColor: '#f1f5f9' },
      ];

      const createdList: any[] = [];
      const now = new Date().toISOString();

      for (let i = 0; i < items.length; i++) {
        const raw = items[i];
        let sellerName = '';
        let rawEmail = '';
        let sellerPhone = '';
        let sellerColor = '';
        let sellerBgColor = '';

        if (typeof raw === 'string') {
          sellerName = raw.trim();
        } else if (raw && typeof raw === 'object') {
          sellerName = String(raw.name || raw.nome || raw.fullName || '').trim();
          rawEmail = String(raw.email || raw.mail || '').trim();
          sellerPhone = String(raw.phone || raw.telefone || raw.whatsapp || raw.celular || '').trim();
          sellerColor = String(raw.color || raw.cor || '').trim();
          sellerBgColor = String(raw.bgColor || raw.corFundo || '').trim();
        }

        if (!sellerName) continue;

        const pal = paletteList[i % paletteList.length];
        const finalColor = sellerColor || pal.color;
        const finalBgColor = sellerBgColor || pal.bgColor;
        const sellerId = `seller-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
        const cleanSlug = sellerName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Gera e-mail padrão @nyroh.com e senha padrão nome123
        const creds = D.getSalespersonCredentials(sellerName, rawEmail);
        const sellerEmail = creds.email;
        const hashedPass = hashPassword(creds.defaultPassword);
        const userId = `user-${sellerId}`;

        if (D.usePostgres && D.pgPool) {
          const result = await D.pgPool.query(
            `INSERT INTO salespeople (id, name, email, phone, color, bg_color, is_default, slug, active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, TRUE, CURRENT_TIMESTAMP)
             RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, created_at AS "createdAt"`,
            [sellerId, sellerName, sellerEmail, sellerPhone, finalColor, finalBgColor, cleanSlug]
          );

          // Auto-cria conta de login para este vendedor
          await D.pgPool.query(
            `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
             VALUES ($1, $2, $3, $4, $5, 'salesperson', $6, TRUE, CURRENT_TIMESTAMP)
             ON CONFLICT (email) DO UPDATE
             SET name = $2, password_hash = $4, password_salt = $5, salesperson_id = $6, active = TRUE`,
            [userId, sellerName, sellerEmail, hashedPass.hash, hashedPass.salt, sellerId]
          );

          createdList.push({
            ...result.rows[0],
            totalLeads: 0,
            uncontactedLeads: 0,
            inProgressLeads: 0,
            closedLeads: 0,
            refusedLeads: 0,
            loginEmail: sellerEmail,
            initialPassword: creds.defaultPassword
          });
        } else {
          const newSeller: Salesperson = {
            id: sellerId,
            name: sellerName,
            email: sellerEmail,
            phone: sellerPhone,
            color: finalColor,
            bgColor: finalBgColor,
            isDefault: false,
            slug: cleanSlug,
            active: true,
            createdAt: now
          };
          D.memorySalespeopleMap.set(sellerId, newSeller);

          D.memoryUsersMap.set(userId, {
            id: userId,
            name: sellerName,
            email: sellerEmail,
            passwordHash: hashedPass.hash,
            passwordSalt: hashedPass.salt,
            role: 'salesperson',
            salespersonId: sellerId,
            active: true,
            createdAt: now
          });

          createdList.push({
            ...newSeller,
            totalLeads: 0,
            uncontactedLeads: 0,
            inProgressLeads: 0,
            closedLeads: 0,
            refusedLeads: 0,
            loginEmail: sellerEmail,
            initialPassword: creds.defaultPassword
          });
        }
      }

      if (createdList.length === 0) {
        return res.status(400).json({ error: 'Nenhum vendedor válido com nome preenchido foi encontrado no JSON.' });
      }

      const loteCriado: RespostaLoteVendedores = {
        success: true,
        count: createdList.length,
        salespeople: createdList,
        message: `${createdList.length} vendedor(es) cadastrado(s) com logins @nyroh.com e senhas gerados com sucesso!`
      };
      return res.status(201).json(loteCriado);
    } catch (error: any) {
      console.error('Error in batch salespeople creation:', error);
      res.status(500).json({ error: `Erro ao cadastrar vendedores em lote: ${error.message}` });
    }
  });

  // 3. Update salesperson
  app.put('/api/salespeople/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, color, bgColor, slug, active, whatsappType } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome do vendedor(a) é obrigatório.' });
    }

    const nameTrim = name.trim();
    const sellerColor = color || '#0284c7';
    const sellerBgColor = bgColor || '#e0f2fe';
    const sellerEmail = email ? email.trim() : '';
    const sellerPhone = phone ? phone.trim() : '';
    const sellerSlug = slug !== undefined && slug !== null ? String(slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : null;
    const sellerActive = typeof active === 'boolean' ? active : true;
    const sellerWhatsAppType = whatsappType && ['business', 'normal', 'ask'].includes(whatsappType) ? whatsappType : null;

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `UPDATE salespeople 
           SET name = $1, email = $2, phone = $3, color = $4, bg_color = $5, slug = $6, active = $7,
               whatsapp_type = COALESCE($8, whatsapp_type, 'business')
           WHERE id = $9
           RETURNING id, name, email, phone, color, bg_color AS "bgColor", is_default AS "isDefault", slug, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf", COALESCE(whatsapp_type, 'business') AS "whatsappType", created_at AS "createdAt"`,
          [nameTrim, sellerEmail, sellerPhone, sellerColor, sellerBgColor, sellerSlug, sellerActive, sellerWhatsAppType, id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }

        // Update salesperson_name in leads table
        await D.pgPool.query(`UPDATE leads SET salesperson_name = $1 WHERE salesperson_id = $2`, [nameTrim, id]);

        // Sync active state, name, and email with users table if a user exists
        if (sellerEmail) {
          await D.pgPool.query(
            `UPDATE users SET active = $1, name = $2, email = $3 WHERE salesperson_id = $4`,
            [sellerActive, nameTrim, sellerEmail.toLowerCase(), id]
          );
        } else {
          await D.pgPool.query(`UPDATE users SET active = $1, name = $2 WHERE salesperson_id = $3`, [sellerActive, nameTrim, id]);
        }

        const vendedorAtualizado: RespostaVendedorAtualizado = result.rows[0];
        return res.json(vendedorAtualizado);
      } else {
        const seller = D.memorySalespeopleMap.get(id);
        if (!seller) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        seller.name = nameTrim;
        seller.email = sellerEmail;
        seller.phone = sellerPhone;
        seller.color = sellerColor;
        seller.bgColor = sellerBgColor;
        if (sellerSlug !== null) seller.slug = sellerSlug;
        seller.active = sellerActive;
        if (sellerWhatsAppType) seller.whatsappType = sellerWhatsAppType;
        D.memorySalespeopleMap.set(id, seller);

        // Update leads in memory
        for (const lead of D.memoryLeadsMap.values()) {
          if (lead.salespersonId === id) {
            lead.salespersonName = nameTrim;
          }
        }

        // Sync user in memory
        for (const u of D.memoryUsersMap.values()) {
          if (u.salespersonId === id) {
            u.active = sellerActive;
            u.name = nameTrim;
            if (sellerEmail) u.email = sellerEmail.toLowerCase();
          }
        }

        const vendedorAtualizadoMemoria: RespostaVendedorAtualizado = seller;
        return res.json(vendedorAtualizadoMemoria);
      }
    } catch (error: any) {
      console.error('Error updating salesperson:', error);
      res.status(500).json({ error: 'Erro ao atualizar vendedor.' });
    }
  });

  // 3.1 Reset/Set password for a salesperson
  app.post('/api/salespeople/:id/reset-password', async (req: any, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    // Esta rota é SÓ para conta de vendedor. Nunca pode tocar numa conta de administrador:
    // era por aqui que um vendedor redefinia a senha de `seller-thomas` (admin) e virava dono
    // do sistema. Troca de senha de admin é na tela de usuários, por outro admin.
    if (await D.isAdminSalesperson(id)) {
      return res.status(403).json({
        error: 'Esta conta é de administrador. Troque a senha pela tela de usuários.',
        code: 'admin_account'
      });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < D.MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `A senha deve ter pelo menos ${D.MIN_PASSWORD_LENGTH} caracteres.` });
    }

    const cleanPass = newPassword.trim();
    const creds = hashPassword(cleanPass);
    const now = new Date().toISOString();

    try {
      if (D.usePostgres && D.pgPool) {
        // Find salesperson info
        const spRes = await D.pgPool.query('SELECT name, email, slug FROM salespeople WHERE id = $1', [id]);
        if (spRes.rowCount === 0) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        const seller = spRes.rows[0];

        // Check if user already exists for this salesperson
        const userRes = await D.pgPool.query('SELECT id, email FROM users WHERE salesperson_id = $1', [id]);
        if (userRes.rowCount && userRes.rowCount > 0) {
          const userId = userRes.rows[0].id;
          await D.pgPool.query(
            `UPDATE users SET password_hash = $1, password_salt = $2, active = TRUE WHERE id = $3`,
            [creds.hash, creds.salt, userId]
          );
          const respostaSenhaAtualizada: RespostaSenhaVendedor = {
            success: true,
            email: userRes.rows[0].email,
            message: `Senha de ${seller.name} atualizada com sucesso!`
          };
          return res.json(respostaSenhaAtualizada);
        } else {
          // Create user account for this closer
          const credsInfo = D.getSalespersonCredentials(seller.name, seller.email);
          const email = credsInfo.email;
          const newUserId = `user-${id}`;
          await D.pgPool.query(
            `INSERT INTO users (id, name, email, password_hash, password_salt, role, salesperson_id, active, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [newUserId, seller.name, email.toLowerCase(), creds.hash, creds.salt, 'salesperson', id, true, now]
          );
          const respostaCredencialCriada: RespostaSenhaVendedor = {
            success: true,
            email: email.toLowerCase(),
            message: `Credencial criada com sucesso para ${seller.name}!`
          };
          return res.json(respostaCredencialCriada);
        }
      } else {
        const seller = D.memorySalespeopleMap.get(id);
        if (!seller) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        let foundUser: any = null;
        for (const u of D.memoryUsersMap.values()) {
          if (u.salespersonId === id) {
            foundUser = u;
            break;
          }
        }
        if (foundUser) {
          foundUser.passwordHash = creds.hash;
          foundUser.passwordSalt = creds.salt;
          foundUser.active = true;
          const respostaSenhaMemoria: RespostaSenhaVendedor = {
            success: true,
            email: foundUser.email,
            message: `Senha de ${seller.name} atualizada com sucesso!`
          };
          return res.json(respostaSenhaMemoria);
        } else {
          const credsInfo = D.getSalespersonCredentials(seller.name, seller.email);
          const email = credsInfo.email;
          const newUserId = `user-${id}`;
          D.memoryUsersMap.set(newUserId, {
            id: newUserId,
            name: seller.name,
            email: email.toLowerCase(),
            passwordHash: creds.hash,
            passwordSalt: creds.salt,
            role: 'salesperson',
            salespersonId: id,
            active: true,
            createdAt: now
          });
          const respostaCredencialCriada: RespostaSenhaVendedor = {
            success: true,
            email: email.toLowerCase(),
            message: `Credencial criada com sucesso para ${seller.name}!`
          };
          return res.json(respostaCredencialCriada);
        }
      }
    } catch (error: any) {
      console.error('Error resetting password for salesperson:', error);
      res.status(500).json({ error: 'Erro ao redefinir senha do vendedor.' });
    }
  });

  // 3.2 Quick Toggle Active status for salesperson
  app.patch('/api/salespeople/:id/toggle-active', async (req: any, res) => {
    const { id } = req.params;
    const { active } = req.body;

    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'O status active deve ser booleano.' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `UPDATE salespeople SET active = $1 WHERE id = $2 RETURNING id, name, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf"`,
          [active, id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        await D.pgPool.query(`UPDATE users SET active = $1 WHERE salesperson_id = $2`, [active, id]);
        const respostaStatus: RespostaVendedorStatus = { success: true, salesperson: result.rows[0] };
        return res.json(respostaStatus);
      } else {
        const seller = D.memorySalespeopleMap.get(id);
        if (!seller) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        seller.active = active;
        for (const u of D.memoryUsersMap.values()) {
          if (u.salespersonId === id) {
            u.active = active;
          }
        }
        const respostaStatus: RespostaVendedorStatus = { success: true, salesperson: seller };
        return res.json(respostaStatus);
      }
    } catch (err: any) {
      console.error('Erro ao alternar status do vendedor:', err);
      res.status(500).json({ error: 'Erro ao alternar status do vendedor.' });
    }
  });

  // 3.2.1 Toggle Can Generate Audit PDF Permission for salesperson
  app.patch('/api/salespeople/:id/toggle-audit-pdf', async (req: any, res) => {
    const { id } = req.params;
    const { canGenerateAuditPdf } = req.body;

    if (typeof canGenerateAuditPdf !== 'boolean') {
      return res.status(400).json({ error: 'O status canGenerateAuditPdf deve ser booleano.' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `UPDATE salespeople SET can_generate_audit_pdf = $1 WHERE id = $2 RETURNING id, name, active, COALESCE(can_generate_audit_pdf, TRUE) AS "canGenerateAuditPdf"`,
          [canGenerateAuditPdf, id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        const respostaStatus: RespostaVendedorStatus = { success: true, salesperson: result.rows[0] };
        return res.json(respostaStatus);
      } else {
        const seller = D.memorySalespeopleMap.get(id);
        if (!seller) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        seller.canGenerateAuditPdf = canGenerateAuditPdf;
        const respostaStatus: RespostaVendedorStatus = { success: true, salesperson: seller };
        return res.json(respostaStatus);
      }
    } catch (err: any) {
      console.error('Erro ao alternar permissão de laudo audit PDF:', err);
      res.status(500).json({ error: 'Erro ao alternar permissão de laudo audit PDF.' });
    }
  });

  // 3.2.1.1 Update Salesperson WhatsApp Type (Business, Normal ou Ask)
  app.patch('/api/salespeople/:id/whatsapp-type', async (req: any, res) => {
    const { id } = req.params;
    const { whatsappType } = req.body;
    const cleanType = ['business', 'normal', 'ask'].includes(whatsappType) ? whatsappType : 'business';

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          `UPDATE salespeople 
           SET whatsapp_type = $1 
           WHERE id = $2 
           RETURNING id, name, active, COALESCE(whatsapp_type, 'business') AS "whatsappType"`,
          [cleanType, id]
        );
        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        const respostaStatus: RespostaVendedorStatus = { success: true, salesperson: result.rows[0] };
        return res.json(respostaStatus);
      } else {
        const seller = D.memorySalespeopleMap.get(id);
        if (!seller) {
          return res.status(404).json({ error: 'Vendedor não encontrado.' });
        }
        seller.whatsappType = cleanType;
        const respostaStatus: RespostaVendedorStatus = { success: true, salesperson: seller };
        return res.json(respostaStatus);
      }
    } catch (err: any) {
      console.error('Erro ao atualizar whatsapp_type do vendedor:', err);
      res.status(500).json({ error: 'Erro ao atualizar preferência de WhatsApp.' });
    }
  });

  // 4. Delete salesperson (Reassigns their leads back to Thomas / primary)
  app.delete('/api/salespeople/:id', async (req: any, res) => {
    if (req.user && !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Permissão negada. Apenas administradores podem remover vendedores.' });
    }
    const { id } = req.params;

    if (id === 'seller-thomas') {
      return res.status(400).json({ error: 'Não é permitido excluir o vendedor principal (Thomas).' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        // Reassign leads to Thomas
        await D.pgPool.query(
          `UPDATE leads SET salesperson_id = 'seller-thomas', salesperson_name = 'Thomas' WHERE salesperson_id = $1`,
          [id]
        );
        // Delete associated user login
        await D.pgPool.query(`DELETE FROM users WHERE salesperson_id = $1`, [id]);
        // Delete salesperson
        await D.pgPool.query(`DELETE FROM salespeople WHERE id = $1`, [id]);
        await D.logAudit('VENDEDOR_EXCLUIDO', `Excluiu vendedor ID ${id} e removeu suas credenciais de login`, req);
        const respostaExclusao: RespostaSucesso = { success: true, message: 'Vendedor e sua conta de acesso foram excluídos, e seus leads foram transferidos para Thomas.' };
        return res.json(respostaExclusao);
      } else {
        for (const lead of D.memoryLeadsMap.values()) {
          if (lead.salespersonId === id) {
            lead.salespersonId = 'seller-thomas';
            lead.salespersonName = 'Thomas';
          }
        }
        for (const [uid, u] of D.memoryUsersMap.entries()) {
          if (u.salespersonId === id) {
            D.memoryUsersMap.delete(uid);
          }
        }
        D.memorySalespeopleMap.delete(id);
        await D.logAudit('VENDEDOR_EXCLUIDO', `Excluiu vendedor ID ${id} e removeu suas credenciais de login`, req);
        const respostaExclusao: RespostaSucesso = { success: true, message: 'Vendedor e sua conta de acesso foram excluídos, e seus leads foram transferidos para Thomas.' };
        return res.json(respostaExclusao);
      }
    } catch (error) {
      console.error('Error deleting salesperson:', error);
      res.status(500).json({ error: 'Erro ao excluir vendedor.' });
    }
  });

  // Configuração de Pesos da Roleta por Vendedor
  app.post('/api/salespeople/:id/roulette-config', async (req, res) => {
    const { id } = req.params;
    const { pctInteressados, pctNaoInteressados, limiteLeadsDiario } = req.body;

    const pctWarm = Math.max(0, Math.min(100, Number(pctInteressados ?? 50)));
    const pctCold = Math.max(0, Math.min(100, Number(pctNaoInteressados ?? 50)));
    const limit = Math.max(1, Number(limiteLeadsDiario ?? 50));

    if (D.usePostgres && D.pgPool) {
      try {
        await D.pgPool.query(
          `UPDATE salespeople 
           SET pct_interessados = $1, pct_nao_interessados = $2, limite_leads_diario = $3
           WHERE id = $4`,
          [pctWarm, pctCold, limit, id]
        );
      } catch (err: any) {
        return res.status(500).json({ error: `Erro ao salvar configurações da roleta: ${err.message}` });
      }
    }

    const seller = D.memorySalespeopleMap.get(id);
    if (seller) {
      seller.pctInteressados = pctWarm;
      seller.pctNaoInteressados = pctCold;
      seller.limiteLeadsDiario = limit;
      D.memorySalespeopleMap.set(id, seller);
    }

    D.broadcastSSE('SALESPEOPLE_UPDATED', { salespersonId: id }, { broadcastAll: true });
    const respostaRoleta: RespostaRoletaConfig = { success: true, salespersonId: id, pctWarm, pctCold, limit };
    return res.json(respostaRoleta);
  });

  // Reset manual de leads diários da equipe
  app.post('/api/salespeople/reset-daily-leads', async (req, res) => {
    if (D.usePostgres && D.pgPool) {
      try {
        await D.pgPool.query('UPDATE salespeople SET leads_recebidos_hoje = 0');
      } catch (err: any) {
        return res.status(500).json({ error: `Erro ao resetar: ${err.message}` });
      }
    }

    for (const s of D.memorySalespeopleMap.values()) {
      s.leadsRecebidosHoje = 0;
    }

    D.broadcastSSE('SALESPEOPLE_UPDATED', { resetDaily: true }, { broadcastAll: true });
    const respostaReset: RespostaSucesso = { success: true, message: 'Contagem diária de leads zerada com sucesso!' };
    return res.json(respostaReset);
  });

  // Execução da Roleta em Lote (Distribui leads pendentes respeitando limites e pesos)
  app.post('/api/salespeople/distribute-roulette', async (req, res) => {
    const { leadType = 'geral', count, maxCount } = (req.body ?? {}) satisfies RequisicaoDistribuicaoRoleta;
    // O front envia `count`. `maxCount` continua aceito por compatibilidade.
    const limite = Number(count ?? maxCount) || 50;

    let leadIds: string[] = [];
    if (D.usePostgres && D.pgPool) {
      const qRes = await D.pgPool.query(
        `SELECT id FROM leads 
         WHERE column_status = 'Leads'
         ORDER BY created_at DESC 
         LIMIT $1`,
        [limite]
      );
      leadIds = qRes.rows.map(r => r.id);
    } else {
      leadIds = Array.from(D.memoryLeadsMap.values())
        .filter(l => l.columnStatus === 'Leads')
        .slice(0, limite)
        .map(l => l.id);
    }

    const assigned: any[] = [];
    for (const id of leadIds) {
      // Distribuição manual do admin: pode reatribuir lead que já tem dono.
      const resAssigned = await D.assignLeadViaRoulette(id, leadType, { force: true });
      if (resAssigned) assigned.push({ leadId: id, ...resAssigned });
    }

    const respostaDistribuicao: RespostaDistribuicaoRoleta = {
      success: true,
      totalProcessed: leadIds.length,
      assignedCount: assigned.length,
      assigned
    };
    return res.json(respostaDistribuicao);
  });

  // ============================================================================
  // QUICK REPLIES (RESPOSTAS RÁPIDAS COM ATALHO '/')
  // ============================================================================
  app.get('/api/quick-replies', async (req, res) => {
    // Com Postgres, a verdade é o banco — inclusive quando está vazio.
    // Antes, lista vazia no banco fazia aparecerem 4 respostas "padrão" que só existiam na
    // memória: o usuário apagava e elas voltavam, editava e não salvava.
    // As padrão agora são gravadas no banco na primeira subida (ver initDatabase).
    if (D.usePostgres && D.pgPool) {
      try {
        const qRes = await D.pgPool.query(
          `SELECT id, salesperson_id AS "salespersonId", shortcut, title, type, content, media_url AS "mediaUrl", created_at AS "createdAt"
           FROM quick_replies
           ORDER BY created_at ASC`
        );
        return res.json({ success: true, quickReplies: qRes.rows } satisfies RespostaListaRespostasRapidas);
      } catch (err: any) {
        console.warn('[PostgreSQL] Erro ao buscar quick_replies:', err.message);
        return res.status(503).json({ error: 'Não foi possível ler as respostas rápidas.' });
      }
    }
    return res.json({
      success: true,
      quickReplies: Array.from(D.memoryQuickRepliesMap.values())
    } satisfies RespostaListaRespostasRapidas);
  });

  app.post('/api/quick-replies', async (req, res) => {
    const { shortcut, title, content, type = 'text', mediaUrl, salespersonId } = req.body;
    if (!shortcut || !title || !content) {
      return res.status(400).json({ error: 'Atalho, título e conteúdo são obrigatórios.' });
    }

    const cleanShortcut = String(shortcut).replace(/^\//, '').trim().toLowerCase();
    const id = `qr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newQR: QuickReply = {
      id,
      salespersonId,
      shortcut: cleanShortcut,
      title: String(title).trim(),
      type,
      content: String(content).trim(),
      mediaUrl,
      createdAt: new Date().toISOString()
    };

    D.memoryQuickRepliesMap.set(id, newQR);

    if (D.usePostgres && D.pgPool) {
      try {
        await D.pgPool.query(
          `INSERT INTO quick_replies (id, salesperson_id, shortcut, title, type, content, media_url, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [id, salespersonId || null, cleanShortcut, newQR.title, type, newQR.content, mediaUrl || null]
        );
      } catch (err: any) {
        console.warn('[PostgreSQL] Erro ao criar quick_reply:', err.message);
      }
    }

    D.broadcastSSE('QUICK_REPLY_CREATED', { quickReply: newQR }, { broadcastAll: true });
    return res.status(201).json({ success: true, quickReply: newQR } satisfies RespostaRespostaRapidaCriada);
  });

  app.delete('/api/quick-replies/:id', async (req, res) => {
    const { id } = req.params;
    D.memoryQuickRepliesMap.delete(id);

    if (D.usePostgres && D.pgPool) {
      try {
        await D.pgPool.query('DELETE FROM quick_replies WHERE id = $1', [id]);
      } catch (err: any) {
        console.warn('[PostgreSQL] Erro ao excluir quick_reply:', err.message);
      }
    }

    D.broadcastSSE('QUICK_REPLY_DELETED', { id }, { broadcastAll: true });
    return res.json({ success: true, id } satisfies RespostaRespostaRapidaExcluida);
  });

}
