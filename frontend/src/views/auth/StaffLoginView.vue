<script setup lang="ts">
import { Construction, LoaderCircle, LogIn, WandSparkles } from '@lucide/vue';
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

const inputClass =
  'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20';
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-slate-900 px-4 py-10">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center justify-center gap-2.5">
        <span class="grid size-9 place-items-center rounded-lg bg-amber-400">
          <Construction class="size-5 text-slate-900" />
        </span>
        <div class="leading-tight">
          <p class="text-base font-semibold text-white">RentOps AI</p>
          <p class="text-xs text-slate-400">Operations dashboard</p>
        </div>
      </div>

      <form class="space-y-4 rounded-2xl bg-white p-6 shadow-xl" @submit.prevent="submit">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">Staff sign in</h1>
          <p class="text-sm text-slate-500">Observe what the agents are doing and manage master data.</p>
        </div>

        <label class="block">
          <span class="text-sm font-medium text-slate-700">Email</span>
          <input v-model="form.email" type="email" autocomplete="username" required :class="inputClass" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Password</span>
          <input v-model="form.password" type="password" autocomplete="current-password" required :class="inputClass" />
        </label>

        <p v-if="error" class="rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{{ error }}</p>

        <button
          type="submit"
          :disabled="submitting"
          class="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
        >
          <LoaderCircle v-if="submitting" class="size-4 animate-spin" />
          <LogIn v-else class="size-4" />
          Sign in
        </button>

        <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
          <span class="inline-flex items-center gap-1 font-medium text-amber-700"><WandSparkles class="size-3.5" /> Demo:</span>
          <button
            v-for="d in DEMO"
            :key="d.email"
            type="button"
            class="rounded-md bg-slate-100 px-2 py-1 text-slate-700 hover:bg-slate-200"
            @click="Object.assign(form, { email: d.email, password: d.password })"
          >
            {{ d.label }}
          </button>
        </div>
      </form>

      <p class="mt-4 text-center text-sm text-slate-400">
        Are you a customer?
        <RouterLink :to="{ name: 'customer-login' }" class="font-medium text-amber-400 hover:text-amber-300">Customer area</RouterLink>
      </p>
    </div>
  </div>
</template>
