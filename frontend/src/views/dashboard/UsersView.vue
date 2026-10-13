<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { ref } from 'vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DataTable, { type Column } from '@/components/ui/DataTable.vue';
import Drawer from '@/components/ui/Drawer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import { useAsync } from '@/composables/useAsync';
import { ApiError } from '@/services/http';
import { session } from '@/services/session';
import { usersApi } from '@/services/users.api';
import type { StaffRole, StaffUser } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';

const { data, loading, error, refresh } = useAsync(usersApi.list);

const ROLES: { value: StaffRole; label: string; hint: string }[] = [
  { value: 'ADMIN', label: 'Admin', hint: 'Everything, including user accounts and the demo reset' },
  { value: 'OPERATOR', label: 'Operator', hint: 'Dashboard and customer master data' },
];

const columns: Column[] = [
  { key: 'name', label: 'User', class: 'whitespace-normal' },
  { key: 'role', label: 'Role' },
  { key: 'isActive', label: 'Status' },
  { key: 'lastLoginAt', label: 'Last sign-in' },
];

// ── Form (create / edit) ──
const editing = ref<StaffUser | null>(null);
const open = ref(false);
const saving = ref(false);
const formError = ref('');
const fieldErrors = ref<Record<string, string[]>>({});
const form = ref({ name: '', email: '', role: 'OPERATOR' as StaffRole, isActive: true, password: '' });

const isSelf = (u: StaffUser | null) => u?.id === session.staff?.user.id;

function openCreate() {
  editing.value = null;
  form.value = { name: '', email: '', role: 'OPERATOR', isActive: true, password: '' };
  resetErrors();
  open.value = true;
}

function openEdit(user: StaffUser) {
  editing.value = user;
  form.value = { name: user.name, email: user.email, role: user.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR', isActive: user.isActive, password: '' };
  resetErrors();
  open.value = true;
}

function resetErrors() {
  formError.value = '';
  fieldErrors.value = {};
}

async function save() {
  resetErrors();
  saving.value = true;
  try {
    if (editing.value) {
      await usersApi.update(editing.value.id, {
        role: form.value.role,
        isActive: form.value.isActive,
        password: form.value.password || undefined,
      });
    } else {
      await usersApi.create({ name: form.value.name, email: form.value.email, role: form.value.role, password: form.value.password });
    }
    open.value = false;
    await refresh();
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Could not save the user';
    if (e instanceof ApiError && e.details) fieldErrors.value = e.details;
  } finally {
    saving.value = false;
  }
}

const errorOf = (field: string) => fieldErrors.value[field]?.[0];
const inputClass =
  'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50 disabled:text-slate-500';
</script>

<template>
  <PageHeader
    title="Users"
    description="Staff who can sign in to this dashboard. People observe and maintain master data — rental decisions stay with the agents."
  >
    <template #actions>
      <button
        class="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300"
        @click="openCreate"
      >
        <Plus class="size-4" /> New user
      </button>
    </template>
  </PageHeader>

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <Panel v-if="data" flush>
      <DataTable :columns="columns" :rows="data" clickable :selected-id="editing?.id" @row-click="openEdit">
        <template #cell-name="{ row }">
          <span class="block font-medium text-slate-900">
            {{ row.name }} <span v-if="isSelf(row)" class="text-xs font-normal text-slate-400">(you)</span>
          </span>
          <span class="text-xs text-slate-400">{{ row.email }}</span>
        </template>
        <template #cell-role="{ row }">
          <span class="rounded px-1.5 py-0.5 text-xs font-medium" :class="row.role === 'ADMIN' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'">
            {{ row.role === 'ADMIN' ? 'Admin' : row.role === 'OPERATOR' ? 'Operator' : row.role }}
          </span>
        </template>
        <template #cell-isActive="{ row }">
          <span class="rounded px-1.5 py-0.5 text-xs" :class="row.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'">
            {{ row.isActive ? 'Active' : 'Deactivated' }}
          </span>
        </template>
        <template #cell-lastLoginAt="{ row }">
          <span class="text-xs text-slate-500">{{ row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'Never' }}</span>
        </template>
      </DataTable>
    </Panel>
  </AsyncState>

  <Drawer
    :open="open"
    :title="editing ? editing.name : 'New user'"
    :subtitle="editing ? `${editing.email} · since ${formatDate(editing.createdAt)}` : 'Give a team member access to the dashboard'"
    @close="open = false"
  >
    <form class="space-y-5" @submit.prevent="save">
      <template v-if="!editing">
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Name</span>
          <input v-model="form.name" :class="inputClass" />
          <span v-if="errorOf('name')" class="mt-1 block text-xs text-rose-600">{{ errorOf('name') }}</span>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Email</span>
          <input v-model="form.email" type="email" autocomplete="off" :class="inputClass" />
          <span v-if="errorOf('email')" class="mt-1 block text-xs text-rose-600">{{ errorOf('email') }}</span>
        </label>
      </template>

      <fieldset class="space-y-2">
        <legend class="text-sm font-medium text-slate-700">Role</legend>
        <label
          v-for="r in ROLES"
          :key="r.value"
          class="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition"
          :class="[form.role === r.value ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' : 'border-slate-200 hover:bg-slate-50', isSelf(editing) && 'pointer-events-none opacity-60']"
        >
          <input v-model="form.role" type="radio" :value="r.value" class="mt-0.5 accent-amber-500" :disabled="isSelf(editing)" />
          <span>
            <span class="block text-sm font-medium text-slate-800">{{ r.label }}</span>
            <span class="block text-xs text-slate-400">{{ r.hint }}</span>
          </span>
        </label>
      </fieldset>

      <label v-if="editing" class="flex items-center gap-2.5">
        <input v-model="form.isActive" type="checkbox" class="size-4 rounded border-slate-300 accent-amber-500" :disabled="isSelf(editing)" />
        <span class="text-sm text-slate-700">Active — can sign in</span>
      </label>
      <p v-if="isSelf(editing)" class="text-xs text-slate-400">You cannot change your own role or deactivate yourself.</p>

      <label class="block">
        <span class="text-sm font-medium text-slate-700">{{ editing ? 'New password' : 'Password' }}</span>
        <input v-model="form.password" type="password" autocomplete="new-password" :placeholder="editing ? 'Leave empty to keep the current one' : ''" :class="inputClass" />
        <span v-if="errorOf('password')" class="mt-1 block text-xs text-rose-600">{{ errorOf('password') }}</span>
        <span v-else class="mt-1 block text-xs text-slate-400">At least 8 characters. Share it with the person securely.</span>
      </label>

      <p v-if="formError" class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ formError }}</p>

      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" @click="open = false">Cancel</button>
        <button
          type="submit"
          :disabled="saving"
          class="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
        >
          {{ saving ? 'Saving…' : editing ? 'Save changes' : 'Create user' }}
        </button>
      </div>
    </form>
  </Drawer>
</template>
