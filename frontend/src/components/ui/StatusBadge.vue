<script setup lang="ts">
import { computed } from 'vue';
import { TONE_CLASSES, statusMeta } from '@/utils/status';

const props = defineProps<{ status: string; label?: string }>();

const meta = computed(() => statusMeta(props.status));
const classes = computed(() => TONE_CLASSES[meta.value.tone]);
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="classes.badge"
  >
    <span class="size-1.5 rounded-full" :class="classes.dot" />
    {{ label ?? meta.label }}
  </span>
</template>
