/**
 * Índice de busca no histórico de mensagens (item 2.2a-2 d do checklist). Antes ficava no boot.
 * Para mudar o índice, criar migração nova (não editar esta).
 */
import { type Migracao } from './migracoes.js';

export const BUSCA_MENSAGENS: Migracao = {
  versao: '0005_busca_mensagens',
  descricao: 'índice gin de busca em lead_messages.text (português)',
  sql: '\n' + "CREATE INDEX IF NOT EXISTS idx_lead_messages_text ON lead_messages USING gin (to_tsvector('portuguese', coalesce(text, '')));\n" + '\n',
};
