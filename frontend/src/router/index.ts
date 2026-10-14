import { createRouter, createWebHistory } from 'vue-router';
import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import PublicLayout from '@/components/layout/PublicLayout.vue';
import { isAdmin, session } from '@/services/session';

declare module 'vue-router' {
  interface RouteMeta {
    /** Who may open the page: signed-in staff, staff with the ADMIN role, or a signed-in customer. */
    requires?: 'staff' | 'admin' | 'customer';
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', component: () => import('@/views/auth/StaffLoginView.vue') },
    {
      path: '/dashboard',
      component: DashboardLayout,
      meta: { requires: 'staff' },
      children: [
        { path: '', name: 'overview', component: () => import('@/views/dashboard/OverviewView.vue') },
        { path: 'customers', name: 'customers', component: () => import('@/views/dashboard/CustomersView.vue') },
        { path: 'equipment', name: 'equipment', component: () => import('@/views/dashboard/EquipmentView.vue') },
        { path: 'maintenance', name: 'maintenance', component: () => import('@/views/dashboard/MaintenanceView.vue') },
        { path: 'finance', name: 'finance', component: () => import('@/views/dashboard/FinanceView.vue') },
        { path: 'alerts', name: 'alerts', component: () => import('@/views/dashboard/AlertsView.vue') },
        { path: 'rentals', name: 'rentals', component: () => import('@/views/dashboard/RentalsView.vue') },
        { path: 'statistics', name: 'statistics', component: () => import('@/views/dashboard/StatisticsView.vue') },
        { path: 'reports', name: 'reports', component: () => import('@/views/dashboard/ReportsView.vue') },
        { path: 'agents', name: 'agents', component: () => import('@/views/dashboard/AgentActivityView.vue') },
        { path: 'decisions', name: 'decisions', component: () => import('@/views/dashboard/AiDecisionsView.vue') },
        { path: 'qr-codes', name: 'qr-codes', component: () => import('@/views/dashboard/QrCodesView.vue') },
        { path: 'users', name: 'users', meta: { requires: 'admin' }, component: () => import('@/views/dashboard/UsersView.vue') },
      ],
    },
    // Public pages — what a customer sees after scanning the physical QR code, plus the customer portal
    {
      path: '/',
      component: PublicLayout,
      children: [
        { path: 'equipment/:code', name: 'scan', component: () => import('@/views/public/EquipmentScanView.vue') },
        { path: 'requests/:id', name: 'request-status', component: () => import('@/views/public/RequestStatusView.vue') },
        { path: 'client/login', name: 'customer-login', component: () => import('@/views/portal/CustomerLoginView.vue') },
        { path: 'client/register', name: 'customer-register', component: () => import('@/views/portal/CustomerRegisterView.vue') },
        { path: 'client', name: 'portal', meta: { requires: 'customer' }, component: () => import('@/views/portal/CustomerPortalView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
});

// The UI only hides what you cannot use — the API enforces the same rules on every call.
router.beforeEach((to) => {
  const requires = to.matched.map((r) => r.meta.requires).filter(Boolean);
  if (requires.includes('customer') && !session.customer) {
    return { name: 'customer-login', query: { redirect: to.fullPath } };
  }
  if ((requires.includes('staff') || requires.includes('admin')) && !session.staff) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (requires.includes('admin') && !isAdmin()) return { name: 'overview' };
});
