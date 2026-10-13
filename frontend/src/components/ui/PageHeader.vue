<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-xl font-semibold tracking-tight text-slate-900">{{ title }}</h1>
      <p v-if="description" class="mt-1 max-w-3xl text-sm text-slate-500">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
