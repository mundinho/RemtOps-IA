<script setup lang="ts">
import { computed } from 'vue';
import type { AgentName } from '@/types';
import { AGENTS } from '@/utils/agents';
import { TONE_CLASSES } from '@/utils/status';

const props = defineProps<{ agent: AgentName }>();
const meta = computed(() => AGENTS[props.agent]);
</script>

<template>
  <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-slate-700">
    <span class="grid size-6 place-items-center rounded-md" :class="TONE_CLASSES[meta.tone].soft">
      <component :is="meta.icon" class="size-3.5" :class="TONE_CLASSES[meta.tone].text" />
    </span>
    {{ meta.label }}
  </span>
</template>
