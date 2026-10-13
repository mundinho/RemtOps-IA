<script setup lang="ts">
import { Gavel } from '@lucide/vue';
import { computed, ref } from 'vue';
import ReviewCard from '@/components/reviews/ReviewCard.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAsync } from '@/composables/useAsync';
import { agentsApi } from '@/services/agents.api';

const { data, loading, error, refresh } = useAsync(() => agentsApi.cases(), { pollMs: 5000 });

const TABS = [
  { key: 'RENTAL_DECISION', label: 'Rental decisions' },
  { key: 'ANOMALY', label: 'Anomaly triage' },
] as const;
const tab = ref<(typeof TABS)[number]['key']>('RENTAL_DECISION');

const visible = computed(() => (data.value ?? []).filter((r) => r.kind === tab.value));
const count = (kind: string) => (data.value ?? []).filter((r) => r.kind === kind).length;
</script>

<template>
  <PageHeader
    title="AI decisions"
    description="Every flagged case and how the Approval Agent decided it. Nothing here waits for a person — this page is for auditing the machine's reasoning after the fact."
  />

  <div class="mb-4 flex gap-1.5">
    <button
      v-for="t in TABS"
      :key="t.key"
      class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
      :class="tab === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'"
      @click="tab = t.key"
    >
      {{ t.label }} <span class="ml-1 tabular-nums opacity-60">{{ count(t.key) }}</span>
    </button>
  </div>

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <div v-if="visible.length" class="grid gap-4 xl:grid-cols-2">
      <ReviewCard v-for="review in visible" :key="review.id" :review="review" />
    </div>
    <div v-else class="rounded-xl border border-dashed border-slate-300 bg-white">
      <EmptyState
        :icon="Gavel"
        :title="tab === 'ANOMALY' ? 'No anomalies triaged yet' : 'No flagged rental decisions yet'"
        description="When an agent flags a problem, the Approval Agent decides it automatically and the reasoning appears here."
      />
    </div>
  </AsyncState>
</template>
