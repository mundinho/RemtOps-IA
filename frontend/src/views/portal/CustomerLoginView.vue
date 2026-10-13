<script setup lang="ts">
import { LoaderCircle, LogIn, UserPlus, WandSparkles } from '@lucide/vue';
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authApi } from '@/services/auth.api';
import { setCustomer } from '@/services/session';
import { safeRedirect } from '@/utils/redirect';

const route = useRoute();
const router = useRouter();

const form = reactive({ email: typeof route.query.email === 'string' ? route.query.email : '', password: '' });
const submitting = ref(false);
const error = ref('');

async function submit() {
  submitting.value = true;
  error.value = '';
  try {
    setCustomer(await authApi.customerLogin(form));
    await router.replace(safeRedirect(route.query.redirect, '/client'));
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
  <div class="space-y-4">
    <form class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" @submit.prevent="submit">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Customer sign in</h1>
        <p class="text-sm text-slate-500">Follow your rental requests and request equipment with your details filled in.</p>
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

      <button
        type="button"
        class="flex w-full items-center justify-center gap-1 text-xs font-medium text-amber-700"
        @click="Object.assign(form, { email: 'joao.silva@construcoessilva.co.mz', password: 'cliente123' })"
      >
        <WandSparkles class="size-3.5" /> Demo: Construções Silva (CUS-001)
      </button>
    </form>

    <RouterLink
      :to="{ name: 'customer-register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }"
      class="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 text-sm font-medium text-slate-700 hover:bg-white"
    >
      <UserPlus class="size-4 text-amber-600" /> New customer? Create an account
    </RouterLink>
  </div>
</template>
