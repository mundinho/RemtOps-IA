<script setup lang="ts">
import { CircleUser, Construction, LogIn } from '@lucide/vue';
import { session } from '@/services/session';
</script>

<template>
  <div class="min-h-screen bg-slate-100">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-lg items-center gap-2.5 px-4 py-3">
        <span class="grid size-7 place-items-center rounded-md bg-amber-400">
          <Construction class="size-4 text-slate-900" />
        </span>
        <span class="flex-1 text-sm font-semibold text-slate-900">RentOps · Equipment Rental</span>
        <RouterLink
          v-if="session.customer"
          :to="{ name: 'portal' }"
          class="inline-flex max-w-40 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <CircleUser class="size-4 shrink-0 text-amber-600" />
          <span class="truncate">My account</span>
        </RouterLink>
        <RouterLink
          v-else-if="$route.name !== 'customer-login'"
          :to="{ name: 'customer-login', query: { redirect: $route.fullPath } }"
          class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <LogIn class="size-4 text-amber-600" /> Sign in
        </RouterLink>
      </div>
    </header>
    <main class="mx-auto max-w-lg px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
