import { useEffect, useState } from 'react';
import {
  ACOES,
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

/**
 * Tela de Automações de resposta (admin). Porta fiel do protótipo aprovado.
 * Só dados de exemplo: nada é salvo no servidor e nada é enviado.
 */

type Status = 'ativa' | 'inativa' | 'rascunho';
type Regra = { id: string; status: Status; def: Automacao };
type Visao = 'json' | 'conversa' | 'lado' | 'editar';
type Aba = 'regras' | 'exec' | 'fila' | 'revisao' | 'config';

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
      condicoes: [],
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
      condicoes: [],
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
      condicoes: [],
      passos: [{ acao: 'revisao', params: { motivo: 'Resposta para classificar' } }],
    },
  },
];

const BASE: Partial<Record<AcaoV, Record<string, unknown>>> = {
  enviar_texto: { texto: '' },
  esperar: { valor: 1, unidade: 'horas' },
  revisao: { motivo: '' },
  etiqueta: { op: 'adicionar', nome: '' },
  notificar: { mensagem: '' },
  definir_campo: { campo: '', valor: '' },
  marcar_optout: {},
  pausar_lead: {},
};

const SUBTABS: Array<{ id: Aba; label: string }> = [
  { id: 'regras', label: 'Regras' },
  { id: 'exec', label: 'Execuções' },
  { id: 'fila', label: 'Fila agendada' },
  { id: 'revisao', label: 'Revisão' },
  { id: 'config', label: 'Configurações' },
];

interface ExecucaoLinha { quando: string; decisao: string; motivo: string; leadId: string | null; regraId: string | null }
interface FilaLinha { leadId: string; acao: string; executarEm: string; status: string }
interface RevisaoLinha { leadId: string; ultimoComando: string | null; em: string | null }
interface ConfigReal { persistenciaLigada: boolean; execucaoLigada: boolean; pausaGeral: boolean; limites: null }

// Exemplos mostrados só quando a persistência está desligada (o servidor responde 503).
const EXECUCOES_EXEMPLO: ExecucaoLinha[] = [
  { quando: '', decisao: 'executou', motivo: 'Link enviado', leadId: 'Roberto · Padaria Estrela', regraId: 'Clicou em Acessar Link' },
  { quando: '', decisao: 'bloqueou', motivo: 'Opt-out aplicado', leadId: 'Ana · Clínica Vida', regraId: 'Pediu para parar' },
];
const FILA_EXEMPLO: FilaLinha[] = [{ leadId: 'Lúcia · Loja Sol', acao: 'etiqueta', executarEm: 'hoje, 22:20', status: 'pendente' }];
const REVISAO_EXEMPLO: RevisaoLinha[] = [{ leadId: 'Carlos · Oficina Norte', ultimoComando: 'Ameaça', em: 'aguardando você' }];

/** Lê uma lista do servidor. Se a rota responder erro (ex.: 503, persistência desligada), mantém o exemplo. */
function useLista<T>(url: string, exemplo: T[]): { dados: T[]; real: boolean } {
  const [dados, setDados] = useState<T[]>(exemplo);
  const [real, setReal] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json()) as T[];
        if (vivo) { setDados(j); setReal(true); }
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [url]);
  return { dados, real };
}

const ACCENT = 'text-[#0F766E]';
const BTN = 'inline-flex items-center rounded-lg border border-[#E3E1DA] bg-white px-3 py-2 text-sm font-semibold whitespace-nowrap hover:border-[#cfcdc4] disabled:cursor-not-allowed disabled:opacity-45';
const BTN_PRIMARY = 'inline-flex items-center rounded-lg border border-[#0F766E] bg-[#0F766E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0B5C56] disabled:cursor-not-allowed disabled:opacity-45';
const BTN_SM = 'rounded-lg border border-[#E3E1DA] bg-white px-2.5 py-1 text-xs font-semibold hover:border-[#cfcdc4]';
const CHIP = 'rounded-full border border-[#E3E1DA] px-2.5 py-1 text-xs font-medium text-[#6B6A64]';
const CHIP_ON = 'rounded-full border border-[#0F766E] bg-[#E7F2F0] px-2.5 py-1 text-xs font-semibold text-[#0B5C56]';
const INP = 'w-full min-w-0 rounded-lg border border-[#E3E1DA] bg-white px-2.5 py-2 text-[13px] text-[#191917] focus-visible:outline-2 focus-visible:outline-[#0F766E]';
const LABEL = 'mt-2 mb-1 block text-xs font-semibold text-[#6B6A64]';

export default function AdminAutomacoesView() {
  const [tab, setTab] = useState<Aba>('regras');
  const [regras, setRegras] = useState<Regra[]>(SEED);
  const [selId, setSelId] = useState<string | null>('r1');
  const [filtro, setFiltro] = useState<'todas' | Status>('todas');
  const [view, setView] = useState<Visao>('lado');
  const [draft, setDraft] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [persistido, setPersistido] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const exec = useLista<ExecucaoLinha>('/api/admin/automacoes/execucoes', EXECUCOES_EXEMPLO);
  const fila = useLista<FilaLinha>('/api/admin/automacoes/fila', FILA_EXEMPLO);
  const revisao = useLista<RevisaoLinha>('/api/admin/automacoes/revisao', REVISAO_EXEMPLO);
  const config = useLista<ConfigReal | null>('/api/admin/automacoes/configuracoes', [null]);
  const cfg = config.dados[0] ?? null;

  // Com a persistência ligada no servidor, carrega as regras salvas. Sem ela, mantém os exemplos.
  useEffect(() => {
    let vivo = true;
    fetch('/api/admin/automacoes')
      .then(async (r) => {
        if (!vivo) return;
        if (r.status === 503) {
          setAviso('Dados de exemplo: a persistência das automações está desligada neste ambiente. Nada é salvo de verdade.');
          return;
        }
        if (!r.ok) {
          setAviso('Não consegui carregar as automações salvas.');
          return;
        }
        const lista = (await r.json()) as Regra[];
        setPersistido(true);
        setRegras(lista);
        setSelId(lista[0]?.id ?? null);
      })
      .catch(() => {
        if (vivo) setAviso('Não consegui carregar as automações salvas.');
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** Grava no servidor quando a persistência está ligada. Devolve false se o servidor recusar. */
  const gravar = async (id: string, status: Status, def: Automacao): Promise<boolean> => {
    if (!persistido) return true;
    const r = await fetch(`/api/admin/automacoes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, def }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}) as { error?: string; erros?: string[]; conflitos?: string[] });
      setAviso([j.error || 'Não foi possível salvar.', ...(j.erros || []), ...(j.conflitos || [])].join(' '));
      return false;
    }
    setAviso(null);
    return true;
  };

  const sel = regras.find((r) => r.id === selId) ?? regras[0];

  if (!sel) {
    return (
      <div className="p-6">
        <p className="text-sm text-[#6B6A64]">Nenhuma automação. Crie uma com "Nova automação".</p>
      </div>
    );
  }

  const jsonAtual = draft ?? JSON.stringify(sel.def, null, 2);
  let cur: Automacao | null = null;
  let jsonErro = '';
  try {
    const p = JSON.parse(jsonAtual);
    if (p && typeof p === 'object' && !Array.isArray(p)) cur = p as Automacao;
    else jsonErro = 'O JSON precisa ser um objeto.';
  } catch (e) {
    jsonErro = `JSON incompleto: ${(e as Error).message}`;
  }
  // Só renderiza passos/lógica quando a estrutura básica existe; a validação mostra o resto.
  const ok = cur && Array.isArray(cur.passos) ? cur : null;

  const val = cur
    ? validarAutomacao(cur, regras, sel.id)
    : { erros: [jsonErro], avisos: [] as string[], conflitos: [] as string[] };
  const temErros = val.erros.length > 0;
  const temConflitos = val.conflitos.length > 0;
  const tudoOk = !temErros && !temConflitos;
  const noSave = temErros || !ok;
  const noActivate = !tudoOk && sel.status !== 'ativa';

  const commit = (nd: Automacao) => setDraft(JSON.stringify(nd, null, 2));
  const copia = (): Automacao => JSON.parse(JSON.stringify(ok ?? sel.def));
  const evLabel = (v?: string) => EVENTOS.find((e) => e.v === v)?.label ?? '—';
  const fallbackTxt = (n: string) => {
    const fb = fallbackDe(n);
    return fb.startsWith('(vazio') ? 'bloqueia o envio' : fb;
  };

  const trocarSel = (id: string) => {
    setSelId(id);
    setDraft(null);
    setStep(0);
  };

  const salvar = async () => {
    if (noSave || !ok) return;
    const novo: Status = sel.status === 'ativa' ? 'ativa' : 'rascunho';
    if (!(await gravar(sel.id, novo, ok))) return;
    setRegras((rs) => rs.map((r) => (r.id === sel.id ? { ...r, def: ok, status: novo } : r)));
    setDraft(null);
  };

  const ativar = async () => {
    if (sel.status === 'ativa') {
      if (!(await gravar(sel.id, 'inativa', sel.def))) return;
      setRegras((rs) => rs.map((r) => (r.id === sel.id ? { ...r, status: 'inativa' } : r)));
      return;
    }
    if (noActivate || !ok) return;
    if (!(await gravar(sel.id, 'ativa', ok))) return;
    setRegras((rs) => rs.map((r) => (r.id === sel.id ? { ...r, def: ok, status: 'ativa' } : r)));
    setDraft(null);
  };

  const excluir = async () => {
    if (persistido) {
      const r = await fetch(`/api/admin/automacoes/${encodeURIComponent(sel.id)}`, { method: 'DELETE' });
      if (!r.ok) {
        setAviso('Não foi possível excluir a automação.');
        return;
      }
    }
    const next = regras.filter((r) => r.id !== sel.id);
    setRegras(next);
    setSelId(next[0]?.id ?? null);
    setDraft(null);
    setStep(0);
  };

  const novaAutomacao = () => {
    const id = `n${Date.now().toString(36)}`;
    const def: Automacao = {
      nome: 'Nova automação',
      gatilho: { evento: 'cliente_clicou', filtro: { texto_igual: 'Acessar Link' } },
      condicoes: [],
      passos: [{ acao: 'enviar_texto', params: { texto: 'Oi {nome}, aqui está o link: {site_novo}' } }],
    };
    setRegras((rs) => [...rs, { id, status: 'rascunho', def }]);
    setSelId(id);
    setDraft(null);
    setStep(0);
    setFiltro('todas');
    setTab('regras');
  };

  const visiveis = filtro === 'todas' ? regras : regras.filter((r) => r.status === filtro);
  const nAt = (s: Status) => regras.filter((r) => r.status === s).length;
  const bolhas = ok ? conversaSimulada(ok) : [];
  const total = ok ? ok.passos.length + 1 : 0;
  const linhas = ok ? logicaEmPalavras(ok) : [];
  const resumo = ok ? resumoDe(ok) : 'Corrija o JSON para ver o resumo.';
  const ativarLabel = sel.status === 'ativa' ? 'Pausar' : 'Ativar';

  return (
    <div className="min-h-full bg-[#F5F4F0] p-4 text-[14px] leading-[1.45] text-[#191917] sm:p-6">
      {aviso && <div className="mb-3 rounded-[10px] bg-[#FBF1E0] px-3 py-2 text-[13px] text-[#9A5B00]">{aviso}</div>}
      <header className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-bold tracking-tight">Automações</h1>
          <p className="mt-1 text-[#6B6A64]">Cada automação é uma regra: quando o cliente faz algo, o sistema executa os passos.</p>
        </div>
        <button type="button" onClick={novaAutomacao} className={BTN_PRIMARY}>Nova automação</button>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-[#E3E1DA]">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 ${tab === t.id ? 'border-[#0F766E] font-semibold text-[#191917]' : 'border-transparent font-medium text-[#6B6A64]'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'regras' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [String(regras.length), 'Automações'],
              [String(nAt('ativa')), 'Ativas'],
              [String(nAt('inativa')), 'Inativas'],
              [String(nAt('rascunho')), 'Rascunhos'],
            ].map(([n, l]) => (
              <div key={l} className="rounded-[10px] border border-[#E3E1DA] bg-white px-3.5 py-3">
                <b className="block text-xl">{n}</b>
                <span className="text-xs text-[#6B6A64]">{l}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-[18px] min-[860px]:grid-cols-[250px_minmax(0,1fr)] min-[1280px]:grid-cols-[250px_minmax(0,1fr)_320px] items-start">
            <section className="rounded-[14px] border border-[#E3E1DA] bg-white p-4">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6A64]">Todas as automações</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {(['todas', 'ativa', 'inativa', 'rascunho'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFiltro(f)} className={filtro === f ? CHIP_ON : CHIP}>
                    {f === 'todas' ? 'Todas' : f === 'ativa' ? 'Ativas' : f === 'inativa' ? 'Inativas' : 'Rascunhos'}
                  </button>
                ))}
              </div>
              {visiveis.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => trocarSel(r.id)}
                  className={`mb-2 flex w-full flex-col gap-1 rounded-[10px] border bg-white p-3 text-left hover:border-[#cfcdc4] ${r.id === sel.id ? 'border-[#0F766E] shadow-[0_0_0_3px_#E7F2F0]' : 'border-[#E3E1DA]'}`}
                >
                  <span className="font-semibold">{r.def.nome}</span>
                  <span className="text-xs text-[#6B6A64]">Quando {evLabel(r.def.gatilho?.evento).toLowerCase()} · {r.def.passos?.length ?? 0} passo(s)</span>
                  <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === 'ativa' ? 'bg-[#E7F2F0] text-[#0B5C56]' : r.status === 'rascunho' ? 'bg-[#FBF1E0] text-[#9A5B00]' : 'bg-[#F5F4F0] text-[#6B6A64]'}`}>
                    {r.status === 'ativa' ? 'Ativa' : r.status === 'rascunho' ? 'Rascunho' : 'Inativa'}
                  </span>
                </button>
              ))}
              {visiveis.length === 0 && <p className="text-sm text-[#6B6A64]">Nenhuma automação neste filtro.</p>}
            </section>

            <section className="min-w-0 rounded-[14px] border border-[#E3E1DA] bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h2 className="m-0 text-[19px] font-bold">{ok?.nome || sel.def.nome}</h2>
                  <div className="text-xs text-[#6B6A64]">Situação salva: {sel.status === 'ativa' ? 'ativa' : sel.status === 'rascunho' ? 'rascunho' : 'inativa'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void salvar()} disabled={noSave} className={BTN}>Salvar</button>
                  <button type="button" onClick={() => void ativar()} disabled={sel.status !== 'ativa' && noActivate} className={BTN_PRIMARY}>{ativarLabel}</button>
                  <button type="button" onClick={() => void excluir()} className={`${BTN} text-[#B42318]`}>Excluir</button>
                </div>
              </div>

              <div className="my-2.5 mb-3 rounded-[10px] bg-[#E7F2F0] px-3 py-2.5 text-[13px] leading-normal text-[#0B5C56]">{resumo}</div>

              <div className="mb-3 flex flex-wrap gap-1">
                {([
                  ['json', 'JSON'],
                  ['conversa', 'Conversa ao vivo'],
                  ['lado', 'Lado a lado'],
                  ['editar', 'Editar'],
                ] as Array<[Visao, string]>).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setView(id);
                      if (id === 'conversa') setStep(0);
                    }}
                    className={view === id ? CHIP_ON : CHIP}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {view !== 'editar' && (
                <div className={`grid gap-3.5 ${view === 'lado' ? 'xl:grid-cols-2' : ''}`}>
                  {view !== 'conversa' && (
                    <textarea
                      value={jsonAtual}
                      spellCheck={false}
                      onChange={(e) => setDraft(e.target.value)}
                      className="min-h-[520px] w-full rounded-[10px] border border-[#E3E1DA] bg-[#FBFAF7] p-3 font-mono text-xs leading-[1.55] focus-visible:outline-2 focus-visible:outline-[#0F766E]"
                    />
                  )}
                  {view !== 'json' && (
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[#6B6A64]">Etapa {Math.min(step, total)} de {total} · dados de exemplo (Roberto, Padaria Estrela)</span>
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className={BTN_SM} onClick={() => setStep(0)}>Reiniciar</button>
                          <button type="button" className={BTN_SM} onClick={() => setStep(total)}>Mostrar tudo</button>
                          <button type="button" className={BTN_SM + ' !border-[#0F766E] !bg-[#0F766E] !text-white'} onClick={() => setStep((s) => Math.min(s + 1, total))}>Próximo passo</button>
                        </div>
                      </div>
                      <div className="flex min-h-[520px] flex-col gap-2 rounded-[14px] border border-[#E3E1DA] bg-[#EFEBE4] p-3.5">
                        {bolhas.map((b, i) => {
                          if (i >= step) return null;
                          if (b.quem === 'cliente') {
                            return (
                              <div key={i} className="max-w-[82%] self-start whitespace-pre-wrap rounded-[10px] bg-white px-3 py-2 text-[13.5px] shadow-sm">
                                <span className="mb-0.5 block text-[11px] font-semibold text-[#6B6A64]">Cliente</span>
                                {b.texto}
                              </div>
                            );
                          }
                          if (b.quem === 'automacao') {
                            return (
                              <div key={i} className="max-w-[82%] self-end whitespace-pre-wrap rounded-[10px] bg-[#DCF3EC] px-3 py-2 text-[13.5px] shadow-sm">
                                <span className="mb-0.5 block text-[11px] font-semibold text-[#6B6A64]">Automação</span>
                                {b.texto}
                              </div>
                            );
                          }
                          const warn = /^(Aguarda|Opt-out|Lead pausado)/.test(b.texto);
                          return (
                            <div key={i} className={`max-w-full self-center rounded-full px-2.5 py-1 text-center text-xs ${warn ? 'bg-[#FBF1E0] text-[#9A5B00]' : 'bg-white/75 text-[#6B6A64]'}`}>
                              {b.texto}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {view !== 'editar' && ok && (
                <div className="mt-3 rounded-[14px] border border-[#E3E1DA] p-3.5">
                  <p className="mb-2 text-[13px] font-semibold">Lógica em palavras</p>
                  {linhas.map((l, i) => (
                    <p key={i} className="mb-1 text-[13px] leading-normal">{l}</p>
                  ))}
                </div>
              )}

              {view === 'editar' && ok && (
                <div className="rounded-[14px] border border-[#E3E1DA] p-3.5">
                  <p className="mb-2 text-[13px] font-semibold">Editar a automação</p>
                  <p className="mb-2.5 text-xs text-[#6B6A64]">Mude aqui e o JSON acompanha. Não precisa mexer no JSON.</p>

                  <label className={LABEL}>Nome da automação</label>
                  <input className={INP} value={ok.nome} onChange={(e) => { const nd = copia(); nd.nome = e.target.value; commit(nd); }} />

                  <label className={LABEL}>Quando isso acontecer</label>
                  <select className={INP} value={ok.gatilho?.evento ?? ''} onChange={(e) => { const nd = copia(); nd.gatilho = { ...(nd.gatilho || {}), evento: e.target.value as EventoV }; commit(nd); }}>
                    {EVENTOS.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
                  </select>

                  <p className="mt-3.5 mb-2 text-[13px] font-semibold">Passos, na ordem em que acontecem</p>
                  {ok.passos.map((p, j) => {
                    const texto = String(p.params?.texto ?? '');
                    return (
                      <div key={j} className="mb-2.5 rounded-[10px] border border-[#E3E1DA] bg-white p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <b className="text-[13px]">Passo {j + 1}: {ACOES.find((a) => a.v === p.acao)?.label ?? p.acao}</b>
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" className={BTN_SM} disabled={j === 0} onClick={() => { const nd = copia(); [nd.passos[j - 1], nd.passos[j]] = [nd.passos[j], nd.passos[j - 1]]; commit(nd); }}>Subir</button>
                            <button type="button" className={BTN_SM} disabled={j >= ok.passos.length - 1} onClick={() => { const nd = copia(); [nd.passos[j + 1], nd.passos[j]] = [nd.passos[j], nd.passos[j + 1]]; commit(nd); }}>Descer</button>
                            <button type="button" className={`${BTN_SM} text-[#B42318]`} onClick={() => { const nd = copia(); nd.passos.splice(j, 1); commit(nd); }}>Remover</button>
                          </div>
                        </div>

                        <label className={LABEL}>O que acontece neste passo</label>
                        <select
                          className={INP}
                          value={p.acao}
                          onChange={(e) => {
                            const nd = copia();
                            const v = e.target.value as AcaoV;
                            nd.passos[j] = BASE[v] ? { acao: v, params: { ...BASE[v] } } : { acao: v };
                            commit(nd);
                          }}
                        >
                          {ACOES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
                        </select>

                        {p.acao === 'enviar_texto' && (
                          <>
                            <label className={LABEL}>Texto da mensagem (clique numa variável para inserir)</label>
                            <textarea
                              className={`${INP} min-h-[70px]`}
                              value={texto}
                              onChange={(e) => { const nd = copia(); nd.passos[j].params = { ...(nd.passos[j].params || {}), texto: e.target.value }; commit(nd); }}
                            />
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {TOKEN_NAMES.map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => { const nd = copia(); nd.passos[j].params = { ...(nd.passos[j].params || {}), texto: texto + `{${n}}` }; commit(nd); }}
                                  className="rounded-md border border-[#E3E1DA] bg-[#F5F4F0] px-2 py-1 font-mono text-[11.5px] hover:border-[#0F766E]"
                                >
                                  {`{${n}}`}
                                </button>
                              ))}
                            </div>
                            <div className="mt-1 text-[11.5px] text-[#6B6A64]">Se o lead não tiver o dado: {TOKEN_NAMES.map((n) => `{${n}} = ${fallbackTxt(n)}`).join(' · ')}</div>
                            <div className="mt-1 text-[11.5px] text-[#6B6A64]">Como o cliente vê: {renderPrevia(texto)} ({renderPrevia(texto).length}/{LIMITE_TEXTO})</div>
                          </>
                        )}

                        {p.acao === 'esperar' && (
                          <>
                            <label className={LABEL}>Esperar quanto tempo antes do próximo passo</label>
                            <div className="flex flex-wrap items-center gap-2">
                              <input type="number" className={`${INP} w-[110px]`} value={Number(p.params?.valor ?? 1)} onChange={(e) => { const nd = copia(); nd.passos[j].params = { ...(nd.passos[j].params || {}), valor: Number(e.target.value) }; commit(nd); }} />
                              <select className={`${INP} w-[110px]`} value={String(p.params?.unidade ?? 'horas')} onChange={(e) => { const nd = copia(); nd.passos[j].params = { ...(nd.passos[j].params || {}), unidade: e.target.value }; commit(nd); }}>
                                <option value="minutos">minutos</option>
                                <option value="horas">horas</option>
                                <option value="dias">dias</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { const nd = copia(); nd.passos = [...nd.passos, { acao: 'enviar_texto', params: { texto: '' } }]; commit(nd); }}
                    className={`w-full rounded-[10px] border border-dashed border-[#c8c6bd] py-2.5 font-semibold ${ACCENT} hover:border-solid hover:border-[#0F766E] hover:bg-[#E7F2F0]`}
                  >
                    + Adicionar passo
                  </button>
                </div>
              )}
            </section>

            <aside className="min-[1280px]:col-span-1 min-[860px]:col-span-2 space-y-3.5">
              <section className="rounded-[14px] border border-[#E3E1DA] bg-white p-4">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6A64]">Validação ao vivo</p>
                {val.erros.map((e) => <div key={e} className="mb-2 rounded-[10px] bg-[#FCEBEA] px-3 py-2 text-[13px] text-[#B42318]">{e}</div>)}
                {val.conflitos.map((c) => <div key={c} className="mb-2 rounded-[10px] bg-[#FBF1E0] px-3 py-2 text-[13px] text-[#9A5B00]">{c}</div>)}
                {val.avisos.map((a) => <div key={a} className="mb-2 rounded-[10px] bg-[#FBF1E0] px-3 py-2 text-[13px] text-[#9A5B00]">{a}</div>)}
                {tudoOk && <div className="rounded-[10px] bg-[#E7F2F0] px-3 py-2 text-[13px] text-[#0B5C56]">Sem erros. Pode salvar e ativar.</div>}
              </section>

              <section className="rounded-[14px] border border-[#E3E1DA] bg-white p-4">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6A64]">Catálogo</p>
                <div className="mb-3">
                  <h4 className="mb-1.5 text-xs font-semibold text-[#6B6A64]">Quando (gatilhos)</h4>
                  {EVENTOS.map((e) => <Item key={e.v} nome={e.v} texto={e.desc} />)}
                </div>
                <div className="mb-3">
                  <h4 className="mb-1.5 text-xs font-semibold text-[#6B6A64]">Variáveis do projeto</h4>
                  {TOKEN_NAMES.map((n) => <Item key={n} nome={`{${n}}`} texto={fallbackTxt(n)} />)}
                </div>
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold text-[#6B6A64]">O que acontece (ações)</h4>
                  {ACOES.map((a) => <Item key={a.v} nome={a.v} texto={a.params} />)}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}

      {tab === 'exec' && (
        <section className="rounded-[14px] border border-[#E3E1DA] bg-white p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6A64]">Execuções{exec.real ? '' : ' (exemplo)'}</p>
          {exec.dados.map((e, i) => <Item key={`${e.leadId}-${i}`} nome={`${e.leadId ?? '—'} · ${e.regraId ?? ''}`} texto={`${e.decisao}: ${e.motivo}`} />)}
        </section>
      )}

      {tab === 'fila' && (
        <section className="rounded-[14px] border border-[#E3E1DA] bg-white p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6A64]">Fila agendada{fila.real ? '' : ' (exemplo)'}</p>
          {fila.dados.map((f, i) => <Item key={`${f.leadId}-${i}`} nome={`${f.leadId} · ${f.acao}`} texto={`${f.executarEm} · ${f.status}`} />)}
        </section>
      )}

      {tab === 'revisao' && (
        <section className="rounded-[14px] border border-[#E3E1DA] bg-white p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6A64]">Revisão manual{revisao.real ? '' : ' (exemplo)'}</p>
          {revisao.dados.map((v, i) => <Item key={`${v.leadId}-${i}`} nome={`${v.leadId} · ${v.ultimoComando ?? '—'}`} texto={v.em ?? ''} />)}
        </section>
      )}

      {tab === 'config' && (
        <section className="rounded-[14px] border border-[#E3E1DA] bg-white p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6B6A64]">Configurações{cfg ? '' : ' (exemplo)'}</p>
          <Item nome="Pausa geral" texto={cfg ? (cfg.pausaGeral ? 'LIGADA: a fila está parada' : 'desligada') : 'desligada'} />
          <Item nome="Execução da fila" texto={cfg ? (cfg.execucaoLigada ? 'ligada' : 'desligada, nada roda') : 'desligada, nada roda'} />
          <Item nome="Limites de mensagens por lead" texto="definidos em cada automação (JSON)" />
          <Item nome="Janela de texto livre" texto="24 horas após a última mensagem do cliente" />
          <Item nome="Horário comercial" texto="08:00 às 18:00 (Brasília)" />
        </section>
      )}
    </div>
  );
}

function Item({ nome, texto }: { nome: string; texto: string }) {
  return (
    <div className="mb-1 flex justify-between gap-2 rounded-md bg-[#F5F4F0] px-2 py-1.5 text-xs">
      <code className="font-mono text-[11.5px]">{nome}</code>
      <span className="text-right text-[#6B6A64]">{texto}</span>
    </div>
  );
}

function resumoDe(def: Automacao): string {
  const ev = EVENTOS.find((e) => e.v === def.gatilho?.evento)?.desc ?? 'faz algo';
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
  return `Quando o cliente ${ev}, ${partes.join(', depois ') || 'nada'}.`;
}
