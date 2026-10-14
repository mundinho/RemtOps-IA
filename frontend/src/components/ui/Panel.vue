<script setup lang="ts">
defineProps<{ title?: string; subtitle?: string; flush?: boolean }>();
</script>

<template>
  <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
    <div v-if="title || $slots.actions" class="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-3">
      <div>
        <h2 class="text-sm font-semibold text-slate-900">{{ title }}</h2>
        <p v-if="subtitle" class="text-xs text-slate-500">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </div>
    <div :class="flush ? '' : 'p-4'">
      <slot />
    </div>
  </section>
</template>
