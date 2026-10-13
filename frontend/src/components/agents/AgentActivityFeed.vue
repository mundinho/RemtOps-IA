<script setup lang="ts">
import { ChevronDown, ChevronRight, Cpu, LoaderCircle, ShieldAlert } from '@lucide/vue';
import { ref } from 'vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { agentsApi } from '@/services/agents.api';
import type { AgentExecutionDetail, AgentExecutionSummary } from '@/types';
import { formatDate, formatTime } from '@/utils/format';
import AgentBadge from './AgentBadge.vue';
import ToolCallList from './ToolCallList.vue';

/**
 * Timeline of agent executions. With `expandable`, each row opens to show the agent's
 * reasoning and every tool call it made — the "why" behind each decision.
 */
const props = defineProps<{ executions: AgentExecutionSummary[]; expandable?: boolean; showDate?: boolean }>();

const openId = ref<string | null>(null);
const details = ref<Record<string, AgentExecutionDetail>>({});
const loadingId = ref<string | null>(null);

async function toggle(id: string) {
  if (!props.expandable) return;
  openId.value = openId.value === id ? null : id;
  if (openId.value && !details.value[id]) {
    loadingId.value = id;
    try {
      details.value[id] = await agentsApi.execution(id);
    } finally {
      loadingId.value = null;
    }
  }
}
</script>

<template>
  <ol class="relative">
    <li v-for="execution in executions" :key="execution.id" class="relative pl-6">
      <!-- timeline rail -->
      <span class="absolute left-[7px] top-0 h-full w-px bg-slate-200" />
      <span
        class="absolute left-0 top-4 size-[15px] rounded-full border-2 border-white ring-1"
        :class="
          execution.status === 'FAILED'
            ? 'bg-rose-500 ring-rose-200'
            : execution.status === 'RUNNING'
              ? 'animate-pulse bg-sky-500 ring-sky-200'
              : 'bg-slate-300 ring-slate-200'
        "
      />

      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-3"
        :class="expandable && 'cursor-pointer hover:bg-slate-50'"
        @click="toggle(execution.id)"
      >
        <span class="font-mono text-xs tabular-nums text-slate-400">
          <template v-if="showDate">{{ formatDate(execution.startedAt) }} · </template>{{ formatTime(execution.startedAt) }}
        </span>
        <AgentBadge :agent="execution.agent" />
        <span class="min-w-0 flex-1 truncate text-sm text-slate-600">{{ execution.summary ?? 'Working…' }}</span>
        <span v-if="execution.rental" class="font-mono text-xs text-slate-400">{{ execution.rental.code }}</span>
        <span v-else class="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
          {{ execution.agent === 'ASSISTANT' ? 'Customer chat' : execution.agent === 'ONBOARDING' ? 'Registration' : 'Monitoring' }}
        </span>
        <StatusBadge v-if="execution.decision" :status="execution.decision" />
        <component
          :is="openId === execution.id ? ChevronDown : ChevronRight"
          v-if="expandable"
          class="size-4 text-slate-300"
        />
      </div>

      <div v-if="openId === execution.id" class="mb-3 ml-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div v-if="loadingId === execution.id" class="flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle class="size-4 animate-spin" /> Loading trace…
        </div>
        <template v-else-if="details[execution.id]">
          <div class="flex flex-wrap gap-2 text-xs text-slate-500">
            <span class="inline-flex items-center gap-1 rounded bg-white px-2 py-1 ring-1 ring-slate-200">
              <Cpu class="size-3" />
              {{ details[execution.id]!.usedLLM ? details[execution.id]!.model : 'Deterministic rules only' }}
            </span>
            <span v-if="details[execution.id]!.confidence != null" class="rounded bg-white px-2 py-1 ring-1 ring-slate-200">
              Confidence {{ Math.round(details[execution.id]!.confidence! * 100) }}%
            </span>
            <span v-if="details[execution.id]!.durationMs != null" class="rounded bg-white px-2 py-1 ring-1 ring-slate-200">
              {{ (details[execution.id]!.durationMs! / 1000).toFixed(1) }} s
            </span>
            <span
              v-if="details[execution.id]!.policyOverride"
              class="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-rose-700 ring-1 ring-rose-200"
            >
              <ShieldAlert class="size-3" /> Policy guard overrode the LLM
            </span>
          </div>
          <div v-if="details[execution.id]!.reasoning">
            <p class="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Reasoning</p>
            <p class="text-sm text-slate-700">{{ details[execution.id]!.reasoning }}</p>
          </div>
          <div v-if="details[execution.id]!.error" class="text-sm text-rose-600">{{ details[execution.id]!.error }}</div>
          <div>
            <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              Tool calls ({{ details[execution.id]!.toolCalls.length }})
            </p>
            <ToolCallList :tool-calls="details[execution.id]!.toolCalls" />
          </div>
        </template>
      </div>
    </li>
  </ol>
</template>
