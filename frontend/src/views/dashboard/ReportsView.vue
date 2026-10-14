<script setup lang="ts">
import { Bot, ClipboardList, FileDown, Printer, Truck, Wallet } from '@lucide/vue';
import { ref, watch, type Component } from 'vue';
import BarList from '@/components/charts/BarList.vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import { operationsApi } from '@/services/operations.api';
import type { Report, ReportFormat, ReportType } from '@/types';
import { formatDate, formatDateTime, formatMoney } from '@/utils/format';

/**
 * Management reports. The backend returns every report in the same shape (KPIs, breakdowns, table),
 * so this page renders, exports to Excel (CSV) and prints to PDF any of them the same way.
 */

const TYPES: { type: ReportType; label: string; icon: Component }[] = [
  { type: 'financial', label: 'Financial', icon: Wallet },
  { type: 'rentals', label: 'Rentals', icon: ClipboardList },
  { type: 'fleet', label: 'Fleet & maintenance', icon: Truck },
  { type: 'agents', label: 'AI agents', icon: Bot },
];

const iso = (d: Date) => d.toLocaleDateString('sv-SE');
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const PRESETS = [
  { label: 'This month', from: () => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) },
  { label: 'Last 30 days', from: () => iso(daysAgo(29)) },
  { label: 'Last 90 days', from: () => iso(daysAgo(89)) },
  { label: 'This year', from: () => iso(new Date(new Date().getFullYear(), 0, 1)) },
];

const type = ref<ReportType>('financial');
const from = ref(PRESETS[1]!.from());
const to = ref(iso(new Date()));

const report = ref<Report | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  if (!from.value || !to.value) return;
  loading.value = true;
  error.value = null;
  try {
    report.value = await operationsApi.report(type.value, from.value, to.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load the report';
  } finally {
    loading.value = false;
  }
}
watch([type, from, to], load, { immediate: true });

function preset(p: (typeof PRESETS)[number]) {
  from.value = p.from();
  to.value = iso(new Date());
}

// ── Formatting ──
function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  return `${Math.round(seconds / 86_400)} days`;
}
function show(value: unknown, format?: ReportFormat): string {
  if (value == null || value === '') return '—';
  if (typeof value !== 'number') return format === 'date' ? formatDate(String(value)) : String(value);
  switch (format) {
    case 'money':
      return formatMoney(value);
    case 'percent':
      return `${(value * 100).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`;
    case 'seconds':
      return duration(value);
    default:
      return value.toLocaleString('pt-PT');
  }
}
const humanLabel = (label: string) => label.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

// ── Export ──
/** CSV for Excel in Portuguese: ";" separator, decimal comma, UTF-8 BOM so accents open correctly. */
function exportCsv() {
  if (!report.value) return;
  const { columns, rows } = report.value.table;
  const cell = (v: unknown) => {
    const text = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.label)).join(';'), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `rentops-${report.value.type}-${report.value.period.from}_${report.value.period.to}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
const printPdf = () => window.print();
</script>

<template>
  <PageHeader title="Reports" description="Financial, rental, fleet and AI-agent reports for any period — on screen, in Excel or as PDF.">
    <template #actions>
      <button type="button" class="btn-secondary no-print" :disabled="!report" @click="exportCsv"><FileDown class="size-4" /> Excel (CSV)</button>
      <button type="button" class="btn-primary no-print" :disabled="!report" @click="printPdf"><Printer class="size-4" /> PDF / Print</button>
    </template>
  </PageHeader>

  <!-- Controls -->
  <div class="no-print mb-6 space-y-3">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="t in TYPES"
        :key="t.type"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition"
        :class="type === t.type ? 'bg-brand-700 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'"
        @click="type = t.type"
      >
        <component :is="t.icon" class="size-4" /> {{ t.label }}
      </button>
    </div>
    <div class="card flex flex-wrap items-end gap-3 p-3">
      <label class="block">
        <span class="eyebrow">From</span>
        <input v-model="from" type="date" :max="to" class="input mt-1 w-40" />
      </label>
      <label class="block">
        <span class="eyebrow">To</span>
        <input v-model="to" type="date" :min="from" class="input mt-1 w-40" />
      </label>
      <div class="flex flex-wrap gap-1.5 pb-0.5">
        <button v-for="p in PRESETS" :key="p.label" type="button" class="btn-ghost px-2.5 py-1.5 text-xs ring-1 ring-slate-200" @click="preset(p)">
          {{ p.label }}
        </button>
      </div>
    </div>
  </div>

  <AsyncState :loading="loading && !report" :error="error" :has-data="!!report" @retry="load">
    <div v-if="report" class="space-y-6" :class="loading && 'opacity-60'">
      <!-- Print header (PDF) -->
      <div class="hidden border-b border-slate-300 pb-3 print:block">
        <p class="text-xl font-semibold">RentOps · {{ report.title }}</p>
        <p class="text-sm text-slate-600">
          Period {{ formatDate(report.period.from) }} – {{ formatDate(report.period.to) }} ({{ report.period.days }} days) · generated
          {{ formatDateTime(report.generatedAt) }}
        </p>
      </div>
      <p class="text-sm text-slate-500 print:hidden">
        <span class="font-medium text-slate-700">{{ report.title }}</span> · {{ formatDate(report.period.from) }} – {{ formatDate(report.period.to) }}
        ({{ report.period.days }} days)
      </p>

      <!-- KPIs -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <div v-for="k in report.kpis" :key="k.label" class="card p-4">
          <p class="eyebrow">{{ k.label }}</p>
          <p class="mt-1.5 text-xl font-semibold tracking-tight tabular-nums text-slate-900">{{ show(k.value, k.format) }}</p>
          <p v-if="k.hint" class="mt-0.5 text-xs text-slate-500">{{ k.hint }}</p>
        </div>
      </div>

      <!-- Breakdowns -->
      <div class="grid gap-4 lg:grid-cols-2">
        <Panel v-for="b in report.breakdowns" :key="b.title" :title="b.title">
          <BarList :items="b.items" :format="(v: number) => show(v, b.format)" :label-of="humanLabel" empty="No data in this period" />
        </Panel>
      </div>

      <!-- Detail -->
      <Panel :title="`Detail (${report.table.rows.length} rows)`" flush>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50">
                <th
                  v-for="c in report.table.columns"
                  :key="c.key"
                  class="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold tracking-[0.06em] text-slate-500 uppercase"
                  :class="['money', 'number', 'percent'].includes(c.format ?? '') && 'text-right'"
                >
                  {{ c.label }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(row, i) in report.table.rows" :key="i" class="break-inside-avoid">
                <td
                  v-for="c in report.table.columns"
                  :key="c.key"
                  class="px-4 py-2.5 text-slate-700"
                  :class="[
                    ['money', 'number', 'percent'].includes(c.format ?? '') ? 'whitespace-nowrap text-right tabular-nums' : '',
                    c.key === 'reason' ? 'max-w-md text-xs text-slate-500' : 'whitespace-nowrap',
                  ]"
                >
                  {{ show(row[c.key], c.format) }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!report.table.rows.length" class="px-4 py-8 text-center text-sm text-slate-400">No records in this period.</p>
        </div>
      </Panel>
    </div>
  </AsyncState>
</template>
