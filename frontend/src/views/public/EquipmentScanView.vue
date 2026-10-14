<script setup lang="ts">
import { Banknote, Info, LoaderCircle, MapPin, ScanLine, Send, Smartphone, WandSparkles } from '@lucide/vue';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ChatWidget from '@/components/assistant/ChatWidget.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import PhoneInput from '@/components/ui/PhoneInput.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { authApi } from '@/services/auth.api';
import { ApiError } from '@/services/http';
import { publicApi } from '@/services/public.api';
import { session } from '@/services/session';
import type { CustomerOption, PaymentMethod } from '@/types';
import { DEFAULT_COUNTRY } from '@/utils/countries';
import { formatMoney, inclusiveDays } from '@/utils/format';
import { PAYMENT_METHODS } from '@/utils/payment';
import { EQUIPMENT_TYPE_LABELS } from '@/utils/status';

const route = useRoute();
const router = useRouter();
const code = String(route.params.code);

const { data: equipment, loading, error, refresh } = useAsync(() => publicApi.equipment(code));
// Demo helper only: lets the presenter fill the form with a seeded customer's details (not needed when signed in)
const { data: demoCustomers } = useAsync(() => (session.customer ? Promise.resolve([]) : publicApi.customers()));

// Signed-in customer: the company comes from the account (the API enforces it too).
const signedIn = computed(() => !!session.customer);
onMounted(async () => {
  if (!session.customer) return;
  try {
    const { profile } = await authApi.portal();
    Object.assign(form, {
      companyName: profile.companyName,
      taxId: profile.taxId,
      contactName: profile.contactName,
      email: profile.email,
      phone: profile.phone ?? '',
      country: profile.country,
    });
  } catch {
    // session expired — http() already signed out; the form stays editable
  }
});

const isoDay = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
};

const form = reactive({
  companyName: '',
  taxId: '',
  contactName: '',
  email: '',
  phone: '',
  country: DEFAULT_COUNTRY,
  paymentMethod: 'MPESA' as PaymentMethod,
  startDate: isoDay(1),
  endDate: isoDay(7),
  intendedUse: '',
});
const submitting = ref(false);
const submitError = ref<string | null>(null);
const fieldErrors = ref<Record<string, string[]>>({});

const days = computed(() =>
  form.startDate && form.endDate && form.endDate >= form.startDate ? inclusiveDays(form.startDate, form.endDate) : 0,
);
const estimate = computed(() => (equipment.value ? days.value * equipment.value.dailyRate : 0));

function fillDemo(c: CustomerOption) {
  Object.assign(form, { companyName: c.companyName, taxId: c.taxId, contactName: c.contactName, email: c.email, phone: c.phone ?? '', country: c.country });
  fieldErrors.value = {};
}

// ── M-Pesa: deposit paid before the request is sent ──
const isMpesa = computed(() => form.paymentMethod === 'MPESA');
const mpesaPhone = ref('');
const mpesaCountry = ref('MZ');
const deposit = computed(() => {
  if (!equipment.value) return 0;
  const value = Math.round(estimate.value * equipment.value.mpesa.depositPercent) / 100;
  return equipment.value.mpesa.maxAmount ? Math.min(value, equipment.value.mpesa.maxAmount) : value;
});
// Defaults to the contact phone
watch(isMpesa, (on) => {
  if (on && !mpesaPhone.value) mpesaPhone.value = form.phone;
});

const checkout = ref<{ id: string; amount: number } | null>(null);
let poll: ReturnType<typeof setInterval> | undefined;
onUnmounted(() => clearInterval(poll));

function followCheckout(id: string, amount: number) {
  checkout.value = { id, amount };
  poll = setInterval(async () => {
    try {
      const state = await publicApi.checkout(id);
      if (state.status === 'SUCCESS' && state.rentalId) {
        clearInterval(poll);
        await router.push({ name: 'request-status', params: { id: state.rentalId } });
      } else if (state.status === 'FAILED') {
        clearInterval(poll);
        checkout.value = null;
        submitError.value = state.message ?? 'The M-Pesa payment did not go through. Please try again.';
      }
    } catch {
      // keep polling; a transient network error must not lose the payment
    }
  }, 2500);
}

async function submit() {
  submitting.value = true;
  submitError.value = null;
  fieldErrors.value = {};
  try {
    const payload = { ...form, intendedUse: form.intendedUse.trim() || undefined };
    if (isMpesa.value) {
      const started = await publicApi.mpesaCheckout(code, { ...payload, mpesaPhone: mpesaPhone.value });
      followCheckout(started.checkoutId, started.amount);
      return;
    }
    const created = await publicApi.createRequest(code, payload);
    await router.push({ name: 'request-status', params: { id: created.id } });
  } catch (e) {
    if (e instanceof ApiError && e.details) fieldErrors.value = e.details;
    submitError.value = e instanceof ApiError && e.details ? 'Please correct the highlighted fields.' : e instanceof Error ? e.message : 'Could not submit the request';
  } finally {
    submitting.value = false;
  }
}

// "input" (style.css) includes min-w-0: native date inputs would otherwise overflow narrow phones
const inputClass = 'input';
const errorOf = (field: string) => fieldErrors.value[field]?.[0];
</script>

<template>
  <AsyncState :loading="loading" :error="error" :has-data="!!equipment" @retry="refresh">
    <div v-if="equipment" class="space-y-4">
      <div class="flex items-center gap-2 text-xs font-medium text-slate-500">
        <ScanLine class="size-4 text-brand-600" /> Equipment identified from QR code
      </div>

      <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-mono text-xs font-medium text-slate-400">{{ equipment.code }}</p>
            <h1 class="mt-0.5 text-xl font-semibold text-slate-900">{{ equipment.name }}</h1>
            <p class="text-sm text-slate-500">
              {{ EQUIPMENT_TYPE_LABELS[equipment.type] }} · {{ equipment.brand }} {{ equipment.model }}
            </p>
          </div>
          <StatusBadge :status="equipment.status" />
        </div>
        <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <span class="inline-flex items-center gap-1.5"><Banknote class="size-4 text-slate-400" /> {{ formatMoney(equipment.dailyRate) }} / day</span>
          <span v-if="equipment.location" class="inline-flex items-center gap-1.5">
            <MapPin class="size-4 text-slate-400" /> {{ equipment.location }}
          </span>
        </div>
        <p v-if="equipment.requiresOperatorLicense" class="mt-3 flex gap-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
          <Info class="size-4 shrink-0 text-slate-400" /> A valid operator licence is required for this machine.
        </p>
      </section>

      <form class="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-xs" novalidate @submit.prevent="submit">
        <h2 class="text-base font-semibold text-slate-900">Request this equipment</h2>

        <!-- Who is renting -->
        <fieldset class="space-y-3">
          <div class="flex items-center justify-between">
            <legend class="text-sm font-semibold text-slate-800">Your details</legend>
            <RouterLink v-if="signedIn" :to="{ name: 'portal' }" class="text-xs font-medium text-brand-700">From your account</RouterLink>
            <details v-else-if="demoCustomers?.length" class="relative">
              <summary class="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand-700">
                <WandSparkles class="size-3.5" /> Demo: fill in
              </summary>
              <div class="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                <button
                  v-for="c in demoCustomers"
                  :key="c.code"
                  type="button"
                  class="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  @click="fillDemo(c)"
                >
                  {{ c.companyName }} <span class="text-xs text-slate-400">{{ c.code }}</span>
                </button>
              </div>
            </details>
          </div>

          <label class="block">
            <span class="text-sm font-medium text-slate-700">Company / full name</span>
            <input v-model="form.companyName" autocomplete="organization" :readonly="signedIn" :class="[inputClass, signedIn && 'bg-slate-50 text-slate-500']" />
            <span v-if="errorOf('companyName')" class="mt-1 block text-xs text-rose-600">{{ errorOf('companyName') }}</span>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">NUIT</span>
            <input
              v-model="form.taxId"
              inputmode="numeric"
              maxlength="9"
              placeholder="9 digits"
              :readonly="signedIn"
              :class="[inputClass, signedIn && 'bg-slate-50 text-slate-500']"
            />
            <span v-if="errorOf('taxId')" class="mt-1 block text-xs text-rose-600">{{ errorOf('taxId') }}</span>
            <span v-else-if="signedIn" class="mt-1 block text-xs text-slate-400">Your signed-in company. The contact details below can be changed for this request.</span>
            <span v-else class="mt-1 block text-xs text-slate-400">
              Identifies your company. Returning customers keep their history.
              <RouterLink :to="{ name: 'customer-login', query: { redirect: route.fullPath } }" class="font-medium text-brand-700">Sign in</RouterLink>
              to fill this in automatically.
            </span>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Contact person</span>
            <input v-model="form.contactName" autocomplete="name" :class="inputClass" />
            <span v-if="errorOf('contactName')" class="mt-1 block text-xs text-rose-600">{{ errorOf('contactName') }}</span>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Email</span>
            <input v-model="form.email" type="email" autocomplete="email" :class="inputClass" />
            <span v-if="errorOf('email')" class="mt-1 block text-xs text-rose-600">{{ errorOf('email') }}</span>
          </label>
          <div class="block">
            <span class="text-sm font-medium text-slate-700">Phone</span>
            <PhoneInput v-model="form.phone" v-model:country="form.country" />
            <span v-if="errorOf('phone') || errorOf('country')" class="mt-1 block text-xs text-rose-600">{{ errorOf('phone') ?? errorOf('country') }}</span>
            <span v-else class="mt-1 block text-xs text-slate-400">Choose your country on the left — the dial code is added for you.</span>
          </div>
        </fieldset>

        <!-- Rental -->
        <fieldset class="space-y-3 border-t border-slate-100 pt-4">
          <legend class="text-sm font-semibold text-slate-800">Rental</legend>
          <div class="grid grid-cols-2 gap-3">
            <label class="block min-w-0">
              <span class="text-sm font-medium text-slate-700">Start date</span>
              <input v-model="form.startDate" type="date" required :class="inputClass" />
            </label>
            <label class="block min-w-0">
              <span class="text-sm font-medium text-slate-700">End date</span>
              <input v-model="form.endDate" type="date" required :min="form.startDate" :class="inputClass" />
              <span v-if="errorOf('endDate')" class="mt-1 block text-xs text-rose-600">{{ errorOf('endDate') }}</span>
            </label>
          </div>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">What will you use it for?</span>
            <textarea
              v-model="form.intendedUse"
              rows="3"
              maxlength="1000"
              placeholder="e.g. Foundation excavation for a 3-storey residential building"
              :class="inputClass"
            />
            <span class="mt-1 block text-xs text-slate-400">Our AI agent reviews this to check the machine suits the job.</span>
          </label>
        </fieldset>

        <!-- Payment -->
        <fieldset class="space-y-2 border-t border-slate-100 pt-4">
          <legend class="text-sm font-semibold text-slate-800">Payment method</legend>
          <div class="grid grid-cols-2 gap-2">
            <label
              v-for="m in PAYMENT_METHODS"
              :key="m.value"
              class="flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition"
              :class="form.paymentMethod === m.value ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:bg-slate-50'"
            >
              <input v-model="form.paymentMethod" type="radio" name="paymentMethod" :value="m.value" class="sr-only" />
              <component :is="m.icon" class="size-4 shrink-0" :class="form.paymentMethod === m.value ? 'text-brand-700' : 'text-slate-400'" />
              <span class="min-w-0">
                <span class="block text-sm font-medium text-slate-800">{{ m.label }}</span>
                <span class="block truncate text-xs text-slate-400">{{ m.hint }}</span>
              </span>
            </label>
          </div>
          <p v-if="!isMpesa" class="text-xs text-slate-400">Payment is due on the last rental day. Nothing is charged now.</p>

          <!-- M-Pesa: the deposit is paid before the request is sent -->
          <div v-else class="space-y-3 rounded-lg border border-brand-200 bg-brand-50/60 p-3">
            <div>
              <span class="text-sm font-medium text-slate-700">M-Pesa number (Vodacom 84 / 85)</span>
              <PhoneInput v-model="mpesaPhone" v-model:country="mpesaCountry" />
              <span v-if="errorOf('mpesaPhone')" class="mt-1 block text-xs text-rose-600">{{ errorOf('mpesaPhone') }}</span>
              <span v-else class="mt-1 block text-xs text-slate-500">You confirm the payment on this phone with your M-Pesa PIN.</span>
            </div>
            <p class="text-xs text-slate-600">
              A <span class="font-semibold">{{ equipment.mpesa.depositPercent }}% deposit</span> is paid now to submit the request; the balance is due on the
              last rental day. If the request is not approved, the deposit is refunded.
            </p>
          </div>
        </fieldset>

        <div class="space-y-1 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Estimate · {{ days }} day{{ days === 1 ? '' : 's' }}</span>
            <span class="font-semibold tabular-nums text-slate-900">{{ formatMoney(estimate) }}</span>
          </div>
          <div v-if="isMpesa" class="flex items-center justify-between border-t border-slate-200 pt-1">
            <span class="font-medium text-brand-800">Pay now with M-Pesa</span>
            <span class="font-semibold tabular-nums text-brand-800">{{ formatMoney(deposit) }}</span>
          </div>
        </div>

        <p v-if="submitError" class="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{{ submitError }}</p>

        <!-- Waiting for the PIN -->
        <div v-if="checkout" class="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <LoaderCircle class="mt-0.5 size-5 shrink-0 animate-spin text-brand-600" />
          <div class="text-sm">
            <p class="font-semibold text-slate-900">Confirm {{ formatMoney(checkout.amount) }} on your phone</p>
            <p class="mt-0.5 text-slate-600">Enter your M-Pesa PIN. Your request is sent as soon as the payment is confirmed.</p>
          </div>
        </div>

        <button v-else type="submit" :disabled="submitting || !days" class="btn-primary w-full py-2.5">
          <LoaderCircle v-if="submitting" class="size-4 animate-spin" />
          <Smartphone v-else-if="isMpesa" class="size-4" />
          <Send v-else class="size-4" />
          {{ isMpesa ? `Pay ${formatMoney(deposit)} with M-Pesa and submit` : 'Submit rental request' }}
        </button>
        <p class="text-center text-xs text-slate-400">
          Availability, maintenance, documents, risk and payments are checked automatically by our agents.
        </p>
      </form>
      <ChatWidget :equipment-code="equipment.code" :equipment-name="equipment.name" />
    </div>
  </AsyncState>
</template>
