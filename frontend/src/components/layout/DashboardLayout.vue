<script setup lang="ts">
import {
  Activity,
  Bell,
  ChartColumn,
  ClipboardList,
  Construction,
  Cpu,
  Eye,
  FileText,
  Gavel,
  Hammer,
  LayoutDashboard,
  LogOut,
  QrCode,
  Truck,
  UserCog,
  Users,
  Wallet,
} from '@lucide/vue';
import { computed, type Component } from 'vue';
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

interface NavItem {
  to: string;
  label: string;
  icon: Component;
  exact?: boolean;
  badge?: number;
  badgeTone?: string;
}

const groups = computed<{ label: string; items: NavItem[] }[]>(() => [
  {
    label: 'Monitor',
    items: [
      { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
      { to: '/dashboard/statistics', label: 'Statistics', icon: ChartColumn },
      { to: '/dashboard/reports', label: 'Reports', icon: FileText },
      { to: '/dashboard/agents', label: 'Agent Activity', icon: Activity },
      { to: '/dashboard/decisions', label: 'AI Decisions', icon: Gavel },
      { to: '/dashboard/alerts', label: 'Alerts & Notifications', icon: Bell, badge: overview.value?.kpis.openAlerts || undefined, badgeTone: 'bg-rose-500' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/dashboard/rentals', label: 'Rentals', icon: ClipboardList, badge: overview.value?.kpis.pendingRentals || undefined },
      { to: '/dashboard/customers', label: 'Customers', icon: Users },
      { to: '/dashboard/equipment', label: 'Equipment', icon: Truck },
      { to: '/dashboard/maintenance', label: 'Maintenance', icon: Hammer },
      { to: '/dashboard/finance', label: 'Finance', icon: Wallet },
      { to: '/dashboard/qr-codes', label: 'QR Labels', icon: QrCode },
    ],
  },
  ...(isAdmin() ? [{ label: 'Administration', items: [{ to: '/dashboard/users', label: 'Users', icon: UserCog }] }] : []),
]);

const initials = computed(() =>
  (session.staff?.user.name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
);
</script>

<template>
  <div class="min-h-screen lg:flex">
    <aside class="no-print flex shrink-0 flex-col bg-brand-950 text-brand-100 lg:sticky lg:top-0 lg:h-screen lg:w-64">
      <!-- Brand -->
      <div class="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <span class="grid size-9 place-items-center rounded-md bg-amber-400 shadow-sm">
          <Construction class="size-5 text-brand-950" />
        </span>
        <div class="leading-tight">
          <p class="text-[15px] font-semibold tracking-tight text-white">RentOps</p>
          <p class="text-[11px] font-medium tracking-[0.12em] text-brand-300 uppercase">Equipment Operations</p>
        </div>
      </div>

      <!-- Navigation: grouped on desktop, one scrollable row on phones -->
      <nav class="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-1 lg:flex-col lg:gap-5 lg:overflow-y-auto">
        <div v-for="group in groups" :key="group.label" class="flex gap-1 lg:flex-col">
          <p class="hidden px-3 pb-1 text-[10.5px] font-semibold tracking-[0.12em] text-brand-400 uppercase lg:block">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            v-slot="{ href, navigate, isActive, isExactActive }"
            :to="item.to"
            custom
          >
            <a
              :href="href"
              class="relative flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition"
              :class="
                (item.exact ? isExactActive : isActive)
                  ? 'bg-white/10 text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-amber-400'
                  : 'text-brand-200 hover:bg-white/5 hover:text-white'
              "
              @click="navigate"
            >
              <component :is="item.icon" class="size-4 shrink-0 opacity-90" />
              <span class="flex-1 whitespace-nowrap">{{ item.label }}</span>
              <span
                v-if="item.badge"
                class="rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums text-white"
                :class="item.badgeTone ?? 'bg-brand-500'"
              >
                {{ item.badge }}
              </span>
            </a>
          </RouterLink>
        </div>
      </nav>

      <!-- System status -->
      <div class="hidden border-t border-white/10 px-5 py-4 text-xs lg:block">
        <div class="flex items-center gap-2">
          <span class="relative flex size-2">
            <span v-if="!healthError" class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span class="relative inline-flex size-2 rounded-full" :class="healthError ? 'bg-rose-500' : 'bg-emerald-400'" />
          </span>
          <span class="text-brand-100">{{ healthError ? 'API unreachable' : 'Autonomous operations online' }}</span>
        </div>
        <p class="mt-2 flex items-center gap-1.5 text-brand-300"><Eye class="size-3" /> Read-only: people observe, agents decide</p>
        <p v-if="health" class="mt-1.5 flex items-center gap-1.5 text-brand-300"><Cpu class="size-3" /> Model: {{ health.llm.model }}</p>
      </div>

      <!-- Signed-in user -->
      <div v-if="session.staff" class="flex items-center gap-3 border-t border-white/10 px-5 py-3">
        <span class="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white ring-1 ring-white/20">
          {{ initials }}
        </span>
        <div class="min-w-0 flex-1 leading-tight">
          <p class="truncate text-sm font-medium text-white">{{ session.staff.user.name }}</p>
          <p class="truncate text-xs text-brand-300">{{ session.staff.user.role === 'ADMIN' ? 'Administrator' : 'Operator' }}</p>
        </div>
        <button type="button" title="Sign out" aria-label="Sign out" class="rounded-md p-1.5 text-brand-300 hover:bg-white/10 hover:text-white" @click="signOut">
          <LogOut class="size-4" />
        </button>
      </div>
    </aside>

    <main class="min-w-0 flex-1">
      <div class="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <RouterView />
      </div>
    </main>
  </div>
</template>
