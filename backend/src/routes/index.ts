import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import * as customers from '../controllers/customer.controller.js';
import * as dashboard from '../controllers/dashboard.controller.js';
import * as demo from '../controllers/demo.controller.js';
import * as equipment from '../controllers/equipment.controller.js';
import * as observability from '../controllers/observability.controller.js';
import * as operations from '../controllers/operations.controller.js';
import * as publicApi from '../controllers/public.controller.js';
import * as rentals from '../controllers/rental.controller.js';
import * as users from '../controllers/user.controller.js';
import { llm } from '../llm/index.js';
import { optionalCustomer, requireCustomer, requireStaff } from '../middleware/auth.js';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', llm: { provider: llm.name, model: llm.model } });
});

// ─────────── Public ───────────

// Reached from the physical QR code (a signed-in customer is recognised, but not required)
router.get('/public/equipment/:code', publicApi.equipment);
router.post('/public/equipment/:code/rental-requests', optionalCustomer, publicApi.createRequest);
router.post('/public/equipment/:code/assistant', publicApi.assistant);
router.get('/public/rental-requests/:id', publicApi.requestStatus);
router.post('/public/rental-requests/:id/mpesa', publicApi.payMpesa);
router.get('/public/demo-customers', publicApi.demoCustomers);
// QR label image — loaded by <img>, which cannot send a token
router.get('/equipment/:code/qr', equipment.qrCode);

// Sign-in and customer self-registration
router.post('/auth/staff/login', auth.loginStaff);
router.post('/auth/customer/login', auth.loginCustomer);
router.post('/auth/customer/register', auth.register);
router.get('/auth/customer/registrations/:id', auth.registrationStatus);

// ─────────── Customer portal (ACTIVE account) ───────────

router.get('/portal', requireCustomer, auth.customerPortal);

// ─────────── Dashboard (staff) — everything below requires a staff sign-in ───────────

router.use(requireStaff());

router.get('/auth/staff/me', auth.staffMe);

// Observability
router.get('/dashboard/overview', dashboard.overview);
router.get('/dashboard/statistics', dashboard.statistics);

router.get('/equipment', equipment.list);
router.get('/equipment/:code', equipment.detail);

router.get('/rentals', rentals.list);
router.get('/rentals/:id', rentals.detail);

router.get('/agent-executions', observability.executions);
router.get('/agent-executions/:id', observability.execution);
// Read-only by design: every decision is taken by agents; people observe.
router.get('/cases', observability.reviews);
router.get('/alerts', observability.alerts);

// Finance & maintenance
router.get('/payments', operations.payments);
router.get('/finance/summary', operations.financeSummary);
router.get('/maintenance-orders', operations.maintenanceOrders);

// Proactive monitoring
router.post('/monitoring/run', operations.runMonitoring);
router.get('/monitoring/status', operations.monitoringStatus);
router.get('/notifications', observability.notifications);
router.get('/audit-logs', observability.auditLogs);

// Customer master data
router.get('/customers', customers.list);
router.post('/customers', customers.create);
router.put('/customers/:id', customers.update);

// Staff accounts and demo reset — admin only
router.get('/users', requireStaff('ADMIN'), users.list);
router.post('/users', requireStaff('ADMIN'), users.create);
router.patch('/users/:id', requireStaff('ADMIN'), users.update);
router.post('/demo/reset', requireStaff('ADMIN'), demo.reset);
