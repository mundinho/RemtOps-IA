import { Banknote, CreditCard, Landmark, Smartphone } from '@lucide/vue';
import type { Component } from 'vue';
import type { PaymentMethod } from '@/types';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint: string; icon: Component }[] = [
  { value: 'MPESA', label: 'M-Pesa', hint: 'Vodacom mobile money', icon: Smartphone },
  { value: 'EMOLA', label: 'e-Mola', hint: 'Movitel mobile money', icon: Smartphone },
  { value: 'BANK_TRANSFER', label: 'Bank transfer', hint: 'Transferência bancária', icon: Landmark },
  { value: 'CARD', label: 'Card', hint: 'Debit or credit card', icon: CreditCard },
  { value: 'CASH', label: 'Cash', hint: 'Numerário — limits apply', icon: Banknote },
];

export const paymentMethodLabel = (method: PaymentMethod | null | undefined) =>
  PAYMENT_METHODS.find((m) => m.value === method)?.label ?? '—';
