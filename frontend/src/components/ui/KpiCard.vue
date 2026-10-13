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
    class="group flex flex-col gap-3 rounded-xl border bg-white p-4 transition"
    :class="[
      highlight ? 'border-violet-300 shadow-sm shadow-violet-100' : 'border-slate-200',
      to && 'hover:border-slate-300 hover:shadow-sm',
    ]"
  >
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-slate-500">{{ label }}</span>
      <span class="grid size-8 place-items-center rounded-lg" :class="TONE_CLASSES[tone].soft">
        <component :is="icon" class="size-4" :class="TONE_CLASSES[tone].text" />
      </span>
    </div>
    <div class="flex items-baseline gap-2">
      <span class="text-2xl font-semibold tabular-nums text-slate-900">{{ value }}</span>
      <span v-if="hint" class="text-xs text-slate-400">{{ hint }}</span>
    </div>
  </component>
</template>
