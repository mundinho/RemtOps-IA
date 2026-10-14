<script setup lang="ts">
import { CircleCheck, RotateCcw, Smartphone } from '@lucide/vue';
import { computed } from 'vue';
import type { RentalDeposit } from '@/types';
import { formatDateTime, formatMoney } from '@/utils/format';

/** The M-Pesa deposit paid before the request was sent — and, if it was not approved, its refund. */
const props = defineProps<{ deposit: RentalDeposit; total: number }>();
const balance = computed(() => Math.max(0, props.total - (props.deposit.amount ?? 0)));
</script>

<template>
  <section class="card overflow-hidden">
    <header class="flex items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-md bg-[#e60000] text-white">
        <Smartphone class="size-4" />
      </span>
      <div class="min-w-0">
        <p class="text-sm font-semibold text-slate-900">M-Pesa deposit</p>
        <p class="text-xs text-slate-500">
          Transaction {{ deposit.transactionId }}<template v-if="deposit.paidAt"> · {{ formatDateTime(deposit.paidAt) }}</template>
        </p>
      </div>
      <span class="ml-auto text-base font-semibold tabular-nums text-slate-900">{{ formatMoney(deposit.amount) }}</span>
    </header>

    <!-- Not approved: the deposit goes back -->
    <div v-if="deposit.refund" class="flex items-start gap-3 p-5 text-sm">
      <RotateCcw class="mt-0.5 size-5 shrink-0" :class="deposit.refund.refundedAt ? 'text-emerald-600' : 'text-amber-600'" />
      <p v-if="deposit.refund.refundedAt" class="text-slate-700">
        Your deposit was <span class="font-semibold">refunded</span> to your M-Pesa on {{ formatDateTime(deposit.refund.refundedAt) }}.
      </p>
      <p v-else class="text-slate-700">
        Your request was not approved, so your deposit of <span class="font-semibold">{{ formatMoney(deposit.amount) }}</span> will be
        <span class="font-semibold">refunded</span> to your M-Pesa account.
      </p>
    </div>

    <!-- Paid -->
    <div v-else class="flex items-start gap-3 p-5 text-sm">
      <CircleCheck class="mt-0.5 size-5 shrink-0 text-emerald-600" />
      <p class="text-slate-700">
        Deposit received. Remaining balance <span class="font-semibold">{{ formatMoney(balance) }}</span>, due on the last rental day.
        <template v-if="deposit.simulated"><br /><span class="text-xs font-medium text-amber-700">Demo mode — no money was charged.</span></template>
      </p>
    </div>
  </section>
</template>
