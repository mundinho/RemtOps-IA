<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

export interface Series {
  key: string;
  label: string;
  /** CSS colour, normally a var(--series-n) token. */
  color: string;
}

/**
 * Stacked columns over time. Legend always shown, hover tooltip per column,
 * and a table toggle so no value depends on colour alone.
 */
const props = defineProps<{
  categories: { key: string; label: string }[];
  series: Series[];
  /** values[categoryKey][seriesKey] */
  values: Record<string, Record<string, number>>;
}>();

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 32 };
const GAP = 2; // surface gap between stacked segments
const RADIUS = 4;

const root = ref<HTMLElement | null>(null);
const width = ref(600);
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => (width.value = Math.max(entry!.contentRect.width, 280)));
  if (root.value) observer.observe(root.value);
});
onUnmounted(() => observer?.disconnect());

const totals = computed(() => props.categories.map((c) => props.series.reduce((sum, s) => sum + (props.values[c.key]?.[s.key] ?? 0), 0)));

/** Clean integer ticks: 0 … niceMax in 4 or fewer steps. */
const ticks = computed(() => {
  const max = Math.max(...totals.value, 1);
  const rawStep = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? rawStep);
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
});
const yMax = computed(() => ticks.value.at(-1)!);
const plotH = HEIGHT - PAD.top - PAD.bottom;
const plotW = computed(() => width.value - PAD.left - PAD.right);
const band = computed(() => plotW.value / props.categories.length);
const barW = computed(() => Math.min(24, band.value * 0.6));
const y = (v: number) => PAD.top + plotH - (v / yMax.value) * plotH;

/** Column segments bottom-up; only the topmost visible segment gets the rounded data end. */
const columns = computed(() =>
  props.categories.map((c, i) => {
    const x = PAD.left + band.value * i + (band.value - barW.value) / 2;
    let base = 0;
    const visible = props.series.filter((s) => (props.values[c.key]?.[s.key] ?? 0) > 0);
    const segments = visible.map((s, idx) => {
      const value = props.values[c.key]![s.key]!;
      const y0 = y(base);
      const y1 = y(base + value);
      base += value;
      const isTop = idx === visible.length - 1;
      const top = y1;
      const bottom = y0 - (idx > 0 ? GAP : 0);
      return { key: s.key, color: s.color, path: segmentPath(x, top, barW.value, Math.max(bottom - top, 1), isTop) };
    });
    return { key: c.key, label: c.label, x, cx: PAD.left + band.value * i + band.value / 2, segments, total: totals.value[i]! };
  }),
);

function segmentPath(x: number, top: number, w: number, h: number, rounded: boolean) {
  const r = rounded ? Math.min(RADIUS, h, w / 2) : 0;
  return `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${top + h} Z`;
}

const hover = ref<number | null>(null);
const hovered = computed(() => (hover.value == null ? null : columns.value[hover.value]));
const showTable = ref(false);
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <li v-for="s in series" :key="s.key" class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-sm" :style="{ background: s.color }" />{{ s.label }}
        </li>
      </ul>
      <button class="text-xs font-medium text-slate-500 hover:text-slate-800" @click="showTable = !showTable">
        {{ showTable ? 'Show chart' : 'Show table' }}
      </button>
    </div>

    <div v-show="!showTable" ref="root" class="relative" @mouseleave="hover = null">
      <svg :width="width" :height="HEIGHT" class="block" role="img" aria-label="Stacked column chart">
        <g>
          <template v-for="t in ticks" :key="t">
            <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" :stroke="t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'" stroke-width="1" />
            <text :x="PAD.left - 8" :y="y(t)" dy="0.32em" text-anchor="end" class="fill-slate-400 text-[11px] tabular-nums">{{ t }}</text>
          </template>
        </g>
        <g v-for="(col, i) in columns" :key="col.key">
          <rect
            :x="PAD.left + band * i"
            :y="PAD.top"
            :width="band"
            :height="plotH"
            :fill="hover === i ? 'var(--chart-hover)' : 'transparent'"
            @mouseenter="hover = i"
          />
          <path v-for="seg in col.segments" :key="seg.key" :d="seg.path" :fill="seg.color" class="pointer-events-none" />
          <text :x="col.cx" :y="HEIGHT - 8" text-anchor="middle" class="pointer-events-none fill-slate-500 text-[11px]">{{ col.label }}</text>
        </g>
      </svg>

      <div
        v-if="hovered"
        class="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
        :style="{ left: `${Math.min(hovered.cx + 14, width - 160)}px` }"
      >
        <p class="mb-1 font-semibold text-slate-900">{{ hovered.label }}</p>
        <p v-for="s in series" :key="s.key" class="flex items-center justify-between gap-4 text-slate-600">
          <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm" :style="{ background: s.color }" />{{ s.label }}</span>
          <span class="tabular-nums font-medium text-slate-800">{{ values[hovered.key]?.[s.key] ?? 0 }}</span>
        </p>
        <p class="mt-1 flex justify-between border-t border-slate-100 pt-1 text-slate-500">
          <span>Total</span><span class="tabular-nums font-medium text-slate-800">{{ hovered.total }}</span>
        </p>
      </div>
    </div>

    <table v-if="showTable" class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <th class="py-2 font-medium">Month</th>
          <th v-for="s in series" :key="s.key" class="py-2 text-right font-medium">{{ s.label }}</th>
          <th class="py-2 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr v-for="col in columns" :key="col.key">
          <td class="py-1.5 text-slate-700">{{ col.label }}</td>
          <td v-for="s in series" :key="s.key" class="py-1.5 text-right tabular-nums text-slate-700">{{ values[col.key]?.[s.key] ?? 0 }}</td>
          <td class="py-1.5 text-right font-medium tabular-nums text-slate-900">{{ col.total }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
