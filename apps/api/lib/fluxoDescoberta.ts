import { executeFluxoRequest } from './fluxoClient.js';
import { metaDescobrirBmsEWabas, metaListarNumerosDoWaba } from './metaClient.js';

/**
 * Descoberta dos números de uma conta: cruza o que a FluxoAPI tem com o que a Meta tem.
 * Quem decide a marca de cada número é o operador (ver fluxoContas.salvarVinculos).
 * Nada aqui devolve segredo.
 */

export interface InstanciaFluxo {
  instanceId: string;
  telefone: string | null;
  status: string;
  nome: string | null;
}

export interface NumeroMeta {
  bmId: string;
  bmName: string;
  wabaId: string;
  metaPhoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string;
  statusMeta: string;
}

export interface CandidatoNumero {
  metaPhoneNumberId: string | null;
  instanceId: string | null;
  numero: string | null;
  nomeVerificado: string | null;
  bmId: string | null;
  bmName: string | null;
  wabaId: string | null;
  statusFluxo: string | null;
  qualidadeMeta: string | null;
  /** true quando aparece nas duas pontas: é o caso normal. */
  conferido: boolean;
}

/** Chave para comparar números: só dígitos, últimos 10 (DDD + número, ignora DDI e o 9 extra). */
export function chaveTelefone(valor: string | null | undefined): string | null {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (digitos.length < 8) return null;
  return digitos.slice(-10);
}

export function normalizarStatusFluxo(bruto: string): string {
  const s = String(bruto || 'desconhecido').toLowerCase();
  return ['connected', 'online', 'open', 'ready', 'no_ar', 'active'].includes(s) ? 'no_ar' : s;
}

export function cruzarNumeros(fluxo: InstanciaFluxo[], meta: NumeroMeta[]): CandidatoNumero[] {
  const saida: CandidatoNumero[] = [];
  const instanciasUsadas = new Set<string>();

  for (const n of meta) {
    const chave = chaveTelefone(n.displayPhoneNumber);
    const par = chave ? fluxo.find(f => chaveTelefone(f.telefone) === chave) : undefined;
    if (par) instanciasUsadas.add(par.instanceId);
    saida.push({
      metaPhoneNumberId: n.metaPhoneNumberId,
      instanceId: par ? par.instanceId : null,
      numero: n.displayPhoneNumber || par?.telefone || null,
      nomeVerificado: n.verifiedName || null,
      bmId: n.bmId,
      bmName: n.bmName,
      wabaId: n.wabaId,
      statusFluxo: par ? par.status : null,
      qualidadeMeta: n.qualityRating || null,
      conferido: Boolean(par),
    });
  }

  // Instâncias da FluxoAPI que a Meta não listou (ex.: número ainda não vinculado na WABA escolhida)
  for (const f of fluxo) {
    if (instanciasUsadas.has(f.instanceId)) continue;
    saida.push({
      metaPhoneNumberId: null,
      instanceId: f.instanceId,
      numero: f.telefone,
      nomeVerificado: f.nome,
      bmId: null,
      bmName: null,
      wabaId: null,
      statusFluxo: f.status,
      qualidadeMeta: null,
      conferido: false,
    });
  }
  return saida;
}

export interface FontesDescoberta {
  listarInstanciasFluxo: (apiKey: string, apiSecret: string) => Promise<InstanciaFluxo[]>;
  listarBmsEWabas: (metaToken: string) => Promise<Array<{ bmId: string; bmName: string; wabaId: string }>>;
  listarNumerosWaba: (wabaId: string, metaToken: string) => Promise<Array<{ id: string; displayPhoneNumber: string; verifiedName: string; qualityRating: string; status: string }>>;
}

/** Fontes reais: FluxoAPI (GET /v1/instances) e Meta Graph (BMs, WABAs e números). */
export const fontesReais: FontesDescoberta = {
  async listarInstanciasFluxo(apiKey, apiSecret) {
    const r = await executeFluxoRequest<any>({ method: 'GET', path: '/v1/instances', apiKey, apiSecret });
    if (!r.success) throw new Error(`FluxoAPI recusou a listagem (HTTP ${r.status || 0}).`);
    const lista: any[] = Array.isArray(r.data) ? r.data : (r.data?.instances || r.data?.data || []);
    return lista
      .filter((i: any) => i && (i.id || i.instanceId))
      .map((i: any) => ({
        instanceId: String(i.id || i.instanceId),
        telefone: i.phone || i.number || i.phoneNumber || null,
        status: normalizarStatusFluxo(i.status || i.connectionStatus || i.state || ''),
        nome: i.name || i.label || null,
      }));
  },
  listarBmsEWabas: metaDescobrirBmsEWabas,
  listarNumerosWaba: metaListarNumerosDoWaba,
};

/** Descobre tudo de uma conta. Se a Meta não tiver token, traz só o lado da FluxoAPI. */
export async function descobrirNumerosDaConta(
  credenciais: { apiKey: string | null; apiSecret: string | null; metaToken: string | null },
  fontes: FontesDescoberta = fontesReais
): Promise<{ candidatos: CandidatoNumero[]; avisos: string[] }> {
  const avisos: string[] = [];
  let fluxo: InstanciaFluxo[] = [];
  if (credenciais.apiKey && credenciais.apiSecret) {
    fluxo = await fontes.listarInstanciasFluxo(credenciais.apiKey, credenciais.apiSecret);
  } else {
    avisos.push('Sem chave e segredo da FluxoAPI: não dá para listar as instâncias.');
  }

  const meta: NumeroMeta[] = [];
  if (credenciais.metaToken) {
    const bms = await fontes.listarBmsEWabas(credenciais.metaToken);
    if (!bms.length) avisos.push('O token da Meta não enxerga nenhuma WABA.');
    for (const waba of bms) {
      const numeros = await fontes.listarNumerosWaba(waba.wabaId, credenciais.metaToken);
      for (const n of numeros) {
        meta.push({
          bmId: waba.bmId,
          bmName: waba.bmName,
          wabaId: waba.wabaId,
          metaPhoneNumberId: n.id,
          displayPhoneNumber: n.displayPhoneNumber,
          verifiedName: n.verifiedName,
          qualityRating: n.qualityRating,
          statusMeta: n.status,
        });
      }
    }
  } else {
    avisos.push('Sem token da Meta: os números não vêm com BM. Cadastre o token da conta para ver a BM de cada número.');
  }

  return { candidatos: cruzarNumeros(fluxo, meta), avisos };
}
