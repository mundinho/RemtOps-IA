<script setup lang="ts">
import { ChevronRight } from '@lucide/vue';
import type { AgentName } from '@/types';
import { AGENTS, PIPELINE } from '@/utils/agents';
import { TONE_CLASSES } from '@/utils/status';

/** A route through the agents: the rental request flow by default, or the monitoring cycle. */
withDefaults(defineProps<{ steps?: AgentName[] }>(), { steps: () => PIPELINE });
</script>

<template>
  <ol class="flex flex-wrap items-center gap-1.5">
    <template v-for="(agent, index) in steps" :key="index">
      <li
        class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
      >
        <component :is="AGENTS[agent].icon" class="size-3.5" :class="TONE_CLASSES[AGENTS[agent].tone].text" />
        {{ AGENTS[agent].label.replace(' Agent', '').replace(' & Compliance', '') }}
      </li>
      <ChevronRight v-if="index < steps.length - 1" class="size-3.5 text-slate-300" />
    </template>
  </ol>
</template>
