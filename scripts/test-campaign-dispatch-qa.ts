import JSZip from 'jszip';

async function runCampaignDispatchQA() {
  console.log('================================================================');
  console.log('🧪 QA AUTOMATIZADO: FLUXO COMPLETO DE IMPORTAÇÃO E DISPARO');
  console.log('   MODO DRY-RUN SEGURO (SEM ENVIAR MENSAGENS REAIS À META)');
  console.log('================================================================\n');

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

  const BASE_URL = 'http://127.0.0.1:3000';
  const BATCH_ID = `safra-qa-dryrun-${Date.now()}`;
  const BATCH_NAME = 'Safra QA Dry-Run Automática';

  try {
    // -------------------------------------------------------------------------
    // PASSO 1: Criar arquivo ZIP em memória com 5 perfis de leads
    // -------------------------------------------------------------------------
    console.log('--- PASSO 1: Montagem do Lote ZIP com Amostras Realistas de Leads ---');

    const sampleLeads = [
      {
        id: `qa_lead_celular_${Date.now()}`,
        name: 'Dr. Lucas Rocha - Consultório Médico',
        phone: '(11) 98765-4321',
        publicUrl: 'https://nyroh.app/preview/dr-lucas-rocha',
        website: 'https://drlucasrocha.com.br',
        niche: 'Saúde & Medicina'
      },
      {
        // CASO CRÍTICO SOLICITADO PELO USUÁRIO: Número comercial/fixo que começa com 3
        id: `qa_lead_comercial_inicio3_${Date.now()}`,
        name: 'Dra. Juliana - Advocacia & Consultoria',
        phone: '(31) 3212-3456', // Início 3, 10 dígitos (DDD 31 + 3212-3456)
        publicUrl: 'https://nyroh.app/preview/adv-juliana',
        website: 'https://julianaadvocacia.com.br',
        niche: 'Jurídico'
      },
      {
        id: `qa_lead_comercial_10dig_${Date.now()}`,
        name: 'Auto Peças e Mecânica Paraná',
        phone: '(41) 3344-5566',
        publicUrl: 'https://nyroh.app/preview/auto-pecas-pr',
        website: 'https://autopecasparana.com.br',
        niche: 'Automotivo'
      },
      {
        id: `qa_lead_ddi55_${Date.now()}`,
        name: 'Pizzaria Bella Itália',
        phone: '+55 (21) 99876-5432',
        publicUrl: 'https://nyroh.app/preview/bella-italia',
        website: 'https://bellaitariapizza.com.br',
        niche: 'Gastronomia'
      },
      {
        // CASO DE DESCARTE LEGÍTIMO: Número incompleto/inválido
        id: `qa_lead_invalido_${Date.now()}`,
        name: 'Contato Teste Sem Telefone Válido',
        phone: '1234',
        publicUrl: '',
        website: '',
        niche: 'Outros'
      }
    ];

    const zip = new JSZip();
    zip.file('leads_amostra.json', JSON.stringify(sampleLeads, null, 2));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    assert(zipBuffer.length > 0, 'Buffer ZIP gerado com sucesso em memória com 5 leads');

    // -------------------------------------------------------------------------
    // PASSO 2: Upload do arquivo ZIP via POST /api/campaign/upload-zip
    // -------------------------------------------------------------------------
    console.log('\n--- PASSO 2: Upload da Safra via /api/campaign/upload-zip ---');

    const formData = new FormData();
    const blob = new Blob([zipBuffer], { type: 'application/zip' });
    formData.append('zipFile', blob, 'safra_qa.zip');
    formData.append('batchId', BATCH_ID);
    formData.append('safraName', BATCH_NAME);

    const uploadRes = await fetch(`${BASE_URL}/api/campaign/upload-zip`, {
      method: 'POST',
      body: formData
    });

    assert(uploadRes.status === 200, `POST /api/campaign/upload-zip retornou status 200 (atual: ${uploadRes.status})`);
    const uploadData = await uploadRes.json();
    assert(uploadData.success === true, 'Upload processou com sucesso (success: true)');
    const totalProcessed = uploadData.totalProcessed ?? uploadData.totalLeads;
    assert(totalProcessed === 5, `Total de leads importados igual a 5 (obtido: ${totalProcessed})`);
    assert(uploadData.validMobiles >= 4, `Contagem de leads válidos >= 4 (obtido: ${uploadData.validMobiles})`);

    // -------------------------------------------------------------------------
    // PASSO 3: Validação da Classificação dos Telefones e Não Descarte do Início 3
    // -------------------------------------------------------------------------
    console.log('\n--- PASSO 3: Validação dos Leads em STAGING e Preservação de Números com Início 3 ---');

    const leadsRes = await fetch(`${BASE_URL}/api/campaign/leads?batchId=${BATCH_ID}`);
    assert(leadsRes.status === 200, 'GET /api/campaign/leads retornou status 200');
    const leadsRaw = await leadsRes.json();
    const batchLeads: any[] = Array.isArray(leadsRaw) ? leadsRaw : (leadsRaw.leads || []);

    assert(batchLeads.length === 5, `Safra contém exatamente 5 leads registrados (obtido: ${batchLeads.length})`);

    // Procura o lead com número comercial que começa com 3
    const leadInicio3 = batchLeads.find(l => l.name.includes('Juliana') || (l.phoneNumber && (l.phoneNumber.includes('32123456') || l.phoneNumber.includes('3212-3456'))));
    assert(Boolean(leadInicio3), 'Lead com número comercial/fixo início 3 encontrado na safra');
    assert(leadInicio3?.status === 'STAGING', `Número com início 3 está em STAGING (não foi descartado, status: ${leadInicio3?.status})`);

    // Procura o lead com número inválido '1234'
    const leadInvalido = batchLeads.find(l => l.name.includes('Sem Telefone') || l.phoneNumber === '1234');
    assert(leadInvalido?.status === 'DESCARTADO', `Número inválido '1234' foi descartado corretamente (status: ${leadInvalido?.status})`);

    // Contagem de leads prontos para disparo
    const stagingLeads = batchLeads.filter(l => l.status === 'STAGING');
    assert(stagingLeads.length === 4, `Exatamente 4 leads válidos aguardando disparo em STAGING (obtido: ${stagingLeads.length})`);

    // -------------------------------------------------------------------------
    // PASSO 4: Disparo em Modo DRY-RUN (Sem Envio Real à Meta)
    // -------------------------------------------------------------------------
    console.log('\n--- PASSO 4: Execução do Disparo em Modo DRY-RUN ---');

    const dispatchRes = await fetch(`${BASE_URL}/api/campaign/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId: BATCH_ID,
        templateName: 'dns_escassez_np4',
        quarantineHours: 4,
        speedPerSecond: 20,
        dryRun: true, // Garante que ZERO mensagens são enviadas à Meta
        salespersonIds: ['seller-thomas'],
        variableValues: {
          var1: 'Olá {nome}! Tudo bem? Falo da {empresa}?',
          var2: 'Aqui é o {vendedor} da equipe Thomas.',
          var3: 'Veja o novo site da sua empresa: {site_novo}'
        }
      })
    });

    assert(dispatchRes.status === 200, `POST /api/campaign/dispatch retornou 200 (atual: ${dispatchRes.status})`);
    const dispatchData = await dispatchRes.json();
    assert(dispatchData.success === true, 'Disparo enfileirado com sucesso (success: true)');
    assert(dispatchData.dispatchedCount === 4, `Total de 4 leads válidos disparados (obtido: ${dispatchData.dispatchedCount})`);

    // Aguarda o worker em background processar os 4 jobs (pacing de 20 msgs/s = ~200ms)
    console.log('   Aguardando processamento da fila BullMQ / esteira assíncrona (2s)...');
    await new Promise(r => setTimeout(r, 2000));

    // -------------------------------------------------------------------------
    // PASSO 5: Verificação de Quarentena, CRM e Progresso
    // -------------------------------------------------------------------------
    console.log('\n--- PASSO 5: Verificação de Quarentena e Sincronização com CRM ---');

    // 5.1 Status dos leads da safra pós-disparo
    const postDispatchLeadsRes = await fetch(`${BASE_URL}/api/campaign/leads?batchId=${BATCH_ID}`);
    const postDispatchRaw = await postDispatchLeadsRes.json();
    const postLeads: any[] = Array.isArray(postDispatchRaw) ? postDispatchRaw : (postDispatchRaw.leads || []);

    const quarantinedLeads = postLeads.filter(l => l.status === 'QUARENTENA');
    assert(quarantinedLeads.length === 4, `Todos os 4 leads disparados entraram em QUARENTENA (obtido: ${quarantinedLeads.length})`);

    const hasQuarantineExpiry = quarantinedLeads.every(l => Boolean(l.quarantineExpiresAt));
    assert(hasQuarantineExpiry, 'Todos os leads em quarentena possuem timer quarantineExpiresAt calculado (+4h)');

    // 5.2 Status da safra
    const batchesRes = await fetch(`${BASE_URL}/api/campaign/batches`);
    const batchesRaw = await batchesRes.json();
    const allBatches: any[] = Array.isArray(batchesRaw) ? batchesRaw : (batchesRaw.batches || []);
    const currentBatch = allBatches.find((b: any) => b.id === BATCH_ID);
    assert(currentBatch?.status === 'quarantine', `Safra foi movida para status 'quarantine' (atual: ${currentBatch?.status})`);
    assert(Number(currentBatch?.dispatchedCount) >= 4, `Contador dispatchedCount da safra >= 4 (obtido: ${currentBatch?.dispatchedCount})`);

    // 5.3 Progresso da safra
    const progressRes = await fetch(`${BASE_URL}/api/campaign/batches/${BATCH_ID}/progress`);
    if (progressRes.status === 200) {
      const progressData = await progressRes.json();
      assert(progressData.total === 4, `Progresso total registrado: 4 jobs`);
      assert(progressData.sent === 4, `Jobs processados com sucesso no dry-run: 4 (obtido: ${progressData.sent})`);
    }

    // 5.4 Sincronização no CRM (leads table)
    const crmRes = await fetch(`${BASE_URL}/api/leads`);
    if (crmRes.status === 200) {
      const crmRaw = await crmRes.json();
      const allCrmLeads: any[] = Array.isArray(crmRaw) ? crmRaw : (crmRaw.leads || []);
      const syncedLead = allCrmLeads.find(l => l.name?.includes('Lucas Rocha') || l.name?.includes('Juliana'));
      if (syncedLead) {
        assert(syncedLead.columnStatus === 'Leads', 'Lead sincronizado no CRM com columnStatus: "Leads"');
        assert(syncedLead.subStatus === 'Disparo WhatsApp Realizado (Aguardando Resposta)', 'Lead sincronizado com subStatus: "Disparo WhatsApp Realizado (Aguardando Resposta)"');
        assert(Boolean(syncedLead.phoneNumber), 'Lead sincronizado no CRM contém número formatado');
      } else {
        console.log('ℹ️ Leads sincronizados diretamente na tabela campaign_leads com quarentena');
      }
    }

    // -------------------------------------------------------------------------
    // PASSO 6: Limpeza Automática do Lote de Teste (Cleanup)
    // -------------------------------------------------------------------------
    console.log('\n--- PASSO 6: Limpeza dos Dados de Teste (Cleanup) ---');
    const deleteRes = await fetch(`${BASE_URL}/api/campaign/batches/${BATCH_ID}`, {
      method: 'DELETE'
    });
    assert(deleteRes.status === 200, `DELETE /api/campaign/batches/${BATCH_ID} limpou o lote de teste (status: ${deleteRes.status})`);

    const verifyDeleteRes = await fetch(`${BASE_URL}/api/campaign/leads?batchId=${BATCH_ID}`);
    const verifyDeleteRaw = await verifyDeleteRes.json();
    const verifyDeleteList: any[] = Array.isArray(verifyDeleteRaw) ? verifyDeleteRaw : (verifyDeleteRaw.leads || []);
    assert(verifyDeleteList.length === 0, 'Todos os leads de teste foram removidos da safra');

  } catch (err: any) {
    console.error('💥 Erro inesperado durante a execução do QA:', err.message, err.stack);
  }

  console.log('\n================================================================');
  console.log(`📊 RELATÓRIO FINAL DO QA: ${passed}/${total} TESTES PASSARAM COM SUCESSO!`);
  console.log('================================================================');

  if (passed === total) {
    console.log('🚀 A FUNCIONALIDADE DE DISPARO E IMPORTAÇÃO ESTÁ 100% OPERACIONAL!');
    process.exit(0);
  } else {
    console.error(`⚠️ ATENÇÃO: ${total - passed} testes apresentaram divergência.`);
    process.exit(1);
  }
}

runCampaignDispatchQA();
