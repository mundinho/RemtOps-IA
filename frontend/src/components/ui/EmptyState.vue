<script setup lang="ts">
import { Inbox } from '@lucide/vue';
import type { Component } from 'vue';

withDefaults(defineProps<{ title: string; description?: string; icon?: Component; compact?: boolean }>(), {
  icon: () => Inbox,
  compact: false,
});
</script>

<template>
  <div class="flex flex-col items-center text-center" :class="compact ? 'py-6' : 'py-12'">
    <span class="grid size-10 place-items-center rounded-full bg-slate-100">
      <component :is="icon" class="size-5 text-slate-400" />
    </span>
    <p class="mt-3 text-sm font-medium text-slate-700">{{ title }}</p>
    <p v-if="description" class="mt-1 max-w-sm text-sm text-slate-500">{{ description }}</p>
    <div v-if="$slots.default" class="mt-4"><slot /></div>
  </div>
</template>
