<script setup lang="ts">
import AgentActivityFeed from '@/components/agents/AgentActivityFeed.vue';
import AgentBadge from '@/components/agents/AgentBadge.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DetailList from '@/components/ui/DetailList.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { agentsApi } from '@/services/agents.api';
import { rentalsApi } from '@/services/rentals.api';
import { formatDate, formatDateTime, formatMoney, humanize, inclusiveDays } from '@/utils/format';
import { Bot } from '@lucide/vue';
import { paymentMethodLabel } from '@/utils/payment';

const props = defineProps<{ id: string }>();

const { data: rental, loading, error, refresh } = useAsync(() => rentalsApi.get(props.id), { pollMs: 4000 });
const { data: trace } = useAsync(() => agentsApi.executions({ correlationId: props.id, limit: 100 }), { pollMs: 4000 });
</script>

<template>
  <AsyncState :loading="loading" :error="error" :has-data="!!rental" @retry="refresh">
    <div v-if="rental" class="space-y-6">
      <div class="flex flex-wrap items-center gap-2">
        <StatusBadge :status="rental.status" />
        <span class="text-xs text-slate-400">Workflow step: {{ humanize(rental.workflowStep) }}</span>
      </div>

      <div v-if="rental.decisionReason" class="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Decision</p>
        <p class="mt-1 text-sm text-slate-700">{{ rental.decisionReason }}</p>
        <div v-if="rental.decidedByAgent" class="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <AgentBadge :agent="rental.decidedByAgent" /> · {{ formatDateTime(rental.decidedAt) }}
        </div>
      </div>

      <DetailList
        :items="[
          { label: 'Customer', value: `${rental.customer.companyName} (${rental.customer.code})` },
          { label: 'Equipment', value: `${rental.equipment.name} (${rental.equipment.code})` },
          { label: 'Period', value: `${formatDate(rental.startDate)} → ${formatDate(rental.endDate)}` },
          { label: 'Duration', value: `${inclusiveDays(rental.startDate, rental.endDate)} days` },
          { label: 'Daily rate', value: formatMoney(rental.dailyRate) },
          { label: 'Total', value: formatMoney(rental.totalAmount) },
          { label: 'Risk', value: rental.riskLevel ? `${humanize(rental.riskLevel)} (${rental.riskScore ?? '—'})` : null },
          { label: 'Return', value: rental.lateDays ? `${rental.lateDays} days late` : rental.status === 'COMPLETED' ? 'On time' : null },
          { label: 'Payment method', value: paymentMethodLabel(rental.paymentMethod) },
          { label: 'Requested by', value: rental.contactName ? `${rental.contactName} · ${rental.contactEmail} · ${rental.contactPhone}` : null },
        ]"
      />

      <div v-if="rental.approvalConditions.length" class="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p class="text-xs font-medium uppercase tracking-wide text-amber-700">Conditions set by the Approval Agent</p>
        <ul class="mt-1 list-disc pl-5 text-sm text-amber-900">
          <li v-for="c in rental.approvalConditions" :key="c">{{ c }}</li>
        </ul>
      </div>

      <div v-if="rental.intendedUse">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Intended use (customer, free text)</p>
        <p class="mt-1 text-sm italic text-slate-700">“{{ rental.intendedUse }}”</p>
      </div>
      <p v-if="rental.damageNotes" class="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Damage: {{ rental.damageNotes }}</p>

      <section>
        <h3 class="mb-2 text-sm font-semibold text-slate-900">Agent trace</h3>
        <AgentActivityFeed v-if="trace?.length" :executions="[...trace].reverse()" expandable />
        <EmptyState
          v-else
          compact
          :icon="Bot"
          title="No agent activity"
          :description="
            rental.decisionReason?.startsWith('Historical')
              ? 'Historical rental, imported before agent automation.'
              : 'Agents have not processed this request yet.'
          "
        />
      </section>

      <section v-if="rental.notifications.length">
        <h3 class="mb-2 text-sm font-semibold text-slate-900">Notifications sent</h3>
        <ul class="space-y-2">
          <li v-for="n in rental.notifications" :key="n.id" class="rounded-lg border border-slate-200 p-3 text-sm">
            <p class="font-medium text-slate-800">{{ n.subject }}</p>
            <p class="text-xs text-slate-400">{{ n.channel }} → {{ n.recipient }}</p>
            <p class="mt-1 whitespace-pre-line text-slate-600">{{ n.body }}</p>
          </li>
        </ul>
      </section>
    </div>
  </AsyncState>
</template>
