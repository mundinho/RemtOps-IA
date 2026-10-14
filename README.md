# RentOps AI — Operações de Aluguer de Equipamento com Agentes de IA

Prova de conceito de um sistema de aluguer de equipamento de construção (Moçambique, valores em **MZN**)
operado de ponta a ponta por **agentes de IA**, sem decisões humanas. O cliente lê o QR code da máquina
e faz o pedido. A partir daí os agentes verificam disponibilidade, manutenção, documentos, risco e
pagamentos, e um **Approval Agent** toma a decisão final. As pessoas só **observam** no dashboard o que os
agentes fizeram, porquê e com que dados.

> **0% de decisões humanas, com fail-safe.** Quando a IA não tem confiança suficiente, falha ou dá uma
> resposta inválida, o pedido é **rejeitado**. O sistema nunca aprova na dúvida.

---

## O que o sistema faz

| Área | Funcionalidade |
|---|---|
| **Pedido por QR code** | Página móvel por máquina: dados da empresa (NUIT), datas, uso previsto, método de pagamento (M-Pesa, e-Mola, transferência, cartão, numerário) |
| **Workflow de agentes** | Orchestrator → Rental → Maintenance → Risk → Finance → **Approval** → Billing → Notification |
| **Monitorização proativa** | Ciclo periódico (15 min por omissão) em que os agentes procuram problemas sem que ninguém peça: manutenção vencida, pagamentos em atraso, devoluções em falta, anomalias |
| **Assistente de cliente** | Chatbot nas páginas do QR que responde só com dados reais (disponibilidade, preços, documentos, estado do pedido). Não pode decidir nada |
| **Contas de cliente** | Autorregisto validado por um **Onboarding Agent**, portal do cliente e formulário do QR pré-preenchido |
| **Dashboard da equipa** | Login com papéis (Admin / Operator): atividade dos agentes, decisões da IA, alertas, alugueres, clientes, frota, manutenção, finanças, estatísticas, etiquetas QR, utilizadores |
| **Pagamentos M-Pesa** | Quem escolhe M-Pesa paga o sinal antes de enviar o pedido (PIN no telemóvel); pedidos recusados aparecem nas Finanças para reembolso |
| **Relatórios** | Financeiro, Alugueres, Frota e manutenção, Agentes de IA — por período, no ecrã, em Excel (CSV) e PDF |
| **Rastreabilidade** | Cada execução de agente, cada ferramenta chamada (incluindo as recusadas), cada decisão e cada alteração de estado ficam registadas e visíveis |

## Onde está a IA (e onde não está)

A regra de desenho é **"a IA pode tornar uma decisão mais restritiva, nunca mais permissiva"**.

- **Regras determinísticas** (código) decidem o que é facto ou política: disponibilidade, datas, manutenção
  vencida, dívidas, limite de crédito, documentos em falta, utilizadores bloqueados.
- **A IA (LLM)** atua onde há texto ou ambiguidade:
  - avaliar se o uso descrito pelo cliente é adequado à máquina;
  - classificar avarias descritas em texto livre;
  - pesar o risco de um cliente;
  - tomar a decisão final com condições;
  - escrever as mensagens ao cliente;
  - validar registos de clientes.
- O **Policy Guard** junta as duas: as regras ganham sempre, e a IA só pode escolher decisões da sua lista
  autorizada e acima de um limiar de confiança.

Mais detalhe em [docs/09-apresentacao-perguntas.md](docs/09-apresentacao-perguntas.md).

## Arranque rápido

Requisitos: **Node.js 22+** (testado com a 24), **PostgreSQL 16** e um LLM compatível com a API da OpenAI (por exemplo
**Ollama** local, que é gratuito) ou o fornecedor `mock` para correr offline.

```powershell
# 1. Backend
cd backend
npm install
copy .env.example .env          # edita DATABASE_URL e o LLM
npm run db:migrate              # cria as tabelas
npm run db:seed                 # dados de demonstração + contas
npm run dev                     # API em http://localhost:3000/api

# 2. Frontend (noutro terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Também podes arrancar as duas partes de uma vez (abre duas janelas e o browser):

```powershell
powershell -ExecutionPolicy Bypass -File .\start-demo.ps1
```

Guia completo, variáveis de ambiente e resolução de problemas:
[docs/08-instalacao-e-operacao.md](docs/08-instalacao-e-operacao.md).

### Contas de demonstração

| Quem | Onde | Email | Password |
|---|---|---|---|
| Admin | `/login` | admin@demo.local | admin123 |
| Operador | `/login` | operador@demo.local | operador123 |
| Cliente CUS-001 (Construções Silva) | `/client/login` | joao.silva@construcoessilva.co.mz | cliente123 |

> As contas de demonstração existem só para a apresentação. Muda-as (e a variável `AUTH_SECRET`) antes de
> expor o sistema fora da máquina local.

## Documentação

| Documento | Conteúdo |
|---|---|
| [01 — Arquitetura](docs/01-arquitetura.md) | Componentes, tecnologia, estrutura de pastas, eventos |
| [02 — Agentes](docs/02-agentes.md) | O ciclo de cada agente, o Policy Guard, cada agente em detalhe, as permissões de ferramentas |
| [03 — Fluxos](docs/03-fluxos.md) | Pedido de aluguer (máquina de estados), ciclo de monitorização, registo de cliente, assistente |
| [04 — Regras de negócio](docs/04-regras-de-negocio.md) | Todas as regras, limiares e o que acontece quando disparam |
| [05 — API](docs/05-api.md) | Todos os endpoints, autenticação e exemplos |
| [06 — Modelo de dados](docs/06-modelo-de-dados.md) | Tabelas, estados e relações |
| [07 — Segurança](docs/07-seguranca.md) | Autenticação, papéis, proteções e limitações conhecidas |
| [08 — Instalação e operação](docs/08-instalacao-e-operacao.md) | Instalação, configuração, scripts, cenários de demonstração, problemas comuns |
| [09 — Apresentação: perguntas e respostas](docs/09-apresentacao-perguntas.md) | "Onde está a IA?", "Porquê agentes?", limitações, próximos passos |

## Tecnologia

**Frontend:** Vue 3, TypeScript, Vite, Vue Router e Tailwind CSS 4.
**Backend:** Node.js, Express 5, TypeScript, Prisma 6, PostgreSQL 16 e Zod.
**IA:** qualquer API compatível com OpenAI (Ollama `qwen2.5:3b` local, Groq, OpenRouter) ou o fornecedor
`mock` determinístico.
**Testes:** Vitest (regras de negócio e Policy Guard).
