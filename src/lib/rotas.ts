/**
 * Rotas com URL do painel (Fase 4).
 *
 * Uma única fonte de verdade para "onde o usuário está": a aba principal e, no admin,
 * a seção. A URL é derivada deste mapa; ao abrir um link ou apertar voltar/avançar,
 * a tela volta para o estado correspondente.
 */

export type AbaPrincipal = 'admin' | 'kanban' | 'table' | 'dashboard' | 'whatsapp' | 'hoje';

export type SecaoAdmin =
  | 'cockpit'
  | 'disparos'
  | 'usuarios'
  | 'carteiras'
  | 'vendedores'
  | 'estrutura'
  | 'configuracoes'
  | 'auditoria'
  | 'blindagem'
  | 'whatsapp';

export interface Destino {
  tab: AbaPrincipal;
  section?: SecaoAdmin;
}

const CAMINHOS: Array<{ path: string; tab: AbaPrincipal; section?: SecaoAdmin; soAdmin?: boolean }> = [
  { path: '/hoje', tab: 'hoje' },
  { path: '/conversas', tab: 'whatsapp' },
  { path: '/pipeline', tab: 'kanban' },
  { path: '/lista', tab: 'table' },
  { path: '/relatorios', tab: 'dashboard' },
  { path: '/admin', tab: 'admin', section: 'cockpit', soAdmin: true },
  { path: '/admin/leads', tab: 'admin', section: 'estrutura', soAdmin: true },
  { path: '/admin/campanhas', tab: 'admin', section: 'disparos', soAdmin: true },
  { path: '/admin/configuracoes', tab: 'admin', section: 'configuracoes', soAdmin: true },
  { path: '/admin/equipe', tab: 'admin', section: 'usuarios', soAdmin: true },
  { path: '/admin/carteiras', tab: 'admin', section: 'carteiras', soAdmin: true },
  { path: '/admin/vendedores', tab: 'admin', section: 'vendedores', soAdmin: true },
  { path: '/admin/auditoria', tab: 'admin', section: 'auditoria', soAdmin: true },
  { path: '/admin/blindagem', tab: 'admin', section: 'blindagem', soAdmin: true },
];

/** Caminho da URL para um destino. Destino de admin sem seção cai no cockpit. */
export function caminhoDe(destino: Destino): string {
  if (destino.tab === 'admin') {
    const sec = destino.section ?? 'cockpit';
    const achado = CAMINHOS.find(c => c.tab === 'admin' && c.section === sec);
    return achado ? achado.path : '/admin';
  }
  const achado = CAMINHOS.find(c => c.tab === destino.tab && !c.soAdmin);
  return achado ? achado.path : '/pipeline';
}

/** Destino para um caminho da URL, ou null se o caminho não existe. */
export function destinoDoCaminho(pathname: string): Destino | null {
  const limpo = pathname.replace(/\/+$/, '') || '/';
  const achado = CAMINHOS.find(c => c.path === limpo);
  if (!achado) return null;
  return achado.section ? { tab: achado.tab, section: achado.section } : { tab: achado.tab };
}
