/**
 * Testa a confirmação automática de descadastro (item 3.2): flag desligada por padrão,
 * texto aprovado exato e envio uma vez só por telefone.
 * Rodar: npm run test:confirmacao-descadastro
 */
import assert from 'node:assert/strict';
import { confirmarDescadastroSeLigada, limparConfirmacoesDescadastro, TEXTO_CONFIRMACAO_DESCADASTRO } from '../shared/lib/descadastroEnvio';

let falhas = 0;
async function test(nome: string, fn: () => Promise<void>) {
  try {
    limparConfirmacoesDescadastro();
    await fn();
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`  FALHA ${nome}\n       ${(e as Error).message}`);
  }
}

const ligada = { NYROH_CONFIRMACAO_DESCADASTRO: 'true' } as NodeJS.ProcessEnv;
const enviosFalsos = () => {
  const envios: Array<{ telefone: string; texto: string }> = [];
  const enviarTexto = async (telefone: string, texto: string) => {
    envios.push({ telefone, texto });
    return true;
  };
  return { envios, enviarTexto };
};

(async () => {
  console.log('Confirmação automática de descadastro');

  await test('com a flag desligada (padrão), nada é enviado', async () => {
    const { envios, enviarTexto } = enviosFalsos();
    const r = await confirmarDescadastroSeLigada({ telefone: '5519999990000', ambiente: {} as NodeJS.ProcessEnv, enviarTexto });
    assert.equal(r, 'desligada');
    assert.equal(envios.length, 0);
  });

  await test('flag com valor fora de "true" não liga', async () => {
    const { envios, enviarTexto } = enviosFalsos();
    const r = await confirmarDescadastroSeLigada({ telefone: '5519999990000', ambiente: { NYROH_CONFIRMACAO_DESCADASTRO: 'sim' } as NodeJS.ProcessEnv, enviarTexto });
    assert.equal(r, 'desligada');
    assert.equal(envios.length, 0);
  });

  await test('texto aprovado pelo Thomas, exato', async () => {
    assert.equal(TEXTO_CONFIRMACAO_DESCADASTRO, 'Pronto, você foi removido da nossa lista e não receberá mais mensagens. Obrigado, tenha um bom dia!');
  });

  await test('com a flag ligada, envia o texto aprovado uma vez só por telefone', async () => {
    const { envios, enviarTexto } = enviosFalsos();
    const r1 = await confirmarDescadastroSeLigada({ telefone: '+55 (19) 99999-0000', ambiente: ligada, enviarTexto });
    const r2 = await confirmarDescadastroSeLigada({ telefone: '5519999990000', ambiente: ligada, enviarTexto });
    assert.equal(r1, 'enviada');
    assert.equal(r2, 'ja_enviada');
    assert.equal(envios.length, 1);
    assert.equal(envios[0].telefone, '5519999990000');
    assert.equal(envios[0].texto, TEXTO_CONFIRMACAO_DESCADASTRO);
  });

  await test('se o envio falhar, libera nova tentativa', async () => {
    let tentativas = 0;
    const enviarTexto = async () => { tentativas++; return tentativas > 1; };
    const r1 = await confirmarDescadastroSeLigada({ telefone: '5519999990000', ambiente: ligada, enviarTexto });
    const r2 = await confirmarDescadastroSeLigada({ telefone: '5519999990000', ambiente: ligada, enviarTexto });
    assert.equal(r1, 'falhou');
    assert.equal(r2, 'enviada');
  });

  await test('erro no envio conta como falha, sem derrubar o processo', async () => {
    const enviarTexto = async () => { throw new Error('rede'); };
    const r = await confirmarDescadastroSeLigada({ telefone: '5519999990000', ambiente: ligada, enviarTexto });
    assert.equal(r, 'falhou');
  });

  await test('telefone vazio não envia', async () => {
    const { envios, enviarTexto } = enviosFalsos();
    const r = await confirmarDescadastroSeLigada({ telefone: '', ambiente: ligada, enviarTexto });
    assert.equal(r, 'falhou');
    assert.equal(envios.length, 0);
  });

  console.log('');
  if (falhas > 0) {
    console.log(`${falhas} teste(s) falharam.`);
    process.exit(1);
  }
  console.log('Todos os testes de confirmação de descadastro passaram.');
})();
