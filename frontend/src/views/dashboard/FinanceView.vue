<script setup lang="ts">
import { Banknote, CircleCheck, Hourglass, Wallet } from '@lucide/vue';
import { computed, ref } from 'vue';
import RefundsPanel from '@/components/rentals/RefundsPanel.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DataTable, { type Column } from '@/components/ui/DataTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import KpiCard from '@/components/ui/KpiCard.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { operationsApi } from '@/services/operations.api';
import type { PaymentStatus } from '@/types';
import { daysUntil, formatDate, formatMoney } from '@/utils/format';
import { paymentMethodLabel } from '@/utils/payment';

const { data: summary } = useAsync(operationsApi.financeSummary, { pollMs: 8000 });
const { data, loading, error, refresh } = useAsync(() => operationsApi.payments(), { pollMs: 8000 });

const FILTERS: { label: string; status?: PaymentStatus }[] = [
  { label: 'All' },
  { label: 'Overdue', status: 'OVERDUE' },
  { label: 'Pending', status: 'PENDING' },
  { label: 'Paid', status: 'PAID' },
];
const active = ref(0);
const rows = computed(() => (data.value ?? []).filter((p) => !FILTERS[active.value]?.status || p.status === FILTERS[active.value]?.status));

const columns: Column[] = [
  { key: 'reference', label: 'Payment' },
  { key: 'customer', label: 'Customer' },
  { key: 'rental', label: 'Rental', class: 'whitespace-normal' },
  { key: 'dueDate', label: 'Due' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'method', label: 'Method' },
  { key: 'status', label: 'Status' },
];
</script>

<template>
  <PageHeader
    title="Finance"
    description="Payments associated with rentals by the Finance Agent. Overdue and pending amounts are flagged automatically during monitoring — money decisions are rules, not AI."
  />

  <div v-if="summary" class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
    <KpiCard label="Overdue" :value="formatMoney(summary.overdueAmount)" :hint="`${summary.overdueCount} payment(s)`" :icon="Banknote" tone="red" :highlight="summary.overdueAmount > 0" />
    <KpiCard label="Pending" :value="formatMoney(summary.pendingAmount)" :hint="`${summary.pendingCount} payment(s)`" :icon="Hourglass" tone="amber" />
    <KpiCard label="Outstanding total" :value="formatMoney(summary.overdueAmount + summary.pendingAmount)" :icon="Wallet" />
    <KpiCard label="Collected (30 days)" :value="formatMoney(summary.collectedLast30Days)" :icon="CircleCheck" tone="green" />
  </div>

  <div class="mb-6"><RefundsPanel /></div>

  <div class="mb-4 flex flex-wrap gap-1.5">
    <button
      v-for="(f, i) in FILTERS"
      :key="f.label"
      class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
      :class="active === i ? 'bg-brand-700 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'"
      @click="active = i"
    >
      {{ f.label }}
    </button>
  </div>

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <Panel flush>
      <DataTable :columns="columns" :rows="rows">
        <template #cell-reference="{ row }"><span class="font-mono text-xs font-medium text-slate-600">{{ row.reference }}</span></template>
        <template #cell-customer="{ row }"><span class="font-medium text-slate-900">{{ row.customer.companyName }}</span></template>
        <template #cell-rental="{ row }">
          <span class="block">{{ row.rental.equipment.name }}</span>
          <span class="font-mono text-xs text-slate-400">{{ row.rental.code }} · ends {{ formatDate(row.rental.endDate) }}</span>
        </template>
        <template #cell-dueDate="{ row }">
          <span :class="row.status === 'OVERDUE' ? 'font-medium text-rose-600' : ''">{{ formatDate(row.dueDate) }}</span>
          <span v-if="row.status === 'OVERDUE'" class="block text-xs text-rose-500">{{ -daysUntil(row.dueDate) }} days overdue</span>
          <span v-else-if="row.status === 'PAID' && row.paidAt" class="block text-xs text-slate-400">paid {{ formatDate(row.paidAt) }}</span>
        </template>
        <template #cell-amount="{ row }"><span class="font-medium">{{ formatMoney(row.amount) }}</span></template>
        <template #cell-method="{ row }"><span class="text-sm text-slate-600">{{ paymentMethodLabel(row.method) }}</span></template>
        <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
        <template #empty><EmptyState compact title="No payments in this view" /></template>
      </DataTable>
    </Panel>
  </AsyncState>
</template>
