<script setup lang="ts">
import { Building2, ChevronRight, ClipboardList, FileCheck, LogOut, ScanLine } from '@lucide/vue';
import { useRouter } from 'vue-router';
import AsyncState from '@/components/ui/AsyncState.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { authApi } from '@/services/auth.api';
import { setCustomer } from '@/services/session';
import type { CustomerDocumentType } from '@/types';
import { formatDate, formatMoney } from '@/utils/format';

const router = useRouter();
// Requests change state while the agents work — keep the list fresh.
const { data, loading, error, refresh } = useAsync(authApi.portal, { pollMs: 10000 });

const DOC_LABELS: Record<CustomerDocumentType, string> = {
  ID_DOCUMENT: 'ID document',
  INSURANCE_CERTIFICATE: 'Insurance',
  OPERATOR_LICENSE: 'Operator licence',
  COMPANY_REGISTRATION: 'Company registration',
};

function signOut() {
  setCustomer(null);
  void router.push({ name: 'customer-login' });
}
</script>

<template>
  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <div v-if="data" class="space-y-4">
      <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-mono text-xs font-medium text-slate-400">{{ data.profile.code }} · NUIT {{ data.profile.taxId }}</p>
            <h1 class="mt-0.5 flex items-center gap-2 text-xl font-semibold text-slate-900">
              <Building2 class="size-5 shrink-0 text-slate-400" /> <span class="truncate">{{ data.profile.companyName }}</span>
            </h1>
            <p class="text-sm text-slate-500">{{ data.profile.contactName }} · {{ data.profile.email }}</p>
          </div>
          <button
            type="button"
            class="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            @click="signOut"
          >
            <LogOut class="size-4" /> Sign out
          </button>
        </div>
        <p class="mt-3 text-xs text-slate-400">Customer since {{ formatDate(data.profile.memberSince) }}</p>
      </section>

      <section class="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <ScanLine class="size-5 shrink-0 text-amber-700" />
        <p class="text-sm text-amber-900">
          <span class="font-semibold">To request equipment</span>, scan the QR code on the machine. While you are signed in, your company details
          are filled in automatically.
        </p>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 class="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
          <ClipboardList class="size-4 text-slate-400" /> My rental requests
        </h2>
        <p v-if="!data.rentals.length" class="px-5 py-6 text-center text-sm text-slate-400">No requests yet.</p>
        <ul v-else class="divide-y divide-slate-100">
          <li v-for="r in data.rentals" :key="r.id">
            <RouterLink :to="{ name: 'request-status', params: { id: r.id } }" class="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-900">{{ r.equipment.name }}</p>
                <p class="text-xs text-slate-500">
                  <span class="font-mono">{{ r.code }}</span> · {{ formatDate(r.startDate) }} → {{ formatDate(r.endDate) }} ·
                  {{ formatMoney(r.totalAmount) }}
                </p>
                <p v-if="r.customerMessage" class="mt-1 line-clamp-2 text-xs text-slate-500">{{ r.customerMessage }}</p>
              </div>
              <StatusBadge :status="r.status" />
              <ChevronRight class="size-4 shrink-0 text-slate-300" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 class="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
          <FileCheck class="size-4 text-slate-400" /> Documents on file
        </h2>
        <p v-if="!data.documents.length" class="px-5 py-4 text-sm text-slate-500">
          No documents on file yet. An ID document and an insurance certificate are required before a rental can be approved.
        </p>
        <ul v-else class="divide-y divide-slate-100">
          <li v-for="d in data.documents" :key="d.type" class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
            <span class="text-slate-700">{{ DOC_LABELS[d.type] }}</span>
            <span class="flex items-center gap-2 text-xs text-slate-400">
              until {{ formatDate(d.expiresAt) }} <StatusBadge :status="d.status" />
            </span>
          </li>
        </ul>
      </section>
    </div>
  </AsyncState>
</template>
