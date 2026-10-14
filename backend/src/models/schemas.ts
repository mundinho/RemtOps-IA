import { AgentName } from '@prisma/client';
import { z } from 'zod';

/**
 * Request validation at the HTTP boundary.
 * Only the *shape* is checked here — business rules (availability, max duration, documents)
 * are evaluated later by the agents, so every rejection is traced and explained.
 */

const isoDate = z.iso.date().transform((value) => new Date(`${value}T00:00:00`));

export const PAYMENT_METHODS = ['MPESA', 'EMOLA', 'BANK_TRANSFER', 'CARD', 'CASH'] as const;
/** Methods new requests may use. e-Mola, bank transfer and card are shown as unavailable for now. */
export const AVAILABLE_PAYMENT_METHODS: readonly (typeof PAYMENT_METHODS)[number][] = ['MPESA', 'CASH'];

/** Country of the contact, ISO 3166-1 alpha-2 (MZ, ZA, PT…). Mozambique when not given. */
const country = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Invalid country')
  .default('MZ');

/**
 * A Mozambican number must have 9 digits after +258 (mobile 8x…, landline 2x…) — otherwise an SMS can
 * never arrive. Other countries keep the generic format check.
 */
const isValidPhoneForCountry = ({ phone, country }: { phone?: string; country: string }) => {
  if (!phone) return true;
  const digits = phone.replace(/\D/g, '');
  if (country !== 'MZ' && !digits.startsWith('258')) return true;
  const local = digits.startsWith('258') ? digits.slice(3) : digits;
  return /^[82]\d{8}$/.test(local);
};
const MZ_PHONE_ERROR = { message: 'A Mozambican number has 9 digits after +258 (e.g. 84 123 4567)', path: ['phone'] };

/** What the person scanning the QR code fills in. The company is identified by its NUIT. */
export const RentalRequestSchema = z
  .object({
    companyName: z.string().trim().min(2, 'Company or full name is required').max(150),
    taxId: z.string().trim().regex(/^\d{9}$/, 'NUIT must have 9 digits'),
    contactName: z.string().trim().min(2, 'Contact name is required').max(120),
    email: z.email('Invalid email').trim().toLowerCase(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s]{9,16}$/, 'Invalid phone number'),
    country,
    paymentMethod: z.enum(PAYMENT_METHODS).refine((m) => AVAILABLE_PAYMENT_METHODS.includes(m), 'This payment method is currently unavailable'),
    startDate: isoDate,
    endDate: isoDate,
    intendedUse: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  })
  .refine(isValidPhoneForCountry, MZ_PHONE_ERROR);
export type RentalRequestInput = z.infer<typeof RentalRequestSchema>;

export const DOCUMENT_TYPES = ['ID_DOCUMENT', 'INSURANCE_CERTIFICATE', 'OPERATOR_LICENSE', 'COMPANY_REGISTRATION'] as const;

/**
 * Admin registration of a customer (dashboard → Customers). The documents listed here were checked
 * by the admin; the Risk Agent then treats them as on file (VALID until they expire).
 */
export const CustomerInputSchema = z.object({
  companyName: z.string().trim().min(2, 'Company or full name is required').max(150),
  taxId: z.string().trim().regex(/^\d{9}$/, 'NUIT must have 9 digits'),
  contactName: z.string().trim().min(2, 'Contact name is required').max(120),
  email: z.email('Invalid email').trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s]{9,16}$/, 'Invalid phone number')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  country,
  creditLimit: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
  documents: z
    .array(
      z.object({
        type: z.enum(DOCUMENT_TYPES),
        documentNumber: z.string().trim().max(60).optional(),
        expiresAt: isoDate,
      }),
    )
    .refine((docs) => new Set(docs.map((d) => d.type)).size === docs.length, 'Each document type can only be listed once')
    .default([]),
}).refine(isValidPhoneForCountry, MZ_PHONE_ERROR);
export type CustomerInput = z.infer<typeof CustomerInputSchema>;

// ── Authentication ──

const password = z.string().min(8, 'Password must have at least 8 characters').max(100);

export const LoginSchema = z.object({
  email: z.email('Invalid email').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required').max(100),
});

/** Customer self-registration. The account stays PENDING until the Onboarding Agent decides. */
export const CustomerRegistrationSchema = z.object({
  companyName: z.string().trim().min(2, 'Company or full name is required').max(150),
  taxId: z.string().trim().regex(/^\d{9}$/, 'NUIT must have 9 digits'),
  contactName: z.string().trim().min(2, 'Contact name is required').max(120),
  email: z.email('Invalid email').trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s]{9,16}$/, 'Invalid phone number'),
  country,
  password,
}).refine(isValidPhoneForCountry, MZ_PHONE_ERROR);
export type CustomerRegistrationInput = z.infer<typeof CustomerRegistrationSchema>;

/** Staff account created by an admin. */
export const UserInputSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.email('Invalid email').trim().toLowerCase(),
  role: z.enum(['ADMIN', 'OPERATOR']),
  password,
});
export type UserInput = z.infer<typeof UserInputSchema>;

/** Admin changes to an existing staff account; a password here resets it. */
export const UserUpdateSchema = z.object({
  role: z.enum(['ADMIN', 'OPERATOR']).optional(),
  isActive: z.boolean().optional(),
  password: password.optional(),
});
export type UserUpdate = z.infer<typeof UserUpdateSchema>;

/** A chat turn from the public assistant widget. History is kept by the browser and bounded here. */
export const AssistantChatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(600) }))
    .min(1)
    .max(12)
    .refine((m) => m.at(-1)?.role === 'user', 'The last message must come from the user'),
  rentalId: z.string().min(1).optional(),
});

export const EquipmentCodeParam = z.object({ code: z.string().regex(/^EQP-\d{3}$/) });
export const IdParam = z.object({ id: z.string().min(1) });

export const RentalListQuery = z.object({
  status: z
    .enum(['REQUESTED', 'IN_REVIEW', 'REQUIRES_HUMAN_REVIEW', 'APPROVED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const ExecutionListQuery = z.object({
  // Derived from the Prisma enum, so a new agent can never be missing from the filter again
  agent: z.enum(AgentName).optional(),
  correlationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const ReviewListQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export const AlertListQuery = z.object({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
});

export const AuditListQuery = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  correlationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/**
 * M-Pesa checkout: the QR form (validated as a RentalRequest when the checkout starts) plus the
 * Vodacom number that confirms the deposit with its PIN.
 */
export const MpesaCheckoutSchema = z.looseObject({
  mpesaPhone: z.string().trim().min(9, 'M-Pesa number is required').max(20),
});
