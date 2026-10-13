<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ value: unknown }>();
const text = computed(() => JSON.stringify(props.value, null, 2));
</script>

<template>
  <pre class="max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">{{ text }}</pre>
</template>
