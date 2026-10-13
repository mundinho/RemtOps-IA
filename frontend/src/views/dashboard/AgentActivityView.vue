<script setup lang="ts">
import { Bot } from '@lucide/vue';
import { computed, ref } from 'vue';
import AgentActivityFeed from '@/components/agents/AgentActivityFeed.vue';
import AgentPipeline from '@/components/agents/AgentPipeline.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import { useAsync } from '@/composables/useAsync';
import { agentsApi } from '@/services/agents.api';
import type { AgentName } from '@/types';
import { AGENTS, MONITORING_PIPELINE } from '@/utils/agents';
import { TONE_CLASSES } from '@/utils/status';

const agentFilter = ref<AgentName | undefined>();
const { data, loading, error, refresh } = useAsync(
  () => agentsApi.executions({ agent: agentFilter.value, limit: 100 }),
  { pollMs: 3000 },
);

const agentNames = Object.keys(AGENTS) as AgentName[];
const counts = computed(() => {
  const result: Partial<Record<AgentName, number>> = {};
  for (const e of data.value ?? []) result[e.agent] = (result[e.agent] ?? 0) + 1;
  return result;
});

function setFilter(agent?: AgentName) {
  agentFilter.value = agentFilter.value === agent ? undefined : agent;
  void refresh();
}
</script>

<template>
  <PageHeader
    title="Agent activity"
    description="Every agent run: which agent acted, when, which tools it used, what it decided and why. Click a row to inspect the full trace."
  />

  <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
    <button
      v-for="name in agentNames"
      :key="name"
      class="rounded-xl border bg-white p-4 text-left transition hover:shadow-sm"
      :class="agentFilter === name ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'"
      @click="setFilter(name)"
    >
      <div class="flex items-center justify-between">
        <span class="grid size-8 place-items-center rounded-lg" :class="TONE_CLASSES[AGENTS[name].tone].soft">
          <component :is="AGENTS[name].icon" class="size-4" :class="TONE_CLASSES[AGENTS[name].tone].text" />
        </span>
        <span v-if="!agentFilter" class="text-xs tabular-nums text-slate-400">{{ counts[name] ?? 0 }} runs</span>
      </div>
      <p class="mt-3 text-sm font-semibold text-slate-900">{{ AGENTS[name].label }}</p>
      <p class="mt-1 text-xs leading-relaxed text-slate-500">{{ AGENTS[name].responsibility }}</p>
    </button>
  </div>

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <Panel :title="agentFilter ? `${AGENTS[agentFilter].label} — runs` : 'All agent runs'">
      <template v-if="agentFilter" #actions>
        <button class="text-sm font-medium text-slate-500 hover:text-slate-800" @click="setFilter()">Clear filter</button>
      </template>
      <AgentActivityFeed v-if="data?.length" :executions="data" expandable show-date />
      <EmptyState
        v-else
        :icon="Bot"
        title="No agent runs yet"
        description="Requests flow through the first route; the monitoring cycle runs the second on a schedule. Each step appears here in real time."
      >
        <div class="flex flex-col items-center gap-3">
          <AgentPipeline />
          <AgentPipeline :steps="MONITORING_PIPELINE" />
        </div>
      </EmptyState>
    </Panel>
  </AsyncState>
</template>
