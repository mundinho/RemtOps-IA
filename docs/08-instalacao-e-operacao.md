# 08 — Instalação e operação

## Requisitos

| Componente | Versão | Notas |
|---|---|---|
| Node.js | 22 ou superior (testado com a 24) | Exigido pelo Vite 8 |
| PostgreSQL | 16 | Instalação local, sem Docker |
| LLM | Um dos seguintes | **Ollama** (local, grátis), **Groq** (cloud, grátis com limites, rápido), **OpenRouter**, ou `mock` (offline) |

## 1. Base de dados

Cria a base de dados no PostgreSQL:

```sql
CREATE DATABASE equipment_rental;
```

## 2. Backend

```powershell
cd backend
npm install
copy .env.example .env
```

Edita o `.env` (pelo menos `DATABASE_URL` e o bloco do LLM) e depois:

```powershell
npm run db:migrate     # aplica as migrações (cria as tabelas)
npm run db:seed        # dados de demonstração + contas de demonstração
npm run dev            # API em http://localhost:3000/api (reinicia ao gravar ficheiros)
```

Confirma que está a responder: abre `http://localhost:3000/api/health`.

## 3. Frontend

```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173
```

## 4. Arranque rápido (Windows)

Na raiz do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-demo.ps1
```

Abre uma janela para a API e outra para o frontend, inicia o **ngrok** se estiver instalado (para os QR
codes funcionarem em qualquer rede) e abre o browser no dashboard.

> **Corre o script só uma vez.** Se o correres de novo sem fechar as janelas anteriores, ficas com duas
> APIs e dois frontends a correr ao mesmo tempo.

## Variáveis de ambiente (`backend/.env`)

| Variável | Por omissão | Descrição |
|---|---|---|
| `DATABASE_URL` | — (obrigatória) | `postgresql://postgres:PASSWORD@localhost:5432/equipment_rental?schema=public` |
| `PORT` | `3000` | Porta da API |
| `FRONTEND_URL` | `http://localhost:5173` | Base dos links dos QR codes (a API deteta o URL do ngrok automaticamente) |
| `LLM_PROVIDER` | `mock` | `mock` ou `openai-compatible` |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | Endpoint compatível com OpenAI |
| `LLM_API_KEY` | vazio | Chave da API (no Ollama, qualquer valor) |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | Modelo |
| `LLM_VISION_MODEL` | `qwen2.5vl:3b` | Reservado para o Document Agent |
| `LLM_TIMEOUT_MS` | `120000` | Tempo máximo por chamada ao modelo |
| `MONITORING_INTERVAL_MS` | `900000` (15 min) | Intervalo do ciclo de monitorização; `0` desliga o agendador |
| `AUTH_SECRET` | segredo de demonstração | Assina os tokens de sessão. **Muda-o fora da máquina local** (mínimo 16 caracteres) |
| `AUTH_TOKEN_TTL_HOURS` | `12` | Validade da sessão |
| `EMAIL_PROVIDER` | `simulated` | `simulated` ou `smtp` (com `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`) |
| `OPERATIONS_EMAIL` | vazio | Se definido, as notificações para a operação também seguem por email |
| `SMS_PROVIDER` | `simulated` | `simulated` ou `mozesms` (gateway moçambicano MozeSMS) |
| `MOZESMS_API_KEY` / `MOZESMS_API_SECRET` | vazio | Chaves do painel MozeSMS (**nunca no Git**) |
| `SMS_SENDER_ID` | vazio | Remetente aprovado pela MozeSMS; vazio = "MozeSMS" |
| `SMS_ALLOWLIST` | vazio | Números separados por vírgulas; se definido, só estes recebem SMS reais |
| `MPESA_PROVIDER` | `simulated` | `simulated` (nenhum dinheiro se move), `emedx` (cobranças reais pelo gateway **Emedx Pay**) ou `vodacom` (conta M-Pesa própria) |
| `EMEDX_CLIENT_KEY` / `EMEDX_CLIENT_SECRET` | vazio | Credencial gerada no painel manage.payments.emedx.co.mz → Chaves de API (**nunca no Git**) |
| `MPESA_API_KEY` / `MPESA_PUBLIC_KEY` | vazio | Chave da API e chave pública do portal developer.mpesa.vm.co.mz (**nunca no Git**) |
| `MPESA_SERVICE_PROVIDER_CODE` | vazio | Shortcode da organização que recebe o dinheiro |
| `MPESA_DEPOSIT_PERCENT` / `MPESA_MAX_AMOUNT` | `10` / `0` | Sinal cobrado por M-Pesa (% do total) e limite opcional por transação (MZN) |

### Escolher o LLM

**Ollama (local, grátis):**
```powershell
ollama pull qwen2.5:3b
```
```env
LLM_PROVIDER="openai-compatible"
LLM_BASE_URL="http://localhost:11434/v1"
LLM_API_KEY="ollama"
LLM_MODEL="qwen2.5:3b"
LLM_TIMEOUT_MS=120000
```
Em CPU é lento: cerca de 2–3 minutos por pedido aprovado, porque vários agentes chamam o modelo.

**Groq (cloud, rápido, bom para apresentar ao vivo):**
```env
LLM_PROVIDER="openai-compatible"
LLM_BASE_URL="https://api.groq.com/openai/v1"
LLM_API_KEY="gsk_..."
LLM_MODEL="llama-3.3-70b-versatile"
```

**Mock (sem internet nem modelo):**
```env
LLM_PROVIDER="mock"
```
As regras, as permissões, o Policy Guard e a auditoria funcionam exatamente igual. A "IA" responde sempre
de forma benigna.

Para testar a ligação ao modelo:
```powershell
npx tsx scripts/llm-smoke-test.ts EQP-002
```

## Scripts do backend

| Comando | O que faz |
|---|---|
| `npm run dev` | API em modo de desenvolvimento (reinicia ao gravar) |
| `npm run build` / `npm start` | Compila para `dist/` / corre a versão compilada |
| `npm run typecheck` | Verificação de tipos |
| `npm test` | Testes das regras de negócio e do Policy Guard (Vitest) |
| `npm run db:migrate` | Cria e aplica migrações (`prisma migrate dev`; interativo) |
| `npm run db:seed` | Repõe os dados de demonstração (**apaga os dados atuais**) |
| `npm run db:reset` | Apaga a base de dados, aplica as migrações e o seed |
| `npm run db:studio` | Prisma Studio: ver e editar dados no browser |
| `npm run auth:demo-accounts` | Cria ou atualiza as contas de demonstração **sem apagar dados** |
| `npx tsx scripts/run-scenarios.ts` | Corre os 8 cenários de demonstração de ponta a ponta (ver abaixo) |
| `npx tsx scripts/try-assistant.ts EQP-001` | Faz algumas perguntas ao assistente de cliente |
| `npm run mpesa:test` | Mostra o gateway M-Pesa e o saldo; `npm run mpesa:test -- 84XXXXXXX 1` cobra 1 MZN a esse número (PIN no telemóvel) |
| `npm run sms:test` | Mostra o fornecedor de SMS e o saldo (não envia nada); `npm run sms:test -- 2588…` envia 1 SMS de teste |

## Dados e cenários de demonstração

O seed cria 10 máquinas, clientes com históricos diferentes e alugueres passados, com datas relativas a
"hoje", para os cenários funcionarem sempre que se corre a demonstração.

`scripts/run-scenarios.ts` envia estes pedidos pelo Orchestrator real e confirma o resultado:

| # | Cenário | Máquina | Cliente | Resultado esperado |
|---|---|---|---|---|
| 1 | Tudo em ordem | EQP-001 Escavadora | CUS-001 | **Aprovado** |
| 2 | Manutenção vencida (o estado diz disponível) | EQP-002 Bulldozer | CUS-001 | Rejeitado (BLOCK) |
| 3 | Seguro expirado + atrasos + fatura por pagar | EQP-003 Gerador | CUS-002 | Rejeitado (regra não anulável) |
| 4 | Máquina já alugada | EQP-004 Grua | CUS-001 | Rejeitado |
| 5 | Pagamento em atraso | EQP-003 Gerador | CUS-003 | Rejeitado (regra não anulável) |
| 6 | Cliente novo sem documentos | EQP-003 | novo | A IA decide |
| 7 | NUIT conhecido com outro email | EQP-001 | CUS-001 | Rejeitado (regra não anulável) |
| 8 | Numerário acima do limite | EQP-001 | CUS-001 | A IA decide |

```powershell
# pára a API antes, para não haver dois Orchestrators a processar os mesmos pedidos
npx tsx scripts/run-scenarios.ts               # usa o LLM do .env
$env:LLM_PROVIDER="mock"; npx tsx scripts/run-scenarios.ts
npx tsx scripts/run-scenarios.ts --no-reset    # mantém os dados atuais
```

O ciclo de monitorização sobre os dados de demonstração encontra, entre outros:
- EQP-007 acima do limite de horas;
- EQP-005 a 95% do limite, com avarias hidráulicas recorrentes;
- EQP-008 a terminar amanhã com 25 000 MZN em dívida;
- EQP-009 não devolvida;
- EQP-010 "alugada" sem aluguer;
- uma leitura impossível de 28 h/dia na EQP-001;
- o padrão de atrasos do CUS-002.

### Repor a demonstração

- Pelo dashboard, como Admin: botão **Reset demo** na página **QR Labels** (`POST /api/demo/reset`).
- Pela linha de comandos: `npm run db:seed`.

As duas formas **apagam tudo**, incluindo contas criadas e pedidos, e recriam as contas de demonstração.
Como os utilizadores são recriados, **tens de voltar a fazer login** depois da reposição.

## Testar num telemóvel real

- **Mesma rede Wi-Fi:** o Vite aceita ligações da rede local. Abre `http://<IP-do-PC>:5173/equipment/EQP-001`
  (o IP vê-se com `ipconfig`).
- **Qualquer rede:** com o **ngrok** instalado, `start-demo.ps1` abre um túnel para a porta 5173. Os QR codes
  impressos a partir de **QR Labels** apontam para esse endereço.
- No computador: F12 → **Ctrl+Shift+M** (modo dispositivo) → escolhe um telemóvel.

## Páginas

| Página | Quem | Endereço |
|---|---|---|
| Login da equipa | Equipa | `/login` |
| Dashboard | Equipa | `/dashboard` (Overview, Statistics, Agent Activity, AI Decisions, Alerts, Rentals, Customers, Equipment, Maintenance, Finance, QR Labels, Users*) |
| Pedido pelo QR | Público | `/equipment/EQP-001` |
| Estado do pedido | Público | `/requests/:id` |
| Login do cliente | Cliente | `/client/login` |
| Registo de cliente | Cliente | `/client/register` |
| Portal do cliente | Cliente | `/client` |

\* Users só aparece para o Admin.

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| `EPERM: operation not permitted, rename ... query_engine-windows.dll.node` ao correr `prisma generate` | A API está a correr e bloqueia o ficheiro do Prisma (Windows) | Pára a API, corre `npx prisma generate` e arranca-a de novo |
| `prisma migrate dev` diz *non-interactive environment* | Corrido por uma ferramenta ou script sem terminal interativo | Corre-o num terminal normal, ou aplica as migrações existentes com `npx prisma migrate deploy` |
| `EADDRINUSE :3000` / `:5173` | Já há uma instância a correr (por exemplo, `start-demo.ps1` corrido duas vezes) | Fecha as janelas antigas ou termina os processos `node` em excesso |
| O dashboard pede login de repente | Sessão expirada (12 h), utilizador desativado ou `AUTH_SECRET` mudado | Volta a fazer login |
| Um pedido fica muito tempo em "Agents reviewing" | LLM local em CPU (lento) ou modelo inacessível | Espera (Ollama em CPU: 2–3 min); confirma o modelo em `/api/health`; usa Groq ou `mock` |
| Muitos pedidos rejeitados por "No confident AI approval" | O modelo responde com pouca confiança ou JSON inválido | É o fail-safe a funcionar. Um modelo maior (Groq, `llama-3.3-70b`) responde melhor |
| O registo de cliente fica em "Validating…" | O LLM está lento ou a API reiniciou a meio | Espera; os registos pendentes são retomados no arranque |
| Erro *Invalid environment configuration* no arranque | Uma variável do `.env` falta ou é inválida | A mensagem indica qual; compara com `.env.example` |
| Os acentos aparecem estragados depois de editar um ficheiro no PowerShell | `Get-Content`/`Set-Content` mudam a codificação | Edita no editor (VS Code) ou usa `-Encoding utf8` |
