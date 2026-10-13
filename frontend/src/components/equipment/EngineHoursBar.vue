<script setup lang="ts">
import { computed } from 'vue';

/** Engine hours used since the last service, against the service interval. */
const props = defineProps<{ sinceService: number; interval: number | null }>();

const ratio = computed(() => (props.interval ? props.sinceService / props.interval : 0));
const tone = computed(() => (ratio.value >= 1 ? 'bg-rose-500' : ratio.value >= 0.9 ? 'bg-amber-400' : 'bg-emerald-500'));
</script>

<template>
  <div v-if="interval" class="w-36">
    <div class="flex justify-between text-xs tabular-nums">
      <span :class="ratio >= 1 ? 'font-medium text-rose-600' : 'text-slate-600'">{{ sinceService }} / {{ interval }} h</span>
      <span class="text-slate-400">{{ Math.round(ratio * 100) }}%</span>
    </div>
    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div class="h-full rounded-full" :class="tone" :style="{ width: `${Math.min(ratio, 1) * 100}%` }" />
    </div>
  </div>
  <span v-else class="text-slate-300">—</span>
</template>
