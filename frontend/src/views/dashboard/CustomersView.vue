<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { computed, ref } from 'vue';
import AsyncState from '@/components/ui/AsyncState.vue';
import DataTable, { type Column } from '@/components/ui/DataTable.vue';
import Flag from '@/components/ui/Flag.vue';
import Drawer from '@/components/ui/Drawer.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import Panel from '@/components/ui/Panel.vue';
import PhoneInput from '@/components/ui/PhoneInput.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAsync } from '@/composables/useAsync';
import { customersApi } from '@/services/customers.api';
import { ApiError } from '@/services/http';
import type { Customer, CustomerDocumentType, CustomerPayload } from '@/types';
import { countryLabel, DEFAULT_COUNTRY } from '@/utils/countries';
import { formatDate, formatMoney } from '@/utils/format';

const { data, loading, error, refresh } = useAsync(customersApi.list);

const DOC_TYPES: { type: CustomerDocumentType; label: string; hint: string }[] = [
  { type: 'ID_DOCUMENT', label: 'ID document', hint: 'Required for every rental' },
  { type: 'INSURANCE_CERTIFICATE', label: 'Insurance certificate', hint: 'Required for every rental' },
  { type: 'OPERATOR_LICENSE', label: 'Operator licence', hint: 'Required for machines that need a licensed operator' },
  { type: 'COMPANY_REGISTRATION', label: 'Company registration', hint: 'Optional' },
];

const columns: Column[] = [
  { key: 'code', label: 'ID' },
  { key: 'companyName', label: 'Customer', class: 'whitespace-normal' },
  { key: 'taxId', label: 'NUIT' },
  { key: 'email', label: 'Email on file' },
  { key: 'documents', label: 'Documents' },
  { key: 'accountStatus', label: 'Portal' },
  { key: 'rentalCount', label: 'Rentals', align: 'right' },
];

const today = new Date().toISOString().slice(0, 10);
const inOneYear = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

/** Status of a document type for the table chips. */
function docState(customer: Customer, type: CustomerDocumentType): 'valid' | 'expired' | 'missing' {
  const docs = customer.documents.filter((d) => d.type === type);
  if (docs.some((d) => d.status === 'VALID' && (!d.expiresAt || d.expiresAt >= today))) return 'valid';
  return docs.length ? 'expired' : 'missing';
}
const CHIP = { valid: 'bg-emerald-50 text-emerald-700', expired: 'bg-rose-50 text-rose-700', missing: 'bg-slate-100 text-slate-400' };
const SHORT: Record<CustomerDocumentType, string> = { ID_DOCUMENT: 'ID', INSURANCE_CERTIFICATE: 'Insurance', OPERATOR_LICENSE: 'Licence', COMPANY_REGISTRATION: 'Registration' };

// ── Form (create / edit) ──
type DocRow = { type: CustomerDocumentType; onFile: boolean; documentNumber: string; expiresAt: string };
const editing = ref<Customer | null>(null);
const open = ref(false);
const saving = ref(false);
const formError = ref('');
const fieldErrors = ref<Record<string, string[]>>({});
const form = ref(emptyForm());

function emptyForm() {
  return {
    companyName: '',
    taxId: '',
    contactName: '',
    email: '',
    phone: '',
    country: DEFAULT_COUNTRY,
    creditLimit: '' as string | number,
    notes: '',
    docs: DOC_TYPES.map<DocRow>((d) => ({ type: d.type, onFile: false, documentNumber: '', expiresAt: inOneYear() })),
  };
}

function openCreate() {
  editing.value = null;
  form.value = emptyForm();
  form.value.docs.forEach((d) => (d.onFile = d.type === 'ID_DOCUMENT' || d.type === 'INSURANCE_CERTIFICATE'));
  resetErrors();
  open.value = true;
}

function openEdit(customer: Customer) {
  editing.value = customer;
  form.value = {
    companyName: customer.companyName,
    taxId: customer.taxId,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone ?? '',
    country: customer.country,
    creditLimit: customer.creditLimit ?? '',
    notes: customer.notes ?? '',
    docs: DOC_TYPES.map<DocRow>(({ type }) => {
      const doc = customer.documents.find((d) => d.type === type); // newest first
      return { type, onFile: !!doc, documentNumber: doc?.documentNumber ?? '', expiresAt: doc?.expiresAt ?? inOneYear() };
    }),
  };
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
  const payload: CustomerPayload = {
    companyName: form.value.companyName,
    taxId: form.value.taxId,
    contactName: form.value.contactName,
    email: form.value.email,
    phone: form.value.phone,
    country: form.value.country,
    creditLimit: form.value.creditLimit === '' ? null : Number(form.value.creditLimit),
    notes: form.value.notes,
    documents: form.value.docs
      .filter((d) => d.onFile)
      .map(({ type, documentNumber, expiresAt }) => ({ type, documentNumber, expiresAt })),
  };
  try {
    if (editing.value) await customersApi.update(editing.value.id, payload);
    else await customersApi.create(payload);
    open.value = false;
    await refresh();
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Could not save the customer';
    if (e instanceof ApiError && e.details) fieldErrors.value = e.details;
  } finally {
    saving.value = false;
  }
}

const errorOf = (field: string) => fieldErrors.value[field]?.[0];
const missingRequired = computed(() =>
  form.value.docs.filter((d) => (d.type === 'ID_DOCUMENT' || d.type === 'INSURANCE_CERTIFICATE') && (!d.onFile || d.expiresAt < today)),
);

const inputClass = 'input';
</script>

<template>
  <PageHeader
    title="Customers"
    description="Customer master data maintained by the admin. Documents registered here are what the Risk Agent checks — the rental decision itself stays with the agents."
  >
    <template #actions>
      <button
        class="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
        @click="openCreate"
      >
        <Plus class="size-4" /> New customer
      </button>
    </template>
  </PageHeader>

  <AsyncState :loading="loading" :error="error" :has-data="!!data" @retry="refresh">
    <Panel v-if="data" flush>
      <DataTable :columns="columns" :rows="data" clickable :selected-id="editing?.id" @row-click="openEdit">
        <template #cell-code="{ row }"><span class="font-mono text-xs font-medium text-slate-500">{{ row.code }}</span></template>
        <template #cell-companyName="{ row }">
          <span class="block font-medium text-slate-900">{{ row.companyName }}</span>
          <span class="inline-flex items-center gap-1.5 text-xs text-slate-400">{{ row.contactName }} · <Flag :code="row.country" /> {{ countryLabel(row.country) }}</span>
          <span v-if="row.isBlocked" class="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">Blocked</span>
        </template>
        <template #cell-taxId="{ row }"><span class="font-mono text-xs">{{ row.taxId }}</span></template>
        <template #cell-documents="{ row }">
          <span class="flex flex-wrap gap-1">
            <span
              v-for="d in DOC_TYPES"
              :key="d.type"
              class="rounded px-1.5 py-0.5 text-xs"
              :class="CHIP[docState(row, d.type)]"
              :title="`${d.label}: ${docState(row, d.type)}`"
            >
              {{ SHORT[d.type] }}
            </span>
          </span>
        </template>
        <template #cell-accountStatus="{ row }">
          <span v-if="row.accountStatus" :title="row.accountDecisionReason ?? undefined"><StatusBadge :status="row.accountStatus" /></span>
          <span v-else class="text-xs text-slate-300">No account</span>
        </template>
      </DataTable>
    </Panel>
  </AsyncState>

  <Drawer
    :open="open"
    :title="editing ? editing.companyName : 'New customer'"
    :subtitle="editing ? `${editing.code} · since ${formatDate(editing.createdAt)}` : 'Register a company allowed to rent'"
    @close="open = false"
  >
    <form class="space-y-5" @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium text-slate-700">Company / full name</span>
          <input v-model="form.companyName" :class="inputClass" />
          <span v-if="errorOf('companyName')" class="mt-1 block text-xs text-rose-600">{{ errorOf('companyName') }}</span>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-slate-700">NUIT</span>
          <input v-model="form.taxId" inputmode="numeric" maxlength="9" placeholder="9 digits" :class="inputClass" />
          <span v-if="errorOf('taxId')" class="mt-1 block text-xs text-rose-600">{{ errorOf('taxId') }}</span>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-slate-700">Contact name</span>
          <input v-model="form.contactName" :class="inputClass" />
          <span v-if="errorOf('contactName')" class="mt-1 block text-xs text-rose-600">{{ errorOf('contactName') }}</span>
        </label>
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium text-slate-700">Email</span>
          <input v-model="form.email" type="email" :class="inputClass" />
          <span v-if="errorOf('email')" class="mt-1 block text-xs text-rose-600">{{ errorOf('email') }}</span>
          <span v-else class="mt-1 block text-xs text-slate-400">The QR form must use this email, or the request is flagged as an identity mismatch.</span>
        </label>
        <div class="block sm:col-span-2">
          <span class="text-sm font-medium text-slate-700">Phone and country</span>
          <PhoneInput v-model="form.phone" v-model:country="form.country" />
          <span v-if="errorOf('phone') || errorOf('country')" class="mt-1 block text-xs text-rose-600">{{ errorOf('phone') ?? errorOf('country') }}</span>
        </div>
        <label class="block sm:col-span-2">
          <span class="text-sm font-medium text-slate-700">Credit limit (MZN)</span>
          <input v-model="form.creditLimit" type="number" min="0" step="1000" placeholder="No limit" :class="inputClass" />
          <span v-if="editing?.creditLimit != null" class="mt-1 block text-xs text-slate-400">Currently {{ formatMoney(editing.creditLimit) }}</span>
        </label>
      </div>

      <fieldset class="rounded-lg border border-slate-200">
        <legend class="mx-3 px-1 text-sm font-medium text-slate-700">Documents checked by the admin</legend>
        <div class="divide-y divide-slate-100">
          <div v-for="(doc, i) in form.docs" :key="doc.type" class="px-4 py-3">
            <label class="flex items-start gap-2.5">
              <input v-model="doc.onFile" type="checkbox" class="mt-0.5 size-4 rounded border-slate-300 accent-brand-600" />
              <span>
                <span class="block text-sm font-medium text-slate-800">{{ DOC_TYPES[i]!.label }}</span>
                <span class="block text-xs text-slate-400">{{ DOC_TYPES[i]!.hint }}</span>
              </span>
            </label>
            <div v-if="doc.onFile" class="mt-2 grid gap-3 pl-6.5 sm:grid-cols-2">
              <label class="block">
                <span class="text-xs text-slate-500">Number</span>
                <input v-model="doc.documentNumber" :class="inputClass" />
              </label>
              <label class="block">
                <span class="text-xs text-slate-500">Valid until</span>
                <input v-model="doc.expiresAt" type="date" required :class="inputClass" />
                <span v-if="doc.expiresAt < today" class="mt-1 block text-xs text-rose-600">Expired — saved as EXPIRED</span>
              </label>
            </div>
          </div>
        </div>
      </fieldset>

      <label class="block">
        <span class="text-sm font-medium text-slate-700">Notes</span>
        <textarea v-model="form.notes" rows="2" :class="inputClass" />
      </label>

      <p v-if="missingRequired.length" class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Without a valid ID document and insurance certificate the Risk Agent will flag this customer's requests, and the Approval Agent rejects them.
      </p>
      <p v-if="formError" class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ formError }}</p>

      <div class="flex justify-end gap-2">
        <button type="button" class="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" @click="open = false">Cancel</button>
        <button
          type="submit"
          :disabled="saving"
          class="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
        >
          {{ saving ? 'Saving…' : editing ? 'Save changes' : 'Register customer' }}
        </button>
      </div>
    </form>
  </Drawer>
</template>
