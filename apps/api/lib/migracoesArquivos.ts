import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { aplicarMigracoes, type ClienteSql, type Migracao } from './migracoes.js';

/**
 * Migrações que vivem em arquivos SQL da pasta `migrations/` (item 2.2a-3 do checklist).
 * O conteúdo do arquivo é o SQL da migração; o runner grava o registro e roda cada uma numa transação.
 * Nunca editar uma migração já aplicada: criar outra com versão nova.
 */
export interface MigracaoArquivo {
  versao: string;
  descricao: string;
  arquivo: string;
}

/** Schema de UX (flag NYROH_APLICAR_MIGRACOES_UX). */
export const MIGRACOES_UX: MigracaoArquivo[] = [
  { versao: '0006_ux_experiencias', descricao: 'experiências de UX: remessas, bloqueio, regras de contato e campanhas', arquivo: '2026-11-ux-experiencias.sql' },
];

/** Persistência de automações (flag NYROH_AUTOMACOES_PERSISTENCIA): respostas. */
export const MIGRACOES_AUTOMACOES_RESPOSTAS: MigracaoArquivo[] = [
  { versao: '0007_automacoes_respostas', descricao: 'automações de respostas', arquivo: '2026-11-automacoes-respostas.sql' },
];

/** Persistência de automações: estado do lead, etiquetas e configuração (nessa ordem). */
export const MIGRACOES_AUTOMACOES_ESTADO: MigracaoArquivo[] = [
  { versao: '0008_leads_estado_auditoria', descricao: 'estado do lead e auditoria', arquivo: '2026-11-leads-estado-auditoria.sql' },
  { versao: '0009_lead_tags', descricao: 'etiquetas do lead', arquivo: '2026-11-lead-tags.sql' },
  { versao: '0010_automacoes_config', descricao: 'configuração do motor de automações', arquivo: '2026-11-automacoes-config.sql' },
];

/** Fila das esperas de automações (flag NYROH_AUTOMACOES_EXECUCAO). */
export const MIGRACOES_AUTOMACOES_FILA: MigracaoArquivo[] = [
  { versao: '0011_automacoes_fila', descricao: 'fila das esperas de automações', arquivo: '2026-11-automacoes-fila.sql' },
];

/** Lê os arquivos da pasta migrations/ e devolve as migrações prontas para o runner. */
export function lerMigracoesArquivo(raiz: string, lista: MigracaoArquivo[]): Migracao[] {
  return lista.map((m) => ({
    versao: m.versao,
    descricao: m.descricao,
    sql: readFileSync(resolve(raiz, 'migrations', m.arquivo), 'utf8'),
  }));
}

/** Aplica uma lista de migrações de arquivo pelo runner, numa conexão do pool. */
export async function aplicarMigracoesArquivo(pool: pg.Pool, lista: MigracaoArquivo[]): Promise<void> {
  const cliente = await pool.connect();
  try {
    const migracoes = lerMigracoesArquivo(process.cwd(), lista);
    await aplicarMigracoes(cliente as unknown as ClienteSql, migracoes, async () => cliente as unknown as ClienteSql);
  } finally {
    cliente.release();
  }
}
