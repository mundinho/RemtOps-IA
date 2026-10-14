<script setup lang="ts">
import { computed } from 'vue';

/**
 * Country flag as an SVG image (flag-icons, MIT). Emoji flags do not render on Windows — they show
 * as letters ("MZ") — so images are used everywhere. Only the countries offered in the forms are bundled.
 */
const FLAGS = import.meta.glob<string>(
  '/node_modules/flag-icons/flags/4x3/{mz,za,sz,zw,mw,zm,tz,bw,na,mg,ao,pt,br,cv,ke,cn,in,ae,gb,us,fr,it}.svg',
  { eager: true, query: '?url', import: 'default' },
);

const props = defineProps<{ code: string | null | undefined }>();
const src = computed(() => (props.code ? FLAGS[`/node_modules/flag-icons/flags/4x3/${props.code.toLowerCase()}.svg`] : undefined));
</script>

<template>
  <img v-if="src" :src="src" :alt="code ?? ''" class="inline-block h-3.5 w-[1.17rem] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10" />
  <span v-else class="inline-block h-3.5 w-[1.17rem] shrink-0 rounded-[2px] bg-slate-200" aria-hidden="true" />
</template>
