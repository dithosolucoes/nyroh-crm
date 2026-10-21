import React, { useState } from 'react';
import { Shield, Lock, Mail, ArrowRight, User, Eye, EyeOff, CheckCircle2, ShieldCheck, KeyRound, Sparkles, Zap, ShieldAlert } from 'lucide-react';
import { User as UserType } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: UserType) => void;
  onShowToast: (msg: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onShowToast }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (loginEmail?: string, loginPass?: string) => {
    const targetEmail = (loginEmail || email).trim();
    const targetPass = loginPass || password;

    if (!targetEmail || !targetPass) {
      setErrorMsg('Preencha seu e-mail e sua senha para acessar.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetPass })
      });

      const data = await res.json();
      if (res.ok && data.user) {
        onShowToast(`Bem-vindo de volta, ${data.user.name}!`);
        onLoginSuccess(data.user);
      } else {
        setErrorMsg(data.error || 'Credenciais inválidas. Verifique seu login.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro de conexão ao servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
    handleLogin(quickEmail, quickPass);
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center items-center p-4 sm:p-6 text-neutral-900 selection:bg-blue-100">
      <div className="w-full max-w-md space-y-6">
        {/* Header do Sistema */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-neutral-900 text-white shadow-md mb-1">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            CRM • Pipeline & Ligações
          </h1>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto">
            Plataforma de gestão comercial com carteiras isoladas e discagem rápida.
          </p>
        </div>

        {/* Card Principal de Formulário */}
        <div className="bg-white border border-neutral-200/90 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Acesso à Conta
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
              <Lock className="w-3 h-3 text-emerald-600" />
              Sessão Criptografada
            </span>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="space-y-4"
          >
            {/* Campo E-mail */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 flex items-center justify-between">
                <span>E-mail Corporativo</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@empresa.com"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-neutral-200 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 flex items-center justify-between">
                <span>Senha de Acesso</span>
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-xs rounded-xl border border-neutral-200 bg-neutral-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 p-0.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão de Entrar */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 active:bg-black text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 mt-2 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Acesso rápido de DESENVOLVIMENTO: só existe em `npm run dev` — o build de produção NÃO inclui este bloco nem as senhas. */}
          {import.meta.env.DEV && (
          <div className="pt-4 border-t border-neutral-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Ambiente Google AI Studio
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded-full border border-amber-200">
                1 Clique
              </span>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin('admin@demo.com', 'admin123')}
              className="w-full group flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-600/5 to-blue-500/10 hover:from-emerald-500/20 hover:to-blue-500/20 border border-emerald-300 text-left transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-neutral-900 group-hover:text-emerald-950 flex items-center gap-1.5">
                    <span>Entrar como Administrador Fake (Demo)</span>
                    <span className="text-[9px] bg-emerald-700 text-white px-1.5 py-0.2 rounded font-black tracking-wide">
                      ADMIN
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-600">
                    admin@demo.com • Acesso total a Disparos, Kanban, Quarentena e Metas
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickLogin('admin@nyroh.com', 'Thomas123456!')}
                className="text-left p-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-700 hover:text-neutral-900 transition-all cursor-pointer"
              >
                <div className="text-[11px] font-bold">Super Admin Nyroh</div>
                <div className="text-[10px] text-neutral-500">admin@nyroh.com</div>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickLogin('thomas@nyroh.com', '123')}
                className="text-left p-2 rounded-lg bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-700 hover:text-neutral-900 transition-all cursor-pointer"
              >
                <div className="text-[11px] font-bold">Thomas (Dono & Closer)</div>
                <div className="text-[10px] text-neutral-500">thomas@nyroh.com</div>
              </button>
            </div>
          </div>
          )}
        </div>

        {/* Rodapé discreto e profissional */}
        <div className="text-center">
          <p className="text-[11px] text-neutral-400">
            Ambiente corporativo seguro • Sessão monitorada e criptografada
          </p>
        </div>
      </div>
    </div>
  );
};
