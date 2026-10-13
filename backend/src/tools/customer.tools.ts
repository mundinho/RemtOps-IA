import { z } from 'zod';
import { prisma } from '../database/prisma.js';
import * as customerService from '../services/customer.service.js';
import * as documentService from '../services/document.service.js';
import { defineTool } from './types.js';

export const getCustomer = defineTool({
  name: 'getCustomer',
  description: 'Get the profile of the customer who made the current request: company, contact, whether the account is blocked, credit limit and internal notes.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const { customerId } = await ctx.scope();
    const c = await customerService.getCustomer(customerId);
    return {
      code: c.code,
      companyName: c.companyName,
      contactName: c.contactName,
      email: c.email,
      isBlocked: c.isBlocked,
      creditLimit: c.creditLimit == null ? null : Number(c.creditLimit),
      notes: c.notes,
    };
  },
});

export const getCustomerRentalHistory = defineTool({
  name: 'getCustomerRentalHistory',
  description: "Get the customer's previous rentals with totals of late returns, late days and damage incidents.",
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const { customerId, id } = await ctx.scope();
    return customerService.getCustomerRentalHistory(customerId, id);
  },
});

export const checkDocuments = defineTool({
  name: 'checkDocuments',
  description: 'Check which documents the customer must hold for this equipment and which are valid, missing or expired.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const { customerId, equipmentId } = await ctx.scope();
    const equipment = await prisma.equipment.findUniqueOrThrow({
      where: { id: equipmentId },
      select: { requiresOperatorLicense: true },
    });
    return documentService.checkDocuments(customerId, equipment.requiresOperatorLicense);
  },
});
