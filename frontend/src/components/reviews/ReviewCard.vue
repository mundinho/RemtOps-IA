<script setup lang="ts">
import { ref } from 'vue';
import AgentBadge from '@/components/agents/AgentBadge.vue';
import JsonBlock from '@/components/ui/JsonBlock.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import type { HumanReview } from '@/types';
import { formatDate, formatDateTime, humanize } from '@/utils/format';

/**
 * One flagged case and the AI's decision on it — read-only.
 * Shows why the case was opened, what data was analysed and how the Approval Agent decided.
 */
const props = defineProps<{ review: HumanReview }>();
const showData = ref(false);

const outcome = () => {
  const r = props.review;
  if (r.status === 'PENDING') return { label: 'Awaiting AI decision', class: 'bg-slate-100 text-slate-600' };
  if (r.kind === 'ANOMALY') {
    return r.status === 'APPROVED'
      ? { label: 'AI: keep for follow-up', class: 'bg-amber-100 text-amber-800' }
      : { label: 'AI: dismissed', class: 'bg-slate-100 text-slate-700' };
  }
  return r.status === 'APPROVED'
    ? { label: 'AI approved', class: 'bg-emerald-100 text-emerald-800' }
    : { label: 'AI rejected', class: 'bg-rose-100 text-rose-800' };
};
</script>

<template>
  <article class="rounded-lg border border-slate-200 bg-white shadow-xs p-5">
    <header class="flex flex-wrap items-center gap-2">
      <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="outcome().class">{{ outcome().label }}</span>
      <span class="rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
        {{ review.kind === 'ANOMALY' ? 'Anomaly' : 'Rental decision' }}
      </span>
      <StatusBadge :status="review.priority" :label="`${humanize(review.priority)} priority`" />
      <span class="ml-auto text-xs text-slate-400">opened {{ formatDateTime(review.createdAt) }}</span>
    </header>

    <p class="mt-3 text-sm font-medium text-slate-900">{{ review.reason }}</p>

    <p v-if="review.rental" class="mt-1 text-sm text-slate-500">
      <span class="font-mono text-xs">{{ review.rental.code }}</span> ·
      {{ review.rental.customer.companyName }} · {{ review.rental.equipment.name }} ·
      {{ formatDate(review.rental.startDate) }} → {{ formatDate(review.rental.endDate) }}
    </p>
    <p v-else-if="review.customer || review.equipment" class="mt-1 text-sm text-slate-500">
      <template v-if="review.customer">{{ review.customer.companyName }} ({{ review.customer.code }})</template>
      <template v-if="review.customer && review.equipment"> · </template>
      <template v-if="review.equipment">{{ review.equipment.name }} ({{ review.equipment.code }})</template>
    </p>

    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Flagged by</p>
        <div class="mt-1"><AgentBadge :agent="review.requestedByAgent" /></div>
      </div>
      <div v-if="review.resolvedByAgent">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Decided by</p>
        <div class="mt-1 flex items-center gap-2">
          <AgentBadge :agent="review.resolvedByAgent" />
          <span class="text-xs text-slate-400">{{ formatDateTime(review.resolvedAt) }}</span>
        </div>
      </div>
    </div>

    <div v-if="review.resolutionNotes" class="mt-4 rounded-lg bg-slate-50 p-3">
      <p class="text-xs font-medium uppercase tracking-wide text-slate-400">AI decision & reasoning</p>
      <p class="mt-1 whitespace-pre-line text-sm text-slate-700">{{ review.resolutionNotes }}</p>
    </div>

    <button class="mt-4 text-sm font-medium text-slate-500 hover:text-slate-800" @click="showData = !showData">
      {{ showData ? 'Hide' : 'Show' }} data analysed by the agents
    </button>
    <div v-if="showData" class="mt-2"><JsonBlock :value="review.analyzedData" /></div>
  </article>
</template>
