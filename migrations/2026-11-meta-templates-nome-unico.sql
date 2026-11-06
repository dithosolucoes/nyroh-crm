-- Migração: garante nome único em meta_templates (chave usada por ON CONFLICT (name)).
-- NÃO aplicar em produção sem backup e OK explícito do Thomas.
-- Passo 1 (só leitura): se devolver linhas, há nomes duplicados e o índice NÃO pode ser criado
-- antes de resolver os duplicados. Não apague nada automaticamente.

SELECT name, COUNT(*) AS total
FROM meta_templates
GROUP BY name
HAVING COUNT(*) > 1;

-- Passo 2 (só depois do passo 1 vazio): índice único idempotente.
-- Se a tabela já foi criada com UNIQUE(name) pelo CREATE TABLE do server.ts, este comando é no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_templates_name ON meta_templates (name);
