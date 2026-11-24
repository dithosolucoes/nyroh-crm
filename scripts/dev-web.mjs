// Sobe só o front (apps/web) com dados falsos, sem o servidor.
// Funciona no Windows e no Linux (não depende de sintaxe de variável de ambiente do shell).
// Dados falsos: só leitura (GET). Salvar e enviar precisam do servidor (npm run dev).
import { spawn } from 'node:child_process';

const env = { ...process.env, USE_MOCK_API: 'true' };
const filho = spawn('npx', ['vite', '--config', 'apps/web/vite.config.ts', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  shell: true,
});
filho.on('exit', (codigo) => process.exit(codigo ?? 0));
