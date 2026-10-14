<script setup lang="ts">
import { Activity, Construction, LoaderCircle, LogIn, ShieldCheck, WandSparkles, Workflow } from '@lucide/vue';
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authApi } from '@/services/auth.api';
import { setStaff } from '@/services/session';
import { safeRedirect } from '@/utils/redirect';

const route = useRoute();
const router = useRouter();

const form = reactive({ email: '', password: '' });
const submitting = ref(false);
const error = ref('');

// Demo helper for the presentation — the seeded accounts (see backend: npm run auth:demo-accounts)
const DEMO = [
  { label: 'Admin', email: 'admin@demo.local', password: 'admin123' },
  { label: 'Operator', email: 'operador@demo.local', password: 'operador123' },
];

const HIGHLIGHTS = [
  { icon: Workflow, title: 'Autonomous workflow', text: 'Every request is checked by specialised AI agents, end to end.' },
  { icon: ShieldCheck, title: 'Policy first', text: 'Business rules always prevail over the AI — rejects when unsure.' },
  { icon: Activity, title: 'Full traceability', text: 'Every decision, tool call and reason is recorded and auditable.' },
];

async function submit() {
  submitting.value = true;
  error.value = '';
  try {
    setStaff(await authApi.staffLogin(form));
    await router.replace(safeRedirect(route.query.redirect, '/dashboard'));
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not sign in';
  } finally {
    submitting.value = false;
  }
}

const inputClass = 'input';
</script>

<template>
  <div class="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
    <!-- Brand panel -->
    <section class="relative hidden overflow-hidden bg-brand-950 px-12 py-12 text-white lg:flex lg:flex-col">
      <div
        class="pointer-events-none absolute inset-0 opacity-[0.07]"
        style="background-image: linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px); background-size: 40px 40px"
        aria-hidden="true"
      />
      <div class="relative flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-md bg-amber-400">
          <Construction class="size-5 text-brand-950" />
        </span>
        <div class="leading-tight">
          <p class="text-lg font-semibold tracking-tight">RentOps</p>
          <p class="text-[11px] font-medium tracking-[0.14em] text-brand-300 uppercase">Equipment Operations</p>
        </div>
      </div>

      <div class="relative mt-auto max-w-md">
        <h2 class="text-3xl leading-tight font-semibold tracking-tight">Construction equipment rental, operated by AI agents.</h2>
        <p class="mt-3 text-brand-200">Monitor requests, fleet, risk and finance in one place — with every automated decision explained.</p>
        <ul class="mt-8 space-y-4">
          <li v-for="h in HIGHLIGHTS" :key="h.title" class="flex gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-white/10 ring-1 ring-white/15">
              <component :is="h.icon" class="size-4 text-amber-300" />
            </span>
            <div>
              <p class="text-sm font-semibold">{{ h.title }}</p>
              <p class="text-sm text-brand-300">{{ h.text }}</p>
            </div>
          </li>
        </ul>
      </div>
      <p class="relative mt-10 text-xs text-brand-400">© {{ new Date().getFullYear() }} RentOps · Maputo, Mozambique</p>
    </section>

    <!-- Sign-in -->
    <section class="flex flex-col items-center justify-center bg-white px-4 py-10 sm:px-8">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex items-center gap-2.5 lg:hidden">
          <span class="grid size-9 place-items-center rounded-md bg-brand-950">
            <Construction class="size-5 text-amber-400" />
          </span>
          <p class="text-lg font-semibold tracking-tight text-brand-950">RentOps</p>
        </div>

        <p class="eyebrow text-brand-600">Staff access</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Sign in to the dashboard</h1>
        <p class="mt-1.5 text-sm text-slate-500">Use your company account.</p>

        <form class="mt-8 space-y-4" @submit.prevent="submit">
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Email</span>
            <input v-model="form.email" type="email" autocomplete="username" required :class="inputClass" />
          </label>
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Password</span>
            <input v-model="form.password" type="password" autocomplete="current-password" required :class="inputClass" />
          </label>

          <p v-if="error" class="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{{ error }}</p>

          <button type="submit" :disabled="submitting" class="btn-primary w-full py-2.5">
            <LoaderCircle v-if="submitting" class="size-4 animate-spin" />
            <LogIn v-else class="size-4" />
            Sign in
          </button>
        </form>

        <div class="mt-6 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2.5 text-xs">
          <span class="inline-flex items-center gap-1 font-medium text-slate-500"><WandSparkles class="size-3.5" /> Demo accounts:</span>
          <button
            v-for="d in DEMO"
            :key="d.email"
            type="button"
            class="rounded bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800"
            @click="Object.assign(form, { email: d.email, password: d.password })"
          >
            {{ d.label }}
          </button>
        </div>

        <p class="mt-8 text-center text-sm text-slate-500">
          Are you a customer?
          <RouterLink :to="{ name: 'customer-login' }" class="link">Go to the customer area</RouterLink>
        </p>
      </div>
    </section>
  </div>
</template>
