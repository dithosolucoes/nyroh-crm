import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import {
  ACOES,
  AMOSTRA,
  EVENTOS,
  LIMITE_TEXTO,
  conversaSimulada,
  fallbackDe,
  logicaEmPalavras,
  renderPrevia,
  validarAutomacao,
  type Automacao,
  type AcaoV,
  type EventoV,
} from '../lib/automacoes';
import { TOKEN_NAMES } from '../lib/leadTokens';

type Status = 'ativa' | 'inativa' | 'rascunho';
type Regra = { id: string; status: Status; def: Automacao };
type Visao = 'json' | 'conversa' | 'lado' | 'editar';
type Aba = 'regras' | 'execucoes' | 'fila' | 'revisao' | 'config';

const SEED: Regra[] = [
  {
    id: 'r1',
    status: 'ativa',
    def: {
      nome: 'Clicou em Acessar Link',
      gatilho: { evento: 'cliente_clicou', filtro: { texto_igual: 'Acessar Link' } },
      condicoes: [{ var: 'lead.optout', op: 'falso' }],
      passos: [{ acao: 'enviar_texto', params: { texto: 'Aqui está o link do site: {site_novo}' } }],
    },
  },
  {
    id: 'r2',
    status: 'ativa',
    def: {
      nome: 'Pediu para parar',
      gatilho: { evento: 'cliente_pediu_parar' },
      passos: [
        { acao: 'marcar_optout' },
        { acao: 'enviar_texto', params: { texto: 'Obrigado pelo retorno, {nome}. Vou tirar seu número da lista. Bom sucesso!' } },
      ],
    },
  },
  {
    id: 'r3',
    status: 'ativa',
    def: {
      nome: 'Ameaça: pausar e revisar',
      gatilho: { evento: 'cliente_ameacou' },
      passos: [
        { acao: 'pausar_lead' },
        { acao: 'revisao', params: { motivo: 'Palavra de alerta' } },
        { acao: 'notificar', params: { mensagem: 'Lead com ameaça pausado' } },
      ],
    },
  },
  {
    id: 'r4',
    status: 'rascunho',
    def: {
      nome: 'Outra resposta: mandar para revisão',
      gatilho: { evento: 'cliente_respondeu' },
      passos: [{ acao: 'revisao', params: { motivo: 'Resposta para classificar' } }],
    },
  },
];

const BASE_PASSO: Partial<Record<AcaoV, Record<string, unknown>>> = {
  enviar_texto: { texto: '' },
  esperar: { valor: 1, unidade: 'horas' },
  revisao: { motivo: '' },
  etiqueta: { op: 'adicionar', nome: '' },
  notificar: { mensagem: '' },
  definir_campo: { campo: '', valor: '' },
};

const CHIP_ABAS: Array<{ id: Aba; label: string }> = [
  { id: 'regras', label: 'Regras' },
  { id: 'execucoes', label: 'Execuções' },
  { id: 'fila', label: 'Fila agendada' },
  { id: 'revisao', label: 'Revisão' },
  { id: 'config', label: 'Configurações' },
];

const EXEMPLO_EXECUCOES = [
  { lead: 'Roberto · Padaria Estrela', regra: 'Clicou em Acessar Link', resultado: 'Link enviado' },
  { lead: 'Ana · Clínica Vida', regra: 'Pediu para parar', resultado: 'Opt-out aplicado' },
  { lead: 'Carlos · Oficina Norte', regra: 'Ameaça', resultado: 'Pausado · revisão' },
];

const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:border-neutral-300 disabled:cursor-not-allowed disabled:opacity-40';
const btnPrimario = 'inline-flex items-center gap-1.5 rounded-lg border border-teal-700 bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40';
const btnSm = 'rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:border-neutral-300';
const campo = 'w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-teal-600 focus:outline-none';

export default function AdminAutomacoesView() {
  const [aba, setAba] = useState<Aba>('regras');
  const [regras, setRegras] = useState<Regra[]>(SEED);
  const [selId, setSelId] = useState('r1');
  const [filtro, setFiltro] = useState<'todas' | Status>('todas');
  const [visao, setVisao] = useState<Visao>('lado');
  const [rascunho, setRascunho] = useState<Automacao | null>(null);
  const [jsonTxt, setJsonTxt] = useState<string | null>(null);
  const [jsonErro, setJsonErro] = useState('');
  const [passo, setPasso] = useState(0);

  const sel = regras.find((r) => r.id === selId) ?? regras[0];
  const atual: Automacao = rascunho ?? sel.def;
  const val = validarAutomacao(atual, regras, sel.id);
  const temErro = val.erros.length > 0 || !!jsonErro;
  const podeSalvar = !temErro;
  const podeAtivar = podeSalvar && val.conflitos.length === 0;
  const alterado = rascunho !== null;

  const editar = (nd: Automacao) => {
    setRascunho(nd);
    setJsonTxt(null);
    setJsonErro('');
  };

  const selecionar = (id: string) => {
    setSelId(id);
    setRascunho(null);
    setJsonTxt(null);
    setJsonErro('');
    setPasso(0);
  };

  const salvar = () => {
    if (!podeSalvar) return;
    setRegras((rs) => rs.map((r) => (r.id === sel.id ? { ...r, def: atual, status: r.status === 'ativa' ? 'ativa' : 'rascunho' } : r)));
    setRascunho(null);
    setJsonTxt(null);
  };

  const ativarOuPausar = () => {
    if (sel.status === 'ativa') {
      setRegras((rs) => rs.map((r) => (r.id === sel.id ? { ...r, status: 'inativa' } : r)));
      return;
    }
    if (!podeAtivar) return;
    setRegras((rs) => rs.map((r) => (r.id === sel.id ? { ...r, def: atual, status: 'ativa' } : r)));
    setRascunho(null);
    setJsonTxt(null);
  };

  const excluir = () => {
    const restantes = regras.filter((r) => r.id !== sel.id);
    setRegras(restantes);
    setSelId(restantes[0]?.id ?? '');
    setRascunho(null);
  };

  const novaAutomacao = () => {
    const id = `n${Date.now().toString(36)}`;
    const def: Automacao = {
      nome: 'Nova automação',
      gatilho: { evento: 'cliente_clicou', filtro: { texto_igual: 'Acessar Link' } },
      passos: [{ acao: 'enviar_texto', params: { texto: 'Oi {nome}, aqui está o link: {site_novo}' } }],
    };
    setRegras((rs) => [...rs, { id, status: 'rascunho', def }]);
    setSelId(id);
    setRascunho(null);
    setAba('regras');
    setVisao('editar');
  };

  const mudarPasso = (j: number, novo: Partial<{ acao: AcaoV; params: Record<string, unknown> }>) => {
    const passos = [...atual.passos];
    passos[j] = { ...passos[j], ...novo } as Automacao['passos'][number];
    editar({ ...atual, passos });
  };

  const trocarAcao = (j: number, acao: AcaoV) => {
    const passos = [...atual.passos];
    passos[j] = BASE_PASSO[acao] ? { acao, params: { ...BASE_PASSO[acao] } } : { acao };
    editar({ ...atual, passos });
  };

  const moverPasso = (j: number, para: number) => {
    if (para < 0 || para >= atual.passos.length) return;
    const passos = [...atual.passos];
    [passos[j], passos[para]] = [passos[para], passos[j]];
    editar({ ...atual, passos });
  };

  const removerPasso = (j: number) => editar({ ...atual, passos: atual.passos.filter((_, i) => i !== j) });

  const inserirVariavel = (j: number, nome: string) => {
    const texto = String(atual.passos[j]?.params?.texto ?? '');
    mudarPasso(j, { params: { ...(atual.passos[j]?.params || {}), texto: `${texto}{${nome}}` } });
  };

  const visiveis = filtro === 'todas' ? regras : regras.filter((r) => r.status === filtro);
  const bolhas = conversaSimulada(atual);
  const linhas = logicaEmPalavras(atual);
  const eventoAtual = EVENTOS.find((e) => e.v === atual.gatilho?.evento);

  const rotuloStatus = (s: Status) => (s === 'ativa' ? 'Ativa' : s === 'rascunho' ? 'Rascunho' : 'Inativa');
  const corStatus = (s: Status) => (s === 'ativa' ? 'bg-teal-50 text-teal-800' : s === 'rascunho' ? 'bg-amber-50 text-amber-800' : 'bg-neutral-100 text-neutral-600');

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8f9fa] overflow-y-auto">
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Automações de resposta</h2>
            <p className="text-sm text-neutral-500">Quando o cliente age, o sistema executa os passos. Nada é enviado enquanto o motor não estiver ligado ao servidor.</p>
          </div>
          <button type="button" onClick={novaAutomacao} className={btnPrimario}>
            <Plus className="h-4 w-4" /> Nova automação
          </button>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto border-b border-neutral-200">
          {CHIP_ABAS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${aba === t.id ? 'border-teal-700 font-semibold text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {aba !== 'regras' && (
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="mb-3 text-xs text-neutral-500">Dados de exemplo: esta aba ainda não está ligada ao servidor.</p>
            {aba === 'execucoes' && EXEMPLO_EXECUCOES.map((e) => (
              <div key={e.lead} className="flex justify-between border-b border-neutral-100 py-2 text-sm last:border-0">
                <span>{e.lead} · {e.regra}</span><b>{e.resultado}</b>
              </div>
            ))}
            {aba === 'fila' && <p className="text-sm text-neutral-600">Lúcia · Loja Sol · passo 2 · hoje, 22:20</p>}
            {aba === 'revisao' && <p className="text-sm text-neutral-600">Carlos · Oficina Norte · Palavra de alerta · aguardando você</p>}
            {aba === 'config' && (
              <div className="space-y-2 text-sm text-neutral-700">
                <p>Janela de texto livre: 24 horas após a última mensagem do cliente.</p>
                <p>Espera padrão de uma resposta automática: 2 horas.</p>
                <p>Máximo de mensagens automáticas por lead: 2 por dia, 5 por semana.</p>
                <p>Horário comercial: 08:00 às 18:00 (Brasília).</p>
              </div>
            )}
          </div>
        </div>
      )}

      {aba === 'regras' && (
        <div className="grid flex-1 grid-cols-1 gap-4 p-4 sm:p-6 xl:grid-cols-[250px_minmax(0,1fr)_300px] xl:items-start">
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Automações ({regras.length})</p>
            <div className="mb-3 flex flex-wrap gap-1">
              {(['todas', 'ativa', 'inativa', 'rascunho'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFiltro(f)} className={`rounded-full border px-2.5 py-1 text-xs ${filtro === f ? 'border-teal-700 bg-teal-50 font-semibold text-teal-900' : 'border-neutral-200 text-neutral-500'}`}>
                  {f === 'todas' ? 'Todas' : rotuloStatus(f)}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {visiveis.map((r) => (
                <button key={r.id} type="button" onClick={() => selecionar(r.id)} className={`w-full rounded-lg border p-3 text-left ${r.id === sel.id ? 'border-teal-700 ring-2 ring-teal-100' : 'border-neutral-200 hover:border-neutral-300'}`}>
                  <span className="block text-sm font-semibold text-neutral-900">{r.def.nome}</span>
                  <span className="block text-xs text-neutral-500">
                    Quando {(EVENTOS.find((e) => e.v === r.def.gatilho?.evento)?.label || '—').toLowerCase()} · {r.def.passos.length} passo(s)
                  </span>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${corStatus(r.status)}`}>{rotuloStatus(r.status)}</span>
                </button>
              ))}
              {visiveis.length === 0 && <p className="text-sm text-neutral-500">Nenhuma automação neste filtro.</p>}
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-neutral-900">{atual.nome || 'Sem nome'}</h3>
                <p className="text-xs text-neutral-500">Situação salva: {rotuloStatus(sel.status)}{alterado ? ' · alterações não salvas' : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={salvar} disabled={!podeSalvar} className={btn}>Salvar</button>
                <button type="button" onClick={ativarOuPausar} disabled={sel.status !== 'ativa' && !podeAtivar} className={btnPrimario}>
                  {sel.status === 'ativa' ? 'Pausar' : 'Ativar'}
                </button>
                <button type="button" onClick={excluir} className={`${btn} text-red-700`}>Excluir</button>
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{resumo(atual)}</div>

            <div className="mt-4 flex flex-wrap gap-1">
              {([
                ['json', 'JSON'],
                ['conversa', 'Conversa ao vivo'],
                ['lado', 'Lado a lado'],
                ['editar', 'Editar'],
              ] as Array<[Visao, string]>).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setVisao(id)} className={`rounded-full border px-3 py-1 text-xs ${visao === id ? 'border-teal-700 bg-teal-50 font-semibold text-teal-900' : 'border-neutral-200 text-neutral-500'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className={`mt-4 grid gap-4 ${visao === 'lado' ? '2xl:grid-cols-2' : ''}`}>
              {(visao === 'json' || visao === 'lado') && (
                <div>
                  <textarea
                    value={jsonTxt ?? JSON.stringify(atual, null, 2)}
                    spellCheck={false}
                    onChange={(e) => {
                      const txt = e.target.value;
                      setJsonTxt(txt);
                      try {
                        const parsed = JSON.parse(txt) as Automacao;
                        setRascunho(parsed);
                        setJsonErro('');
                      } catch (err) {
                        setJsonErro(`JSON incompleto: ${(err as Error).message}`);
                      }
                    }}
                    className="h-[480px] w-full rounded-lg border border-neutral-200 bg-[#fbfaf7] p-3 font-mono text-xs leading-relaxed text-neutral-900 focus:border-teal-600 focus:outline-none"
                  />
                  {jsonErro && <p className="mt-2 text-xs text-red-700">{jsonErro}</p>}
                </div>
              )}

              {(visao === 'conversa' || visao === 'lado') && (
                <div className="rounded-lg bg-[#efebe4] p-3">
                  <p className="mb-2 text-xs text-neutral-600">Conversa simulada, com dados de exemplo ({AMOSTRA.nome}, {AMOSTRA.empresa}).</p>
                  <div className="flex flex-col gap-2">
                    {bolhas.map((b, i) => (
                      <div key={i} className={b.quem === 'sistema' ? 'self-center rounded-full bg-white/80 px-3 py-1 text-center text-xs text-neutral-600' : b.quem === 'automacao' ? 'max-w-[82%] self-end whitespace-pre-wrap rounded-lg bg-[#dcf3ec] px-3 py-2 text-sm' : 'max-w-[82%] self-start rounded-lg bg-white px-3 py-2 text-sm'}>
                        {b.quem === 'cliente' && <span className="block text-[11px] font-semibold text-neutral-500">Cliente</span>}
                        {b.quem === 'automacao' && <span className="block text-[11px] font-semibold text-neutral-500">Automação</span>}
                        {b.texto}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {visao === 'editar' && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-neutral-500">Nome da automação</label>
                    <input className={campo} value={atual.nome} onChange={(e) => editar({ ...atual, nome: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-neutral-500">Quando isso acontecer</label>
                    <select className={campo} value={atual.gatilho?.evento} onChange={(e) => editar({ ...atual, gatilho: { ...atual.gatilho, evento: e.target.value as EventoV } })}>
                      {EVENTOS.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
                    </select>
                    {atual.gatilho?.evento === 'cliente_clicou' && (
                      <p className="mt-1 text-xs text-neutral-500">Texto do botão que dispara: {atual.gatilho.filtro?.texto_igual || 'Acessar Link'}</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-semibold text-neutral-900">Passos, na ordem em que acontecem</p>
                    <div className="space-y-3">
                      {atual.passos.map((p, j) => (
                        <div key={j} className={`rounded-lg border p-3 ${passo === j ? 'border-teal-600' : 'border-neutral-200'}`} onClick={() => setPasso(j)}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold">Passo {j + 1}: {ACOES.find((a) => a.v === p.acao)?.label || p.acao}</span>
                            <div className="flex gap-1">
                              <button type="button" className={btnSm} onClick={() => moverPasso(j, j - 1)} aria-label="Subir passo"><ArrowUp className="h-3.5 w-3.5" /></button>
                              <button type="button" className={btnSm} onClick={() => moverPasso(j, j + 1)} aria-label="Descer passo"><ArrowDown className="h-3.5 w-3.5" /></button>
                              <button type="button" className={`${btnSm} text-red-700`} onClick={() => removerPasso(j)} aria-label="Remover passo"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>

                          <label className="mb-1 block text-xs font-semibold text-neutral-500">O que acontece neste passo</label>
                          <select className={campo} value={p.acao} onChange={(e) => trocarAcao(j, e.target.value as AcaoV)}>
                            {ACOES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
                          </select>

                          {p.acao === 'enviar_texto' && (
                            <div className="mt-3">
                              <label className="mb-1 block text-xs font-semibold text-neutral-500">Texto da mensagem</label>
                              <textarea className={`${campo} min-h-[70px]`} value={String(p.params?.texto ?? '')} onChange={(e) => mudarPasso(j, { params: { ...p.params, texto: e.target.value } })} />
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {TOKEN_NAMES.map((nome) => (
                                  <button key={nome} type="button" onClick={() => inserirVariavel(j, nome)} className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-mono text-[11px] text-neutral-700 hover:border-teal-600">
                                    {`{${nome}}`}
                                  </button>
                                ))}
                              </div>
                              <p className="mt-2 text-[11px] text-neutral-500">Se o lead não tiver o dado: {TOKEN_NAMES.map((n) => `{${n}} = ${fallbackDe(n)}`).join(' · ')}</p>
                              <p className="mt-1 text-[11px] text-neutral-500">Como o cliente vê: {renderPrevia(String(p.params?.texto ?? ''))} ({String(renderPrevia(String(p.params?.texto ?? ''))).length}/{LIMITE_TEXTO})</p>
                            </div>
                          )}

                          {p.acao === 'esperar' && (
                            <div className="mt-3">
                              <label className="mb-1 block text-xs font-semibold text-neutral-500">Esperar quanto tempo antes do próximo passo</label>
                              <div className="flex gap-2">
                                <input type="number" className={`${campo} w-28`} value={Number(p.params?.valor ?? 1)} onChange={(e) => mudarPasso(j, { params: { ...p.params, valor: Number(e.target.value) } })} />
                                <select className={`${campo} w-36`} value={String(p.params?.unidade ?? 'horas')} onChange={(e) => mudarPasso(j, { params: { ...p.params, unidade: e.target.value } })}>
                                  <option value="minutos">minutos</option>
                                  <option value="horas">horas</option>
                                  <option value="dias">dias</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => editar({ ...atual, passos: [...atual.passos, { acao: 'enviar_texto', params: { texto: '' } }] })} className="mt-3 w-full rounded-lg border border-dashed border-neutral-300 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">
                      + Adicionar passo
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
              {linhas.map((l) => <p key={l} className="text-sm text-neutral-700">{l}</p>)}
            </div>
            {eventoAtual && <p className="mt-2 text-xs text-neutral-400">Gatilho: {eventoAtual.desc}</p>}
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Validação ao vivo</p>
              {val.erros.map((e) => <p key={e} className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{e}</p>)}
              {jsonErro && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{jsonErro}</p>}
              {val.conflitos.map((c) => <p key={c} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{c}</p>)}
              {val.avisos.map((a) => <p key={a} className="mb-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">{a}</p>)}
              {!temErro && val.conflitos.length === 0 && <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">Sem erros. Pode salvar e ativar.</p>}
            </section>
            <section className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Variáveis do projeto</p>
              <div className="space-y-1">
                {TOKEN_NAMES.map((n) => (
                  <div key={n} className="flex justify-between gap-2 rounded-md bg-neutral-50 px-2 py-1 text-xs">
                    <code className="font-mono">{`{${n}}`}</code>
                    <span className="text-right text-neutral-500">{fallbackDe(n)}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function resumo(def: Automacao): string {
  if (!def?.gatilho) return 'Escolha quando a automação acontece para ver o resumo.';
  const ev = EVENTOS.find((e) => e.v === def.gatilho.evento);
  const nomes: Partial<Record<AcaoV, string>> = {
    enviar_texto: 'envio um texto',
    marcar_optout: 'marco opt-out',
    pausar_lead: 'pauso o lead',
    revisao: 'mando para sua revisão',
    etiqueta: 'adiciono uma etiqueta',
    notificar: 'aviso você',
    definir_campo: 'defino um campo',
  };
  const partes = (def.passos || []).map((p) =>
    p.acao === 'esperar' ? `espero ${p.params?.valor} ${p.params?.unidade}` : nomes[p.acao] || p.acao
  );
  return `Quando o cliente ${ev?.desc || 'faz algo'}, ${partes.join(', depois ') || 'nada'}.`;
}
