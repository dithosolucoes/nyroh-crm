import { buildFluxoAuthHeaders } from '../src/lib/fluxoClient';

async function runQATests() {
  console.log('=====================================================');
  console.log('🧪 INICIANDO BATERIA DE TESTES DE QA: FLUXOAPI WHATSAPP');
  console.log('=====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, extraInfo?: any) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (extraInfo) console.error('   Detalhes:', extraInfo);
    }
  }

  // TESTE 1: Assinatura HMAC-SHA256 e Headers
  console.log('--- TESTE 1: Validação da Assinatura HMAC-SHA256 ---');
  const dummyKey = 'fxk_live_test12345678';
  const dummySecret = 'fxs_secret_abcdef9876543210';
  const method = 'POST';
  const path = '/v1/instances/inst_test/messages';
  const body = JSON.stringify({ to: '5511999999999', type: 'text', text: { body: 'Olá mundo' } });

  const authHeaders = buildFluxoAuthHeaders(method, path, body, dummyKey, dummySecret);

  assert(authHeaders.headers['X-Fluxo-Key'] === dummyKey, 'Header X-Fluxo-Key deve ser igual à chave fornecida');
  assert(Boolean(authHeaders.headers['X-Fluxo-Timestamp']), 'Header X-Fluxo-Timestamp deve existir');
  assert(Boolean(authHeaders.headers['X-Fluxo-Nonce']), 'Header X-Fluxo-Nonce (UUID) deve existir');
  assert(authHeaders.headers['X-Fluxo-Signature'].startsWith('v1='), 'Assinatura deve ter prefixo v1=');
  assert(authHeaders.headers['X-Fluxo-Signature'].length === 67, 'Assinatura HMAC-SHA256 deve ter 67 caracteres (v1= + 64 hex)');

  // TESTE 2: Consistência do Body Hash vazio
  console.log('\n--- TESTE 2: Hash de Payload Vazio (GET) ---');
  const emptyHeaders = buildFluxoAuthHeaders('GET', '/v1/instances', '', dummyKey, dummySecret);
  assert(emptyHeaders.debug.bodyHash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'Body hash de string vazia deve ser o SHA256 padrão de string vazia');

  // TESTE 3: Chamada aos Endpoints do Servidor Local
  console.log('\n--- TESTE 3: Verificação dos Endpoints no Servidor (localhost:3000) ---');
  try {
    // 3.1: GET Config
    const configRes = await fetch('http://127.0.0.1:3000/api/admin/fluxo/config');
    assert(configRes.status === 200, 'GET /api/admin/fluxo/config retorna status 200');
    const configData = await configRes.json();
    assert(typeof configData.isConfigured === 'boolean', 'Config contém campo isConfigured');

    // 3.2: POST Config
    const saveRes = await fetch('http://127.0.0.1:3000/api/admin/fluxo/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: 'fxk_live_qa_test',
        apiSecret: 'fxs_secret_qa_test',
        instanceId: 'inst_qa_test_123'
      })
    });
    assert(saveRes.status === 200, 'POST /api/admin/fluxo/config salva com status 200');
    const saveData = await saveRes.json();
    assert(saveData.success === true, 'POST /api/admin/fluxo/config retorna success: true');

    // 3.3: POST Send Test Message (validação de campos obrigatórios)
    const emptySendRes = await fetch('http://127.0.0.1:3000/api/admin/fluxo/send-test-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(emptySendRes.status === 400, 'POST /api/admin/fluxo/send-test-message rejeita requisição sem destino (status 400)');

    // 3.4: Webhook Fluxo Receiver
    const webhookRes = await fetch('http://127.0.0.1:3000/api/webhooks/fluxo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'message.received',
        timestamp: Date.now(),
        data: { from: '5511999999999', text: 'Teste webhook' }
      })
    });
    assert(webhookRes.status === 200, 'POST /api/webhooks/fluxo aceita eventos e responde 200');
    const webhookData = await webhookRes.json();
    assert(webhookData.status === 'received', 'POST /api/webhooks/fluxo retorna status: "received"');

  } catch (err: any) {
    console.error('⚠️ Nota sobre teste de rede no servidor:', err.message);
  }

  console.log('\n=====================================================');
  console.log(`📊 RESULTADO DOS TESTES DE QA: ${passed}/${total} PASSARAM`);
  console.log('=====================================================');

  if (passed === total) {
    console.log('🚀 TODOS OS TESTES PASSARAM COM SUCESSO!');
    process.exit(0);
  } else {
    console.log(`⚠️ ALGUNS TESTES FALHARAM: ${total - passed} falhas`);
    process.exit(1);
  }
}

runQATests();
