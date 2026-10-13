<script setup lang="ts">
import { CircleCheck, ClipboardList, Cpu, Timer, Wallet } from '@lucide/vue';
import { computed } from 'vue';
import BarList from '@/components/charts/BarList.vue';
import StackedColumns from '@/components/charts/StackedColumns.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import KpiCard from '@/components/ui/KpiCard.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import { useAsync } from '@/composables/useAsync';
import { dashboardApi } from '@/services/dashboard.api';
import type { AgentName, PaymentMethod } from '@/types';
import { AGENTS } from '@/utils/agents';
import { formatMoney, humanize } from '@/utils/format';
import { paymentMethodLabel } from '@/utils/payment';

const { data, loading, error, refresh } = useAsync(dashboardApi.statistics, { pollMs: 30000 });

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' });

const series = [
  { key: 'approved', label: 'Approved', color: 'var(--series-1)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--series-2)' },
  { key: 'inProgress', label: 'In progress', color: 'var(--series-3)' },
];

const months = computed(() =>
  (data.value?.rentalsByMonth ?? []).map((m) => ({ key: m.key, label: monthFmt.format(new Date(`${m.key}-01T00:00:00`)) })),
);
const monthValues = computed(() =>
  Object.fromEntries((data.value?.rentalsByMonth ?? []).map((m) => [m.key, { approved: m.approved, rejected: m.rejected, inProgress: m.inProgress }])),
);

const compactMzn = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} M MZN` : formatMoney(v);
const duration = (s: number | null) => (s == null ? '—' : s < 60 ? `${s} s` : `${Math.floor(s / 60)}m ${s % 60}s`);
const seconds = (v: number) => `${v.toLocaleString('pt-PT')} s`;
const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}k` : String(v));
const agentLabel = (name: string) => AGENTS[name as AgentName]?.label ?? humanize(name);
</script>

<template>
  <div class="viz-root">
    <PageHeader
      title="Statistics"
      description="How the operation and the agents are performing — computed live from the same records the agents write."
    />

    <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
      <template v-if="data">
        <div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Rental requests" :value="data.kpis.totalRequests" :icon="ClipboardList" :hint="`${data.kpis.inProgress} in progress`" />
          <KpiCard
            label="Approval rate"
            :value="data.kpis.approvalRate == null ? '—' : `${Math.round(data.kpis.approvalRate * 100)}%`"
            :icon="CircleCheck"
            tone="green"
            :hint="`${data.kpis.approved} approved · ${data.kpis.rejected} rejected`"
          />
          <KpiCard label="Revenue booked" :value="compactMzn(data.kpis.revenueBooked)" :icon="Wallet" tone="amber" />
          <KpiCard label="Avg. time to decision" :value="duration(data.kpis.avgDecisionSeconds)" :icon="Timer" tone="violet" hint="all agents, per request" />
        </div>

        <div class="grid gap-4 xl:grid-cols-2">
          <Panel title="Rentals per month" subtitle="By rental start date, split by the agents' final decision" class="xl:col-span-2">
            <StackedColumns :categories="months" :series="series" :values="monthValues" />
          </Panel>

          <Panel title="Why requests were rejected" subtitle="Rules flagged on rejected requests (one request can have several)">
            <BarList :items="data.rejectionReasons" empty="No rejected requests" />
          </Panel>

          <Panel title="Revenue booked per machine" subtitle="Approved, active and completed rentals">
            <BarList :items="data.revenueByEquipment" :format="compactMzn" />
          </Panel>

          <Panel title="Payments by status" subtitle="Invoiced amount">
            <BarList :items="data.paymentsByStatus" :format="compactMzn" :label-of="humanize" />
          </Panel>

          <Panel title="Payment method chosen" subtitle="Number of rental requests">
            <BarList :items="data.paymentMethods" :label-of="(l) => paymentMethodLabel(l as PaymentMethod)" />
          </Panel>

          <Panel title="Fleet status" subtitle="Machines per status, right now">
            <BarList :items="data.fleetStatus" :label-of="humanize" />
          </Panel>

          <Panel title="Average run time per agent" subtitle="Seconds per run, local model on CPU — hover for runs and tokens">
            <BarList
              :items="data.agents"
              :format="seconds"
              :label-of="agentLabel"
              :detail-of="(a) => {
                const agent = data!.agents.find((x) => x.label === a.label)!;
                return `${agent.runs} runs · ${compact(agent.tokens)} tokens`;
              }"
            />
            <p class="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <Cpu class="size-3.5" /> {{ compact(data.kpis.llmTokens) }} LLM tokens used in total
            </p>
          </Panel>
        </div>
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.viz-root {
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --chart-grid: #e2e8f0;
  --chart-axis: #cbd5e1;
  --chart-hover: rgb(15 23 42 / 0.04);
}
</style>
