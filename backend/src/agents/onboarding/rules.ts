import type { RuleViolation } from '../core/types.js';

/** What the Onboarding Agent knows about one registration. */
export interface RegistrationFacts {
  submitted: { companyName: string; taxId: string; contactName: string; email: string; phone: string };
  /** The customer record this NUIT already had before the registration (admin or QR request), if any. */
  existingRecord: {
    code: string;
    companyName: string;
    contactName: string;
    email: string;
    isBlocked: boolean;
    rentals: number;
  } | null;
}

/** Throwaway inbox providers — an account must be reachable for invoices and notices. */
const DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
];

/** Deterministic checks on a self-registration. No AI involved — these always win. */
export function onboardingRules({ submitted, existingRecord }: RegistrationFacts): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (existingRecord?.isBlocked) {
    violations.push({
      rule: 'customer.blocked',
      decision: 'REJECT',
      reason: `NUIT ${submitted.taxId} belongs to a blocked customer (${existingRecord.code}).`,
    });
  }

  // An existing company can only be claimed with the email already on file — prevents account takeover by NUIT.
  if (existingRecord && existingRecord.email.toLowerCase() !== submitted.email.toLowerCase()) {
    violations.push({
      rule: 'customer.email_mismatch',
      decision: 'REJECT',
      reason: `NUIT ${submitted.taxId} is already registered (${existingRecord.code}) with a different email address. Use the email on file or contact us.`,
    });
  }

  const domain = submitted.email.split('@')[1]?.toLowerCase() ?? '';
  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    violations.push({
      rule: 'email.disposable',
      decision: 'REJECT',
      reason: `Disposable email addresses (${domain}) are not accepted.`,
    });
  }

  return violations;
}
