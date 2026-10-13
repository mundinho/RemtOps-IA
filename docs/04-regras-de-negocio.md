# 04 — Regras de negócio

Todas as decisões **de política** são código determinístico, testado, e não opinião da IA. Os limiares estão
num só ficheiro, [`backend/src/config/businessRules.ts`](../backend/src/config/businessRules.ts). Cada
agente tem as suas regras em `agents/<agente>/rules.ts`, e os testes estão em
[`backend/tests/rules.test.ts`](../backend/tests/rules.test.ts).

## Efeito de cada decisão

| Decisão | Significado | Efeito no workflow |
|---|---|---|
| `PROCEED` / `APPROVE` | Sem objeções | Avança |
| `ESCALATE` | **Sinalização**: há algo a pesar | Avança; o Approval Agent decide no fim |
| `REJECT` | Política impede o pedido | Termina: pedido `REJECTED` |
| `BLOCK` | Máquina não pode sair (segurança) | Termina: pedido `REJECTED` |

## Limiares

| Parâmetro | Valor | Usado por |
|---|---|---|
| `maxRentalDays` | 90 dias | Rental Agent |
| `humanApprovalValueThreshold` | 1 500 000 MZN | Risk Agent (sinaliza alugueres de valor alto) |
| `maxCashPayment` | 250 000 MZN | Finance Agent |
| `minLlmConfidence` | 0,75 | Policy Guard: abaixo disto, uma decisão permissiva da IA não é aceite |
| `maxAgentSteps` | 6 | Máximo de iterações de chamadas a ferramentas por execução |
| `alwaysRequiredDocuments` | Documento de identificação + certificado de seguro | Risk Agent |
| `operatorLicenseDocument` | Licença de operador (só para máquinas que a exigem) | Risk Agent |
| `history.maxLateReturnsBeforeReview` | 1 | Risk Agent: mais de 1 atraso leva a sinalização |
| `history.maxDamageIncidentsBeforeReview` | 1 | Risk Agent: mais de 1 dano leva a sinalização |
| `monitoring.serviceHoursWarningRatio` | 0,9 (90%) | Maintenance (monitorização) |
| `monitoring.serviceDueSoonDays` | 14 dias | Maintenance (monitorização) |
| `monitoring.recurringIssueWindowDays` / `MinReports` | 180 dias / 2 relatos | Maintenance (avarias recorrentes) |
| `monitoring.lateReturnPattern` | 3 atrasos em 5 alugueres | Risk (monitorização) |
| `monitoring.maxPlausibleHoursPerDay` | 24 h | Risk (leituras impossíveis do contador) |
| `monitoring.returnReminderDays` | 1 dia | Notification (lembrete de devolução) |

## Regras do workflow de aluguer

### Rental Agent (`INTAKE`)
| Regra | Decisão | Quando |
|---|---|---|
| `equipment.retired` | REJECT | A máquina foi retirada da frota |
| `equipment.already_rented` | REJECT | Já há um aluguer aprovado ou ativo que se sobrepõe ao período |
| `period.start_in_past` | REJECT | A data de início é anterior a hoje |
| `period.too_long` | REJECT | Mais de 90 dias |

### Maintenance Agent (`MAINTENANCE_CHECK`)
| Regra | Decisão | Quando |
|---|---|---|
| `maintenance.overdue` | BLOCK | A revisão programada já passou |
| `equipment.out_of_service` | BLOCK | A máquina está em `MAINTENANCE` ou `BLOCKED` |
| `issue.critical` | BLOCK | Avaria aberta com gravidade `CRITICAL` (registada ou atribuída pela IA) |
| `issue.high` | ESCALATE | Avaria aberta com gravidade `HIGH` |
| `issue.unclassified` | ESCALATE | Avaria que nem o registo nem a IA conseguiram classificar |
| `maintenance.due_during_rental` | ESCALATE | A próxima revisão cai dentro do período do aluguer |

### Risk & Compliance Agent (`RISK_ASSESSMENT`)
| Regra | Decisão | Quando |
|---|---|---|
| `customer.blocked` | REJECT | A conta do cliente está bloqueada |
| `documents.incomplete` | ESCALATE | Falta ou está expirado um documento obrigatório |
| `history.late_returns` | ESCALATE | Mais de 1 devolução atrasada no histórico |
| `history.damage` | ESCALATE | Mais de 1 devolução com danos |
| `value.above_threshold` | ESCALATE | Valor total acima de 1 500 000 MZN |
| `identity.contact_mismatch` | ESCALATE | O email do formulário não é o registado para aquele NUIT |

### Finance Agent (`FINANCE_CHECK`)
| Regra | Decisão | Quando |
|---|---|---|
| `payments.overdue` | ESCALATE | O cliente tem pagamentos em atraso |
| `credit.limit_exceeded` | ESCALATE | Em dívida + este aluguer > limite de crédito do cliente |
| `payment.cash_limit` | ESCALATE | Numerário acima de 250 000 MZN |

### Approval Agent (`FINALIZE`)
| Regra | Decisão | Quando |
|---|---|---|
| `equipment.booked_meanwhile` | REJECT | Outro pedido reservou a máquina enquanto este estava a ser analisado |
| `checks.incomplete` | REJECT | Um agente falhou e uma verificação ficou por fazer |
| `locked:<regra>` | REJECT | Existe uma sinalização **não anulável** (abaixo) |

**Sinalizações que a IA não pode anular** (`autonomy.nonOverridableRules`):
`identity.contact_mismatch`, `payments.overdue`, `credit.limit_exceeded`, `issue.high`, `issue.critical`.
Como não há uma pessoa para verificar, cada uma destas leva à rejeição sem perguntar à IA.

**Sinalizações que a IA pode pesar:** documentos incompletos, histórico de atrasos ou danos, valor alto,
numerário acima do limite, revisão durante o aluguer, uso previsto duvidoso, avaria por classificar. A IA
pode aprovar **com condições** que mitiguem o risco, ou rejeitar.

## Regras do registo de cliente (Onboarding Agent)

| Regra | Decisão | Quando |
|---|---|---|
| `customer.blocked` | REJECT | O NUIT pertence a um cliente bloqueado |
| `customer.email_mismatch` | REJECT | O NUIT já existe com outro email (impede que alguém se apodere da conta de outra empresa) |
| `email.disposable` | REJECT | Email de um serviço descartável (mailinator, yopmail, 10minutemail…) |

Se nenhuma regra disparar, a IA avalia se os dados são plausíveis. Só uma aprovação com confiança ≥ 0,75
ativa a conta.

## Validação de formulários (forma dos dados)

Verificado na API com Zod antes de qualquer agente:

| Campo | Regra |
|---|---|
| NUIT | Exatamente 9 dígitos |
| Email | Formato válido; guardado em minúsculas |
| Telefone | 9–16 dígitos, `+` e espaços opcionais (ex.: `+258 84 123 4567`) |
| Datas | `AAAA-MM-DD`; fim ≥ início |
| Uso previsto | Até 1000 caracteres (opcional) |
| Método de pagamento | `MPESA`, `EMOLA`, `BANK_TRANSFER`, `CARD`, `CASH` |
| Password | 8 a 100 caracteres |

## Monitorização: o que gera alertas

| Agente | Situação | Ação |
|---|---|---|
| Maintenance | Horas de motor ≥ 90% do intervalo, ou revisão em ≤ 14 dias | Ordem de manutenção + estado `MAINTENANCE_PENDING` + alerta |
| Maintenance | ≥ 2 relatos de avaria em 180 dias que a IA considera o mesmo problema | Alerta + recomendação de inspeção |
| Finance | Pagamento pendente depois do vencimento | Marcado `OVERDUE` + alerta |
| Finance | Aluguer termina amanhã com dinheiro em dívida | Alerta |
| Risk | 3 atrasos nos últimos 5 alugueres | Caso de anomalia + alerta |
| Risk | Aluguer `ACTIVE` depois da data de fim (máquina não devolvida) | Caso de anomalia + alerta |
| Risk | Máquina `RENTED` sem nenhum aluguer ativo | Caso de anomalia + alerta |
| Risk | Mais de 24 horas de motor por dia de aluguer | Caso de anomalia + alerta |
| Approval | Anomalia pendente | Triagem `FOLLOW_UP` (mantém) ou `DISMISS` (fecha) |
| Notification | Devolução amanhã/hoje/em atraso | Notificação ao cliente (simulada) |
| Notification | Achados `HIGH`/`CRITICAL` do ciclo | Notificação individual à operação; o resto vai num resumo |

## Como mudar uma regra

1. Muda o limiar em `config/businessRules.ts` ou a lógica no `rules.ts` do agente.
2. Atualiza ou acrescenta o teste em `tests/rules.test.ts` e corre `npm test` no `backend`.
3. Opcional: `npx tsx scripts/run-scenarios.ts` para ver o efeito nos cenários de demonstração.

Os agentes e a IA não precisam de mudar. É essa a vantagem de separar regras e juízo.
