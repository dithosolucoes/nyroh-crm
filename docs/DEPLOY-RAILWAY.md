# Deploy do Nyroh CRM na Railway

Este guia lista o que a Railway precisa para subir o CRM com banco e fila reais.
Nenhum valor secreto fica no repositório: as chaves são cadastradas direto em **Variables** na Railway.

## Arquivos de build (já no repositório)

- `railway.json`: builder Nixpacks, comando de start `npm start`, healthcheck em `/health`, reinício automático em falha.
- `nixpacks.toml`: Node 20, ffmpeg (conversão de áudio), `npm ci`, `npm run build`, `npm start`.
- `.nvmrc`: versão do Node (20).
- `.env.example`: modelo com os nomes de todas as variáveis.

## Ordem de configuração

1. **Criar o projeto** na Railway: *New Project > Deploy from GitHub repo* e escolher o repositório e o branch `main`.
2. **Adicionar PostgreSQL**: *New > Database > PostgreSQL*. Depois, no serviço da aplicação, criar a variável `DATABASE_URL` com a referência `${{Postgres.DATABASE_URL}}`.
3. **Adicionar Redis**: *New > Database > Redis*. No serviço da aplicação, criar `REDIS_URL` com `${{Redis.REDIS_URL}}`.
4. **Adicionar um Volume** ao serviço da aplicação para as mídias recebidas (fotos e áudios). A Railway informa o caminho do volume pela variável `RAILWAY_VOLUME_MOUNT_PATH`, que o servidor usa automaticamente.
5. **Cadastrar as variáveis** da lista abaixo em *Variables*.
6. Fazer o deploy e conferir o log: não deve aparecer `[Config]` com ❌.

## Variáveis

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `NODE_ENV` | sim | Use `production`. |
| `DATABASE_URL` | sim | Banco PostgreSQL (referência ao serviço Postgres). |
| `REDIS_URL` | recomendada | Fila durável de webhooks e disparos (referência ao serviço Redis). |
| `ADMIN_INITIAL_PASSWORD` | sim | Senha inicial dos administradores. Troque depois do primeiro login. |
| `FLUXO_KEY` | sim | Chave da FluxoAPI. |
| `FLUXO_SECRET` | sim | Segredo da FluxoAPI. |
| `FLUXO_INSTANCE_ID` | sim | ID da instância na FluxoAPI. |
| `FLUXO_WEBHOOK_SECRET` | sim | Segredo do webhook (`whsec_...`). Sem ele, qualquer requisição é aceita. |
| `APP_PUBLIC_URL` | sim | URL pública `https` da aplicação na Railway. |
| `SEED_DEMO_USERS` | recomendada | Use `false` em produção, para não criar usuários de demonstração. |
| `PG_POOL_MAX` | opcional | Tamanho do pool do Postgres. |
| `MIRROR_EVENTS_URL` / `MIRROR_EVENTS_TOKEN` | opcional | Espelhamento de eventos para outro sistema. |
| `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `META_VERIFY_TOKEN` | opcional | Integração direta com a API oficial da Meta. |
| `GEMINI_API_KEY` | opcional | Recursos de IA. |

## Depois do deploy

- Abrir `https://<seu-dominio>/health`. Deve responder `OK`.
- Trocar a senha das contas de administração.
- Se houver dados a importar de um backup, importar no PostgreSQL da Railway depois que o serviço estiver no ar.
