<script setup lang="ts">
import { CircleUser, Construction, LogIn, ShieldCheck } from '@lucide/vue';
import { session } from '@/services/session';
</script>

<template>
  <div class="flex min-h-screen flex-col bg-canvas">
    <header class="bg-brand-950 text-white">
      <div class="mx-auto flex max-w-lg items-center gap-2.5 px-4 py-3">
        <span class="grid size-8 place-items-center rounded-md bg-amber-400">
          <Construction class="size-4 text-brand-950" />
        </span>
        <div class="flex-1 leading-tight">
          <p class="text-sm font-semibold tracking-tight">RentOps</p>
          <p class="text-[10px] font-medium tracking-[0.14em] text-brand-300 uppercase">Equipment Rental</p>
        </div>
        <RouterLink
          v-if="session.customer"
          :to="{ name: 'portal' }"
          class="inline-flex max-w-40 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-brand-100 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
        >
          <CircleUser class="size-4 shrink-0" />
          <span class="truncate">My account</span>
        </RouterLink>
        <RouterLink
          v-else-if="$route.name !== 'customer-login'"
          :to="{ name: 'customer-login', query: { redirect: $route.fullPath } }"
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-brand-100 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
        >
          <LogIn class="size-4" /> Sign in
        </RouterLink>
      </div>
    </header>

    <main class="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <RouterView />
    </main>

    <footer class="border-t border-slate-200 bg-white">
      <div class="mx-auto flex max-w-lg flex-col gap-1 px-4 py-4 text-xs text-slate-500">
        <p class="flex items-center gap-1.5 font-medium text-slate-600">
          <ShieldCheck class="size-3.5 text-brand-600" /> Requests are reviewed automatically and every decision is recorded.
        </p>
        <p>© {{ new Date().getFullYear() }} RentOps · Construction equipment rental · Maputo, Mozambique</p>
      </div>
    </footer>
  </div>
</template>
