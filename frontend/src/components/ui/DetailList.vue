<script setup lang="ts">
/** Two-column label/value grid for detail panels. Values go in named slots or `items`. */
defineProps<{ items: { label: string; value?: string | number | null }[] }>();
</script>

<template>
  <dl class="grid grid-cols-2 gap-x-6 gap-y-4">
    <div v-for="item in items" :key="item.label">
      <dt class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ item.label }}</dt>
      <dd class="mt-1 text-sm text-slate-800">
        <slot :name="item.label" :item="item">{{ item.value ?? '—' }}</slot>
      </dd>
    </div>
  </dl>
</template>
