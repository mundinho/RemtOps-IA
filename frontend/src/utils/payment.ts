import { Banknote, CreditCard, Landmark, Smartphone } from '@lucide/vue';
import type { Component } from 'vue';
import type { PaymentMethod } from '@/types';

/** `available: false` → shown but disabled (the API refuses them too). */
export const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint: string; icon: Component; available: boolean }[] = [
  { value: 'MPESA', label: 'M-Pesa', hint: 'Vodacom mobile money', icon: Smartphone, available: true },
  { value: 'EMOLA', label: 'e-Mola', hint: 'Movitel mobile money', icon: Smartphone, available: false },
  { value: 'BANK_TRANSFER', label: 'Bank transfer', hint: 'Transferência bancária', icon: Landmark, available: false },
  { value: 'CARD', label: 'Card', hint: 'Debit or credit card', icon: CreditCard, available: false },
  { value: 'CASH', label: 'Cash', hint: 'Numerário — limits apply', icon: Banknote, available: true },
];

export const paymentMethodLabel = (method: PaymentMethod | null | undefined) =>
  PAYMENT_METHODS.find((m) => m.value === method)?.label ?? '—';
