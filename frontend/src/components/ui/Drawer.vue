<script setup lang="ts">
import { X } from '@lucide/vue';
import { onMounted, onUnmounted } from 'vue';

defineProps<{ open: boolean; title?: string; subtitle?: string }>();
const emit = defineEmits<{ close: [] }>();

const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close');
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
    >
      <div v-if="open" class="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]" @click="emit('close')" />
    </Transition>
    <Transition
      enter-from-class="translate-x-full"
      leave-to-class="translate-x-full"
      enter-active-class="transition-transform duration-200 ease-out"
      leave-active-class="transition-transform duration-150 ease-in"
    >
      <aside
        v-if="open"
        class="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-xl"
      >
        <header class="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 class="text-base font-semibold text-slate-900">{{ title }}</h2>
            <p v-if="subtitle" class="text-sm text-slate-500">{{ subtitle }}</p>
          </div>
          <button class="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" @click="emit('close')">
            <X class="size-5" />
          </button>
        </header>
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <slot />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
