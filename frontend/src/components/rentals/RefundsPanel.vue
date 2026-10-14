<script setup lang="ts">
import { CircleCheck, LoaderCircle, RotateCcw } from '@lucide/vue';
import { computed, ref } from 'vue';
import Panel from '@/components/ui/Panel.vue';
import { useAsync } from '@/composables/useAsync';
import { operationsApi } from '@/services/operations.api';
import { formatDateTime, formatMoney } from '@/utils/format';

/**
 * M-Pesa deposits of requests the agents rejected: the money is returned manually in the M-Pesa
 * portal, then finance marks it here (recorded with their name in the audit log).
 */
const { data, refresh } = useAsync(operationsApi.refunds, { pollMs: 15000 });
const due = computed(() => (data.value ?? []).filter((r) => !r.refundedAt));
const done = computed(() => (data.value ?? []).filter((r) => r.refundedAt).slice(0, 5));

const busy = ref<string | null>(null);
const error = ref<string | null>(null);

async function mark(id: string) {
  const note = window.prompt('Refund reference / note (optional), e.g. the M-Pesa reversal ID:') ?? undefined;
  busy.value = id;
  error.value = null;
  try {
    await operationsApi.markRefunded(id, note || undefined);
    await refresh({ silent: true });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not mark as refunded';
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <Panel v-if="data && (due.length || done.length)" title="M-Pesa refunds" subtitle="Deposits of requests that were not approved — refund them in the M-Pesa portal, then mark them here">
    <p v-if="error" class="mb-3 rounded-md bg-rose-50 p-2.5 text-sm text-rose-700">{{ error }}</p>
    <p v-if="!due.length" class="flex items-center gap-2 text-sm text-slate-500"><CircleCheck class="size-4 text-emerald-600" /> Nothing to refund.</p>
    <ul v-else class="divide-y divide-slate-100">
      <li v-for="r in due" :key="r.id" class="flex flex-wrap items-center gap-3 py-2.5">
        <RotateCcw class="size-4 shrink-0 text-amber-600" />
        <div class="min-w-0 flex-1 text-sm">
          <p class="font-medium text-slate-900">
            {{ formatMoney(r.amount) }} → {{ r.msisdn }}
            <span class="font-normal text-slate-500">· {{ r.rental?.customer.companyName }} · {{ r.rental?.code }}</span>
          </p>
          <p class="text-xs text-slate-500">Paid {{ formatDateTime(r.paidAt) }} · M-Pesa {{ r.transactionId }}</p>
        </div>
        <button type="button" class="btn-secondary px-3 py-1.5 text-xs" :disabled="busy === r.id" @click="mark(r.id)">
          <LoaderCircle v-if="busy === r.id" class="size-3.5 animate-spin" />
          Mark as refunded
        </button>
      </li>
    </ul>
    <details v-if="done.length" class="mt-3 text-xs text-slate-500">
      <summary class="cursor-pointer font-medium">Recently refunded ({{ done.length }})</summary>
      <ul class="mt-2 space-y-1">
        <li v-for="r in done" :key="r.id">
          {{ formatMoney(r.amount) }} → {{ r.msisdn }} · {{ r.rental?.code }} · {{ formatDateTime(r.refundedAt) }} by {{ r.refundedBy }}
          <template v-if="r.refundNote"> · {{ r.refundNote }}</template>
        </li>
      </ul>
    </details>
  </Panel>
</template>
