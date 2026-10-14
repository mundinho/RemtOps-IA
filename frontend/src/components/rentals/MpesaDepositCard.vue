<script setup lang="ts">
import { CircleCheck, CircleX, LoaderCircle, Smartphone } from '@lucide/vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import PhoneInput from '@/components/ui/PhoneInput.vue';
import { ApiError } from '@/services/http';
import { publicApi } from '@/services/public.api';
import type { MpesaDeposit } from '@/types';
import { formatDateTime, formatMoney } from '@/utils/format';

/**
 * "Pay deposit with M-Pesa" on the request page of an approved rental. The payment is confirmed by the
 * customer on their phone (PIN), so after starting it this card polls until it is paid or failed.
 */
const props = defineProps<{ rentalId: string; deposit: MpesaDeposit; total: number }>();
const emit = defineEmits<{ changed: [] }>();

const phone = ref('');
const country = ref('MZ');
const starting = ref(false);
const error = ref<string | null>(null);

const waiting = computed(() => props.deposit.lastAttempt?.status === 'PENDING');
const failed = computed(() => (props.deposit.lastAttempt?.status === 'FAILED' ? props.deposit.lastAttempt.message : null));
const balance = computed(() => Math.max(0, props.total - props.deposit.amount));

// While the customer confirms on the phone, refresh the request every 3 s.
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  waiting,
  (isWaiting) => {
    clearInterval(timer);
    if (isWaiting) timer = setInterval(() => emit('changed'), 3000);
  },
  { immediate: true },
);
onUnmounted(() => clearInterval(timer));

async function pay() {
  starting.value = true;
  error.value = null;
  try {
    await publicApi.payMpesa(props.rentalId, phone.value);
    emit('changed');
  } catch (e) {
    error.value = e instanceof ApiError && e.details?.phone ? e.details.phone[0]! : e instanceof Error ? e.message : 'Could not start the payment';
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <section class="card overflow-hidden">
    <header class="flex items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-md bg-[#e60000] text-white">
        <Smartphone class="size-4" />
      </span>
      <div class="min-w-0">
        <p class="text-sm font-semibold text-slate-900">Pay your deposit with M-Pesa</p>
        <p class="text-xs text-slate-500">{{ deposit.depositPercent }}% of the rental confirms your booking</p>
      </div>
    </header>

    <!-- Paid -->
    <div v-if="deposit.paid" class="flex items-start gap-3 p-5">
      <CircleCheck class="mt-0.5 size-5 shrink-0 text-emerald-600" />
      <div class="text-sm">
        <p class="font-semibold text-slate-900">Deposit paid — {{ formatMoney(deposit.paid.amount) }}</p>
        <p class="mt-0.5 text-slate-500">
          M-Pesa transaction {{ deposit.paid.transactionId }}<template v-if="deposit.paid.at"> · {{ formatDateTime(deposit.paid.at) }}</template>
        </p>
        <p class="mt-2 text-slate-600">Remaining balance: <span class="font-medium">{{ formatMoney(balance) }}</span>, due on the last rental day.</p>
      </div>
    </div>

    <!-- Waiting for the PIN on the phone -->
    <div v-else-if="waiting" class="flex items-start gap-3 p-5">
      <LoaderCircle class="mt-0.5 size-5 shrink-0 animate-spin text-brand-600" />
      <div class="text-sm">
        <p class="font-semibold text-slate-900">Confirm the payment on your phone</p>
        <p class="mt-0.5 text-slate-500">
          A request of {{ formatMoney(deposit.amount) }} was sent to your M-Pesa. Enter your PIN to confirm — this page updates by itself.
        </p>
      </div>
    </div>

    <!-- Ask -->
    <form v-else class="space-y-4 p-5" @submit.prevent="pay">
      <div class="flex items-baseline justify-between rounded-md bg-slate-50 px-3 py-2.5 text-sm">
        <span class="text-slate-500">Deposit now</span>
        <span class="text-lg font-semibold tabular-nums text-slate-900">{{ formatMoney(deposit.amount) }}</span>
      </div>

      <p v-if="failed" class="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
        <CircleX class="mt-0.5 size-4 shrink-0" /> {{ failed }}
      </p>

      <div>
        <span class="text-sm font-medium text-slate-700">M-Pesa number (Vodacom 84 / 85)</span>
        <PhoneInput v-model="phone" v-model:country="country" />
        <span v-if="error" class="mt-1 block text-xs text-rose-600">{{ error }}</span>
      </div>

      <button type="submit" :disabled="starting || !phone" class="btn-primary w-full py-2.5">
        <LoaderCircle v-if="starting" class="size-4 animate-spin" />
        <Smartphone v-else class="size-4" />
        Pay {{ formatMoney(deposit.amount) }} with M-Pesa
      </button>
      <p class="text-center text-xs text-slate-400">
        You will receive a prompt on your phone. Nothing is charged until you confirm with your PIN.
        <template v-if="deposit.simulated"><br /><span class="font-medium text-amber-700">Demo mode — no money is charged.</span></template>
      </p>
    </form>
  </section>
</template>
