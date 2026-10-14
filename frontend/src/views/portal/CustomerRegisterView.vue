<script setup lang="ts">
import { CircleCheck, CircleX, LoaderCircle, ShieldCheck, UserCheck, UserPlus } from '@lucide/vue';
import { onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PhoneInput from '@/components/ui/PhoneInput.vue';
import { authApi } from '@/services/auth.api';
import { ApiError } from '@/services/http';
import { setCustomer } from '@/services/session';
import type { RegistrationStatus } from '@/types';
import { DEFAULT_COUNTRY } from '@/utils/countries';
import { safeRedirect } from '@/utils/redirect';

const route = useRoute();
const router = useRouter();

const form = reactive({ companyName: '', taxId: '', contactName: '', email: '', phone: '', country: DEFAULT_COUNTRY, password: '', confirm: '' });
const submitting = ref(false);
const submitError = ref<string | null>(null);
const fieldErrors = ref<Record<string, string[]>>({});

// After submitting: the Onboarding Agent decides in the background; this page follows it.
// The id lives in the URL, so a refresh keeps following the same registration.
const registrationId = ref(typeof route.query.registration === 'string' ? route.query.registration : '');
const status = ref<RegistrationStatus | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

async function submit() {
  submitError.value = null;
  fieldErrors.value = {};
  if (form.password !== form.confirm) {
    fieldErrors.value = { confirm: ['Passwords do not match'] };
    return;
  }
  submitting.value = true;
  try {
    const { confirm: _confirm, ...payload } = form;
    const created = await authApi.register(payload);
    registrationId.value = created.registrationId;
    await router.replace({ query: { ...route.query, registration: created.registrationId } });
  } catch (e) {
    if (e instanceof ApiError && e.details) fieldErrors.value = e.details;
    submitError.value = e instanceof Error ? e.message : 'Could not create the account';
  } finally {
    submitting.value = false;
  }
}

async function poll() {
  try {
    status.value = await authApi.registrationStatus(registrationId.value);
  } catch {
    // keep the last known state; the next tick retries
  }
  if (status.value && status.value.status !== 'PENDING') {
    clearInterval(timer);
    // Still holding the password from this page → sign straight in.
    if (status.value.status === 'ACTIVE' && form.password && status.value.email) {
      try {
        setCustomer(await authApi.customerLogin({ email: status.value.email, password: form.password }));
        await router.replace(safeRedirect(route.query.redirect, '/client'));
      } catch {
        // fall back to the sign-in button
      }
    }
  }
}

watch(
  registrationId,
  (id) => {
    clearInterval(timer);
    if (!id) return;
    void poll();
    timer = setInterval(poll, 3000);
  },
  { immediate: true },
);
onUnmounted(() => clearInterval(timer));

function startOver() {
  registrationId.value = '';
  status.value = null;
  void router.replace({ query: { ...route.query, registration: undefined } });
}

const inputClass =
  'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20';
const errorOf = (field: string) => fieldErrors.value[field]?.[0];
</script>

<template>
  <!-- Following the Onboarding Agent's decision -->
  <section v-if="registrationId" class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div class="flex items-center gap-2 text-xs font-medium text-slate-500">
      <UserCheck class="size-4 text-teal-600" /> Onboarding Agent
    </div>

    <template v-if="!status || status.status === 'PENDING'">
      <div class="flex items-start gap-3">
        <LoaderCircle class="mt-0.5 size-5 shrink-0 animate-spin text-amber-600" />
        <div>
          <h1 class="text-base font-semibold text-slate-900">Validating your registration…</h1>
          <p class="mt-1 text-sm text-slate-500">
            Our AI agent is checking your company details. No person is involved — this usually takes from a few seconds to a couple
            of minutes. You can keep this page open.
          </p>
        </div>
      </div>
    </template>

    <template v-else-if="status.status === 'ACTIVE'">
      <div class="flex items-start gap-3">
        <CircleCheck class="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div>
          <h1 class="text-base font-semibold text-slate-900">Account activated</h1>
          <p class="mt-1 text-sm text-slate-500">{{ status.companyName }} can now sign in and request equipment.</p>
        </div>
      </div>
      <p v-if="status.reason" class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><span class="font-medium">Agent:</span> {{ status.reason }}</p>
      <RouterLink
        :to="{ name: 'customer-login', query: { email: status.email ?? undefined, redirect: route.query.redirect } }"
        class="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-300"
      >
        Sign in
      </RouterLink>
    </template>

    <template v-else>
      <div class="flex items-start gap-3">
        <CircleX class="mt-0.5 size-5 shrink-0 text-rose-600" />
        <div>
          <h1 class="text-base font-semibold text-slate-900">Registration not accepted</h1>
          <p class="mt-1 text-sm text-slate-500">The agent could not validate this registration.</p>
        </div>
      </div>
      <p v-if="status.reason" class="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{{ status.reason }}</p>
      <button type="button" class="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="startOver">
        Correct and try again
      </button>
    </template>
  </section>

  <!-- Registration form -->
  <form v-else class="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" novalidate @submit.prevent="submit">
    <div>
      <h1 class="text-lg font-semibold text-slate-900">Create a customer account</h1>
      <p class="text-sm text-slate-500">Your company is identified by its NUIT. Already rented with us? Use the email we have on file.</p>
    </div>

    <fieldset class="space-y-3">
      <legend class="text-sm font-semibold text-slate-800">Company</legend>
      <label class="block">
        <span class="text-sm font-medium text-slate-700">Company / full name</span>
        <input v-model="form.companyName" autocomplete="organization" :class="inputClass" />
        <span v-if="errorOf('companyName')" class="mt-1 block text-xs text-rose-600">{{ errorOf('companyName') }}</span>
      </label>
      <label class="block">
        <span class="text-sm font-medium text-slate-700">NUIT</span>
        <input v-model="form.taxId" inputmode="numeric" maxlength="9" placeholder="9 digits" :class="inputClass" />
        <span v-if="errorOf('taxId')" class="mt-1 block text-xs text-rose-600">{{ errorOf('taxId') }}</span>
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

    <fieldset class="space-y-3 border-t border-slate-100 pt-4">
      <legend class="text-sm font-semibold text-slate-800">Password</legend>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="block min-w-0">
          <span class="text-sm font-medium text-slate-700">Password</span>
          <input v-model="form.password" type="password" autocomplete="new-password" :class="inputClass" />
          <span v-if="errorOf('password')" class="mt-1 block text-xs text-rose-600">{{ errorOf('password') }}</span>
          <span v-else class="mt-1 block text-xs text-slate-400">At least 8 characters.</span>
        </label>
        <label class="block min-w-0">
          <span class="text-sm font-medium text-slate-700">Confirm password</span>
          <input v-model="form.confirm" type="password" autocomplete="new-password" :class="inputClass" />
          <span v-if="errorOf('confirm')" class="mt-1 block text-xs text-rose-600">{{ errorOf('confirm') }}</span>
        </label>
      </div>
    </fieldset>

    <p v-if="submitError" class="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{{ submitError }}</p>

    <button
      type="submit"
      :disabled="submitting"
      class="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
    >
      <LoaderCircle v-if="submitting" class="size-4 animate-spin" />
      <UserPlus v-else class="size-4" />
      Create account
    </button>
    <p class="flex items-start gap-1.5 text-xs text-slate-400">
      <ShieldCheck class="mt-px size-3.5 shrink-0" /> Every registration is validated automatically by our Onboarding Agent before the account
      is activated.
    </p>
    <p class="text-center text-sm text-slate-500">
      Already have an account?
      <RouterLink :to="{ name: 'customer-login', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="font-medium text-amber-700">
        Sign in
      </RouterLink>
    </p>
  </form>
</template>
