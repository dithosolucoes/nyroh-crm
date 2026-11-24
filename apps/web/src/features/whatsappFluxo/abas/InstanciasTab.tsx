import MetaAccountsPanel from '../../../components/MetaAccountsPanel';
import { CheckCircle2, AlertCircle, RefreshCw, ExternalLink, Key, Lock, Terminal, Radio, Copy, Plus } from 'lucide-react';
import type { FluxoVM } from '../useFluxo';

export function InstanciasTab({ f }: { f: FluxoVM }) {
  const { setActiveSubTab, config, inputApiKey, setInputApiKey, inputApiSecret, setInputApiSecret, inputInstanceId, setInputInstanceId, savingConfig, inputMetaAccessToken, setInputMetaAccessToken, inputMetaWabaId, setInputMetaWabaId, inputMetaVerifyToken, setInputMetaVerifyToken, savingMetaConfig, metaSaveSuccess, syncingWithMeta, instances, selectedBmId, setSelectedBmId, instancesError, loadingInstances, connectionResult, templates, setTemplateAccountFilter, fetchBmAccounts, syncWithMetaRealtime, handleSaveMetaConfig, fetchInstances, fetchTemplates, handleSaveConfig, copyToClipboard, onShowToast } = f;
  return (
    <>
        <div className="space-y-6">
          <MetaAccountsPanel
            onShowToast={onShowToast}
            onAccountsChanged={() => { fetchInstances(); fetchTemplates(); fetchBmAccounts(); }}
            numbers={instances}
            selectedId={selectedBmId}
            onSelect={setSelectedBmId}
            onOpenModels={(id) => { setTemplateAccountFilter(id); setActiveSubTab('templates'); }}
          />
          {/* Card de Instâncias Conectadas (visão geral; some quando uma BM está selecionada) */}
          {!selectedBmId && (
          <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-600" />
                  Instâncias Oficiais da Meta Conectadas
                </h3>
                <p className="text-xs text-neutral-500">
                  Gerenciamento de linhas e coexistência com o aplicativo WhatsApp Business do celular.
                </p>
              </div>

              <button
                onClick={fetchInstances}
                disabled={loadingInstances}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingInstances ? 'animate-spin' : ''}`} />
                <span>Atualizar Linhas</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {instancesError && (
                <div className="md:col-span-2 p-4 rounded-xl border-2 border-amber-300 bg-amber-50 space-y-1">
                  <p className="text-xs font-bold text-amber-900">Não foi possível listar os números</p>
                  <p className="text-[11px] text-amber-800">{instancesError.message}</p>
                  {instancesError.action && <p className="text-[11px] text-amber-700">→ {instancesError.action}</p>}
                </div>
              )}

              {!instancesError && !loadingInstances && instances.length === 0 && (
                <div className="md:col-span-2 p-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-[11px] text-neutral-600">
                  Nenhum número encontrado. Confira o token da Meta ou cadastre uma BM acima.
                </div>
              )}

              {instances.map((inst, index) => {
                const connected = inst.status === 'connected';
                const coexistence = inst.coexistence === true;
                const coexistenceUnknown = inst.coexistence === null || inst.coexistence === undefined;
                const quality = String(inst.quality || 'UNKNOWN').toUpperCase();
                const qualityLabel = quality === 'GREEN' ? 'Alta (Verde)' : quality === 'YELLOW' ? 'Atenção (Amarela)' : quality === 'RED' ? 'Baixa (Vermelha)' : 'Desconhecida';
                const qualityColor = quality === 'GREEN' ? 'text-emerald-700' : quality === 'YELLOW' ? 'text-amber-700' : quality === 'RED' ? 'text-red-700' : 'text-neutral-500';
                const statusLabel: Record<string, string> = { connected: 'Conectada', pending: 'Aguardando conexão', disconnected: 'Desconectada', suspended: 'Suspensa', flagged: 'Sinalizada pela Meta', restricted: 'Restrita pela Meta', migrated: 'Migrada', unknown: 'Status não informado' };
                return (
                  <div
                    key={inst.id || index}
                    className={`p-4 rounded-xl border-2 space-y-3 relative overflow-hidden ${connected ? 'border-emerald-200 bg-emerald-50/30' : 'border-red-200 bg-red-50/30'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${connected ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-600 animate-pulse' : 'bg-red-600'}`} />
                          {statusLabel[inst.status] || inst.status || 'Status desconhecido'}
                        </div>
                        <h4 className="text-sm font-black text-neutral-900 mt-1">{inst.name || inst.id}</h4>
                        <p className="text-xs font-mono font-bold text-neutral-700">{inst.phone || 'Número ainda não informado'}</p>
                      </div>

                      <span className="text-[11px] font-mono text-neutral-400 bg-white px-2 py-1 rounded border border-neutral-200">
                        {inst.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-200 text-[11px]">
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Qualidade Meta:</span>
                        <span className={`font-bold flex items-center gap-1 ${qualityColor}`}>
                          <CheckCircle2 className="w-3 h-3" /> {qualityLabel}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Coexistência:</span>
                        <span className={`font-bold ${coexistenceUnknown ? 'text-neutral-600' : coexistence ? 'text-emerald-700' : 'text-red-700'}`}>
                          {coexistenceUnknown ? 'Não verificado (a Meta não informou)' : coexistence ? 'Ativa (celular + CRM)' : 'DESLIGADA (somente API)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-500 block text-[10px]">Limite diário (Meta):</span>
                        <span className="font-bold text-neutral-800">
                          {inst.messagingLimit24h ? `${Number(inst.messagingLimit24h).toLocaleString('pt-BR')} conversas/24h` : '—'}
                        </span>
                      </div>
                    </div>

                    {!coexistence && (
                      <p className="text-[11px] leading-relaxed text-red-800 bg-red-50 border border-red-200 rounded-lg p-2">
                        <b>Por que as mensagens enviadas pelo celular não aparecem no CRM:</b> este número está em modo
                        <b> somente API</b>. A FluxoAPI só envia o evento <code>message.sent_from_phone</code> em instâncias com
                        coexistência. Reconecte o número em modo coexistência pelo painel da FluxoAPI.
                      </p>
                    )}
                    {(quality === 'YELLOW' || quality === 'RED') && (
                      <p className="text-[11px] leading-relaxed text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <b>Atenção:</b> a qualidade do número caiu. A Meta reduz o limite diário e pode desativar o número. Reduza o volume de disparos.
                      </p>
                    )}
                  </div>
                );
              })}
              {/* Box de Instrução para Nova Instância */}
              <div className="p-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 flex flex-col justify-between space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-neutral-500" />
                    Vincular Novo Número ou Instância
                  </h4>
                  <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                    Para adicionar uma 2ª linha (ex: número exclusivo para suporte ou closer individual), cadastre o número no painel oficial da Meta ou FluxoAPI e vincule o ID da nova instância aqui.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <a
                    href="https://fluxoapi.com.br/app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-medium cursor-pointer"
                  >
                    <span>Abrir Wizard de Instâncias</span>
                    <ExternalLink className="w-3 h-3 text-neutral-400" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          )}

          {/* Avançado: recolhido por padrão (configuração inicial e standby da FluxoAPI) */}
          <details className="group rounded-2xl border border-neutral-200 bg-white shadow-2xs">
            <summary className="cursor-pointer select-none list-none flex items-center justify-between px-5 py-4 text-sm font-bold text-neutral-800">
              <span>Avançado: FluxoAPI (standby) e configuração por variáveis</span>
              <span className="text-xs font-normal text-neutral-500 group-open:hidden">Mostrar</span>
              <span className="text-xs font-normal text-neutral-500 hidden group-open:inline">Ocultar</span>
            </summary>
            <div className="p-5 pt-0 space-y-6">
          {/* Grid de Credenciais e Diagnóstico */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Coluna 1: Chaves da API */}
            <div className="lg:col-span-6 bg-white p-5 rounded-2xl border border-neutral-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Credenciais Criptográficas (HMAC-SHA256)
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Chaves da sua conta para autenticar requisições na FluxoAPI
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Chave Pública (FLUXO_KEY):
                  </label>
                  <input
                    type="text"
                    value={inputApiKey}
                    onChange={(e) => setInputApiKey(e.target.value)}
                    placeholder="fxk_live_01J..."
                    className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-neutral-400 block mt-1">
                    Começa com <code className="text-emerald-700 font-bold">fxk_live_</code> ou <code className="text-neutral-600">fxk_test_</code>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Segredo da Chave (FLUXO_SECRET):
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={inputApiSecret}
                      onChange={(e) => setInputApiSecret(e.target.value)}
                      placeholder={config.hasSecret ? '••••••••••••••••••••••••••••••••' : 'fxs_...'}
                      className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-9"
                    />
                    <Lock className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-2.5" />
                  </div>
                  {config.hasSecret ? (
                    <span className="text-[10px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      Segredo protegido e salvo no Banco de Dados. Deixe em branco para manter o atual.
                    </span>
                  ) : (
                    <span className="text-[10px] text-neutral-400 block mt-1">
                      Começa com <code className="text-neutral-600">fxs_</code>. Usado apenas para gerar a assinatura HMAC no servidor.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    ID da Instância Padrão:
                  </label>
                  <input
                    type="text"
                    value={inputInstanceId}
                    onChange={(e) => setInputInstanceId(e.target.value)}
                    placeholder="inst_..."
                    className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{savingConfig ? 'Salvando...' : 'Salvar e Conectar'}</span>
                </button>
              </form>
            </div>

            {/* Coluna 2: Variáveis Railway & Diagnóstico */}
            <div className="lg:col-span-6 space-y-4">
              <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900">
                  <Terminal className="w-4 h-4 text-neutral-600" />
                  <span>Configuração Permanente na Railway</span>
                </div>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Para que suas chaves fiquem salvas para sempre mesmo após deploys ou reinicializações do servidor, adicione essas variáveis no painel da Railway:
                </p>

                <div className="p-3 bg-neutral-900 rounded-xl text-neutral-200 text-xs font-mono space-y-1 relative group">
                  <div className="text-emerald-400">FLUXO_KEY=fxk_live_...</div>
                  <div className="text-emerald-400">FLUXO_SECRET=fxs_...</div>
                  <div className="text-emerald-400">FLUXO_INSTANCE_ID=inst_...</div>

                  <button
                    onClick={() =>
                      copyToClipboard(
                        `FLUXO_KEY=${inputApiKey || 'fxk_live_...'}\nFLUXO_SECRET=${inputApiSecret || 'fxs_...'}\nFLUXO_INSTANCE_ID=${inputInstanceId || 'inst_...'}`,
                        'Variáveis Railway'
                      )
                    }
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copiar</span>
                  </button>
                </div>
              </div>

              {/* Resultado do Teste de Conexão */}
              {connectionResult && (
                <div
                  className={`p-4 rounded-2xl border ${
                    connectionResult.success
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                      : 'bg-red-50/50 border-red-200 text-red-950'
                  } space-y-2 text-xs`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      {connectionResult.success ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Conexão Autenticada com Sucesso
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-600" /> Falha na Conexão
                        </>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {connectionResult.testedAt}
                    </span>
                  </div>

                  {connectionResult.latencyMs && (
                    <div className="text-[11px] text-neutral-600">
                      Latência do servidor: <span className="font-mono font-bold">{connectionResult.latencyMs}ms</span>
                    </div>
                  )}

                  {connectionResult.error && (
                    <div className="text-red-700 font-mono text-[11px] bg-white/80 p-2 rounded-lg border border-red-200">
                      {connectionResult.error.message || JSON.stringify(connectionResult.error)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card Oficial Meta Cloud API (Graph API) */}
          <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-blue-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base">
                  M
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <span>Meta Graph API Oficial (WhatsApp Business Cloud)</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                      Sincronização Direta
                    </span>
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Conecte diretamente ao WhatsApp Cloud da Meta para puxar e sincronizar templates criados no Gerenciador do WhatsApp
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={syncWithMetaRealtime}
                disabled={syncingWithMeta}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingWithMeta ? 'animate-spin' : ''}`} />
                <span>Testar & Puxar Templates</span>
              </button>
            </div>

            <form onSubmit={handleSaveMetaConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Token de Acesso Permanente da Meta (Graph API Access Token):
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={inputMetaAccessToken}
                    onChange={(e) => setInputMetaAccessToken(e.target.value)}
                    placeholder="EAAG... (Token de Sistema com permissões whatsapp_business_messaging e management)"
                    className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none pr-9"
                  />
                  <Lock className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-2.5" />
                </div>
                <span className="text-[10px] text-neutral-400 block mt-1">
                  Gerado em <em>Meta for Developers &gt; Usuários do Sistema</em> com escopo <code>whatsapp_business_management</code>.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  ID da Conta do WhatsApp Business (WABA ID):
                </label>
                <input
                  type="text"
                  value={inputMetaWabaId}
                  onChange={(e) => setInputMetaWabaId(e.target.value)}
                  placeholder="Ex: 104837592817492"
                  className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[10px] text-neutral-400 block mt-1">
                  Encontrado no Gerenciador do WhatsApp &gt; Configurações da Conta WABA.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Token de Verificação do Webhook (hub.verify_token):
                </label>
                <input
                  type="text"
                  value={inputMetaVerifyToken}
                  onChange={(e) => setInputMetaVerifyToken(e.target.value)}
                  placeholder="crm_webhook_meta_token"
                  className="w-full text-xs font-mono px-3 py-2 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[10px] text-neutral-400 block mt-1">
                  O mesmo token inserido na configuração de Webhook do aplicativo da Meta.
                </span>
              </div>

              {metaSaveSuccess && (
                <div className="md:col-span-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{metaSaveSuccess}</span>
                </div>
              )}

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingMetaConfig}
                  className="flex items-center gap-2 py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{savingMetaConfig ? 'Salvando no Banco...' : 'Salvar Credenciais da Meta'}</span>
                </button>
              </div>
            </form>
          </div>
            </div>
          </details>
        </div>
    </>
  );
}
