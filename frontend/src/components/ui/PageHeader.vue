<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

defineProps<{ title: string; description?: string }>();

// Section label above the title, from the dashboard area the page belongs to.
const route = useRoute();
const section = computed(() => (route.path.startsWith('/dashboard') ? 'RentOps · Operations' : 'RentOps'));
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
    <div class="min-w-0">
      <p class="eyebrow text-brand-600">{{ section }}</p>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{{ title }}</h1>
      <p v-if="description" class="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
