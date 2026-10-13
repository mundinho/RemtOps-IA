<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue';
import { ref } from 'vue';
import EngineHoursBar from '@/components/equipment/EngineHoursBar.vue';
import EquipmentDetailPanel from '@/components/equipment/EquipmentDetailPanel.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DataTable, { type Column } from '@/components/ui/DataTable.vue';
import Drawer from '@/components/ui/Drawer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { equipmentApi } from '@/services/equipment.api';
import type { Equipment } from '@/types';
import { formatDate, relativeDays } from '@/utils/format';
import { EQUIPMENT_TYPE_LABELS } from '@/utils/status';

const { data, loading, error, refresh } = useAsync(equipmentApi.list, { pollMs: 10000 });
const selected = ref<Equipment | null>(null);

const columns: Column[] = [
  { key: 'code', label: 'ID' },
  { key: 'name', label: 'Name', class: 'whitespace-normal' },
  { key: 'status', label: 'Status' },
  { key: 'hours', label: 'Engine hours' },
  { key: 'nextMaintenanceDue', label: 'Next service' },
  { key: 'currentRental', label: 'Current rental' },
];
</script>

<template>
  <PageHeader title="Equipment" description="Fleet status as seen by the agents. Each machine carries a physical QR code that starts a rental request." />

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <Panel v-if="data" flush>
      <DataTable :columns="columns" :rows="data" clickable :selected-id="selected?.id" @row-click="selected = $event">
        <template #cell-code="{ row }"><span class="font-mono text-xs font-medium text-slate-500">{{ row.code }}</span></template>
        <template #cell-name="{ row }">
          <span class="block font-medium text-slate-900">{{ row.name }}</span>
          <span class="text-xs text-slate-400">{{ EQUIPMENT_TYPE_LABELS[row.type] }}</span>
          <span v-if="row.openIssues" class="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
            {{ row.openIssues }} open issue{{ row.openIssues > 1 ? 's' : '' }}
          </span>
        </template>
        <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
        <template #cell-hours="{ row }">
          <EngineHoursBar :since-service="row.usageHours - row.hoursAtLastService" :interval="row.serviceIntervalHours" />
        </template>
        <template #cell-nextMaintenanceDue="{ row }">
          <span v-if="row.maintenanceOverdue" class="inline-flex items-center gap-1.5 font-medium text-rose-600">
            <TriangleAlert class="size-3.5" /> Overdue · {{ relativeDays(row.nextMaintenanceDue) }}
          </span>
          <span v-else>{{ formatDate(row.nextMaintenanceDue) }}</span>
        </template>
        <template #cell-currentRental="{ row }">
          <span v-if="row.currentRental" class="text-sm">
            <span class="block">{{ row.currentRental.customer.companyName }}</span>
            <span class="text-xs text-slate-400">
              <span class="font-mono">{{ row.currentRental.code }}</span> · until {{ formatDate(row.currentRental.endDate) }}
            </span>
          </span>
          <span v-else class="text-slate-300">—</span>
        </template>      </DataTable>
    </Panel>
  </AsyncState>

  <Drawer :open="!!selected" :title="selected?.name" :subtitle="selected?.code" @close="selected = null">
    <EquipmentDetailPanel v-if="selected" :key="selected.code" :code="selected.code" />
  </Drawer>
</template>
