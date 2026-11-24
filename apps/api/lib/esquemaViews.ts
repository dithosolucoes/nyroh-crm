/**
 * Views de compatibilidade (item 2.2a-2 a do checklist): vendedores, respostas_rapidas e mensagens.
 * Antes ficavam no boot (initDatabase) e eram recriadas a cada subida. Agora rodam uma vez pelo runner.
 * Para mudar uma view, criar migração nova (não editar esta).
 */
import { type Migracao } from './migracoes.js';

export const VIEWS_COMPATIBILIDADE: Migracao = {
  versao: '0002_views_compatibilidade',
  descricao: 'views de compatibilidade: vendedores, respostas_rapidas e mensagens',
  sql: '\n' + "CREATE OR REPLACE VIEW vendedores AS \n              SELECT id, name AS nome, email, pct_interessados, pct_nao_interessados, \n                     limite_leads_diario, leads_recebidos_hoje, \n                     COALESCE(ativo, true) AS ativo, \n                     created_at AS criado_em \n              FROM salespeople;\n\n            CREATE OR REPLACE VIEW respostas_rapidas AS\n              SELECT id, salesperson_id AS vendedor_id, shortcut AS atalho, type AS tipo, content AS conteudo, created_at AS criado_em\n              FROM quick_replies;\n\n            CREATE OR REPLACE VIEW mensagens AS\n              SELECT id, lead_id, salesperson_id AS vendedor_id, \n                     CASE WHEN sender = 'lead' THEN 'entrada' ELSE 'saida' END AS direcao,\n                     CASE WHEN is_audio THEN 'audio' WHEN media_type IS NOT NULL THEN media_type ELSE 'texto' END AS tipo,\n                     text AS conteudo, whatsapp_message_id AS mensagem_id_meta, created_at AS criado_em\n              FROM lead_messages;" + '\n',
};
