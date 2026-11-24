/**
 * Testes da fila de envio (item 4.2 a, b, c, d).
 *  a. Comportamento atual da esteira em memória: ordem, intervalo, pausa e cancelamento.
 *  b. Escolha do adaptador pela flag NYROH_FILA_ENVIO.
 *  c. Fila Redis (BullMQ) com atrasos de ritmo, num Redis de teste (REDIS_TEST_URL, padrão 127.0.0.1:6390).
 *  d. Ritmo de 48 msgs/min preservado (teto do plano).
 * Uso: npm run test:fila-envio
 */
import { Queue } from 'bullmq';
import { executarLoteEmMemoria, intervaloEntreEnviosMemoria } from '../shared/lib/filaEnvioMemoria.js';
import { modoFilaEnvio, escolherAdaptadorFila } from '../shared/lib/filaEnvio.js';
import { dispatchRpm, maxDispatchPerSecond, effectiveSpeedPerSecond, delayForIndex } from '../shared/lib/dispatchRate.js';

let falhas = 0;
let ok = 0;
function checar(nome: string, cond: boolean, detalhe?: string) {
  if (cond) { ok++; console.log(`  ✅ ${nome}`); }
  else { falhas++; console.log(`  ❌ ${nome}${detalhe ? ' — ' + detalhe : ''}`); }
}

async function testeA() {
  console.log('\n[a] Esteira em memória (comportamento atual)');
  const ordem: number[] = [];
  const jobs = [0, 1, 2, 3, 4].map(i => ({ batchId: 'L1', n: i }));
  const esperas: number[] = [];
  await executarLoteEmMemoria(jobs, {
    velocidade: 2,
    processar: async (j) => { ordem.push(j.jobIndex); },
    pausado: () => false,
    cancelado: () => false,
    esperar: async (ms) => { esperas.push(ms); },
  });
  checar('processa na ordem 0..4', JSON.stringify(ordem) === '[0,1,2,3,4]', JSON.stringify(ordem));
  checar('intervalo entre envios = 500 ms a 2/s', esperas.length === 4 && esperas.every(m => m === 500), JSON.stringify(esperas));
  checar('sem espera após o último envio', esperas.length === 4);
  checar('piso de 10 ms para velocidades altas', intervaloEntreEnviosMemoria(1000) === 10);

  // Cancelamento: depois do primeiro envio, o lote para.
  const processados: number[] = [];
  let chamadasCancel = 0;
  await executarLoteEmMemoria(jobs, {
    velocidade: 2,
    processar: async (j) => { processados.push(j.jobIndex); },
    pausado: () => false,
    cancelado: () => { chamadasCancel++; return chamadasCancel > 1; },
    esperar: async () => {},
  });
  checar('cancelamento para o lote após o 1º envio', JSON.stringify(processados) === '[0]', JSON.stringify(processados));

  // Pausa: segura enquanto pausado, depois envia.
  let pausas = 2;
  const esperasPausa: number[] = [];
  const enviados: number[] = [];
  await executarLoteEmMemoria([{ batchId: 'L2', n: 0 }], {
    velocidade: 2,
    processar: async (j) => { enviados.push(j.jobIndex); },
    pausado: () => { if (pausas > 0) { pausas--; return true; } return false; },
    cancelado: () => false,
    esperar: async (ms) => { esperasPausa.push(ms); },
  });
  checar('pausa espera 500 ms por checagem e envia depois', esperasPausa.length === 2 && enviados.length === 1, JSON.stringify(esperasPausa));

  // Cancelado antes do envio: nada é enviado (checagem no topo do laço).
  let p0 = 0;
  await executarLoteEmMemoria([{ batchId: 'L3', n: 0 }], {
    velocidade: 2,
    processar: async () => { p0++; },
    pausado: () => false,
    cancelado: () => true,
    esperar: async () => {},
  });
  checar('cancelado antes do envio não envia', p0 === 0);

  // REGISTRO DO COMPORTAMENTO ATUAL (defeito leve, não corrigido nesta etapa):
  // se o lote é cancelado DURANTE a pausa, o envio ainda acontece uma vez.
  const comPausaCancelada: number[] = [];
  let chamadas = 0;
  await executarLoteEmMemoria([{ batchId: 'L4', n: 0 }], {
    velocidade: 2,
    processar: async (j) => { comPausaCancelada.push(j.jobIndex); },
    pausado: () => { chamadas++; return chamadas === 1; },
    cancelado: () => chamadas >= 2,
    esperar: async () => {},
  });
  checar('registro: cancelado durante a pausa ainda envia 1 (comportamento atual)', comPausaCancelada.length === 1);
}

function testeB() {
  console.log('\n[b] Escolha do adaptador (NYROH_FILA_ENVIO)');
  checar('vazio vira auto', modoFilaEnvio(undefined) === 'auto');
  checar('valor desconhecido vira auto', modoFilaEnvio('qualquer') === 'auto');
  checar('"Memoria" (maiúsculas) vira memoria', modoFilaEnvio(' Memoria ') === 'memoria');
  checar('auto + Redis disponível → redis', escolherAdaptadorFila('auto', true) === 'redis');
  checar('auto sem Redis → memória', escolherAdaptadorFila('auto', false) === 'memoria');
  checar('memoria + Redis disponível → memória', escolherAdaptadorFila('memoria', true) === 'memoria');
  checar('redis sem fila criada → memória', escolherAdaptadorFila('redis', false) === 'memoria');
}

function testeD() {
  console.log('\n[d] Ritmo preservado (48 msgs/min)');
  const antigoPlano = process.env.FLUXO_PLAN_RPM;
  const antigoShare = process.env.FLUXO_DISPATCH_SHARE;
  process.env.FLUXO_PLAN_RPM = '60';
  delete process.env.FLUXO_DISPATCH_SHARE;
  checar('teto = 48 msgs/min (60 × 0,8)', dispatchRpm() === 48, String(dispatchRpm()));
  checar('teto por segundo = 0,8', Math.abs(maxDispatchPerSecond() - 0.8) < 1e-9);
  checar('pedido de 10/s é limitado a 0,8/s', Math.abs(effectiveSpeedPerSecond(10) - 0.8) < 1e-9);
  const atrasos = [0, 1, 2, 3].map(i => delayForIndex(i, 0.8));
  checar('atraso entre envios = 1250 ms', JSON.stringify(atrasos) === '[0,1250,2500,3750]', JSON.stringify(atrasos));
  if (antigoPlano === undefined) delete process.env.FLUXO_PLAN_RPM; else process.env.FLUXO_PLAN_RPM = antigoPlano;
  if (antigoShare !== undefined) process.env.FLUXO_DISPATCH_SHARE = antigoShare;
}

async function testeC() {
  console.log('\n[c] Fila Redis (BullMQ) com atrasos de ritmo, Redis de teste');
  const url = process.env.REDIS_TEST_URL || 'redis://127.0.0.1:6390';
  const nomeFila = `teste-fila-envio-${Date.now()}`;
  const fila = new Queue(nomeFila, { connection: { url } as any });
  try {
    await fila.waitUntilReady();
    const jobs = [0, 1, 2, 3].map(i => ({
      name: 'campaign-message-send',
      data: { n: i },
      opts: { delay: delayForIndex(i, 0.8) },
    }));
    await fila.addBulk(jobs);
    const todos = await fila.getJobs(['waiting', 'delayed']);
    checar('4 jobs enfileirados', todos.length === 4, String(todos.length));
    const porIndice = todos.sort((a, b) => a.data.n - b.data.n).map(j => j.opts.delay ?? 0);
    checar('atrasos gravados = 0, 1250, 2500, 3750 (o job 0 vai direto para a espera)', JSON.stringify(porIndice) === '[0,1250,2500,3750]', JSON.stringify(porIndice));
  } catch (e: any) {
    checar('Redis de teste respondeu', false, e?.message || String(e));
  } finally {
    await fila.obliterate({ force: true }).catch(() => {});
    await fila.close().catch(() => {});
  }
}

(async () => {
  await testeA();
  testeB();
  testeD();
  await testeC();
  console.log(`\nfila-envio: ${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
