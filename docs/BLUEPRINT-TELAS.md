# Blueprint de telas do NYROH

Estrutura oficial de navegação. Toda tela nova ou movida segue este mapa.
Baseado em CRMs de vendas (Pipedrive: pipeline como centro) e em boas práticas de disparo no WhatsApp (opt-in, qualidade visível, janela de 24 horas, cadência de até 8 toques).

## Barra superior (sempre visível)

- Busca global (⌘K)
- Seletor de marca ativa
- Botão "Nova ação"
- Perfil e sair

## Menu lateral (6 grupos)

| # | Grupo | Admin vê | Vendedor vê |
|---|-------|----------|-------------|
| 1 | Hoje | Resumo da operação e alertas | Tarefas do dia, próximas ações, respostas novas |
| 2 | Pipeline | Kanban, lista, previsão | Kanban, lista (só a própria carteira) |
| 3 | Conversas | Caixa compartilhada de todos | Só as próprias conversas |
| 4 | Leads | Todos, remessas, blocos, bloqueados, aprovações | Só os próprios |
| 5 | Disparos | Campanhas, nova campanha, acompanhamento, quarentena | Não aparece |
| 6 | Configurações | Marcas, números, equipe, relatórios, auditoria, integrações | Só perfil e senha |

## Subtelas por grupo

### 1. Hoje
- Visão do vendedor: tarefas vencidas, próximas ações do dia, respostas não lidas.
- Visão do admin: indicadores da operação, qualidade dos números, bloqueios pendentes, disparos com falha.

### 2. Pipeline
- Kanban (padrão). Colunas: Novos, Em tentativas, Interessados, Fechados, Perdidos.
- Lista: mesma carteira em tabela, com filtros.
- Previsão (admin): valor e conversão por etapa e por vendedor.

### 3. Conversas
- Caixa compartilhada do WhatsApp.
- Indicador de janela de 24 horas aberta ou fechada.
- Aviso de "precisa de template" quando a janela está fechada.

### 4. Leads
- Todos os leads.
- Remessas (upload de origem).
- Blocos salvos por ID.
- Bloqueados.
- Aprovações pendentes de bloqueio.
- Importar (ZIP e CSV).

### 5. Disparos
- Campanhas (lista).
- Nova campanha em 3 passos: público, mensagem e número, revisão e envio.
- Acompanhamento: entregue, lido, respondido, falhou (com motivo).
- Quarentena.

### 6. Configurações
- Marcas: serviços, safras, modelos de mensagem.
- Números: status de qualidade, limite diário, instância.
- Equipe: vendedores, carteiras, distribuição, roleta.
- Relatórios.
- Auditoria (caixa-preta de logs).
- Integrações: Meta e Fluxo.
- Perfil e senha.

## Regras de UX (valem em todas as telas)

1. Um único "próximo passo" visível por lead.
2. Badges "já contatado hoje" e "bloqueado" aparecem onde o lead aparece, inclusive na seleção de disparo.
3. Linha do tempo do lead junta ligações, mensagens e bloqueios.
4. Contador de toques por lead. Aviso ao chegar em 8.
5. Vendedor nunca vê leads de outra carteira.
6. Toda ação destrutiva pede confirmação e fica na auditoria.

## Mapeamento do que existe hoje

| Hoje | Novo lugar |
|------|-----------|
| Cockpit Geral | Hoje (admin) e Relatórios |
| Kanban | Pipeline |
| Tabela | Pipeline > Lista |
| Meu dia | Hoje (vendedor) |
| Aba WhatsApp e WhatsApp Oficial (Fluxo) | Conversas |
| Disparos & Campanhas | Disparos |
| Estrutura > Central | Leads |
| Estrutura > Bloqueios | Leads > Bloqueados e Aprovações |
| Estrutura > Marcas | Configurações > Marcas |
| Estrutura > Números | Configurações > Números |
| Gestão da Equipe | Configurações > Equipe |
| Divisão de Carteiras | Configurações > Equipe (uma só tela) |
| Todos os Closers | Configurações > Equipe (uma só tela) |
| Caixa-Preta de Logs | Configurações > Auditoria |
| Dashboard | Relatórios |

## Fora deste blueprint

- Telas de conexão e login (`LoginScreen`).
- Modais de ação rápida (respostas rápidas, tags, QR code, trocar senha): continuam como modais, abertos a partir de qualquer grupo.
