<script setup lang="ts">
import { Banknote, Bot, CircleCheck, CircleX, ClipboardList, Gavel, Hammer, QrCode, TriangleAlert, Truck, Wallet, Wrench } from '@lucide/vue';
import AgentActivityFeed from '@/components/agents/AgentActivityFeed.vue';
import AgentPipeline from '@/components/agents/AgentPipeline.vue';
import RunMonitoringButton from '@/components/agents/RunMonitoringButton.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import KpiCard from '@/components/ui/KpiCard.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { dashboardApi } from '@/services/dashboard.api';
import type { Overview } from '@/types';
import { MONITORING_PIPELINE } from '@/utils/agents';
import { formatDate, formatDateTime, formatMoney, relativeDays } from '@/utils/format';

const { data, loading, error, refresh } = useAsync(dashboardApi.overview, { pollMs: 5000 });

const reviewSubject = (r: Overview['reviewQueue'][number]) =>
  r.rental?.code ?? r.equipment?.code ?? r.customer?.companyName ?? '';

const decisionChip = (r: Overview['reviewQueue'][number]) => {
  if (r.kind === 'ANOMALY') {
    return r.status === 'APPROVED'
      ? { label: 'Anomaly · follow-up', class: 'bg-amber-50 text-amber-800' }
      : { label: 'Anomaly · dismissed', class: 'bg-slate-100 text-slate-600' };
  }
  return r.status === 'APPROVED'
    ? { label: 'AI approved', class: 'bg-emerald-50 text-emerald-700' }
    : { label: 'AI rejected', class: 'bg-rose-50 text-rose-700' };
};
</script>

<template>
  <PageHeader
    title="Operations overview"
    description="Agents run every rental request and monitor the operation on their own — including the final approval. This view is read-only: people observe the machine's analyses and decisions."
  >
    <template #actions>
      <RunMonitoringButton @started="refresh({ silent: true })" />
    </template>
  </PageHeader>

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <template v-if="data">
      <!-- What needs a human -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Approved by AI" :value="data.kpis.approvedByAi" hint="last 30 days" :icon="Gavel" tone="green"
          to="/dashboard/decisions" />
        <KpiCard label="Open alerts" :value="data.kpis.openAlerts" :icon="TriangleAlert" tone="red"
          :highlight="data.kpis.openAlerts > 0" to="/dashboard/alerts" />
        <KpiCard label="Overdue payments" :value="formatMoney(data.kpis.overdueAmount)" :icon="Banknote" tone="red"
          :highlight="data.kpis.overdueAmount > 0" to="/dashboard/finance" />
        <KpiCard label="Open maintenance orders" :value="data.kpis.openMaintenanceOrders" :icon="Hammer" tone="amber"
          to="/dashboard/maintenance" />
      </div>
      <!-- Operations -->
      <div class="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Rejected by agents" :value="data.kpis.rejectedByAgents" hint="last 30 days" :icon="CircleX" tone="red" to="/dashboard/rentals" />
        <KpiCard label="In progress / active" :value="`${data.kpis.pendingRentals} / ${data.kpis.activeRentals}`" :icon="ClipboardList" tone="blue" to="/dashboard/rentals" />
        <KpiCard label="Outstanding" :value="formatMoney(data.kpis.outstandingAmount)" :icon="Wallet" tone="green" to="/dashboard/finance" />
        <KpiCard label="Available" :value="`${data.kpis.availableEquipment} / ${data.kpis.totalEquipment}`" :icon="CircleCheck" tone="green" to="/dashboard/equipment" />
        <KpiCard label="Rented / reserved" :value="data.kpis.rentedEquipment" :icon="Truck" tone="blue" />
        <KpiCard label="Maintenance / blocked" :value="data.kpis.maintenanceEquipment" :icon="Wrench" tone="amber" />
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel title="Live agent activity" subtitle="Rental workflows and monitoring cycles" class="xl:col-span-2">
          <template #actions>
            <RouterLink to="/dashboard/agents" class="text-sm font-medium text-amber-700 hover:underline">View all</RouterLink>
          </template>
          <AgentActivityFeed v-if="data.recentActivity.length" :executions="data.recentActivity" />
          <EmptyState
            v-else
            :icon="Bot"
            title="Agents are idle"
            description="They start when a customer scans a QR code — and they also monitor the fleet, payments and customers on a schedule."
          >
            <div class="flex flex-col items-center gap-3">
              <AgentPipeline />
              <AgentPipeline :steps="MONITORING_PIPELINE" />
              <RouterLink
                to="/dashboard/qr-codes"
                class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <QrCode class="size-4" /> Open QR labels
              </RouterLink>
            </div>
          </EmptyState>
        </Panel>

        <div class="space-y-6">
          <Panel title="Latest AI decisions" subtitle="Flagged cases decided by the Approval Agent" flush>
            <template #actions>
              <RouterLink to="/dashboard/decisions" class="text-sm font-medium text-amber-700 hover:underline">All</RouterLink>
            </template>
            <ul v-if="data.reviewQueue.length" class="divide-y divide-slate-100">
              <li v-for="review in data.reviewQueue" :key="review.id">
                <RouterLink to="/dashboard/decisions" class="block px-4 py-3 hover:bg-slate-50">
                  <div class="flex items-center gap-2">
                    <span class="rounded px-1.5 py-0.5 text-[11px] font-semibold" :class="decisionChip(review).class">{{ decisionChip(review).label }}</span>
                    <span class="font-mono text-xs text-slate-400">{{ reviewSubject(review) }}</span>
                  </div>
                  <p class="mt-1 line-clamp-2 text-sm text-slate-700">{{ review.reason }}</p>
                  <p class="mt-1 text-xs text-slate-400">{{ formatDateTime(review.resolvedAt) }}</p>
                </RouterLink>
              </li>
            </ul>
            <EmptyState v-else compact :icon="Gavel" title="No flagged cases yet" description="When an agent flags a problem, the AI decides it here automatically." />
          </Panel>

          <Panel title="Open alerts" flush>
            <template #actions>
              <RouterLink to="/dashboard/alerts" class="text-sm font-medium text-amber-700 hover:underline">All</RouterLink>
            </template>
            <ul v-if="data.alertFeed.length" class="divide-y divide-slate-100">
              <li v-for="alert in data.alertFeed" :key="alert.id" class="flex items-start gap-3 px-4 py-3">
                <StatusBadge :status="alert.severity" />
                <div class="min-w-0">
                  <p class="text-sm text-slate-800">{{ alert.title }}</p>
                  <p class="text-xs text-slate-400">
                    {{ alert.category ? alert.category.toLowerCase() : '' }} · {{ formatDateTime(alert.createdAt) }}
                  </p>
                </div>
              </li>
            </ul>
            <EmptyState v-else compact :icon="TriangleAlert" title="No open alerts" />
          </Panel>

          <Panel title="Maintenance watch" subtitle="Overdue, due within 14 days, or service pending" flush>
            <ul v-if="data.maintenanceWatch.length" class="divide-y divide-slate-100">
              <li v-for="item in data.maintenanceWatch" :key="item.code" class="flex items-center gap-3 px-4 py-3">
                <span class="size-2 shrink-0 rounded-full" :class="item.overdue ? 'bg-rose-500' : 'bg-amber-400'" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-slate-800">
                    <span class="font-mono text-xs text-slate-500">{{ item.code }}</span> {{ item.name }}
                  </p>
                  <p v-if="item.nextMaintenanceDue" class="text-xs" :class="item.overdue ? 'text-rose-600' : 'text-slate-400'">
                    {{ item.overdue ? 'Overdue' : 'Due' }} {{ relativeDays(item.nextMaintenanceDue) }} · {{ formatDate(item.nextMaintenanceDue) }}
                  </p>
                </div>
                <StatusBadge :status="item.status" />
              </li>
            </ul>
            <EmptyState v-else compact :icon="Wrench" title="All equipment within service schedule" />
          </Panel>
        </div>
      </div>
    </template>
  </AsyncState>
</template>
