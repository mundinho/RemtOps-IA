<script setup lang="ts">
import { ExternalLink, Printer, RefreshCw } from '@lucide/vue';
import { ref } from 'vue';
import { isAdmin } from '@/services/session';
import { systemApi } from '@/services/system.api';
import QrCodeImage from '@/components/equipment/QrCodeImage.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { equipmentApi } from '@/services/equipment.api';
import { EQUIPMENT_TYPE_LABELS } from '@/utils/status';

const { data, loading, error, refresh } = useAsync(equipmentApi.list);
const print = () => window.print();

const resetting = ref(false);
async function resetDemo() {
  if (!confirm('Reset all demo data? Requests, agent runs, reviews, alerts and accounts will be cleared, and you will need to sign in again.')) return;
  resetting.value = true;
  try {
    await systemApi.resetDemo();
    await refresh();
  } finally {
    resetting.value = false;
  }
}
</script>

<template>
  <PageHeader
    title="QR labels"
    description="Printable labels for each machine. Scanning one opens the public equipment page and starts the agent workflow."
  >
    <template #actions>
      <button
        v-if="isAdmin()"
        class="no-print inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
        :disabled="resetting"
        @click="resetDemo"
      >
        <RefreshCw class="size-4" :class="resetting && 'animate-spin'" /> Reset demo
      </button>
      <button
        class="no-print inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        @click="print"
      >
        <Printer class="size-4" /> Print labels
      </button>
    </template>
  </PageHeader>

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="item in data"
        :key="item.id"
        class="flex break-inside-avoid gap-4 rounded-xl border-2 border-dashed border-slate-300 bg-white p-4"
      >
        <QrCodeImage :code="item.code" size="size-28" />
        <div class="flex min-w-0 flex-col">
          <p class="font-mono text-lg font-semibold text-slate-900">{{ item.code }}</p>
          <p class="text-sm font-medium text-slate-700">{{ item.name }}</p>
          <p class="text-xs text-slate-400">{{ EQUIPMENT_TYPE_LABELS[item.type] }} · Scan to rent</p>
          <div class="no-print mt-auto flex items-center justify-between pt-3">
            <StatusBadge :status="item.status" />
            <RouterLink
              :to="{ name: 'scan', params: { code: item.code } }"
              target="_blank"
              class="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
            >
              Simulate scan <ExternalLink class="size-3" />
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </AsyncState>
</template>
