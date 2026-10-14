<script setup lang="ts">
import type { Component } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { TONE_CLASSES, type Tone } from '@/utils/status';

withDefaults(
  defineProps<{
    label: string;
    value: number | string;
    icon: Component;
    tone?: Tone;
    hint?: string;
    to?: RouteLocationRaw;
    /** Draws attention when the value needs action (e.g. pending reviews > 0). */
    highlight?: boolean;
  }>(),
  { tone: 'slate', highlight: false },
);
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'div'"
    :to="to"
    class="group relative flex flex-col gap-2 overflow-hidden rounded-lg border bg-white p-4 shadow-xs transition"
    :class="[
      highlight ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200',
      to && 'hover:border-brand-300 hover:shadow-sm',
    ]"
  >
    <!-- Thin accent line in the KPI's tone -->
    <span class="absolute inset-x-0 top-0 h-0.5" :class="TONE_CLASSES[tone].dot" aria-hidden="true" />
    <div class="flex items-center justify-between gap-2">
      <span class="eyebrow truncate">{{ label }}</span>
      <span class="grid size-7 shrink-0 place-items-center rounded-md" :class="TONE_CLASSES[tone].soft">
        <component :is="icon" class="size-3.5" :class="TONE_CLASSES[tone].text" />
      </span>
    </div>
    <div class="flex items-baseline gap-2">
      <span class="text-[1.65rem] leading-tight font-semibold tracking-tight tabular-nums text-slate-900">{{ value }}</span>
      <span v-if="hint" class="text-xs text-slate-500">{{ hint }}</span>
    </div>
  </component>
</template>
