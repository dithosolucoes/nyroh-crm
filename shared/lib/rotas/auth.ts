import type { Express } from 'express';
import { User } from '../../types.js';
import type { RespostaLoginOk, RespostaSessaoAtual, RespostaSucesso, UsuarioAdmin, RespostaListaUsuarios, RespostaAuditLogs, RespostaLogsServidor } from '../../contracts/rotas.js';
import { hashPassword, verifyPassword, generateSessionToken, isUserAdmin } from '../serverAuth.js';
import { readLogs, logCategories } from '../logBuffer.js';
import { SQL_SELECT_USERS, SQL_INSERT_AUTH_SESSIONS, SQL_DELETE_AUTH_SESSIONS, SQL_UPDATE_USERS, SQL_DELETE_AUTH_SESSIONS_2, SQL_SELECT_USERS_2, SQL_SELECT_USERS_3, SQL_INSERT_USERS, SQL_UPDATE_USERS_2, SQL_UPDATE_USERS_3, SQL_UPDATE_USERS_4, SQL_UPDATE_USERS_5, SQL_UPDATE_USERS_6, SQL_SELECT_USERS_4, SQL_DELETE_USERS, SQL_SELECT_AUDIT_LOGS, SQL_ALTER_CAMPAIGN_LEADS } from './repo/auth.js';


export interface DependenciasAuth {
  readonly IS_PRODUCTION: any;
  readonly LOGIN_WINDOW_MS: any;
  readonly MIN_PASSWORD_LENGTH: any;
  readonly SESSION_TTL_MS: any;
  readonly VALID_ROLES: any;
  readonly getSalespersonCredentials: any;
  readonly hashSessionToken: any;
  readonly isLoginBlocked: any;
  readonly logAudit: any;
  readonly loginFailures: any;
  readonly loginKey: any;
  readonly memoryAuditLogs: any;
  readonly memorySessionsMap: any;
  readonly memoryUsersMap: Map<string, any>;
  readonly pgPool: any;
  readonly registerLoginFailure: any;
  readonly syncSalespeopleUsers: any;
  readonly usePostgres: any;
}

let D: DependenciasAuth;

export function configurarAuth(deps: DependenciasAuth): void {
  D = deps;
}

export function registrarAuth(app: Express): void {
  // AUTH ENDPOINTS

  // 1. Login
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const rawPass = String(password);

    const throttleKey = D.loginKey(req, cleanEmail);
    if (D.isLoginBlocked(throttleKey)) {
      res.setHeader('Retry-After', String(Math.ceil(D.LOGIN_WINDOW_MS / 1000)));
      return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.' });
    }

    try {
      let foundUser: any = null;

      if (D.usePostgres && D.pgPool) {
        const uRes = await D.pgPool.query(
          SQL_SELECT_USERS,
          [cleanEmail]
        );
        if (uRes.rows.length > 0) {
          foundUser = uRes.rows[0];
        }
      } else {
        for (const u of D.memoryUsersMap.values()) {
          if (u.email.toLowerCase() === cleanEmail) {
            foundUser = u;
            break;
          }
        }
      }

      if (!foundUser) {
        D.registerLoginFailure(throttleKey);
        await D.logAudit('LOGIN_FALHOU', `Tentativa com e-mail inexistente: ${cleanEmail}`, req);
        return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
      }

      if (!foundUser.active) {
        await D.logAudit('LOGIN_BLOQUEADO', `Usuário inativo tentou login: ${cleanEmail}`, req);
        return res.status(403).json({ error: 'Sua conta de acesso foi desativada pelo administrador.' });
      }

      const isValid = verifyPassword(rawPass, foundUser.passwordHash, foundUser.passwordSalt);
      if (!isValid) {
        D.registerLoginFailure(throttleKey);
        await D.logAudit('LOGIN_SENHA_INCORRETA', `Senha incorreta para ${cleanEmail}`, req);
        return res.status(401).json({ error: 'Credenciais inválidas. Senha incorreta.' });
      }

      D.loginFailures.delete(throttleKey);

      // Cria token seguro de 64 caracteres. O banco guarda só o hash dele.
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + D.SESSION_TTL_MS);

      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          SQL_INSERT_AUTH_SESSIONS,
          [D.hashSessionToken(token), foundUser.id, expiresAt]
        );
      } else {
        D.memorySessionsMap.set(D.hashSessionToken(token), { userId: foundUser.id, expiresAt: expiresAt.getTime() });
      }

      // Cookie seguro HttpOnly. sameSite 'strict': o cookie não viaja em requisição
      // vinda de outro site (CSRF).
      res.cookie('crm_session', token, {
        httpOnly: true,
        secure: D.IS_PRODUCTION,
        sameSite: 'strict',
        maxAge: D.SESSION_TTL_MS,
        path: '/'
      });

      const effectiveRole = isUserAdmin(foundUser) ? 'admin' : foundUser.role;
      const publicUserData: User = {
        id: foundUser.id,
        name: foundUser.name,
        email: foundUser.email,
        role: effectiveRole,
        salespersonId: foundUser.salespersonId,
        active: foundUser.active,
        createdAt: foundUser.createdAt || new Date().toISOString()
      };

      (req as any).user = publicUserData;
      await D.logAudit('LOGIN_SUCESSO', `Usuário ${foundUser.name} (${foundUser.role}) logou com sucesso.`, req);

      const respostaLogin: RespostaLoginOk = {
        user: publicUserData,
        token
      };
      return res.json(respostaLogin);
    } catch (err: any) {
      console.error('Erro no login:', err);
      res.status(500).json({ error: 'Erro interno ao realizar autenticação.' });
    }
  });

  // 2. Logout
  app.post('/api/auth/logout', async (req, res) => {
    const token = req.cookies?.crm_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) {
      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(SQL_DELETE_AUTH_SESSIONS, [D.hashSessionToken(token)]).catch(() => {});
      } else {
        D.memorySessionsMap.delete(D.hashSessionToken(token));
      }
    }

    await D.logAudit('LOGOUT', 'Usuário encerrou sessão.', req);
    res.clearCookie('crm_session', { path: '/' });
    const respostaLogout: RespostaSucesso = { success: true, message: 'Sessão encerrada com sucesso.' };
    return res.json(respostaLogout);
  });

  // 3. Me (Current User)
  app.get('/api/auth/me', (req: any, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const respostaMe: RespostaSessaoAtual = { user: req.user };
    return res.json(respostaMe);
  });

  // 3.1 Alterar a própria senha (qualquer usuário autenticado)
  app.post('/api/auth/change-password', async (req: any, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Você precisa estar autenticado para alterar sua senha.' });
    }

    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
    }

    const cleanPass = newPassword.trim();
    // Recusa as senhas que estão publicadas no código-fonte / são geradas por padrão
    const KNOWN_WEAK = new Set(['admin123', 'thomas123456!', '12345678', 'password', 'senha123', 'senha1234', 'nyroh123', 'nyroh1234']);
    const firstNameGuess = D.getSalespersonCredentials(req.user.name || '', req.user.email).legacyPredictablePassword;
    if (KNOWN_WEAK.has(cleanPass.toLowerCase()) || cleanPass === firstNameGuess) {
      return res.status(400).json({ error: 'Essa senha é previsível. Escolha outra (misture letras e números).' });
    }
    const creds = hashPassword(cleanPass);
    const userId = req.user.id;
    const currentToken = req.cookies?.crm_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');

    try {
      if (D.usePostgres && D.pgPool) {
        await D.pgPool.query(
          SQL_UPDATE_USERS,
          [creds.hash, creds.salt, userId]
        );
        // Quem já estava logado com a senha antiga (outro aparelho, alguém que descobriu a senha) perde o acesso
        await D.pgPool.query(SQL_DELETE_AUTH_SESSIONS_2, [userId, currentToken ? D.hashSessionToken(currentToken) : '']);
      } else {
        const currentHashed = currentToken ? D.hashSessionToken(currentToken) : '';
        for (const [tok, s] of D.memorySessionsMap.entries()) {
          if (s.userId === userId && tok !== currentHashed) D.memorySessionsMap.delete(tok);
        }
        const u = D.memoryUsersMap.get(userId);
        if (u) {
          u.passwordHash = creds.hash;
          u.passwordSalt = creds.salt;
        }
      }

      await D.logAudit('SENHA_ALTERADA', `Usuário ${req.user.name} (${req.user.email}) alterou sua própria senha.`, req);
      const respostaSenha: RespostaSucesso = { success: true, message: 'Sua senha foi alterada com sucesso!' };
      return res.json(respostaSenha);
    } catch (error: any) {
      console.error('Erro ao alterar senha:', error);
      return res.status(500).json({ error: 'Erro ao processar alteração de senha.' });
    }
  });

  // 3.2 Sincronizar credenciais de todos os vendedores manualmente
  app.post('/api/admin/sync-credentials', async (req: any, res) => {
    if (!req.user || !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }
    try {
      await D.syncSalespeopleUsers();
      await D.logAudit('SINCRONIZAR_CREDENCIAIS', 'Admin executou sincronização geral de contas de login de vendedores.', req);
      return res.json({ success: true, message: 'Contas e acessos de todos os vendedores foram sincronizados com sucesso!' } satisfies RespostaSucesso);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao sincronizar credenciais.' });
    }
  });

  // ADMIN ENDPOINTS

  // 4. Listar Todos os Usuários
  app.get('/api/admin/users', async (req: any, res) => {
    if (!req.user || !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          SQL_SELECT_USERS_2
        );
        const listaBanco: RespostaListaUsuarios = result.rows;
        return res.json(listaBanco);
      } else {
        const list: RespostaListaUsuarios = Array.from(D.memoryUsersMap.values()).map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          salespersonId: u.salespersonId,
          active: u.active,
          createdAt: u.createdAt
        }));
        return res.json(list);
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar lista de usuários.' });
    }
  });

  // 5. Criar Novo Usuário
  app.post('/api/admin/users', async (req: any, res) => {
    if (!req.user || !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    const { name, email, password, role, salespersonId } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const userRole = role === 'admin' || role === 'manager' ? role : 'salesperson';
    const creds = hashPassword(String(password));
    const newId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    try {
      if (D.usePostgres && D.pgPool) {
        const existing = await D.pgPool.query(SQL_SELECT_USERS_3, [cleanEmail]);
        if (existing.rows.length > 0) {
          return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
        }

        await D.pgPool.query(
          SQL_INSERT_USERS,
          [newId, String(name).trim(), cleanEmail, creds.hash, creds.salt, userRole, salespersonId || null]
        );
      } else {
        for (const u of D.memoryUsersMap.values()) {
          if (u.email.toLowerCase() === cleanEmail) {
            return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
          }
        }
        D.memoryUsersMap.set(newId, {
          id: newId,
          name: String(name).trim(),
          email: cleanEmail,
          passwordHash: creds.hash,
          passwordSalt: creds.salt,
          role: userRole,
          salespersonId: salespersonId || undefined,
          active: true,
          createdAt: now
        });
      }

      await D.logAudit('USUARIO_CRIADO', `Admin criou usuário ${name} (${cleanEmail}) como ${userRole}`, req);

      const novoUsuario: UsuarioAdmin = {
        id: newId,
        name: String(name).trim(),
        email: cleanEmail,
        role: userRole,
        salespersonId,
        active: true,
        createdAt: now
      };
      return res.status(201).json(novoUsuario);
    } catch (err: any) {
      console.error('Erro ao criar usuário:', err);
      res.status(500).json({ error: 'Erro ao cadastrar novo usuário.' });
    }
  });

  // 6. Atualizar Usuário (Ativar/Desativar ou Resetar Senha)
  app.patch('/api/admin/users/:id', async (req: any, res) => {
    if (!req.user || !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    const { id } = req.params;
    const { name, role, salespersonId, active, newPassword } = req.body;

    // `role` aceitava QUALQUER texto vindo do navegador (inclusive um papel inventado que
    // caía nas regras de admin). Agora só os papéis da lista valem.
    if (role !== undefined && !D.VALID_ROLES.has(String(role).toLowerCase().trim())) {
      return res.status(400).json({
        error: `Papel inválido. Use um destes: ${Array.from(D.VALID_ROLES).join(', ')}.`,
        code: 'invalid_role'
      });
    }
    // Senha nova sem mínimo nenhum: agora segue a regra do sistema.
    if (newPassword !== undefined && String(newPassword).trim().length < D.MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `A senha deve ter pelo menos ${D.MIN_PASSWORD_LENGTH} caracteres.` });
    }
    // Um admin não pode se rebaixar sozinho e deixar a operação sem dono.
    if (role !== undefined && String(id) === String(req.user.id) && String(role).toLowerCase().trim() !== 'admin') {
      return res.status(400).json({ error: 'Você não pode remover o seu próprio acesso de administrador.' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        if (typeof active === 'boolean') {
          await D.pgPool.query(SQL_UPDATE_USERS_2, [active, id]);
        }
        if (name) {
          await D.pgPool.query(SQL_UPDATE_USERS_3, [String(name).trim(), id]);
        }
        if (role) {
          await D.pgPool.query(SQL_UPDATE_USERS_4, [role, id]);
        }
        if (salespersonId !== undefined) {
          await D.pgPool.query(SQL_UPDATE_USERS_5, [salespersonId || null, id]);
        }
        if (newPassword) {
          const creds = hashPassword(String(newPassword));
          await D.pgPool.query(SQL_UPDATE_USERS_6, [creds.hash, creds.salt, id]);
        }
      } else {
        const u = D.memoryUsersMap.get(id);
        if (u) {
          if (typeof active === 'boolean') u.active = active;
          if (name) u.name = String(name).trim();
          if (role) u.role = role;
          if (salespersonId !== undefined) u.salespersonId = salespersonId || undefined;
          if (newPassword) {
            const creds = hashPassword(String(newPassword));
            u.passwordHash = creds.hash;
            u.passwordSalt = creds.salt;
          }
        }
      }

      await D.logAudit('USUARIO_ATUALIZADO', `Admin alterou dados/permissão do usuário ID ${id}`, req);
      const respostaAtualizado: RespostaSucesso = { success: true, message: 'Usuário atualizado com sucesso.' };
      return res.json(respostaAtualizado);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao atualizar dados do usuário.' });
    }
  });

  // 6.1 Excluir Usuário de Acesso
  app.delete('/api/admin/users/:id', async (req: any, res) => {
    if (!req.user || !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário logado.' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        const uRes = await D.pgPool.query(SQL_SELECT_USERS_4, [id]);
        if (uRes.rowCount === 0) {
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        await D.pgPool.query(SQL_DELETE_USERS, [id]);
        await D.logAudit('USUARIO_EXCLUIDO', `Admin excluiu o usuário ${uRes.rows[0].name} (${uRes.rows[0].email})`, req);
      } else {
        const u = D.memoryUsersMap.get(id);
        if (!u) {
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }
        D.memoryUsersMap.delete(id);
        await D.logAudit('USUARIO_EXCLUIDO', `Admin excluiu o usuário ${u.name} (${u.email})`, req);
      }

      const respostaExcluido: RespostaSucesso = { success: true, message: 'Usuário excluído com sucesso.' };
      return res.json(respostaExcluido);
    } catch (err: any) {
      console.error('Erro ao excluir usuário:', err);
      return res.status(500).json({ error: 'Erro ao excluir usuário.' });
    }
  });

  // 7. Audit Logs
  // Painel de Logs (admin): últimos logs do servidor, com filtro. Atualiza por afterId.
  app.get('/api/admin/logs', (req: any, res) => {
    if (!req.user || !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }
    const logs = readLogs({
      level: String(req.query.level || ''),
      category: String(req.query.category || ''),
      q: String(req.query.q || ''),
      afterId: Number(req.query.afterId) || 0,
      limit: Number(req.query.limit) || 500
    });
    const respostaLogs: RespostaLogsServidor = { logs, categories: logCategories() };
    res.json(respostaLogs);
  });

  app.get('/api/admin/audit-logs', async (req: any, res) => {
    if (!req.user || !isUserAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    try {
      if (D.usePostgres && D.pgPool) {
        const result = await D.pgPool.query(
          SQL_SELECT_AUDIT_LOGS
        );
        const auditoriaBanco: RespostaAuditLogs = result.rows;
        return res.json(auditoriaBanco);
      } else {
        const auditoriaMemoria: RespostaAuditLogs = D.memoryAuditLogs.slice(0, 100);
        return res.json(auditoriaMemoria);
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar logs de auditoria.' });
    }
  });

  // Endpoint para executar migração de schema sob demanda no Postgres
  app.post('/api/admin/db/migrate', async (req: any, res) => {
    const isAdmin = isUserAdmin(req.user); // antes: liberava anônimo fora de produção
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
    }

    if (!D.usePostgres || !D.pgPool) {
      return res.json({ success: true, message: 'Postgres não configurado (modo em memória).' } satisfies RespostaSucesso);
    }

    try {
      await D.pgPool.query(SQL_ALTER_CAMPAIGN_LEADS);
      console.log('✅ [Postgres Migration] Colunas sincronizadas com sucesso via /api/admin/db/migrate');
      return res.json({ success: true, message: 'Migração de colunas concluída com sucesso no PostgreSQL.' } satisfies RespostaSucesso);
    } catch (err: any) {
      console.error('❌ [Postgres Migration Error]:', err.message);
      return res.status(500).json({ error: `Erro na migração: ${err.message}` });
    }
  });

}
