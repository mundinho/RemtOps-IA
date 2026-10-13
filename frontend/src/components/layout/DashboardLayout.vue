<script setup lang="ts">
import { Activity, Bell, ChartColumn, ClipboardList, Construction, Cpu, Eye, Gavel, Hammer, LayoutDashboard, LogOut, QrCode, Truck, UserCog, Users, Wallet } from '@lucide/vue';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAsync } from '@/composables/useAsync';
import { dashboardApi } from '@/services/dashboard.api';
import { isAdmin, session, setStaff } from '@/services/session';
import { systemApi } from '@/services/system.api';

const router = useRouter();

function signOut() {
  setStaff(null);
  void router.push({ name: 'login' });
}

// Lightweight poll so badge counts (pending reviews, alerts) stay current on every page.
const { data: overview } = useAsync(dashboardApi.overview, { pollMs: 8000 });
const { data: health, error: healthError } = useAsync(systemApi.health, { pollMs: 15000 });

const nav = computed(() => [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { to: '/dashboard/statistics', label: 'Statistics', icon: ChartColumn },
  { to: '/dashboard/agents', label: 'Agent Activity', icon: Activity },
  { to: '/dashboard/decisions', label: 'AI Decisions', icon: Gavel },
  { to: '/dashboard/alerts', label: 'Alerts & Notifications', icon: Bell, badge: overview.value?.kpis.openAlerts || undefined, badgeTone: 'bg-rose-500' },
  { to: '/dashboard/rentals', label: 'Rentals', icon: ClipboardList, badge: overview.value?.kpis.pendingRentals || undefined },
  { to: '/dashboard/customers', label: 'Customers', icon: Users },
  { to: '/dashboard/equipment', label: 'Equipment', icon: Truck },
  { to: '/dashboard/maintenance', label: 'Maintenance', icon: Hammer },
  { to: '/dashboard/finance', label: 'Finance', icon: Wallet },
  { to: '/dashboard/qr-codes', label: 'QR Labels', icon: QrCode },
  ...(isAdmin() ? [{ to: '/dashboard/users', label: 'Users', icon: UserCog }] : []),
]);
</script>

<template>
  <div class="min-h-screen lg:flex">
    <aside class="no-print flex shrink-0 flex-col bg-slate-900 text-slate-300 lg:sticky lg:top-0 lg:h-screen lg:w-60">
      <div class="flex items-center gap-2.5 px-5 py-5">
        <span class="grid size-8 place-items-center rounded-lg bg-amber-400">
          <Construction class="size-4.5 text-slate-900" />
        </span>
        <div class="leading-tight">
          <p class="text-sm font-semibold text-white">RentOps AI</p>
          <p class="text-xs text-slate-400">Equipment Rental Operations</p>
        </div>
      </div>

      <nav class="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          v-slot="{ href, navigate, isActive, isExactActive }"
          :to="item.to"
          custom
        >
          <a
            :href="href"
            class="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition"
            :class="(item.exact ? isExactActive : isActive) ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white'"
            @click="navigate"
          >
            <component :is="item.icon" class="size-4" />
            <span class="flex-1">{{ item.label }}</span>
            <span
              v-if="item.badge"
              class="rounded-full px-1.5 py-px text-xs font-semibold tabular-nums text-white"
              :class="item.badgeTone ?? 'bg-violet-500'"
            >
              {{ item.badge }}
            </span>
          </a>
        </RouterLink>
      </nav>

      <div class="hidden border-t border-slate-800 px-5 py-4 text-xs lg:block">
        <div class="flex items-center gap-2">
          <span class="relative flex size-2">
            <span
              v-if="!healthError"
              class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60"
            />
            <span class="relative inline-flex size-2 rounded-full" :class="healthError ? 'bg-rose-500' : 'bg-emerald-400'" />
          </span>
          <span class="text-slate-300">{{ healthError ? 'API unreachable' : 'Fully autonomous — 0% human decisions' }}</span>
        </div>
        <p class="mt-2 flex items-center gap-1.5 text-slate-500"><Eye class="size-3" /> Read-only: people observe, agents decide</p>
        <p v-if="health" class="mt-2 flex items-center gap-1.5 text-slate-500">
          <Cpu class="size-3" /> {{ health.llm.model }}
        </p>
      </div>

      <div v-if="session.staff" class="flex items-center gap-2 border-t border-slate-800 px-5 py-3 text-xs">
        <div class="min-w-0 flex-1 leading-tight">
          <p class="truncate font-medium text-slate-200">{{ session.staff.user.name }}</p>
          <p class="truncate text-slate-500">{{ session.staff.user.role === 'ADMIN' ? 'Admin' : 'Operator' }} · {{ session.staff.user.email }}</p>
        </div>
        <button type="button" title="Sign out" class="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" @click="signOut">
          <LogOut class="size-4" />
        </button>
      </div>
    </aside>

    <main class="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <RouterView />
    </main>
  </div>
</template>
