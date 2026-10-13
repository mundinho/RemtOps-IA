<script setup lang="ts">
import { Radar } from '@lucide/vue';
import { ref } from 'vue';
import { useAsync } from '@/composables/useAsync';
import { operationsApi } from '@/services/operations.api';
import { formatDateTime } from '@/utils/format';

/**
 * Starts a monitoring cycle on demand. In normal operation the scheduler does this on its own —
 * the button exists so a demo does not have to wait for the next cycle.
 */
const emit = defineEmits<{ started: [] }>();
const { data: status, refresh } = useAsync(operationsApi.monitoringStatus, { pollMs: 3000 });
const error = ref<string | null>(null);

async function run() {
  error.value = null;
  try {
    await operationsApi.runMonitoring();
    emit('started');
    await refresh({ silent: true });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not start monitoring';
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <span v-if="status?.lastCycle && !status.running" class="hidden text-xs text-slate-400 md:inline">
      Last cycle {{ formatDateTime(status.lastCycle.startedAt) }}
    </span>
    <span v-if="error" class="text-xs text-rose-600">{{ error }}</span>
    <button
      class="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      :disabled="status?.running"
      title="Maintenance, Finance and Risk agents scan the operation; the Notification Agent reports what they found"
      @click="run"
    >
      <Radar class="size-4" :class="status?.running && 'animate-spin'" />
      {{ status?.running ? 'Agents monitoring…' : 'Run monitoring now' }}
    </button>
  </div>
</template>
