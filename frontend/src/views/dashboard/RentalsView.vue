<script setup lang="ts">
import { computed, ref } from 'vue';
import AgentBadge from '@/components/agents/AgentBadge.vue';
import RentalDetailPanel from '@/components/rentals/RentalDetailPanel.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DataTable, { type Column } from '@/components/ui/DataTable.vue';
import Drawer from '@/components/ui/Drawer.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { rentalsApi } from '@/services/rentals.api';
import type { Rental, RentalStatus } from '@/types';
import { formatDate, formatDateTime, formatMoney } from '@/utils/format';

const { data, loading, error, refresh } = useAsync(() => rentalsApi.list(), { pollMs: 5000 });
const selected = ref<Rental | null>(null);

const FILTERS: { label: string; statuses?: RentalStatus[] }[] = [
  { label: 'All' },
  { label: 'In progress', statuses: ['REQUESTED', 'IN_REVIEW'] },
  { label: 'Human review', statuses: ['REQUIRES_HUMAN_REVIEW'] },
  { label: 'Approved', statuses: ['APPROVED', 'ACTIVE'] },
  { label: 'Rejected', statuses: ['REJECTED'] },
  { label: 'Completed', statuses: ['COMPLETED'] },
];
const activeFilter = ref(0);

const rows = computed(() => {
  const statuses = FILTERS[activeFilter.value]?.statuses;
  return (data.value ?? []).filter((r) => !statuses || statuses.includes(r.status));
});
const countFor = (statuses?: RentalStatus[]) =>
  (data.value ?? []).filter((r) => !statuses || statuses.includes(r.status)).length;

const columns: Column[] = [
  { key: 'code', label: 'Rental' },
  { key: 'customer', label: 'Customer' },
  { key: 'equipment', label: 'Equipment', class: 'whitespace-normal' },
  { key: 'period', label: 'Period' },
  { key: 'totalAmount', label: 'Value', align: 'right' },
  { key: 'status', label: 'Status' },
  { key: 'decidedByAgent', label: 'Decided by' },
];
</script>

<template>
  <PageHeader title="Rentals" description="Every request and its outcome. Decisions are taken by agents; open a rental to see the full trace." />

  <div class="mb-4 flex flex-wrap gap-1.5">
    <button
      v-for="(filter, i) in FILTERS"
      :key="filter.label"
      class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
      :class="activeFilter === i ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'"
      @click="activeFilter = i"
    >
      {{ filter.label }}
      <span class="ml-1 tabular-nums opacity-60">{{ countFor(filter.statuses) }}</span>
    </button>
  </div>

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <Panel flush>
      <DataTable :columns="columns" :rows="rows" clickable :selected-id="selected?.id" @row-click="selected = $event">
        <template #cell-code="{ row }">
          <span class="block font-mono text-xs font-medium text-slate-600">{{ row.code }}</span>
          <span class="text-xs text-slate-400">{{ formatDateTime(row.createdAt) }}</span>
        </template>
        <template #cell-customer="{ row }"><span class="font-medium text-slate-900">{{ row.customer.companyName }}</span></template>
        <template #cell-equipment="{ row }">
          <span class="block">{{ row.equipment.name }}</span>
          <span class="font-mono text-xs text-slate-400">{{ row.equipment.code }}</span>
        </template>
        <template #cell-period="{ row }">
          <span class="block">{{ formatDate(row.startDate) }}</span>
          <span class="text-xs text-slate-400">→ {{ formatDate(row.endDate) }}</span>
        </template>
        <template #cell-totalAmount="{ row }">{{ formatMoney(row.totalAmount) }}</template>
        <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
        <template #cell-decidedByAgent="{ row }">
          <AgentBadge v-if="row.decidedByAgent" :agent="row.decidedByAgent" />
          <span v-else class="text-xs text-slate-400">{{ row.workflowStep === 'DONE' ? 'Pre-automation' : 'In progress' }}</span>
        </template>
        <template #empty><EmptyState compact title="No rentals in this view" /></template>
      </DataTable>
    </Panel>
  </AsyncState>

  <Drawer :open="!!selected" :title="selected?.code" :subtitle="selected?.customer.companyName" @close="selected = null">
    <RentalDetailPanel v-if="selected" :key="selected.id" :id="selected.id" />
  </Drawer>
</template>
