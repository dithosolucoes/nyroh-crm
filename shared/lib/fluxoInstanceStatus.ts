/**
 * Resumo do estado da integração FluxoAPI para a tela de configuração.
 * Puro (sem rede e sem banco) para poder ser testado em scripts/test-units.ts.
 */

export interface FluxoEnvPresence {
  key: boolean;
  secret: boolean;
  instanceId: boolean;
  webhookSecret: boolean;
}

/** Nomes das variáveis que ainda faltam no Railway (ou na tela), na ordem em que aparecem para o usuário. */
export function missingFluxoVars(p: FluxoEnvPresence): string[] {
  const out: string[] = [];
  if (!p.key) out.push('FLUXO_KEY');
  if (!p.secret) out.push('FLUXO_SECRET');
  if (!p.instanceId) out.push('FLUXO_INSTANCE_ID');
  if (!p.webhookSecret) out.push('FLUXO_WEBHOOK_SECRET');
  return out;
}

export interface FluxoInstanceSummary {
  found: boolean;
  status: string;
  name: string | null;
  phone: string | null;
}

/** Acha a instância configurada na lista devolvida pela FluxoAPI e normaliza o status em texto. */
export function summarizeFluxoInstance(instances: unknown[], instanceId: string): FluxoInstanceSummary {
  const list = Array.isArray(instances) ? instances : [];
  const wanted = (instanceId || '').trim();
  if (!wanted) return { found: false, status: 'sem_id', name: null, phone: null };
  const inst: any = list.find((i: any) => i && String(i.id || i.instanceId || '') === wanted);
  if (!inst) return { found: false, status: 'nao_encontrada', name: null, phone: null };
  const raw = String(inst.status || inst.connectionStatus || inst.state || 'desconhecido').toLowerCase();
  const connected = ['connected', 'online', 'open', 'ready', 'no_ar', 'active'].includes(raw);
  return {
    found: true,
    status: connected ? 'no_ar' : raw,
    name: inst.name || inst.label || null,
    phone: inst.phone || inst.number || inst.phoneNumber || null
  };
}
