import { randomUUID } from 'crypto';
/**
 * Rotas de persistência das automações de resposta (só admin).
 *
 * Não envia nada: só guarda as regras. As tabelas vêm de migrations/2026-11-automacoes-respostas.sql
 * e a criação só roda com NYROH_AUTOMACOES_PERSISTENCIA=true. Sem isso, as rotas respondem 503.
 *
 * Validação no servidor: a mesma do motor (validarAutomacao). Regra com erro não é salva;
 * regra com conflito não pode ficar ativa.
 */
import type { Express, Request, Response } from 'express';
import type pg from 'pg';
import { validarAutomacao, type Automacao } from './automacoes';
import { processarVencidos } from './automacoesWorker';
import { criarExecutorAcoes, camposDoLead, tabelaExiste } from './automacoesExecutores';
import { registrarEventoGeral } from './automacoesExecucao';
import { proximaOcorrencia } from './automacoesEstado';
import type { ItemFila } from './automacoesExecucao';
import type { RegistroAutomacao } from './automacoesExecucao';

/**
 * Pausa geral: vale o que está no banco (tabela automacoes_config, quando existir).
 * Sem a tabela ou sem a linha, vale a variável de ambiente, como antes.
 */
/** Fase H: transporte real do envio ainda NÃO conectado. Enquanto for false, nada sai, mesmo ligado. */
export const ENVIO_REAL_CONECTADO = false;

/** Fase H: configuração de envio guardada em automacoes_config. Sem tabela, vale o padrão (desligado). */
export async function lerEnvioConfig(pool: pg.Pool | null): Promise<ConfigEnvio> {
  if (!pool || !(await tabelaExiste(pool as any, 'automacoes_config').catch(() => false))) return { ...ENVIO_PADRAO, automacoesLiberadas: [] };
  const r = await pool.query(`SELECT valor FROM automacoes_config WHERE chave = 'envio_real'`);
  if (!r.rows[0]) return { ...ENVIO_PADRAO, automacoesLiberadas: [] };
  try {
    return normalizarEnvio(JSON.parse(String(r.rows[0].valor)));
  } catch {
    return { ...ENVIO_PADRAO, automacoesLiberadas: [] };
  }
}

/** Fase H: envios reais já feitos hoje (dia de São Paulo). Base do limite por dia. */
export async function contarEnviosReaisHoje(pool: pg.Pool, agora: Date): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM automacoes_fila
     WHERE status = 'executado' AND resultado LIKE 'Enviado%'
       AND processado_em >= date_trunc('day', $1::timestamptz AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`,
    [agora.toISOString()]
  );
  return Number(r.rows[0]?.n) || 0;
}

export async function lerPausaGeral(pool: pg.Pool | null): Promise<boolean> {
  if (pool && (await tabelaExiste(pool as any, 'automacoes_config').catch(() => false))) {
    const r = await pool.query(`SELECT valor FROM automacoes_config WHERE chave = 'pausa_geral'`);
    if (r.rows[0]) return r.rows[0].valor === 'true';
  }
  return pausaGeralAtiva();
}

/** Disparos de horário já feitos neste processo (regra + minuto). Evita repetir no mesmo minuto. */
const agendasDisparadas = new Set<string>();

/**
 * Agenda do JSON: quando chega o horário de uma regra "agenda_horario" ativa, dispara o evento para
 * os leads do funil indicado no filtro. Sem funil no filtro, a regra não dispara (evita atingir a base toda).
 */
export async function dispararAgendas(pool: pg.Pool, agora: Date, deps: { carregarRegras: () => Promise<RegistroAutomacao[]>; gravarFila: (itens: ItemFila[]) => Promise<void> }): Promise<number> {
  const minuto = Math.floor(agora.getTime() / 60000) * 60000;
  const regras = await deps.carregarRegras();
  let disparos = 0;
  for (const r of regras) {
    const g = r.def?.gatilho;
    if (r.status !== 'ativa' || g?.evento !== 'agenda_horario' || !g.agenda) continue;
    const funil = g.filtro?.funil;
    if (!funil) continue;
    const prox = proximaOcorrencia(new Date(minuto - 60000), g.agenda);
    if (!prox || prox.getTime() !== minuto) continue;
    const chave = `${r.id}|${minuto}`;
    if (agendasDisparadas.has(chave)) continue;
    agendasDisparadas.add(chave);
    if (agendasDisparadas.size > 500) agendasDisparadas.clear();
    const leads = await pool.query(`SELECT id FROM leads WHERE column_status = $1 LIMIT 500`, [funil]);
    for (const l of leads.rows) {
      await registrarEventoGeral('agenda_horario', String(l.id), { funil: String(funil) }, agora, deps).catch(() => 0);
      disparos++;
    }
  }
  return disparos;
}
import { pausaGeralAtiva, aplicarVersao } from './automacoesLimites';
import { ENVIO_PADRAO, LIMITE_ENVIO_DIA_MAX, normalizarEnvio, somenteDigitos, type ConfigEnvio } from './automacoesEnvio';

interface AutomacoesDeps {
  getPool: () => pg.Pool | null;
  currentUser: (req: Request) => any;
  isAdmin: (user: any) => boolean;
}

const FLAG = 'NYROH_AUTOMACOES_PERSISTENCIA';
const STATUS_VALIDOS = ['ativa', 'inativa', 'rascunho'] as const;
const ID_VALIDO = /^[a-zA-Z0-9_-]{1,64}$/;

/** Verdadeiro quando a persistência de automações está liberada (flag ligada). */
export const automacoesPersistenciaOn = (): boolean => process.env[FLAG] === 'true';

/** Aplica a migração de automações (idempotente). Chamado no boot só com a flag ligada. */
export async function applyAutomacoesMigration(pool: pg.Pool): Promise<void> {
  const { default: fs } = await import('fs');
  const path = await import('path');
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'migrations', '2026-11-automacoes-respostas.sql'), 'utf8');
  await pool.query(sql);
  console.log('[AUTOMACOES] migração aplicada (flag NYROH_AUTOMACOES_PERSISTENCIA=true).');
}

export function registerAutomacoesRoutes(app: Express, deps: AutomacoesDeps): void {
  const soAdmin = (req: Request, res: Response): boolean => {
    if (!deps.isAdmin(deps.currentUser(req))) {
      res.status(403).json({ error: 'Acesso restrito ao Administrador.' });
      return false;
    }
    return true;
  };

  const pronto = (res: Response): import('pg').Pool | null => {
    const pool = deps.getPool();
    if (!automacoesPersistenciaOn() || !pool) {
      res.status(503).json({ error: 'Persistência de automações desligada neste ambiente.' });
      return null;
    }
    return pool;
  };

  app.get('/api/admin/automacoes', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const pool = pronto(res);
    if (!pool) return;
    try {
      const r = await pool.query(`SELECT id, status, definicao FROM automacoes_respostas ORDER BY criado_em, id`);
      res.json(r.rows.map((x: any) => ({ id: x.id, status: x.status, def: x.definicao })));
    } catch {
      res.status(500).json({ error: 'Erro ao carregar automações.' });
    }
  });

  app.put('/api/admin/automacoes/:id', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const pool = pronto(res);
    if (!pool) return;
    const id = String(req.params.id);
    const status = req.body?.status;
    const def = req.body?.def as Automacao | undefined;
    if (!ID_VALIDO.test(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'Situação inválida.' });

    try {
      const outras = await pool.query(`SELECT id, status, definicao FROM automacoes_respostas WHERE id <> $1`, [id]);
      const lista = outras.rows.map((x: any) => ({ id: x.id, status: x.status, def: x.definicao }));
      const val = validarAutomacao(def, lista, id);
      if (val.erros.length > 0) return res.status(422).json({ error: 'A automação tem erros.', erros: val.erros });
      if (status === 'ativa' && val.conflitos.length > 0) {
        return res.status(422).json({ error: 'Não dá para ativar: há conflito com outra automação.', conflitos: val.conflitos });
      }
      // Versão e histórico vêm do servidor: a definição anterior entra no histórico.
      const anterior = await pool.query(`SELECT definicao FROM automacoes_respostas WHERE id = $1`, [id]);
      const anteriorDb = anterior.rows[0]?.definicao ?? null;
      const comVersao = aplicarVersao(anteriorDb, def as unknown as Record<string, unknown>, new Date());
      await pool.query(
        `INSERT INTO automacoes_respostas (id, status, definicao, atualizado_em)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, definicao = EXCLUDED.definicao, atualizado_em = CURRENT_TIMESTAMP`,
        [id, status, JSON.stringify(comVersao)]
      );
      res.json({ ok: true, id, status, versao: comVersao.versao });
    } catch {
      res.status(500).json({ error: 'Erro ao salvar automação.' });
    }
  });

  // E2: execuções (decisões do motor com motivo), da auditoria.
  app.get('/api/admin/automacoes/execucoes', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const pool = pronto(res);
    if (!pool) return;
    try {
      const r = await pool.query(
        `SELECT quando, decisao, motivo, lead_id, regra_id, versao FROM automacoes_auditoria ORDER BY quando DESC LIMIT 100`
      );
      res.json(r.rows.map((x: any) => ({ quando: x.quando, decisao: x.decisao, motivo: x.motivo, leadId: x.lead_id, regraId: x.regra_id, versao: x.versao })));
    } catch {
      res.status(500).json({ error: 'Erro ao carregar execuções.' });
    }
  });

  // E3: fila agendada (passos com espera).
  app.get('/api/admin/automacoes/fila', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const pool = pronto(res);
    if (!pool) return;
    try {
      const r = await pool.query(
        `SELECT id, automacao_id, lead_id, passo_ordem, acao, status, executar_em, resultado
         FROM automacoes_fila ORDER BY executar_em DESC LIMIT 100`
      );
      res.json(r.rows.map((x: any) => ({
        id: x.id, automacaoId: x.automacao_id, leadId: x.lead_id, passoOrdem: x.passo_ordem,
        acao: x.acao, status: x.status, executarEm: x.executar_em, resultado: x.resultado,
      })));
    } catch {
      res.status(500).json({ error: 'Erro ao carregar a fila.' });
    }
  });

  // E4: revisão manual (leads pausados pelo motor).
  app.get('/api/admin/automacoes/revisao', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const pool = pronto(res);
    if (!pool) return;
    try {
      const r = await pool.query(
        `SELECT lead_id, ultimo_comando, ultimo_comando_em FROM leads_estado
         WHERE status_geral = 'revisao' ORDER BY ultimo_comando_em DESC NULLS LAST LIMIT 100`
      );
      res.json(r.rows.map((x: any) => ({ leadId: x.lead_id, ultimoComando: x.ultimo_comando, em: x.ultimo_comando_em })));
    } catch {
      res.status(500).json({ error: 'Erro ao carregar a revisão.' });
    }
  });

  // E4: configurações reais (estado de execução e pausa geral). Não depende do banco.
  app.get('/api/admin/automacoes/configuracoes', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    // Lista de um item, como as outras leituras da tela.
    res.json([{
      persistenciaLigada: automacoesPersistenciaOn(),
      execucaoLigada: process.env.NYROH_AUTOMACOES_EXECUCAO === 'true',
      pausaGeral: await lerPausaGeral(deps.getPool()).catch(() => pausaGeralAtiva()),
      // Limites não são mais globais: vêm do JSON de cada automação.
      limites: null,
    }]);
  });

  // Liga ou desliga a pausa geral (dado no banco). Exige a migração de configuração.
  app.put('/api/admin/automacoes/configuracoes', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const pool = pronto(res);
    if (!pool) return;
    const { pausaGeral } = (req.body || {}) as { pausaGeral?: unknown };
    if (typeof pausaGeral !== 'boolean') return res.status(400).json({ error: 'Informe pausaGeral como verdadeiro ou falso.' });
    if (!(await tabelaExiste(pool as any, 'automacoes_config'))) {
      return res.status(409).json({ error: 'Configuração ainda sem tabela (migração pendente). Nada foi alterado.' });
    }
    await pool.query(
      `INSERT INTO automacoes_config (chave, valor, atualizado_em) VALUES ('pausa_geral', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = CURRENT_TIMESTAMP`,
      [String(pausaGeral)]
    );
    res.json({ pausaGeral });
  });

  // Fase H: controle do envio real, decidido na tela. Padrão: desligado.
  app.get('/api/admin/automacoes/envio', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const cfg = await lerEnvioConfig(deps.getPool()).catch(() => ({ ...ENVIO_PADRAO, automacoesLiberadas: [] }));
    res.json({ ...cfg, persistenciaLigada: automacoesPersistenciaOn(), envioRealConectado: ENVIO_REAL_CONECTADO });
  });

  app.put('/api/admin/automacoes/envio', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const pool = pronto(res);
    if (!pool) return;
    const b = (req.body || {}) as Record<string, unknown>;
    if (typeof b.ligado !== 'boolean') return res.status(400).json({ error: 'Informe ligado como verdadeiro ou falso.' });
    const numero = somenteDigitos(b.numeroTeste);
    if (numero && (numero.length < 10 || numero.length > 15)) {
      return res.status(400).json({ error: 'Número de teste: informe com DDI e DDD, entre 10 e 15 dígitos.' });
    }
    const limite = Number(b.limitePorDia);
    if (!Number.isInteger(limite) || limite < 0 || limite > LIMITE_ENVIO_DIA_MAX) {
      return res.status(400).json({ error: `Limite por dia: número inteiro entre 0 e ${LIMITE_ENVIO_DIA_MAX}.` });
    }
    if (!Array.isArray(b.automacoesLiberadas) || b.automacoesLiberadas.some((i) => typeof i !== 'string' || !ID_VALIDO.test(i))) {
      return res.status(400).json({ error: 'Automações liberadas: lista de identificadores válidos.' });
    }
    if (b.ligado === true && !numero) {
      return res.status(400).json({ error: 'Para ligar o envio, informe o número de teste.' });
    }
    if (!(await tabelaExiste(pool as any, 'automacoes_config'))) {
      return res.status(409).json({ error: 'Configuração ainda sem tabela (migração pendente). Nada foi alterado.' });
    }
    const cfg = normalizarEnvio({ ligado: b.ligado, numeroTeste: numero, limitePorDia: limite, automacoesLiberadas: b.automacoesLiberadas });
    await pool.query(
      `INSERT INTO automacoes_config (chave, valor, atualizado_em) VALUES ('envio_real', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = CURRENT_TIMESTAMP`,
      [JSON.stringify(cfg)]
    );
    res.json({ ...cfg, persistenciaLigada: true, envioRealConectado: ENVIO_REAL_CONECTADO });
  });

  app.delete('/api/admin/automacoes/:id', async (req: Request, res: Response) => {
    if (!soAdmin(req, res)) return;
    const pool = pronto(res);
    if (!pool) return;
    const id = String(req.params.id);
    if (!ID_VALIDO.test(id)) return res.status(400).json({ error: 'Identificador inválido.' });
    try {
      await pool.query(`DELETE FROM automacoes_respostas WHERE id = $1`, [id]);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Erro ao excluir automação.' });
    }
  });
}

/** Cria a fila das esperas (idempotente). Só roda com NYROH_AUTOMACOES_EXECUCAO=true. */
/**
 * Estado do lead, auditoria, etiquetas e configuração. Roda no boot com a flag de persistência ligada.
 * Os arquivos só criam tabelas e colunas que não existem (IF NOT EXISTS). Não apagam nada.
 */
export async function applyAutomacoesEstadoMigration(pool: pg.Pool): Promise<void> {
  const { default: fs } = await import('fs');
  const path = await import('path');
  for (const arquivo of ['2026-11-leads-estado-auditoria.sql', '2026-11-lead-tags.sql', '2026-11-automacoes-config.sql']) {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'migrations', arquivo), 'utf8');
    await pool.query(sql);
  }
  console.log('[AUTOMACOES] tabelas de estado, auditoria, etiquetas e configuração conferidas (flag NYROH_AUTOMACOES_PERSISTENCIA=true).');
}

export async function applyAutomacoesFilaMigration(pool: pg.Pool): Promise<void> {
  const { default: fs } = await import('fs');
  const path = await import('path');
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'migrations', '2026-11-automacoes-fila.sql'), 'utf8');
  await pool.query(sql);
  console.log('[AUTOMACOES] fila criada (flag NYROH_AUTOMACOES_EXECUCAO=true).');
}

/**
 * Liga o processador da fila a cada minuto. Só com NYROH_AUTOMACOES_EXECUCAO=true.
 * Não envia nada: ver src/lib/automacoesWorker.ts.
 */
export function iniciarWorkerAutomacoes(pool: pg.Pool, eventos: { carregarRegras: () => Promise<RegistroAutomacao[]>; gravarFila: (itens: ItemFila[]) => Promise<void> }): void {
  if (process.env.NYROH_AUTOMACOES_EXECUCAO !== 'true') return;
  let rodando = false;
  const tick = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await dispararAgendas(pool, new Date(), eventos).catch((e: any) => console.warn('[AUTOMACOES] agenda não disparada:', e?.message));
      const resumo = await processarVencidos(new Date(), {
        buscarVencidos: async (agora, limite) => {
          const r = await pool.query(
            `SELECT id, automacao_id, lead_id, passo_ordem, acao, texto, executar_em, condicoes, limites, params, evento_em
             FROM automacoes_fila WHERE status = 'pendente' AND executar_em <= $1
             ORDER BY executar_em LIMIT $2`,
            [agora.toISOString(), limite]
          );
          return r.rows.map((x: any) => ({
            id: x.id,
            automacaoId: x.automacao_id,
            leadId: x.lead_id,
            passoOrdem: x.passo_ordem,
            acao: x.acao,
            texto: x.texto,
            executarEm: new Date(x.executar_em),
            // Pode ser lista (antiga) ou grupo "e"/"ou"/"nao": guarda como veio.
            condicoes: x.condicoes ?? [],
            limites: x.limites ?? undefined,
            params: x.params ?? undefined,
            eventoEm: x.evento_em ? new Date(x.evento_em).toISOString() : undefined,
          }));
        },
        reservar: async (id) => {
          const r = await pool.query(
            `UPDATE automacoes_fila SET status = 'executando' WHERE id = $1 AND status = 'pendente'`,
            [id]
          );
          return (r.rowCount ?? 0) > 0;
        },
        contextoDoLead: async (leadId) => {
          const r = await pool.query(
            `SELECT l.name, l.phone_number, l.public_url, l.website, l.niche, l.salesperson_name, l.status,
                    l.column_status, l.sub_status, l.loss_reason, l.variaveis_json,
                    e.status_geral, e.ultimo_comando, e.regras_executadas
             FROM leads l LEFT JOIN leads_estado e ON e.lead_id = l.id
             WHERE l.id = $1`,
            [leadId]
          );
          const x = r.rows[0];
          if (!x) return null;
          // Etiquetas por lead: só existem depois da fase I. Sem tabela, o dado fica ausente (condição falsa).
          const tags = (await tabelaExiste(pool as any, 'lead_tags'))
            ? (await pool.query(`SELECT tag FROM lead_tags WHERE lead_id = $1`, [leadId])).rows.map((t: any) => String(t.tag))
            : undefined;
          // Última mensagem do cliente (mesma fonte usada no histórico da conversa).
          const u = await pool.query(`SELECT MAX(timestamp) AS ts FROM lead_messages WHERE lead_id = $1 AND sender = 'lead'`, [leadId]);
          return {
            ultimaMensagemDoCliente: u.rows[0]?.ts ? new Date(u.rows[0].ts) : null,
            leadName: x.name,
            phoneNumber: x.phone_number,
            publicUrl: x.public_url,
            website: x.website,
            niche: x.niche,
            sellerName: x.salesperson_name,
            // Opt-out hoje é marcado com status DESCARTADO (ver detecção de opt-out no recebimento).
            optout: x.status === 'DESCARTADO' || x.status_geral === 'optout',
            pausado: x.status_geral === 'pausado' || x.status_geral === 'revisao',
            ultimoComando: x.ultimo_comando ?? null,
            status: x.status ?? undefined,
            campos: camposDoLead(x),
            tags,
            regrasExecutadas: x.regras_executadas && typeof x.regras_executadas === 'object' ? x.regras_executadas : {},
          };
        },
        aplicarAcao: criarExecutorAcoes(pool as any),
        registrarRegraExecutada: async (leadId, regraId, quando) => {
          if (!(await tabelaExiste(pool as any, 'leads_estado'))) return;
          await pool.query(
            `INSERT INTO leads_estado (lead_id, regras_executadas, atualizado_em)
             VALUES ($1, jsonb_build_object($2::text, $3::text), CURRENT_TIMESTAMP)
             ON CONFLICT (lead_id) DO UPDATE SET regras_executadas = leads_estado.regras_executadas || jsonb_build_object($2::text, $3::text), atualizado_em = CURRENT_TIMESTAMP`,
            [leadId, regraId, quando.toISOString()]
          );
        },
        marcarResultado: async (id, status, resultado, textoFinal) => {
          await pool.query(
            `UPDATE automacoes_fila SET status = $2, resultado = $3, texto_final = $4, processado_em = CURRENT_TIMESTAMP WHERE id = $1`,
            [id, status, resultado, textoFinal]
          );
        },
        lerEnvio: () => lerEnvioConfig(pool),
        contarEnviosReaisHoje: (agora) => contarEnviosReaisHoje(pool, agora),
        enviosRecentes: async (leadId, agora) => {
          // Envios automáticos (simulados hoje) nos últimos 7 dias, para os limites por lead.
          const r = await pool.query(
            `SELECT processado_em FROM automacoes_fila
             WHERE lead_id = $1 AND status = 'executado' AND texto_final IS NOT NULL
               AND processado_em >= $2::timestamptz - INTERVAL '7 days'`,
            [leadId, agora.toISOString()]
          );
          return r.rows.map((x: any) => new Date(x.processado_em));
        },
      }, 50, { pausaGeral: await lerPausaGeral(pool) });
      // D4: auditoria gravada. Se a tabela ainda não existir, só registra o aviso.
      for (const a of resumo.auditoria) {
        try {
          await pool.query(
            `INSERT INTO automacoes_auditoria (id, quando, decisao, motivo, lead_id, regra_id, versao)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [randomUUID(), a.quando, a.decisao, a.motivo, a.leadId, a.regraId, a.versao]
          );
        } catch (e: any) {
          console.warn('[AUTOMACOES] auditoria não gravada:', e?.message);
          break;
        }
      }
      if (resumo.processados > 0 || resumo.ignorados > 0) console.log('[AUTOMACOES] fila processada (sem envio):', resumo);
    } catch (e: any) {
      console.warn('[AUTOMACOES] falha ao processar a fila:', e?.message);
    } finally {
      rodando = false;
    }
  };
  setInterval(tick, 60_000);
  console.log('[AUTOMACOES] worker da fila ligado (sem envio).');
}
