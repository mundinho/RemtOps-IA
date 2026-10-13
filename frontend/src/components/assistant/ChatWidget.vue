<script setup lang="ts">
import { Bot, LoaderCircle, MessageCircle, Send, ShieldCheck, X } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { publicApi } from '@/services/public.api';
import type { ChatTurn } from '@/types';

/**
 * Customer assistant on the QR pages. The conversation lives in the browser (sessionStorage);
 * each question is answered by the Customer Assistant agent from live data via read-only tools.
 */
const props = defineProps<{ equipmentCode: string; equipmentName?: string; rentalId?: string }>();

const MAX_LENGTH = 600;
const storageKey = computed(() => `rentops-chat:${props.equipmentCode}:${props.rentalId ?? 'scan'}`);

const open = ref(false);
const draft = ref('');
const sending = ref(false);
const error = ref<string | null>(null);
const turns = ref<ChatTurn[]>(load());
const scroller = ref<HTMLElement | null>(null);

const suggestions = computed(() =>
  props.rentalId
    ? ['Why was my request decided this way?', 'Are there conditions I must meet?', 'When and how do I pay?']
    : ['Is it free next week? How much?', 'Which documents do I need?', 'Which payment methods do you accept?', 'How long does approval take?'],
);

function load(): ChatTurn[] {
  try {
    return JSON.parse(sessionStorage.getItem(`rentops-chat:${props.equipmentCode}:${props.rentalId ?? 'scan'}`) ?? '[]');
  } catch {
    return [];
  }
}

watch(
  turns,
  (value) => {
    try {
      sessionStorage.setItem(storageKey.value, JSON.stringify(value));
    } catch {
      // private mode / storage blocked — the chat still works for this page view
    }
  },
  { deep: true },
);

async function scrollToEnd() {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' });
}

watch(open, (isOpen) => isOpen && scrollToEnd());

async function send(text = draft.value) {
  const content = text.trim().slice(0, MAX_LENGTH);
  if (!content || sending.value) return;
  draft.value = '';
  error.value = null;
  turns.value.push({ role: 'user', content });
  sending.value = true;
  await scrollToEnd();
  try {
    const { reply } = await publicApi.assistant(props.equipmentCode, turns.value.slice(-12), props.rentalId);
    turns.value.push({ role: 'assistant', content: reply });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'The assistant is unavailable right now.';
  } finally {
    sending.value = false;
    await scrollToEnd();
  }
}
</script>

<template>
  <button
    v-if="!open"
    class="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
    @click="open = true"
  >
    <MessageCircle class="size-5" />
    Ask our assistant
  </button>

  <section
    v-else
    class="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:w-[380px] sm:rounded-2xl"
    aria-label="Customer assistant"
  >
    <header class="flex items-start gap-3 border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
      <span class="grid size-8 shrink-0 place-items-center rounded-full bg-amber-400">
        <Bot class="size-4 text-slate-900" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold">RentOps assistant</p>
        <p class="truncate text-xs text-slate-300">{{ equipmentName ?? equipmentCode }} · answers from live data</p>
      </div>
      <button class="rounded-md p-1 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Close" @click="open = false">
        <X class="size-5" />
      </button>
    </header>

    <div ref="scroller" class="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
      <div class="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-100">
        Hi! Ask me about this machine — availability and price for your dates, documents, payment{{ rentalId ? ', or your request' : '' }}.
        You can write in Português or English.
      </div>

      <template v-for="(turn, i) in turns" :key="i">
        <div
          v-if="turn.role === 'user'"
          class="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-sm bg-amber-400 px-3 py-2 text-sm text-slate-900"
        >
          {{ turn.content }}
        </div>
        <div v-else class="max-w-[85%] whitespace-pre-line rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-100">
          {{ turn.content }}
        </div>
      </template>

      <div v-if="sending" class="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">
        <LoaderCircle class="size-4 animate-spin" /> Checking live data…
      </div>
      <p v-if="error" class="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{{ error }}</p>

      <div v-if="!turns.length && !sending" class="flex flex-wrap gap-1.5 pt-1">
        <button
          v-for="s in suggestions"
          :key="s"
          class="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-amber-50 hover:ring-amber-300"
          @click="send(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <form class="border-t border-slate-100 bg-white p-3" @submit.prevent="send()">
      <div class="flex items-end gap-2">
        <textarea
          v-model="draft"
          rows="1"
          :maxlength="MAX_LENGTH"
          placeholder="Type your question…"
          class="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          @keydown.enter.exact.prevent="send()"
        />
        <button
          type="submit"
          :disabled="sending || !draft.trim()"
          class="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-900 transition hover:bg-amber-300 disabled:opacity-40"
          aria-label="Send"
        >
          <Send class="size-4" />
        </button>
      </div>
      <p class="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
        <ShieldCheck class="size-3" /> AI assistant · cannot approve or change requests · conversations are logged
      </p>
    </form>
  </section>
</template>
