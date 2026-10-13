<script setup lang="ts">
import { computed } from 'vue';
import type { StatPoint } from '@/types';

/**
 * Horizontal bars, single series: one row per category, value at the bar tip.
 * Every value is printed, so the list doubles as its own table view.
 */
const props = withDefaults(
  defineProps<{
    items: StatPoint[];
    format?: (value: number) => string;
    labelOf?: (label: string) => string;
    /** Extra line shown on hover (e.g. "38 runs"). */
    detailOf?: (item: StatPoint) => string | undefined;
    empty?: string;
  }>(),
  { format: (v: number) => v.toLocaleString('pt-PT'), labelOf: (l: string) => l, empty: 'No data yet' },
);

const max = computed(() => Math.max(...props.items.map((i) => i.value), 0));
const widthOf = (value: number) => (max.value ? `${Math.max((value / max.value) * 100, value > 0 ? 1.5 : 0)}%` : '0%');
</script>

<template>
  <ul v-if="items.length" class="space-y-1">
    <li
      v-for="item in items"
      :key="item.label"
      class="group grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 sm:grid-cols-[minmax(0,15rem)_1fr]"
      :title="[`${labelOf(item.label)}: ${format(item.value)}`, detailOf?.(item)].filter(Boolean).join(' · ')"
    >
      <span class="truncate text-sm text-slate-600">{{ labelOf(item.label) }}</span>
      <span class="flex min-w-0 items-center gap-2">
        <span class="h-3 shrink-0 rounded-r bg-(--series-1) transition-[filter] group-hover:brightness-90" :style="{ width: `calc(${widthOf(item.value)} * 0.75)` }" />
        <span class="whitespace-nowrap text-xs font-medium tabular-nums text-slate-700">{{ format(item.value) }}</span>
        <span v-if="detailOf?.(item)" class="hidden whitespace-nowrap text-xs text-slate-400 group-hover:inline">{{ detailOf(item) }}</span>
      </span>
    </li>
  </ul>
  <p v-else class="py-6 text-center text-sm text-slate-400">{{ empty }}</p>
</template>
