/**
 * Testes fixos das regras de UX (sem banco): tamanhos de bloco, motivos, flag e a regra do disparo.
 * Os testes que precisam do banco estão em scripts/qa-tudo.ts.
 *
 * Rodar: npm run test:ux
 */
import { TAMANHOS_BLOCO, MOTIVOS_BLOQUEIO, uxSchemaOn, regraForaDoDisparoSql } from '../shared/lib/uxRoutes.js';

let passou = 0;
let falhou = 0;
const verifica = (nome: string, cond: boolean, detalhe = '') => {
  if (cond) { passou++; console.log(`  ✅ ${nome}`); }
  else { falhou++; console.log(`  ❌ ${nome}${detalhe ? ` — ${detalhe}` : ''}`); }
};

const grupo = (nome: string) => console.log(`\n${nome}`);

grupo('Blocos por ID');
verifica(
  'tamanhos são exatamente 20 … 100.000',
  JSON.stringify([...TAMANHOS_BLOCO]) === JSON.stringify([20, 50, 100, 300, 500, 1000, 5000, 10000, 50000, 100000]),
  JSON.stringify(TAMANHOS_BLOCO)
);

grupo('Motivos de bloqueio');
verifica(
  'motivos fixos existem',
  ['sem_whatsapp', 'pediu_remocao', 'numero_errado', 'ja_atendido', 'outro'].every(k => !!MOTIVOS_BLOQUEIO[k])
);

grupo('Flag de migração');
const antes = process.env.NYROH_APLICAR_MIGRACOES_UX;
delete process.env.NYROH_APLICAR_MIGRACOES_UX;
verifica('desligada quando a variável não existe', uxSchemaOn() === false);
process.env.NYROH_APLICAR_MIGRACOES_UX = 'TRUE';
verifica('"TRUE" em maiúsculas não liga (evita ligar por engano)', uxSchemaOn() === false);
process.env.NYROH_APLICAR_MIGRACOES_UX = 'true';
verifica('"true" exato liga', uxSchemaOn() === true);
if (antes === undefined) delete process.env.NYROH_APLICAR_MIGRACOES_UX; else process.env.NYROH_APLICAR_MIGRACOES_UX = antes;

grupo('Regra do disparo (um contato por dia, bloqueados fora)');
const sql = regraForaDoDisparoSql();
verifica('exclui leads bloqueados', /lb\.blocked_at IS NOT NULL/.test(sql));
verifica('conta contato de disparo de qualquer safra no mesmo dia', /cj\.sent_at IS NOT NULL/.test(sql) && /cj\.id <> campaign_leads\.id/.test(sql));
verifica('conta mensagem do vendedor no mesmo dia', /lm\.sender = 'salesperson'/.test(sql));
verifica('dia é calculado no fuso de São Paulo', (sql.match(/America\/Sao_Paulo/g) || []).length >= 4);
verifica('compara telefone só pelos dígitos nos dois lados', (sql.match(/\[\^0-9\]/g) || []).length >= 4);
verifica('o trecho é só condição (começa com AND)', sql.trim().startsWith('AND NOT EXISTS'));

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exitCode = falhou > 0 ? 1 : 0;
