<script setup lang="ts">
import { ExternalLink, TriangleAlert } from '@lucide/vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DetailList from '@/components/ui/DetailList.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { equipmentApi } from '@/services/equipment.api';
import { formatDate, formatMoney, humanize, relativeDays } from '@/utils/format';
import { EQUIPMENT_TYPE_LABELS } from '@/utils/status';
import EngineHoursBar from './EngineHoursBar.vue';
import QrCodeImage from './QrCodeImage.vue';

const props = defineProps<{ code: string }>();
const { data: equipment, loading, error, refresh } = useAsync(() => equipmentApi.get(props.code));
</script>

<template>
  <AsyncState :loading="loading" :error="error" :has-data="!!equipment" @retry="refresh">
    <div v-if="equipment" class="space-y-6">
      <div
        v-if="equipment.maintenanceOverdue"
        class="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
      >
        <TriangleAlert class="mt-0.5 size-4 shrink-0" />
        <span>
          Scheduled service was due {{ relativeDays(equipment.nextMaintenanceDue) }}. The status field still says
          <b>{{ equipment.status.toLowerCase() }}</b>, but the Maintenance Agent will block any rental.
        </span>
      </div>

      <div class="flex gap-5">
        <div class="shrink-0 rounded-lg border border-slate-200 p-2">
          <QrCodeImage :code="equipment.code" size="size-28" />
        </div>
        <div class="min-w-0 space-y-2">
          <StatusBadge :status="equipment.status" />
          <p class="text-sm text-slate-500">{{ equipment.brand }} {{ equipment.model }} · SN {{ equipment.serialNumber }}</p>
          <RouterLink
            :to="{ name: 'scan', params: { code: equipment.code } }"
            target="_blank"
            class="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
          >
            Open public QR page <ExternalLink class="size-3.5" />
          </RouterLink>
          <p class="break-all font-mono text-xs text-slate-400">{{ equipment.qrUrl }}</p>
        </div>
      </div>

      <DetailList
        :items="[
          { label: 'Type', value: EQUIPMENT_TYPE_LABELS[equipment.type] },
          { label: 'Daily rate', value: formatMoney(equipment.dailyRate) },
          { label: 'Location', value: equipment.location },
          { label: 'Operator licence', value: equipment.requiresOperatorLicense ? 'Required' : 'Not required' },
          { label: 'Last maintenance', value: formatDate(equipment.lastMaintenanceAt) },
          { label: 'Next maintenance', value: formatDate(equipment.nextMaintenanceDue) },
        ]"
      />

      <section>
        <h3 class="mb-2 text-sm font-semibold text-slate-900">Engine hours</h3>
        <div class="flex items-center gap-4">
          <EngineHoursBar :since-service="equipment.usageHours - equipment.hoursAtLastService" :interval="equipment.serviceIntervalHours" />
          <span class="text-xs text-slate-400">{{ equipment.usageHours }} h total on the meter</span>
        </div>
      </section>

      <section v-if="equipment.maintenanceOrders.length">
        <h3 class="mb-2 text-sm font-semibold text-slate-900">Maintenance orders</h3>
        <ul class="space-y-2">
          <li v-for="o in equipment.maintenanceOrders" :key="o.id" class="rounded-lg border border-slate-200 p-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs text-slate-500">{{ o.code }}</span>
              <StatusBadge :status="o.type" />
              <StatusBadge :status="o.priority" />
              <StatusBadge :status="o.status" />
              <span class="ml-auto text-xs text-slate-400">due {{ formatDate(o.dueBy) }}</span>
            </div>
            <p class="mt-1.5 text-slate-600">{{ o.reason }}</p>
          </li>
        </ul>
      </section>

      <section v-if="equipment.upcomingRentals.length">
        <h3 class="mb-2 text-sm font-semibold text-slate-900">Current & upcoming rentals</h3>
        <ul class="divide-y divide-slate-100 rounded-lg border border-slate-200">
          <li v-for="r in equipment.upcomingRentals" :key="r.id" class="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              <span class="font-mono text-xs text-slate-500">{{ r.code }}</span>
              · {{ formatDate(r.startDate) }} → {{ formatDate(r.endDate) }}
            </span>
            <StatusBadge :status="r.status" />
          </li>
        </ul>
      </section>

      <section>
        <h3 class="mb-2 text-sm font-semibold text-slate-900">Maintenance history</h3>
        <ol class="space-y-3">
          <li v-for="m in equipment.maintenances" :key="m.id" class="rounded-lg border border-slate-200 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium text-slate-800">{{ humanize(m.type) }}</span>
              <StatusBadge :status="m.status" />
              <StatusBadge v-if="m.severity" :status="m.severity" :label="`Severity: ${humanize(m.severity)}`" />
              <span
                v-else-if="m.type === 'ISSUE_REPORT'"
                class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/25"
              >
                Unclassified — AI will assess
              </span>
              <span class="ml-auto text-xs text-slate-400">{{ formatDate(m.performedAt ?? m.reportedAt) }}</span>
            </div>
            <p class="mt-1.5 text-sm text-slate-600">{{ m.description }}</p>
            <p v-if="m.nextDueAt" class="mt-1 text-xs text-slate-400">Next due {{ formatDate(m.nextDueAt) }}</p>
          </li>
        </ol>
      </section>
    </div>
  </AsyncState>
</template>
