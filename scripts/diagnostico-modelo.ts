/**
 * Diagnóstico de modelo na FluxoAPI (somente leitura).
 * Uso no Railway (Shell do serviço nyroh-crm):
 *   npx tsx scripts/diagnostico-modelo.ts dns_escassez_np4__portuguese_br
 * Não mostra chaves. Só imprime o que a FluxoAPI devolve para o modelo.
 */
import { executeFluxoRequest, fluxoInstancePath } from '../src/lib/fluxoClient';

const name = process.argv[2] || 'dns_escassez_np4__portuguese_br';
const language = process.argv[3] || 'pt_BR';

async function main() {
  console.log(`\n== Modelo: ${name} (${language}) ==`);
  console.log(`FLUXO_KEY: ${process.env.FLUXO_KEY ? 'definida' : 'AUSENTE'} | FLUXO_SECRET: ${process.env.FLUXO_SECRET ? 'definida' : 'AUSENTE'} | FLUXO_INSTANCE_ID: ${process.env.FLUXO_INSTANCE_ID ? 'definida' : 'AUSENTE'}`);

  const r = await executeFluxoRequest<any>({
    method: 'GET',
    path: fluxoInstancePath(`/templates?name=${encodeURIComponent(name)}&language=${encodeURIComponent(language)}`),
  });
  console.log(`\nResposta HTTP: ${r.status} | sucesso: ${r.success}`);
  if (!r.success) {
    console.log('Erro:', JSON.stringify(r.error || r.data, null, 2));
  }

  const lista: any[] = Array.isArray(r.data) ? r.data : (r.data?.templates || r.data?.data || (r.data?.name ? [r.data] : []));
  if (lista.length === 0) {
    console.log('\nRESULTADO: a FluxoAPI NÃO tem esse modelo. Clique em "Atualizar Meta" no montador e rode de novo.');
    return;
  }
  for (const t of lista) {
    console.log(`\nNome: ${t.name} | status: ${t.status} | categoria: ${t.category || '—'} | idioma: ${t.language || '—'}`);
    console.log(`Enviável: ${t.sendable === undefined ? '—' : t.sendable} | bloqueio: ${t.blockedReason || t.blocked_reason || 'nenhum'}`);
    const body = (t.components || []).find((c: any) => c.type === 'BODY');
    console.log(`Corpo: ${body?.text || '—'}`);
    const buttons = (t.components || []).find((c: any) => c.type === 'BUTTONS');
    console.log(`Botões: ${JSON.stringify(buttons?.buttons || t.buttons || [])}`);
  }
  const aprovado = lista.some(t => String(t.status).toUpperCase() === 'APPROVED');
  console.log(`\nRESULTADO: ${aprovado ? 'modelo APROVADO na FluxoAPI. Se o teste mesmo assim falhou, o erro está no envio (me mande esta saída).' : 'modelo NÃO está APPROVED na FluxoAPI. Esse é o motivo do teste não sair.'}`);
}

main().catch(err => {
  console.error('Falha no diagnóstico:', err?.message || err);
  process.exit(1);
});
