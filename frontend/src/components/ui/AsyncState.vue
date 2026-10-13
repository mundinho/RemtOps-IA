<script setup lang="ts">
import { LoaderCircle, TriangleAlert } from '@lucide/vue';

/** Renders loading / error states and the content once data is available. */
defineProps<{ loading: boolean; error: string | null; hasData: boolean }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="error && !hasData" class="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
    <TriangleAlert class="size-4 shrink-0" />
    <span class="flex-1">{{ error }}</span>
    <button class="font-medium underline" @click="$emit('retry')">Retry</button>
  </div>
  <div v-else-if="loading && !hasData" class="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
    <LoaderCircle class="size-4 animate-spin" />
    Loading…
  </div>
  <slot v-else />
</template>
