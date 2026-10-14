<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import Flag from '@/components/ui/Flag.vue';
import { COUNTRIES, countryByCode } from '@/utils/countries';

/**
 * Phone number with its country: a flag + dial-code picker glued to the number.
 *   v-model         → the full international number, e.g. "+258 84 123 4567"
 *   v-model:country → ISO code of the contact's country (MZ, ZA…)
 * Typing a number that starts with another "+code" switches the country automatically.
 */
const phone = defineModel<string>({ required: true });
const country = defineModel<string>('country', { required: true });
defineProps<{ disabled?: boolean }>();

const dial = computed(() => countryByCode(country.value)?.dial ?? '');

/** The part the person types: the number without the country's dial code. */
const local = computed({
  get() {
    const value = phone.value.trim();
    return dial.value && value.startsWith(dial.value) ? value.slice(dial.value.length).trim() : value;
  },
  set(value: string) {
    const typed = value.trim();
    if (typed.startsWith('+')) {
      // Longest matching dial code wins (+1 vs +12…)
      const match = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => typed.startsWith(c.dial));
      if (match) {
        country.value = match.code;
        phone.value = `${match.dial} ${typed.slice(match.dial.length).trim()}`.trim();
        return;
      }
      phone.value = typed;
      return;
    }
    phone.value = typed ? `${dial.value} ${typed}` : '';
  },
});

// ── Country list (custom, so it can show flag images) ──
const open = ref(false);
const query = ref('');
const root = ref<HTMLElement | null>(null);
const search = ref<HTMLInputElement | null>(null);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase() === q);
});

async function toggle() {
  open.value = !open.value;
  if (open.value) {
    query.value = '';
    await nextTick();
    search.value?.focus();
  }
}

function choose(code: string) {
  const number = local.value;
  country.value = code;
  const nextDial = countryByCode(code)?.dial ?? '';
  phone.value = number && !number.startsWith('+') ? `${nextDial} ${number}` : number;
  open.value = false;
}

const onOutside = (e: PointerEvent) => {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
};
document.addEventListener('pointerdown', onOutside);
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));
</script>

<template>
  <div ref="root" class="relative mt-1" @keydown.esc="open = false">
    <div
      class="flex w-full min-w-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20"
      :class="disabled && 'bg-slate-50'"
    >
      <button
        type="button"
        :disabled="disabled"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-label="`Country: ${countryByCode(country)?.name ?? country}`"
        class="flex shrink-0 items-center gap-1.5 border-r border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-700 hover:bg-slate-100 focus:outline-none"
        @click="toggle"
      >
        <Flag :code="country" />
        <span class="tabular-nums">{{ dial }}</span>
        <svg class="size-3 text-slate-400" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" stroke-width="1.5" fill="none" />
        </svg>
      </button>
      <input
        v-model.lazy="local"
        type="tel"
        inputmode="tel"
        autocomplete="tel-national"
        placeholder="84 123 4567"
        :disabled="disabled"
        class="block w-full min-w-0 border-0 bg-transparent px-3 py-2 text-sm focus:outline-none"
      />
    </div>

    <div v-if="open" class="absolute left-0 z-20 mt-1 w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
      <input
        ref="search"
        v-model="query"
        type="search"
        placeholder="Search country or code"
        class="block w-full border-0 border-b border-slate-100 px-3 py-2 text-sm focus:outline-none"
      />
      <ul role="listbox" class="max-h-64 overflow-y-auto py-1">
        <li v-for="c in filtered" :key="c.code" role="option" :aria-selected="c.code === country">
          <button
            type="button"
            class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50"
            :class="c.code === country && 'bg-amber-50'"
            @click="choose(c.code)"
          >
            <Flag :code="c.code" />
            <span class="min-w-0 flex-1 truncate text-slate-800">{{ c.name }}</span>
            <span class="tabular-nums text-slate-400">{{ c.dial }}</span>
          </button>
        </li>
        <li v-if="!filtered.length" class="px-3 py-2 text-sm text-slate-400">No country found</li>
      </ul>
    </div>
  </div>
</template>
