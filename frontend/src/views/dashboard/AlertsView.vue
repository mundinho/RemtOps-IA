<script setup lang="ts">
import { Bell, Mail, TriangleAlert } from '@lucide/vue';
import { computed, ref } from 'vue';
import AgentBadge from '@/components/agents/AgentBadge.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { agentsApi } from '@/services/agents.api';
import type { AlertCategory } from '@/types';
import { formatDateTime } from '@/utils/format';

const tab = ref<'alerts' | 'notifications'>('alerts');
const alerts = useAsync(agentsApi.alerts, { pollMs: 6000 });
const notifications = useAsync(agentsApi.notifications, { pollMs: 6000 });

const CATEGORIES: (AlertCategory | 'ALL')[] = ['ALL', 'MAINTENANCE', 'FINANCE', 'RISK', 'OPERATIONS'];
const category = ref<AlertCategory | 'ALL'>('ALL');
const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const visibleAlerts = computed(() =>
  (alerts.data.value ?? [])
    .filter((a) => category.value === 'ALL' || a.category === category.value)
    .sort((a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
);
const expanded = ref<string | null>(null);
</script>

<template>
  <PageHeader
    title="Alerts & notifications"
    description="Alerts raised by the agents (deduplicated across monitoring cycles) and every notification they sent, ordered by priority."
  />

  <div class="mb-4 flex flex-wrap gap-1.5">
    <button
      class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition"
      :class="tab === 'alerts' ? 'bg-brand-700 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'"
      @click="tab = 'alerts'"
    >
      <TriangleAlert class="size-4" /> Alerts <span class="tabular-nums opacity-60">{{ alerts.data.value?.filter((a) => a.status === 'OPEN').length ?? 0 }} open</span>
    </button>
    <button
      class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition"
      :class="tab === 'notifications' ? 'bg-brand-700 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'"
      @click="tab = 'notifications'"
    >
      <Mail class="size-4" /> Notifications sent <span class="tabular-nums opacity-60">{{ notifications.data.value?.length ?? 0 }}</span>
    </button>
  </div>

  <template v-if="tab === 'alerts'">
    <div class="mb-4 flex flex-wrap gap-1.5">
      <button
        v-for="c in CATEGORIES"
        :key="c"
        class="rounded-full px-2.5 py-1 text-xs font-medium transition"
        :class="category === c ? 'bg-brand-700 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50'"
        @click="category = c"
      >
        {{ c === 'ALL' ? 'All categories' : c.charAt(0) + c.slice(1).toLowerCase() }}
      </button>
    </div>
    <AsyncState :loading="alerts.loading.value" :error="alerts.error.value" :has-data="!!alerts.data.value" @retry="alerts.refresh">
      <Panel flush>
        <ul v-if="visibleAlerts.length" class="divide-y divide-slate-100">
          <li v-for="a in visibleAlerts" :key="a.id" class="px-4 py-3" :class="a.status !== 'OPEN' && 'opacity-60'">
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge :status="a.severity" />
              <StatusBadge v-if="a.category" :status="a.category" />
              <button class="min-w-0 flex-1 text-left text-sm font-medium text-slate-800" @click="expanded = expanded === a.id ? null : a.id">
                {{ a.title }}
              </button>
              <AgentBadge :agent="a.sourceAgent" />
              <span class="text-xs text-slate-400">{{ formatDateTime(a.createdAt) }}</span>
              <StatusBadge v-if="a.status && a.status !== 'OPEN'" :status="a.status" />
            </div>
            <p v-if="expanded === a.id" class="mt-2 text-sm text-slate-600">{{ a.message }}</p>
          </li>
        </ul>
        <EmptyState v-else compact :icon="TriangleAlert" title="No alerts in this category" />
      </Panel>
    </AsyncState>
  </template>

  <AsyncState v-else :loading="notifications.loading.value" :error="notifications.error.value" :has-data="!!notifications.data.value" @retry="notifications.refresh">
    <div v-if="notifications.data.value?.length" class="space-y-3">
      <article v-for="n in notifications.data.value" :key="n.id" class="rounded-lg border border-slate-200 bg-white shadow-xs p-4">
        <header class="flex flex-wrap items-center gap-2">
          <StatusBadge :status="n.priority" :label="`${n.priority.charAt(0)}${n.priority.slice(1).toLowerCase()} priority`" />
          <span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{{ n.type }}</span>
          <span class="text-xs text-slate-400">{{ n.channel === 'EMAIL' ? 'Email' : n.channel === 'SMS' ? 'SMS' : 'Internal' }} → {{ n.recipient }}</span>
          <span class="ml-auto flex items-center gap-2 text-xs text-slate-400">{{ formatDateTime(n.createdAt) }} <StatusBadge :status="n.status" /></span>
        </header>
        <p class="mt-2 text-sm font-medium text-slate-900">{{ n.subject }}</p>
        <p class="mt-1 whitespace-pre-line text-sm text-slate-600">{{ n.body }}</p>
      </article>
    </div>
    <div v-else class="rounded-lg border border-dashed border-slate-300 bg-white">
      <EmptyState :icon="Bell" title="No notifications yet" />
    </div>
  </AsyncState>
</template>
