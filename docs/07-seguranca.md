# 07 — Segurança

## Autenticação

| Aspeto | Implementação |
|---|---|
| Passwords | **scrypt** (Node `crypto`) com sal aleatório de 16 bytes, guardado como `salt:hash`. A comparação é em tempo constante (`timingSafeEqual`) |
| Sessão | Token assinado com **HMAC-SHA256**, no formato `base64url(payload).base64url(assinatura)`, semelhante a um JWT mas sem dependências. O payload tem o tipo (`staff`/`customer`), o id, o papel e a expiração |
| Segredo | `AUTH_SECRET` (mínimo 16 caracteres). O valor por omissão serve só para a demonstração local |
| Validade | `AUTH_TOKEN_TTL_HOURS` (12 h por omissão) |
| Revogação | Em cada pedido a API confirma na base de dados que o utilizador está `isActive` ou que a conta do cliente está `ACTIVE`. Desativar um utilizador corta-lhe o acesso no pedido seguinte |
| Separação | Um token de cliente não abre o dashboard e um token da equipa não abre o portal |
| Mensagens | Credenciais erradas devolvem sempre "Invalid email or password", sem dizer se o email existe |

Código: [`utils/auth.ts`](../backend/src/utils/auth.ts),
[`middleware/auth.ts`](../backend/src/middleware/auth.ts),
[`services/auth.service.ts`](../backend/src/services/auth.service.ts).

## Autorização

| Quem | Acesso |
|---|---|
| Público (sem sessão) | Páginas do QR, pedido de aluguer, estado do pedido, assistente, registo e login, imagens dos QR codes |
| Cliente `ACTIVE` | O próprio portal (`/portal`): os seus dados, documentos e pedidos. Pedidos pelo QR com a empresa da conta |
| `OPERATOR` | Todo o dashboard, incluindo criar e editar clientes |
| `ADMIN` | O mesmo que o Operator, mais a gestão de utilizadores e a reposição dos dados de demonstração |

No frontend, as guardas do router só **escondem** o que o utilizador não pode usar. **A API aplica as
mesmas regras em cada chamada**, por isso contornar o frontend não dá acesso a nada.

Regras de proteção nos utilizadores:
- um admin não se pode desativar nem despromover a si próprio, para o sistema nunca ficar sem admin por
  engano;
- as passwords nunca são devolvidas pela API.

## Proteção dos dados sensíveis

- **Os hashes das passwords estão excluídos de todas as consultas por omissão** (opção `omit` no cliente
  Prisma, em `database/prisma.ts`). Só o código de login os pede explicitamente. Assim nunca chegam a
  respostas da API, aos factos de um agente, ao LLM nem aos traces de observabilidade.
- O `.env` (password da base de dados, chaves de API) está no `.gitignore`. O repositório só tem
  `.env.example`.
- O NUIT de um cliente com sessão iniciada vem **da conta** e não do formulário. A API impõe isto mesmo que
  o formulário seja alterado.

## Proteções contra abuso de identidade

| Ameaça | Proteção |
|---|---|
| Alguém faz um pedido pelo QR com o NUIT de outra empresa | O registo existente nunca é alterado; o Risk Agent compara o email com o registado (`identity.contact_mismatch`, **não anulável**) e o pedido é rejeitado |
| Alguém cria uma conta com o NUIT de outra empresa | O Onboarding Agent rejeita se o email não for o registado (`customer.email_mismatch`), e a tentativa não deixa credenciais no registo verdadeiro |
| Contas com email descartável | Rejeitadas por regra |
| Redirecionamento malicioso depois do login (`?redirect=//site-externo`) | Só são aceites caminhos internos (`utils/redirect.ts`) |

## Segurança dos agentes de IA

| Risco | Proteção |
|---|---|
| A IA aprova algo que a política proíbe | **Policy Guard**: as regras ganham sempre; a IA só pode restringir |
| A IA faz algo fora da sua função | **Permissões por agente**: as ferramentas fora da lista são recusadas (`DENIED`) e registadas |
| Resposta da IA malformada, incerta ou ausente | Validação Zod + limiar de confiança; na dúvida o pedido é **rejeitado** |
| *Prompt injection* pelo campo "uso previsto" ou pelo chat | A IA não tem ferramentas para aprovar diretamente; o `confirmRental` só existe no Approval Agent e só depois das regras. O assistente só tem ferramentas de leitura, e a máquina e o pedido são fixados pelo servidor |
| Destinatários manipulados nas notificações | Os destinatários vêm sempre da base de dados, nunca do modelo nem do formulário |
| Linguagem acusatória sobre clientes | *Language guard* no Risk Agent: substitui e regista essas formulações |
| Ciclos infinitos de chamadas a ferramentas | Máximo de 6 iterações por execução |
| Um agente falha | Execução `FAILED`, caso aberto; o Approval Agent rejeita pedidos com verificações incompletas |

## Auditoria

Todas as alterações de estado, logins, registos, decisões e chamadas a ferramentas ficam no `AuditLog` e
no `AgentToolCall`, com o ator (agente, utilizador ou sistema), o antes e o depois, e uma correlação com o
pedido. O dashboard mostra-o em Agent Activity e AI Decisions.

## Limitações conhecidas (antes de produção)

Isto é uma prova de conceito. Antes de expor o sistema na internet seria preciso:

1. **Mudar as contas de demonstração e o `AUTH_SECRET`.** As credenciais de demo estão no código e na
   documentação.
2. **Limitar tentativas** (*rate limiting*) no login, no registo e no assistente. Não existe.
3. **Verificar o email** no registo (link de confirmação). Hoje só o Onboarding Agent valida a coerência dos
   dados.
4. **Recuperação de password** para clientes. Hoje só um admin pode repor a password da equipa.
5. **Tokens:** são guardados no `localStorage` (vulnerável se houver XSS) e não há lista de revogação.
   Em produção: cookies `HttpOnly` + `SameSite`, ou um fornecedor de identidade (Keycloak, Auth0, Entra ID).
6. **CORS** está aberto (`cors()` sem restrições). Deve ficar limitado ao domínio do frontend.
7. **HTTPS** obrigatório (hoje é HTTP local, ou ngrok na demonstração).
8. **Rotas públicas:** o estado de um pedido e de um registo é acessível por id (um `cuid` difícil de
   adivinhar, mas sem sessão). `/public/demo-customers` expõe clientes de demonstração e deve ser removido
   fora da demonstração.
9. **Event bus em memória:** um evento emitido mesmo antes de um reinício perde-se. Os pedidos e registos
   pendentes são retomados no arranque, mas em produção deve ser uma fila persistente.
