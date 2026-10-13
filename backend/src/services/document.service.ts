import type { DocumentType } from '@prisma/client';
import { BUSINESS_RULES } from '../config/businessRules.js';
import { prisma } from '../database/prisma.js';
import { isoDay, startOfDay } from '../utils/dates.js';

export interface DocumentCheck {
  required: DocumentType[];
  valid: DocumentType[];
  missing: DocumentType[];
  expired: { type: DocumentType; expiredOn: string | null }[];
  complete: boolean;
}

/** Compares the documents a customer holds with what this equipment requires. */
export async function checkDocuments(customerId: string, requiresOperatorLicense: boolean): Promise<DocumentCheck> {
  const required: DocumentType[] = [
    ...BUSINESS_RULES.alwaysRequiredDocuments,
    ...(requiresOperatorLicense ? [BUSINESS_RULES.operatorLicenseDocument] : []),
  ];

  const documents = await prisma.rentalDocument.findMany({ where: { customerId, type: { in: required } } });
  const today = startOfDay();

  const valid: DocumentType[] = [];
  const expired: DocumentCheck['expired'] = [];
  for (const type of required) {
    const docs = documents.filter((d) => d.type === type);
    const ok = docs.some((d) => d.status === 'VALID' && (!d.expiresAt || d.expiresAt >= today));
    if (ok) valid.push(type);
    else if (docs.length) {
      const latest = docs.sort((a, b) => (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0))[0]!;
      expired.push({ type, expiredOn: isoDay(latest.expiresAt) });
    }
  }
  const missing = required.filter((t) => !valid.includes(t) && !expired.some((e) => e.type === t));

  return { required, valid, missing, expired, complete: missing.length === 0 && expired.length === 0 };
}
