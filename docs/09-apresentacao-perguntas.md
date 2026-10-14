# 09 — Apresentação: perguntas e respostas

Respostas curtas às perguntas que uma audiência técnica costuma fazer, com o sítio do código ou do
dashboard onde se pode mostrar cada uma.

## "Onde está a IA?"

Em seis tarefas concretas, todas onde há **texto ou ambiguidade** que o código não resolve bem:

| Tarefa | Agente | Onde ver |
|---|---|---|
| O uso previsto escrito pelo cliente é adequado à máquina? | Rental | Agent Activity → execução do Rental Agent → raciocínio e `safetyFlags` |
| Que gravidade tem esta avaria descrita em texto livre? | Maintenance | Avarias "(severity assessed by AI)" |
| Estes relatos diferentes descrevem o mesmo problema recorrente? | Maintenance (monitorização) | Alertas de avaria recorrente |
| Qual é o risco deste cliente, com provas? | Risk | `riskLevel`/`riskScore` no aluguer |
| **Aprovar ou rejeitar, e com que condições?** | **Approval** | AI Decisions |
| Que mensagem escrever ao cliente? | Notification | `customerMessage` no estado do pedido |
| Este registo de cliente parece genuíno? | Onboarding | Agent Activity → "Registration" |
| Responder a perguntas do cliente sobre a máquina | Assistant | Chat nas páginas do QR |

E no passo 1 de cada agente, o **LLM escolhe que ferramentas chamar** (*tool calling*). Isso está visível em
cada trace com `source = LLM`.

## "E onde **não** está a IA? Porquê?"

- **Na ordem do processo.** É política da empresa ("verificar manutenção antes do risco"). Está numa tabela,
  é previsível e testável ([workflow.ts](../backend/src/agents/orchestrator/workflow.ts)).
- **Nas regras de dinheiro.** "O cliente deve dinheiro?" é um facto. O Finance Agent não usa IA, de
  propósito, e mostra que um agente não precisa de IA para ser útil.
- **Nos limites de segurança.** Manutenção vencida, máquina já alugada, cliente bloqueado: regras fixas.
- **Em quem recebe as notificações.** Vem da base de dados, nunca do modelo.

## "Porquê agentes e não um único prompt grande?"

1. **Responsabilidade isolada.** Cada agente tem um objetivo, ferramentas e regras próprias. É mais fácil de
   testar, explicar e mudar.
2. **Permissões mínimas.** O Risk Agent não consegue aprovar; o assistente não consegue escrever nada. Num
   único prompt com todas as ferramentas, um erro ou um *prompt injection* tinha acesso a tudo.
3. **Rastreabilidade.** Cada decisão tem um autor, factos, ferramentas, raciocínio e confiança.
4. **Evolução.** O Finance Agent e depois o Approval Agent foram acrescentados mudando só a tabela de
   transições, sem tocar nos outros agentes.
5. **Modelos pequenos.** Tarefas pequenas e bem delimitadas funcionam com um modelo local de 3B parâmetros
   (`qwen2.5:3b`). Um prompt gigante não funcionaria.

## "Como garantem que a IA não faz asneiras?"

Com o **Policy Guard** e o princípio *"a IA pode restringir, nunca permitir"*
([policyGuard.ts](../backend/src/agents/core/policyGuard.ts)):
- as regras ganham sempre à IA;
- a IA só pode escolher decisões da sua lista;
- confiança abaixo de 0,75, resposta inválida ou falha → restrição;
- certas sinalizações (identidade, dívida, crédito, avarias graves) **nunca** podem ser anuladas.

**Para mostrar:** no cenário 2 (bulldozer com manutenção vencida), o Maintenance Agent consulta a IA **mesmo
com o bloqueio**. Se o modelo disser que está tudo bem, o trace mostra `policyOverride = true`, ou seja, a
regra sobrepôs-se ao modelo.

## "0% humano não é perigoso?"

O desenho é **fail-safe**: na dúvida, rejeita. O erro possível é rejeitar um bom cliente (custo comercial),
nunca entregar uma máquina insegura ou a quem deve dinheiro (custo de segurança ou financeiro). E tudo
fica visível depois: as pessoas veem cada decisão e o seu porquê no dashboard.

Num cenário real, o próximo passo natural seria deixar a IA decidir os casos claros e mandar para uma pessoa
só os casos limite, ou abaixo de um certo valor. A arquitetura já o suporta: o modelo `HumanReview` e a
decisão `ESCALATE` existem.

## "O que acontece se o modelo estiver em baixo?"

- O pedido não é aprovado: o Approval Agent sem resposta válida rejeita.
- As notificações usam um texto fixo; nenhuma se perde.
- Na monitorização, as anomalias **ficam visíveis** em vez de serem descartadas.
- Os pedidos e registos interrompidos são retomados quando o servidor volta.
- Há o fornecedor `mock` para demonstrar sem internet.

## "Como se audita uma decisão?"

Dashboard → **Agent Activity** → abrir o pedido. Cada passo mostra:
- os factos que o agente viu;
- as ferramentas que chamou, com argumentos, resultado, duração e quem decidiu chamá-las (LLM ou política);
- as regras que dispararam;
- o raciocínio e a confiança da IA;
- se o Policy Guard se sobrepôs;
- os tokens gastos.

Na base de dados: `AgentExecution`, `AgentToolCall`, `AuditLog`.

## "Quanto custa correr isto?"

Com **Ollama local**, zero (só a eletricidade), mas é lento em CPU (2–3 min por pedido). Com **Groq**, há um
nível gratuito e é rápido. O dashboard **Statistics** mostra os tokens gastos para estimar o custo com um
fornecedor pago. A maioria dos passos usa poucas centenas de tokens, e o Finance Agent nenhum.

## "Que dados vê o LLM?"

Só os factos que cada agente reúne através das suas ferramentas, e esses factos ficam registados no trace.
**As passwords e os seus hashes nunca são lidos pelas consultas**, por isso nunca chegam ao modelo. Com
Ollama, nada sai da máquina.

## "Como se acrescenta um agente novo?"

Ver [02 — Agentes → Como acrescentar um agente](02-agentes.md#como-acrescentar-um-agente). O Onboarding
Agent, o mais recente, foi feito assim: regras, classe, permissões, um evento e testes.

---

## Limitações atuais (dizer antes que perguntem)

| Limitação | Próximo passo |
|---|---|
| Email e SMS dependem de configuração (SMTP, MozeSMS); sem ela ficam simulados | Integrar pagamentos M-Pesa/e-Mola |
| O levantamento e a devolução da máquina não têm ecrã (`ACTIVE`/`COMPLETED` só nos dados de demonstração) | Fluxo de levantamento e devolução, com a leitura do contador e os danos |
| Os documentos são validados pelo admin, não por fotografia | **Document Agent** com modelo de visão (já reservado no modelo de dados) |
| Event bus em memória | Fila persistente (BullMQ/Redis, SQS) |
| Autenticação básica (sem verificação de email, recuperação de password nem limite de tentativas) | Fornecedor de identidade e *rate limiting*. Ver [07 — Segurança](07-seguranca.md) |
| O LLM local é lento | Modelo maior na cloud ou GPU |
| Sem testes de ponta a ponta automáticos no CI | `run-scenarios.ts` com `mock` num pipeline |

## Guião sugerido para a demonstração (10–15 min)

1. **Contexto** (1 min): o problema e "0% humano com fail-safe".
2. **QR code no telemóvel** (2 min): pedir a EQP-001 como CUS-001 → **aprovado**. Mostrar a página de estado
   a atualizar.
3. **Agent Activity** (3 min): abrir o pedido e mostrar o trace, as ferramentas, a IA e o Policy Guard.
4. **Rejeição por segurança** (2 min): EQP-002 (manutenção vencida) → BLOCK, com a regra a sobrepor-se.
5. **Monitorização** (2 min): **Run monitoring now** → alertas, anomalias e triagem pelo Approval Agent.
6. **Registo de cliente** (2 min): criar uma conta → o Onboarding Agent ativa. Tentar com o NUIT de outra
   empresa → rejeitado.
7. **Perguntas** (com este documento à mão).
