import { z } from 'zod';
import * as monitoringService from '../services/monitoring.service.js';
import { defineTool } from './types.js';

export const getCustomerReturnPatterns = defineTool({
  name: 'getCustomerReturnPatterns',
  description: "Get, for each customer, how many of their most recent rentals were returned late.",
  kind: 'read',
  parameters: z.object({}),
  handler: () => monitoringService.getCustomerReturnPatterns(),
});

export const getOperationalConsistency = defineTool({
  name: 'getOperationalConsistency',
  description: 'Find data that contradicts itself: rentals past their end date not returned, machines marked rented without a rental, implausible engine-hour readings.',
  kind: 'read',
  parameters: z.object({}),
  handler: () => monitoringService.getOperationalConsistency(),
});
