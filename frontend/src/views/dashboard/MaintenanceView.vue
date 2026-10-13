<script setup lang="ts">
import { Hammer } from '@lucide/vue';
import AgentBadge from '@/components/agents/AgentBadge.vue';
import EngineHoursBar from '@/components/equipment/EngineHoursBar.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DataTable, { type Column } from '@/components/ui/DataTable.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { equipmentApi } from '@/services/equipment.api';
import { operationsApi } from '@/services/operations.api';
import { formatDate, formatDateTime } from '@/utils/format';

const orders = useAsync(operationsApi.maintenanceOrders, { pollMs: 8000 });
const fleet = useAsync(equipmentApi.list, { pollMs: 8000 });

const orderColumns: Column[] = [
  { key: 'code', label: 'Order' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'type', label: 'Type' },
  { key: 'priority', label: 'Priority' },
  { key: 'reason', label: 'Reason', class: 'whitespace-normal min-w-80' },
  { key: 'createdByAgent', label: 'Created by' },
  { key: 'dueBy', label: 'Due' },
  { key: 'status', label: 'Status' },
];

const fleetColumns: Column[] = [
  { key: 'code', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'hours', label: 'Engine hours since service' },
  { key: 'nextMaintenanceDue', label: 'Next service date' },
];
</script>

<template>
  <PageHeader
    title="Maintenance"
    description="Work orders opened by the Maintenance Agent — engine-hour limits, overdue services, and recurring problems it detected in free-text reports."
  />

  <div class="space-y-6">
    <Panel title="Maintenance orders" flush>
      <AsyncState :loading="orders.loading.value" :error="orders.error.value" :has-data="!!orders.data.value" @retry="orders.refresh">
        <DataTable :columns="orderColumns" :rows="orders.data.value ?? []">
          <template #cell-code="{ row }">
            <span class="block font-mono text-xs font-medium text-slate-600">{{ row.code }}</span>
            <span class="text-xs text-slate-400">{{ formatDateTime(row.createdAt) }}</span>
          </template>
          <template #cell-equipment="{ row }">
            <span class="block font-medium text-slate-900">{{ row.equipment?.name }}</span>
            <span class="font-mono text-xs text-slate-400">{{ row.equipment?.code }}</span>
          </template>
          <template #cell-type="{ row }"><StatusBadge :status="row.type" /></template>
          <template #cell-priority="{ row }"><StatusBadge :status="row.priority" /></template>
          <template #cell-reason="{ row }"><span class="text-sm text-slate-600">{{ row.reason }}</span></template>
          <template #cell-createdByAgent="{ row }">
            <AgentBadge v-if="row.createdByAgent" :agent="row.createdByAgent" />
            <span v-else class="text-slate-300">—</span>
          </template>
          <template #cell-dueBy="{ row }">{{ formatDate(row.dueBy) }}</template>
          <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
          <template #empty>
            <EmptyState compact :icon="Hammer" title="No maintenance orders" description="Run a monitoring cycle from the Overview to let the Maintenance Agent check the fleet." />
          </template>
        </DataTable>
      </AsyncState>
    </Panel>

    <Panel title="Fleet service status" flush>
      <AsyncState :loading="fleet.loading.value" :error="fleet.error.value" :has-data="!!fleet.data.value" @retry="fleet.refresh">
        <DataTable :columns="fleetColumns" :rows="fleet.data.value ?? []">
          <template #cell-code="{ row }"><span class="font-mono text-xs font-medium text-slate-500">{{ row.code }}</span></template>
          <template #cell-name="{ row }"><span class="font-medium text-slate-900">{{ row.name }}</span></template>
          <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
          <template #cell-hours="{ row }">
            <EngineHoursBar :since-service="row.usageHours - row.hoursAtLastService" :interval="row.serviceIntervalHours" />
          </template>
          <template #cell-nextMaintenanceDue="{ row }">
            <span :class="row.maintenanceOverdue ? 'font-medium text-rose-600' : ''">{{ formatDate(row.nextMaintenanceDue) }}</span>
          </template>
        </DataTable>
      </AsyncState>
    </Panel>
  </div>
</template>
