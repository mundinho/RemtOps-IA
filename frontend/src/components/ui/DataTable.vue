<script setup lang="ts" generic="T extends { id: string }">
export interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
  class?: string;
}

defineProps<{ columns: Column[]; rows: T[]; clickable?: boolean; selectedId?: string | null }>();
defineEmits<{ rowClick: [row: T] }>();

/** Default cell renderer when no `#cell-<key>` slot is provided. */
const cellValue = (row: T, key: string) => (row as Record<string, unknown>)[key] ?? '—';
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 bg-slate-50">
          <th
            v-for="col in columns"
            :key="col.key"
            class="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500"
            :class="[col.align === 'right' && 'text-right', col.class]"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr
          v-for="row in rows"
          :key="row.id"
          class="transition-colors"
          :class="[
            clickable && 'cursor-pointer hover:bg-slate-50/80',
            selectedId === row.id && 'bg-brand-50/70 shadow-[inset_3px_0_0_var(--color-brand-600)] hover:bg-brand-50',
          ]"
          @click="clickable && $emit('rowClick', row)"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="whitespace-nowrap px-4 py-3 text-slate-700"
            :class="[col.align === 'right' && 'text-right tabular-nums', col.class]"
          >
            <slot :name="`cell-${col.key}`" :row="row">{{ cellValue(row, col.key) }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
    <slot v-if="!rows.length" name="empty" />
  </div>
</template>
