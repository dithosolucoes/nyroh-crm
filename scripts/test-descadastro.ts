/**
 * Testa o descadastro (O2): palavras fixas, automação padrão e validação.
 * Rodar: npm run test:descadastro
 */
import assert from 'node:assert/strict';
import { pedidoDePararPelasRegras } from '../shared/lib/automacoesExecucao';
import { AUTOMACAO_PARAR_PADRAO, PALAVRAS_PARAR_FIXAS, ehCliqueDescadastro, idsDescadastroBotao, optOutPorBotaoDoWebhook } from '../shared/lib/descadastroPadrao';
import { validarAutomacao } from '../shared/lib/automacoes';

let falhas = 0;
function test(nome: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHA ${nome}\n       ${(e as Error).message}`);
  }
}

const automacaoAtiva = { id: 'parar_padrao', status: 'ativa', def: AUTOMACAO_PARAR_PADRAO } as any;

console.log('\nPalavras fixas (valem sem nenhuma automação)');

test('"PARAR" descadastra mesmo sem automação cadastrada', () => {
  assert.equal(pedidoDePararPelasRegras('PARAR', []), true);
});

test('"não quero mais" descadastra sem automação', () => {
  assert.equal(pedidoDePararPelasRegras('não quero mais', []), true);
});

test('palavra fixa precisa ser palavra inteira ("removeram" não conta)', () => {
  assert.equal(pedidoDePararPelasRegras('eles removeram o anúncio', []), false);
});

test('resposta comum não descadastra', () => {
  assert.equal(pedidoDePararPelasRegras('quanto custa?', []), false);
});

test('a lista fixa tem as palavras essenciais', () => {
  for (const p of ['parar', 'pare', 'sair', 'cancelar', 'stop']) {
    assert.ok(PALAVRAS_PARAR_FIXAS.includes(p), `faltando: ${p}`);
  }
});

console.log('\nAutomação padrão "Parar mensagens"');

test('a automação padrão é válida (sem erros de validação)', () => {
  const r = validarAutomacao(AUTOMACAO_PARAR_PADRAO, [], 'parar_padrao');
  assert.deepEqual(r.erros, []);
});

test('a automação padrão usa a ação de opt-out', () => {
  assert.equal(AUTOMACAO_PARAR_PADRAO.passos[0].acao, 'marcar_optout');
});

test('palavra extra cadastrada na automação também descadastra', () => {
  const extra = { ...automacaoAtiva, def: { ...AUTOMACAO_PARAR_PADRAO, gatilho: { ...AUTOMACAO_PARAR_PADRAO.gatilho, filtro: { texto_lista: ['chega'] } } } };
  assert.equal(pedidoDePararPelasRegras('chega', [extra]), true);
});

test('automação desativada não traz palavras extras', () => {
  const desligada = { ...automacaoAtiva, status: 'pausada', def: { ...AUTOMACAO_PARAR_PADRAO, gatilho: { ...AUTOMACAO_PARAR_PADRAO.gatilho, filtro: { texto_lista: ['chega'] } } } };
  assert.equal(pedidoDePararPelasRegras('chega', [desligada]), false);
});

test('apagar a automação não tira as palavras fixas', () => {
  assert.equal(pedidoDePararPelasRegras('PARAR', []), true);
});

test('clique de descadastro é reconhecido pelo reply.id configurado', () => {
  assert.equal(ehCliqueDescadastro({ kind: 'list_reply', id: 'parar_1', title: 'Parar Mensagens' }, ['parar_1']), true);
});

test('clique sem id configurado não conta, mesmo com o texto do botão', () => {
  assert.equal(ehCliqueDescadastro({ kind: 'list_reply', title: 'Parar Mensagens' }, ['parar_1']), false);
  assert.equal(ehCliqueDescadastro({ kind: 'list_reply', id: 'outro', title: 'Parar Mensagens' }, ['parar_1']), false);
  assert.equal(ehCliqueDescadastro({ kind: 'list_reply', id: 'parar_1' }, []), false);
});

test('reply ausente ou id vazio não conta', () => {
  assert.equal(ehCliqueDescadastro(undefined, ['parar_1']), false);
  assert.equal(ehCliqueDescadastro(null, ['parar_1']), false);
  assert.equal(ehCliqueDescadastro({ id: '  ' }, ['  ']), false);
});

test('ids de botão vêm de lista separada por vírgula, vazia por padrão', () => {
  assert.deepEqual(idsDescadastroBotao(undefined), []);
  assert.deepEqual(idsDescadastroBotao(''), []);
  assert.deepEqual(idsDescadastroBotao(' parar_1 , parar_2 ,, '), ['parar_1', 'parar_2']);
});

test('regra do webhook: com a flag desligada, não decide (undefined) e segue a regra antiga', () => {
  assert.equal(optOutPorBotaoDoWebhook('interactive', { id: 'parar_1' }, { NYROH_DESCADASTRO_BOTAO_IDS: 'parar_1' } as any), undefined);
});

test('regra do webhook: flag ligada, clique com id configurado é descadastro; id desconhecido não é', () => {
  const amb = { NYROH_DESCADASTRO_POR_BOTAO: 'true', NYROH_DESCADASTRO_BOTAO_IDS: 'parar_1' } as any;
  assert.equal(optOutPorBotaoDoWebhook('interactive', { id: 'parar_1' }, amb), true);
  assert.equal(optOutPorBotaoDoWebhook('button', { id: 'outro', title: 'Parar Mensagens' }, amb), false);
});

test('regra do webhook: flag ligada, mensagem que não é clique não decide', () => {
  const amb = { NYROH_DESCADASTRO_POR_BOTAO: 'true', NYROH_DESCADASTRO_BOTAO_IDS: 'parar_1' } as any;
  assert.equal(optOutPorBotaoDoWebhook('text', { id: 'parar_1' }, amb), undefined);
});

console.log('');
if (falhas > 0) {
  console.log(`${falhas} teste(s) falharam.`);
  process.exit(1);
}
console.log('Todos os testes de descadastro passaram.');
