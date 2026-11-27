import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

/**
 * Contas da FluxoAPI. Uma conta tem vários números. Cada número tem o seu segredo de webhook,
 * a sua saúde, o seu log de eventos e a sua marca (que pode ficar pendente). Tudo vem do banco: nada depende de F5.
 * Segredos são enviados uma vez e nunca voltam para a tela.
 */

interface NumeroVinculado {
  id: string;
  instanceId: string | null;
  metaPhoneNumberId: string | null;
  numero: string | null;
  wabaId: string | null;
  bmId: string | null;
  marcaId: string | null;
  ignorado: boolean;
  ultimoEventoEm: string | null;
  temSegredoWebhook: boolean;
  statusFluxo: string | null;
  modoFluxo: string | null;
  qualidade: string | null;
  limite24h: number | null;
  diasAcesso: number | null;
  saudeAtualizadaEm: string | null;
}

interface ContaListada {
  id: string;
  nome: string;
  bmId: string | null;
  temApiKey: boolean;
  temApiSecret: boolean;
  temWebhookSecret: boolean;
  temMetaToken: boolean;
  numeros: NumeroVinculado[];
}

interface EventoRecebido {
  eventId: string | null;
  instanceId: string | null;
  tipo: string;
  resumo: string | null;
  recebidoEm: string;
}

interface TesteConexao {
  ok: boolean;
  mensagem: string;
}

interface Props {
  onShowToast: (msg: string) => void;
}

const FORM_VAZIO = { id: '', nome: '', bmId: '', apiKey: '', apiSecret: '', webhookSecret: '', metaToken: '' };
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const QUALIDADE_TEXTO: Record<string, string> = {
  green: 'qualidade verde',
  yellow: 'qualidade amarela',
  red: 'qualidade vermelha',
  unknown: 'qualidade desconhecida',
};

async function lerJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function enderecoWebhook(): string {
  return `${window.location.origin}/api/webhooks/fluxo`;
}

function dataCurta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : 'nenhum ainda';
}

function Pill({ ok, texto, neutro }: { ok: boolean; texto: string; neutro?: boolean }) {
  const cor = neutro ? 'bg-neutral-100 text-neutral-700' : ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cor}`}>{texto}</span>;
}

/** Avisos que o operador precisa ver sem procurar. */
function alertasDaConta(conta: ContaListada): string[] {
  const avisos: string[] = [];
  if (!conta.temApiKey || !conta.temApiSecret) avisos.push('Falta a chave ou o segredo da FluxoAPI nesta conta.');
  for (const n of conta.numeros) {
    const nome = n.numero || n.instanceId || 'Número';
    if (n.instanceId && !n.temSegredoWebhook) avisos.push(`${nome}: sem segredo do webhook. Os eventos desse número serão recusados.`);
    if (n.qualidade === 'yellow' || n.qualidade === 'red') {
      avisos.push(`${nome}: qualidade ${n.qualidade === 'red' ? 'VERMELHA' : 'AMARELA'}. A Meta pode reduzir o limite diário ou desativar o número.`);
    }
    if (typeof n.diasAcesso === 'number' && n.diasAcesso <= 7) {
      avisos.push(`${nome}: o acesso vence em ${n.diasAcesso} dia(s). Reconecte pelo painel da FluxoAPI.`);
    }
    if (n.temSegredoWebhook && (!n.ultimoEventoEm || Date.now() - new Date(n.ultimoEventoEm).getTime() > UM_DIA_MS)) {
      avisos.push(`${nome}: nenhum evento recebido nas últimas 24 horas. Confira o endereço do webhook na FluxoAPI.`);
    }
  }
  return avisos;
}

export const ContasFluxo: React.FC<Props> = ({ onShowToast }) => {
  const [contas, setContas] = useState<ContaListada[]>([]);
  const [marcas, setMarcas] = useState<Array<{ id: string; name: string }>>([]);
  const [indisponivel, setIndisponivel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [testes, setTestes] = useState<Record<string, TesteConexao>>({});
  const [testando, setTestando] = useState<string | null>(null);
  const [buscando, setBuscando] = useState<string | null>(null);
  const [avisosDescoberta, setAvisosDescoberta] = useState<Record<string, string[]>>({});
  const [segredosNumero, setSegredosNumero] = useState<Record<string, string>>({});
  const [eventosAbertos, setEventosAbertos] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Record<string, EventoRecebido[]>>({});

  const carregar = async () => {
    try {
      const res = await apiFetch('/api/admin/fluxo/contas');
      if (res.status === 404) {
        setIndisponivel(true);
        return;
      }
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar as contas.');
      setContas(data.contas || []);
      setIndisponivel(false);
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar as contas.');
    }
  };

  useEffect(() => {
    carregar();
    apiFetch('/api/brands')
      .then(r => lerJson(r))
      .then(d => setMarcas(Array.isArray(d) ? d : []))
      .catch(() => setMarcas([]));
  }, []);

  const copiarEndereco = async () => {
    try {
      await navigator.clipboard.writeText(enderecoWebhook());
      onShowToast('Endereço copiado.');
    } catch {
      onShowToast('Não consegui copiar. Selecione o endereço e copie manualmente.');
    }
  };

  const salvarConta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await apiFetch('/api/admin/fluxo/contas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id || undefined,
          nome: form.nome,
          bmId: form.bmId || null,
          apiKey: form.apiKey || undefined,
          apiSecret: form.apiSecret || undefined,
          webhookSecret: form.webhookSecret || undefined,
          metaToken: form.metaToken || undefined,
        }),
      });
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível salvar a conta.');
      const editando = Boolean(form.id);
      setForm(FORM_VAZIO); // limpa os segredos da tela logo após enviar
      onShowToast(editando ? 'Conta atualizada.' : 'Conta salva.');
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar a conta.');
    } finally {
      setSalvando(false);
    }
  };

  // Edição: preenche o formulário. Campos de segredo ficam vazios: em branco, o servidor mantém o que já está salvo.
  const editarConta = (conta: ContaListada) => {
    setForm({ ...FORM_VAZIO, id: conta.id, nome: conta.nome, bmId: conta.bmId || '' });
    setErro(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const testarConexao = async (conta: ContaListada) => {
    setTestando(conta.id);
    setErro(null);
    try {
      const res = await apiFetch(`/api/admin/fluxo/contas/${encodeURIComponent(conta.id)}/testar`, { method: 'POST' });
      const data = await lerJson(res);
      if (!res.ok || !data.ok) {
        setTestes(prev => ({ ...prev, [conta.id]: { ok: false, mensagem: data.error || 'A FluxoAPI recusou a conexão.' } }));
        return;
      }
      const total = (data.instancias || []).length;
      setTestes(prev => ({ ...prev, [conta.id]: { ok: true, mensagem: `Conectado. ${total} número(s) na FluxoAPI.` } }));
      await carregar();
    } catch (e: any) {
      setTestes(prev => ({ ...prev, [conta.id]: { ok: false, mensagem: e?.message || 'Erro ao testar a conexão.' } }));
    } finally {
      setTestando(null);
    }
  };

  /** Busca os números na FluxoAPI e na Meta, guarda todos e atualiza a lista. Nenhuma escolha é obrigatória. */
  const buscarNumeros = async (conta: ContaListada) => {
    setBuscando(conta.id);
    setErro(null);
    try {
      const res = await apiFetch(`/api/admin/fluxo/contas/${encodeURIComponent(conta.id)}/descobrir`, { method: 'POST' });
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível buscar os números.');
      setAvisosDescoberta(prev => ({ ...prev, [conta.id]: data.avisos || [] }));
      onShowToast(`${data.guardados ?? (data.candidatos || []).length} número(s) encontrado(s).`);
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao buscar os números.');
    } finally {
      setBuscando(null);
    }
  };

  /** Troca a marca de um número. Grava na hora. "Pendente" é válido: não exige marca para salvar nada. */
  const mudarMarcaNumero = async (conta: ContaListada, n: NumeroVinculado, valor: string) => {
    const vinculo = {
      instanceId: n.instanceId,
      metaPhoneNumberId: n.metaPhoneNumberId,
      numero: n.numero,
      wabaId: n.wabaId,
      bmId: n.bmId,
      marcaId: valor && valor !== '__ignorar' ? valor : null,
      ignorado: valor === '__ignorar',
    };
    try {
      const res = await apiFetch(`/api/admin/fluxo/contas/${encodeURIComponent(conta.id)}/vincular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vinculos: [vinculo] }),
      });
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível trocar a marca.');
      onShowToast('Marca atualizada.');
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao trocar a marca.');
    }
  };

  /** Segredo de webhook de UM número. O valor é enviado uma vez e some da tela depois. */
  const salvarSegredoNumero = async (conta: ContaListada, instanceId: string) => {
    const segredo = (segredosNumero[instanceId] || '').trim();
    if (!segredo) {
      setErro('Cole o segredo do webhook deste número (começa com whsec_).');
      return;
    }
    try {
      const res = await apiFetch(`/api/admin/fluxo/instancias/${encodeURIComponent(instanceId)}/segredo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId: conta.id, segredo }),
      });
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível salvar o segredo.');
      setSegredosNumero(prev => {
        const n = { ...prev };
        delete n[instanceId];
        return n;
      });
      onShowToast('Segredo do webhook salvo.');
      await carregar();
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar o segredo.');
    }
  };

  const alternarEventos = async (instanceId: string) => {
    if (eventosAbertos === instanceId) {
      setEventosAbertos(null);
      return;
    }
    setEventosAbertos(instanceId);
    try {
      const res = await apiFetch(`/api/admin/fluxo/instancias/${encodeURIComponent(instanceId)}/eventos`);
      const data = await lerJson(res);
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar os eventos.');
      setEventos(prev => ({ ...prev, [instanceId]: data.eventos || [] }));
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar os eventos.');
    }
  };

  if (indisponivel) {
    return (
      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
        Contas da FluxoAPI estão desligadas neste servidor. Ative <strong>NYROH_FLUXO_CONTAS</strong> e reinicie o serviço.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {erro && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{erro}</div>}

      {/* Endereço do webhook: colado no painel da FluxoAPI, em cada número */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold text-neutral-900">Endereço do webhook</h3>
        <p className="text-[11px] text-neutral-500">
          Cole este endereço no campo "Webhook de eventos" de cada número no painel da FluxoAPI.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 break-all">{enderecoWebhook()}</code>
          <button onClick={copiarEndereco} className="px-3 py-2 rounded-lg border border-neutral-300 text-xs font-bold hover:bg-neutral-50">Copiar</button>
        </div>
      </div>

      {/* Cadastro e edição de conta */}
      <form onSubmit={salvarConta} className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-neutral-900">{form.id ? 'Editar conta da FluxoAPI' : 'Nova conta da FluxoAPI'}</h3>
          <p className="text-[11px] text-neutral-500">
            {form.id
              ? 'Para trocar um segredo, preencha só esse campo. Campo em branco mantém o que já está salvo.'
              : 'Os segredos são guardados cifrados. Depois de salvar, a tela só mostra se estão configurados.'}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" placeholder="Nome (ex.: Conta Nyroh)" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" placeholder="BM (opcional)" value={form.bmId} onChange={e => setForm({ ...form, bmId: e.target.value })} />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" type="password" autoComplete="new-password" placeholder="Chave da FluxoAPI (fxk_live_…)" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" type="password" autoComplete="new-password" placeholder="Segredo da FluxoAPI (fxs_…)" value={form.apiSecret} onChange={e => setForm({ ...form, apiSecret: e.target.value })} />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" type="password" autoComplete="new-password" placeholder="Segredo do webhook (whsec_…) do primeiro número" value={form.webhookSecret} onChange={e => setForm({ ...form, webhookSecret: e.target.value })} />
          <input className="text-xs border border-neutral-300 rounded-lg px-3 py-2" type="password" autoComplete="new-password" placeholder="Token da Meta (opcional, para ver a BM)" value={form.metaToken} onChange={e => setForm({ ...form, metaToken: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={salvando} className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-bold disabled:opacity-50">
            {salvando ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Salvar conta'}
          </button>
          {form.id && (
            <button type="button" onClick={() => setForm(FORM_VAZIO)} className="px-4 py-2 rounded-lg border border-neutral-300 text-xs font-bold">
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {/* Contas */}
      {contas.map(conta => {
        const alertas = alertasDaConta(conta);
        const teste = testes[conta.id];
        const avisos = avisosDescoberta[conta.id] || [];
        return (
          <div key={conta.id} className="bg-white border border-neutral-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">{conta.nome}</h3>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Pill ok={conta.temApiKey} texto={`chave ${conta.temApiKey ? 'ok' : 'falta'}`} />
                  <Pill ok={conta.temApiSecret} texto={`segredo ${conta.temApiSecret ? 'ok' : 'falta'}`} />
                  <Pill ok={conta.temMetaToken} texto={`token Meta ${conta.temMetaToken ? 'ok' : 'opcional'}`} neutro={!conta.temMetaToken} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => editarConta(conta)} className="px-3 py-2 rounded-lg border border-neutral-300 text-xs font-bold hover:bg-neutral-50">Editar</button>
                <button onClick={() => testarConexao(conta)} disabled={testando === conta.id} className="px-3 py-2 rounded-lg border border-neutral-300 text-xs font-bold hover:bg-neutral-50 disabled:opacity-50">
                  {testando === conta.id ? 'Testando…' : 'Testar conexão'}
                </button>
                <button onClick={() => buscarNumeros(conta)} disabled={buscando === conta.id} className="px-3 py-2 rounded-lg bg-neutral-900 text-white text-xs font-bold disabled:opacity-50">
                  {buscando === conta.id ? 'Buscando…' : 'Buscar números'}
                </button>
              </div>
            </div>

            {teste && (
              <p className={`text-xs px-3 py-2 rounded-lg ${teste.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{teste.mensagem}</p>
            )}

            {[...avisos, ...alertas].length > 0 && (
              <div className="space-y-1">
                {[...avisos, ...alertas].map((a, i) => (
                  <p key={i} className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">{a}</p>
                ))}
              </div>
            )}

            {conta.numeros.length === 0 && (
              <p className="text-xs text-neutral-500 border border-dashed border-neutral-300 rounded-lg p-4 text-center">
                Nenhum número ainda. Clique em "Buscar números" para trazer os números da FluxoAPI.
              </p>
            )}

            {/* Cartões de número */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {conta.numeros.map(n => {
                const valorMarca = n.ignorado ? '__ignorar' : n.marcaId || '';
                return (
                  <div key={n.id} className="border border-neutral-200 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-sm font-bold">{n.numero || n.instanceId || n.metaPhoneNumberId}</div>
                        <div className="text-[11px] text-neutral-500">{n.instanceId ? `ID ${n.instanceId}` : 'Só na Meta (sem instância na FluxoAPI)'}</div>
                      </div>
                      <select
                        className="text-xs border border-neutral-300 rounded-lg px-2 py-1.5"
                        value={valorMarca}
                        onChange={e => mudarMarcaNumero(conta, n, e.target.value)}
                        aria-label={`Marca do número ${n.numero || ''}`}
                      >
                        <option value="">Marca pendente</option>
                        {marcas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        <option value="__ignorar">Não usar</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Pill ok={n.statusFluxo === 'connected'} texto={`status ${n.statusFluxo || 'desconhecido'}`} />
                      <Pill ok neutro texto={n.modoFluxo === 'coexistence' ? 'coexistência' : n.modoFluxo || 'modo desconhecido'} />
                      <Pill ok={n.qualidade === 'green'} texto={QUALIDADE_TEXTO[n.qualidade || 'unknown'] || 'qualidade desconhecida'} />
                      {typeof n.limite24h === 'number' && <Pill ok neutro texto={`limite ${n.limite24h}/24 h`} />}
                      {typeof n.diasAcesso === 'number' && <Pill ok={n.diasAcesso > 7} texto={`acesso: ${n.diasAcesso} dia(s)`} />}
                      {n.instanceId && <Pill ok={n.temSegredoWebhook} texto={`webhook ${n.temSegredoWebhook ? 'ok' : 'falta'}`} />}
                    </div>

                    <div className="text-[11px] text-neutral-500">Último evento: {dataCurta(n.ultimoEventoEm)}</div>

                    {n.instanceId && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="text-xs border border-neutral-300 rounded-lg px-3 py-1.5 flex-1 min-w-[200px]"
                          type="password"
                          autoComplete="new-password"
                          placeholder={n.temSegredoWebhook ? 'Trocar o segredo do webhook (whsec_…)' : 'Segredo do webhook deste número (whsec_…)'}
                          value={segredosNumero[n.instanceId] || ''}
                          onChange={e => setSegredosNumero(prev => ({ ...prev, [n.instanceId!]: e.target.value }))}
                        />
                        <button onClick={() => salvarSegredoNumero(conta, n.instanceId!)} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-bold">Salvar segredo</button>
                        <button onClick={() => alternarEventos(n.instanceId!)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs font-bold hover:bg-neutral-50">
                          {eventosAbertos === n.instanceId ? 'Fechar eventos' : 'Ver eventos'}
                        </button>
                      </div>
                    )}

                    {eventosAbertos === n.instanceId && n.instanceId && (
                      <div className="border-t border-neutral-100 pt-2">
                        {(eventos[n.instanceId] || []).length === 0 && <p className="text-xs text-neutral-500">Nenhum evento registrado para este número.</p>}
                        <ul className="space-y-1">
                          {(eventos[n.instanceId] || []).map((ev, i) => (
                            <li key={(ev.eventId || '') + i} className="text-[11px] text-neutral-700 flex flex-wrap gap-2">
                              <span className="text-neutral-400">{dataCurta(ev.recebidoEm)}</span>
                              <span className="font-mono">{ev.tipo}</span>
                              {ev.resumo && <span>{ev.resumo}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!contas.length && <p className="text-xs text-neutral-500">Nenhuma conta cadastrada ainda.</p>}
    </div>
  );
};
