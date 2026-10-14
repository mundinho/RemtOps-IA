# 05 — API

Base: `http://localhost:3000/api` (no frontend, o Vite encaminha `/api` para aqui).
Tudo é JSON. As rotas estão em [`backend/src/routes/index.ts`](../backend/src/routes/index.ts).

## Autenticação

Envia o token no cabeçalho:

```
Authorization: Bearer <token>
```

| Tipo de rota | Exigência |
|---|---|
| Públicas | Nenhuma |
| Portal do cliente | Token de **cliente** com conta `ACTIVE` |
| Dashboard | Token de **equipa** com utilizador ativo |
| Só admin | Token de equipa com papel `ADMIN` |

O token tem validade de 12 horas (`AUTH_TOKEN_TTL_HOURS`). Em cada pedido a API volta a verificar na base
de dados se o utilizador continua ativo, ou se a conta do cliente continua `ACTIVE`.

## Erros

```json
{ "error": "Validation failed", "details": { "taxId": ["NUIT must have 9 digits"] } }
```

| Código | Quando |
|---|---|
| `400` | Dados inválidos (`details` traz os erros por campo) |
| `401` | Sem sessão, token inválido ou expirado, ou utilizador desativado (`Sign in required`) |
| `403` | Papel sem permissão, ou conta de cliente pendente ou rejeitada (no login) |
| `404` | Não encontrado |
| `409` | Conflito: NUIT ou email já registado, ciclo de monitorização já a correr |
| `500` | Erro interno |

> Qualquer rota inexistente abaixo de `/api` devolve `401` a quem não tem sessão, porque a guarda da equipa
> se aplica antes da resposta `404`.

---

## Rotas públicas

| Método | Caminho | Descrição |
|---|---|---|
| GET | `/health` | Estado da API e do LLM em uso: `{ status, llm: { provider, model } }` |
| GET | `/public/equipment/:code` | Dados públicos da máquina (`code` = `EQP-001`…) |
| POST | `/public/equipment/:code/rental-requests` | Cria um pedido de aluguer (**202**). Com token de cliente, a empresa e o NUIT vêm da conta. Com `paymentMethod: "MPESA"` exige `mpesaCheckoutId` de um pagamento confirmado, desta máquina, para as mesmas datas e ainda não usado |
| POST | `/public/equipment/:code/assistant` | Mensagem para o assistente (chat) |
| GET | `/public/rental-requests/:id` | Estado do pedido para o cliente, incluindo o sinal M-Pesa (`mpesa`) |
| POST | `/public/equipment/:code/mpesa-checkout` | **Pagamento M-Pesa, disparado quando o cliente toca na opção M-Pesa**: o formulário do QR + `mpesaPhone` (Vodacom 84/85). Valida o formulário (se for inválido não cobra nada), cobra o sinal (PIN no telemóvel) e responde logo `202` com `checkoutId`. Não cria o pedido |
| GET | `/public/mpesa-checkouts/:id` | Estado do pagamento: `PENDING`, `SUCCESS` ou `FAILED` (com o motivo); `rentalId` depois de submetido |
| GET | `/public/demo-customers` | Clientes de demonstração (ajuda da apresentação no formulário do QR) |
| GET | `/equipment/:code/qr` | Imagem PNG do QR code (pública porque um `<img>` não envia token) |

### Criar pedido de aluguer

```http
POST /api/public/equipment/EQP-001/rental-requests
Content-Type: application/json

{
  "companyName": "Construções Silva, Lda",
  "taxId": "400123456",
  "contactName": "João Silva",
  "email": "joao.silva@construcoessilva.co.mz",
  "phone": "+258 84 123 4567",
  "country": "MZ",
  "paymentMethod": "MPESA",
  "startDate": "2026-10-20",
  "endDate": "2026-10-26",
  "intendedUse": "Escavação de fundações para um prédio de 3 andares"
}
```

Resposta `202 Accepted`:

```json
{
  "id": "cmv…",
  "code": "RNT-2026-0012",
  "status": "REQUESTED",
  "customerCode": "CUS-001",
  "newCustomer": false,
  "statusUrl": "/api/public/rental-requests/cmv…"
}
```

A decisão é tomada de forma assíncrona pelos agentes. Consulta `statusUrl` até o estado ser final.

### Assistente

```http
POST /api/public/equipment/EQP-001/assistant
{ "messages": [ { "role": "user", "content": "Está livre na próxima semana?" } ], "rentalId": "opcional" }
```

`messages`: 1 a 12 mensagens (`user`/`assistant`, até 600 caracteres cada), e a última tem de ser do
utilizador. Resposta: `{ "reply": "...", "toolsUsed": ["checkDatesAvailability", ...] }`.

---

## Autenticação e registo

| Método | Caminho | Descrição |
|---|---|---|
| POST | `/auth/staff/login` | Login da equipa: `{ email, password }` → `{ token, expiresAt, user }` |
| GET | `/auth/staff/me` | Utilizador da sessão (exige token da equipa) |
| POST | `/auth/customer/login` | Login do cliente: `{ email, password }` → `{ token, expiresAt, customer }`. **403** se a conta estiver pendente ou rejeitada (com o motivo) |
| POST | `/auth/customer/register` | Autorregisto (**202**) → `{ registrationId, status: "PENDING", statusUrl }` |
| GET | `/auth/customer/registrations/:id` | Estado do registo: `{ companyName, email, status, reason }` |

```http
POST /api/auth/customer/register
{
  "companyName": "Construtora Maputo Norte, Lda",
  "taxId": "400777555",
  "contactName": "Helena Cossa",
  "email": "helena.cossa@maputonorte.co.mz",
  "phone": "+258 84 555 6677",
  "password": "pelo-menos-8"
}
```

O `status` passa de `PENDING` a `ACTIVE` ou `REJECTED` quando o Onboarding Agent decide.

## Portal do cliente (token de cliente)

| Método | Caminho | Descrição |
|---|---|---|
| GET | `/portal` | `{ profile, documents, rentals }`: dados da empresa, documentos registados e os pedidos do cliente |

---

## Dashboard (token de equipa)

### Visão geral e estatísticas
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/dashboard/overview` | Indicadores, atividade recente e contagens para o menu |
| GET | `/dashboard/statistics` | Estatísticas: pedidos, taxa de aprovação, receita, tempo de decisão, tokens |

### Frota e alugueres
| Método | Caminho | Parâmetros | Descrição |
|---|---|---|---|
| GET | `/equipment` | — | Lista da frota com o estado de manutenção e o aluguer atual |
| GET | `/equipment/:code` | — | Detalhe de uma máquina |
| GET | `/rentals` | `status`, `limit` (1–200, por omissão 100) | Lista de alugueres |
| GET | `/rentals/:id` | — | Detalhe do aluguer: cliente, máquina, decisão e condições, casos, notificações e alertas. As execuções dos agentes estão em `/agent-executions?correlationId=<id>` |

### Observabilidade dos agentes
| Método | Caminho | Parâmetros | Descrição |
|---|---|---|---|
| GET | `/agent-executions` | `agent`, `correlationId`, `limit` (1–200, 50) | Feed de atividade |
| GET | `/agent-executions/:id` | — | Trace: ferramentas, raciocínio, confiança, tokens |
| GET | `/cases` | `status` (`PENDING`/`APPROVED`/`REJECTED`) | Casos sinalizados e o que a IA decidiu (só leitura) |
| GET | `/alerts` | `status` (`OPEN`/`ACKNOWLEDGED`/`RESOLVED`) | Alertas |
| GET | `/notifications` | — | Notificações (simuladas) |
| GET | `/audit-logs` | `entityType`, `entityId`, `correlationId`, `limit` (1–500, 100) | Registo de auditoria |

### Finanças, manutenção e monitorização
| Método | Caminho | Parâmetros | Descrição |
|---|---|---|---|
| GET | `/payments` | `status` (`PENDING`/`PAID`/`OVERDUE`/`CANCELLED`) | Pagamentos |
| GET | `/finance/summary` | — | Totais financeiros |
| GET | `/maintenance-orders` | `status` (`OPEN`/`SCHEDULED`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED`) | Ordens de manutenção |
| GET | `/reports/:type` | `from`, `to` (AAAA-MM-DD, obrigatórios) | Relatório `financial`, `rentals`, `fleet` ou `agents`: `{ kpis, breakdowns, table }` |
| GET | `/refunds` | — | Sinais M-Pesa de pedidos recusados ou cancelados: a reembolsar e já reembolsados |
| POST | `/refunds/:id/mark-refunded` | `{ note? }` | Regista que o financeiro devolveu o sinal no portal M-Pesa (auditado com o nome) |
| POST | `/monitoring/run` | — | Inicia um ciclo de monitorização (**202**; **409** se já houver um a correr) |
| GET | `/monitoring/status` | — | `{ running, lastCycle }` |

### Clientes (equipa)
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/customers` | Lista com documentos, número de alugueres e estado da conta do portal |
| POST | `/customers` | Regista um cliente com os documentos verificados |
| PUT | `/customers/:id` | Atualiza um cliente e os seus documentos |

```http
POST /api/customers
{
  "companyName": "Obras do Sul, Lda",
  "taxId": "400555111",
  "contactName": "Marta Uamusse",
  "email": "marta@obrasdosul.co.mz",
  "phone": "+258 82 111 2233",
  "creditLimit": 2000000,
  "notes": "",
  "documents": [
    { "type": "ID_DOCUMENT", "documentNumber": "ID-123", "expiresAt": "2028-01-01" },
    { "type": "INSURANCE_CERTIFICATE", "documentNumber": "INS-9", "expiresAt": "2027-06-30" }
  ]
}
```

### Utilizadores e demo (só `ADMIN`)
| Método | Caminho | Descrição |
|---|---|---|
| GET | `/users` | Lista da equipa (sem passwords) |
| POST | `/users` | Cria: `{ name, email, role: "ADMIN" \| "OPERATOR", password }` |
| PATCH | `/users/:id` | Altera `{ role?, isActive?, password? }`. Um admin não se pode desativar nem despromover a si próprio |
| POST | `/demo/reset` | **Apaga tudo** e repõe os dados de demonstração e as contas |

---

## Exemplo completo com `curl`

```bash
API=http://localhost:3000/api

# login da equipa
TOKEN=$(curl -s -X POST $API/auth/staff/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.local","password":"admin123"}' | sed -E 's/.*"token":"([^"]*)".*/\1/')

# últimas decisões do Approval Agent
curl -s "$API/agent-executions?agent=APPROVAL&limit=5" -H "Authorization: Bearer $TOKEN"

# correr a monitorização agora
curl -s -X POST $API/monitoring/run -H "Authorization: Bearer $TOKEN"
```
