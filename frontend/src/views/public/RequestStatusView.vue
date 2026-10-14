<script setup lang="ts">
import { CircleCheck, CircleX, Hourglass, LoaderCircle } from '@lucide/vue';
import { computed, type Component } from 'vue';
import { useRoute } from 'vue-router';
import ChatWidget from '@/components/assistant/ChatWidget.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DetailList from '@/components/ui/DetailList.vue';
import { useAsync } from '@/composables/useAsync';
import { publicApi } from '@/services/public.api';
import type { WorkflowStep } from '@/types';
import { formatDate, formatMoney } from '@/utils/format';
import { paymentMethodLabel } from '@/utils/payment';
import { FINAL_RENTAL_STATUSES } from '@/utils/status';

const route = useRoute();
const id = String(route.params.id);

const { data: request, loading, error, refresh } = useAsync(() => publicApi.requestStatus(id), {
  pollMs: 2500,
  stopWhen: (current) => !!current && FINAL_RENTAL_STATUSES.includes(current.status),
});

// Customer-facing names for the workflow steps (internal agent names stay in the dashboard)
const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: 'INTAKE', label: 'Availability & request check' },
  { key: 'MAINTENANCE_CHECK', label: 'Maintenance & safety check' },
  { key: 'RISK_ASSESSMENT', label: 'Account & documents check' },
  { key: 'FINANCE_CHECK', label: 'Payment check' },
  { key: 'FINALIZE', label: 'Final decision (AI)' },
  { key: 'NOTIFY', label: 'Sending confirmation' },
];
const ORDER: WorkflowStep[] = [
  'INTAKE',
  'MAINTENANCE_CHECK',
  'RISK_ASSESSMENT',
  'FINANCE_CHECK',
  'AWAITING_HUMAN',
  'FINALIZE',
  'BILLING',
  'NOTIFY',
  'DONE',
];

const stepState = (key: WorkflowStep) => {
  const current = ORDER.indexOf(request.value?.workflowStep ?? 'INTAKE');
  const index = ORDER.indexOf(key);
  return index < current ? 'done' : index === current ? 'active' : 'todo';
};

const hero = computed<{ icon: Component; tone: string; title: string; text: string; spin?: boolean }>(() => {
  switch (request.value?.status) {
    case 'APPROVED':
    case 'ACTIVE':
      return { icon: CircleCheck, tone: 'text-emerald-600 bg-emerald-50', title: 'Rental approved', text: 'Your booking is confirmed. A confirmation has been sent to your email.' };
    case 'REJECTED':
      return { icon: CircleX, tone: 'text-rose-600 bg-rose-50', title: 'Request not approved', text: 'We could not approve this request automatically.' };
    case 'REQUIRES_HUMAN_REVIEW':
      return { icon: Hourglass, tone: 'text-violet-600 bg-violet-50', title: 'A specialist is reviewing your request', text: 'Some details need a human check. You will be notified as soon as a decision is made.' };
    default:
      return { icon: LoaderCircle, spin: true, tone: 'text-sky-600 bg-sky-50', title: 'Our agents are reviewing your request', text: 'Checks run automatically — this page updates by itself.' };
  }
});

const inProgress = computed(() => request.value && ['REQUESTED', 'IN_REVIEW'].includes(request.value.status));
</script>

<template>
  <AsyncState :loading="loading" :error="error" :has-data="!!request" @retry="refresh">
    <div v-if="request" class="space-y-4">
      <section class="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-xs">
        <span class="mx-auto grid size-14 place-items-center rounded-full" :class="hero.tone">
          <component :is="hero.icon" class="size-7" :class="hero.spin && 'animate-spin'" />
        </span>
        <h1 class="mt-4 text-lg font-semibold text-slate-900">{{ hero.title }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ hero.text }}</p>
        <p v-if="request.decisionReason" class="mt-4 rounded-lg bg-slate-50 p-3 text-left text-sm text-slate-700">
          {{ request.decisionReason }}
        </p>
        <div v-if="request.approvalConditions.length" class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
          <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">Conditions of this approval</p>
          <ul class="mt-1 list-disc pl-5 text-sm text-amber-900">
            <li v-for="c in request.approvalConditions" :key="c">{{ c }}</li>
          </ul>
        </div>
      </section>

      <section v-if="inProgress" class="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <ol class="space-y-3">
          <li v-for="step in STEPS" :key="step.key" class="flex items-center gap-3 text-sm">
            <span
              class="grid size-6 place-items-center rounded-full text-xs"
              :class="{
                'bg-emerald-500 text-white': stepState(step.key) === 'done',
                'bg-sky-100 text-sky-600 ring-2 ring-sky-500': stepState(step.key) === 'active',
                'bg-slate-100 text-slate-300': stepState(step.key) === 'todo',
              }"
            >
              <CircleCheck v-if="stepState(step.key) === 'done'" class="size-4" />
              <LoaderCircle v-else-if="stepState(step.key) === 'active'" class="size-3.5 animate-spin" />
            </span>
            <span :class="stepState(step.key) === 'todo' ? 'text-slate-400' : 'font-medium text-slate-800'">{{ step.label }}</span>
          </li>
        </ol>
      </section>

      <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <DetailList
          :items="[
            { label: 'Reference', value: request.code },
            { label: 'Equipment', value: `${request.equipment.name}` },
            { label: 'Period', value: `${formatDate(request.startDate)} → ${formatDate(request.endDate)}` },
            { label: 'Estimated total', value: formatMoney(request.totalAmount) },
            { label: 'Payment method', value: paymentMethodLabel(request.paymentMethod) },
            { label: 'Requested by', value: request.contactName ? `${request.contactName}, ${request.customer.companyName}` : request.customer.companyName },
          ]"
        />
      </section>
      <ChatWidget :equipment-code="request.equipment.code" :equipment-name="request.equipment.name" :rental-id="request.id" />
    </div>
  </AsyncState>
</template>
