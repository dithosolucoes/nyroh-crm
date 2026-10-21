/**
 * Helpers para os testes ponta a ponta: sobe o servidor do Nyroh como processo filho e, principalmente,
 * ENCERRA a árvore inteira.
 *
 * O `tsx` roda o servidor num processo FILHO dele. Matar só o `tsx` (child.kill) deixava o servidor
 * órfão escutando a porta: a rodada seguinte subia, batia em EADDRINUSE e as requisições iam para o
 * servidor VELHO (com o banco da rodada anterior) — falhas que pareciam de produto e eram do teste.
 * Agora o processo nasce como líder de grupo e o grupo inteiro é encerrado.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

export interface RunningServer {
  child: ChildProcess;
  log: string[];
  stop: () => Promise<void>;
}

export function stopTree(child: ChildProcess) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      // Sinal para o GRUPO (pid negativo): pega o tsx e o servidor que ele abriu.
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  } catch {
    /* já encerrado */
  }
}

/** Espera a porta ficar realmente livre (evita EADDRINUSE na rodada seguinte). */
export async function waitForPortFree(port: number, timeoutMs = 10000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const free = await new Promise<boolean>(resolve => {
      const tester = net
        .createServer()
        .once('error', () => resolve(false))
        .once('listening', () => tester.close(() => resolve(true)))
        .listen(port, '127.0.0.1');
    });
    if (free) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

/** Sobe `server.ts` com o ambiente dado. Variáveis de Redis/banco herdadas do computador são REMOVIDAS (isolamento). */
export function startNyrohServer(extraEnv: NodeJS.ProcessEnv): RunningServer {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  for (const k of ['RAILWAY_ENVIRONMENT', 'RAILWAY_SERVICE_ID', 'RAILWAY_PUBLIC_DOMAIN', 'RAILWAY_VOLUME_MOUNT_PATH',
    'DATABASE_PRIVATE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL', 'DATABASE_PUBLIC_URL',
    'REDIS_PRIVATE_URL', 'REDIS_PUBLIC_URL', 'MIRROR_EVENTS_URL', 'MIRROR_EVENTS_TOKEN']) {
    if (!(k in extraEnv)) delete env[k];
  }
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(process.execPath, [tsxCli, 'server.ts'], {
    env,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    // Líder do próprio grupo de processos, para o stop encerrar a árvore inteira.
    detached: process.platform !== 'win32'
  });
  const log: string[] = [];
  child.stdout?.on('data', d => log.push(String(d)));
  child.stderr?.on('data', d => log.push(String(d)));
  const port = Number(extraEnv.NYROH_PORT || 0);
  return {
    child,
    log,
    stop: async () => {
      stopTree(child);
      if (port) await waitForPortFree(port, 10000);
      else await new Promise(r => setTimeout(r, 400));
    }
  };
}
