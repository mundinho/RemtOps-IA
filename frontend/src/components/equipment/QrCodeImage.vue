<script setup lang="ts">
import { equipmentApi } from '@/services/equipment.api';

withDefaults(defineProps<{ code: string; size?: string }>(), { size: 'size-32' });
</script>

<template>
  <img :src="equipmentApi.qrUrl(code)" :alt="`QR code for ${code}`" class="rounded-md bg-white" :class="size" />
</template>
