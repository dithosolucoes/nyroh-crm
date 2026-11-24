import fs from 'fs';
import path from 'path';

/**
 * Pasta do front compilado que o servidor serve em produção.
 * Saída própria do front: apps/web/dist. `dist/` fica como reserva para builds antigos.
 */
export function caminhoFrontCompilado(cwd: string): string {
  const candidatos = [path.resolve(cwd, 'apps/web/dist'), path.resolve(cwd, 'dist')];
  return candidatos.find((p) => fs.existsSync(path.join(p, 'index.html'))) ?? candidatos[0];
}
