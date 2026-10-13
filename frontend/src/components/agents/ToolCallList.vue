<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { ref } from 'vue';
import JsonBlock from '@/components/ui/JsonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import type { ToolCall } from '@/types';

/** The tools an agent invoked, in order — including DENIED attempts outside its allowlist. */
defineProps<{ toolCalls: ToolCall[] }>();
const expanded = ref<string | null>(null);

const SOURCE: Record<ToolCall['source'], { label: string; title: string; class: string }> = {
  LLM: { label: 'LLM chose', title: 'The model decided to call this tool', class: 'bg-sky-50 text-sky-700' },
  POLICY: { label: 'Policy', title: 'Required evidence the model did not request — fetched by the agent', class: 'bg-slate-100 text-slate-600' },
  AGENT: { label: 'Action', title: 'Side effect executed by agent code after the decision (audited)', class: 'bg-amber-50 text-amber-800' },
};
</script>

<template>
  <ol class="space-y-1.5">
    <li v-for="(call, i) in toolCalls" :key="call.id" class="rounded-lg border border-slate-200 bg-white">
      <button
        class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        @click="expanded = expanded === call.id ? null : call.id"
      >
        <component :is="expanded === call.id ? ChevronDown : ChevronRight" class="size-4 text-slate-400" />
        <span class="w-5 text-xs tabular-nums text-slate-400">{{ i + 1 }}.</span>
        <code class="font-mono text-xs font-medium text-slate-800">{{ call.toolName }}()</code>
        <span class="rounded px-1.5 py-0.5 text-[11px] font-medium" :class="SOURCE[call.source].class" :title="SOURCE[call.source].title">
          {{ SOURCE[call.source].label }}
        </span>
        <span class="flex-1" />
        <span v-if="call.durationMs != null" class="text-xs tabular-nums text-slate-400">{{ call.durationMs }} ms</span>
        <StatusBadge :status="call.status" />
      </button>
      <div v-if="expanded === call.id" class="space-y-2 border-t border-slate-100 p-3">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Arguments</p>
        <JsonBlock :value="call.arguments" />
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Result</p>
        <p v-if="call.errorMessage" class="text-sm text-rose-600">{{ call.errorMessage }}</p>
        <JsonBlock v-else :value="call.result" />
      </div>
    </li>
  </ol>
</template>
