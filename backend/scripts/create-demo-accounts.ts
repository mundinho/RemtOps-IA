import { PrismaClient } from '@prisma/client';
import { DEMO_ACCOUNTS, ensureDemoAccounts } from '../src/database/seed.js';

/** Adds the demo sign-ins to an existing database without resetting its data. */
const prisma = new PrismaClient();

ensureDemoAccounts(prisma)
  .then(() => {
    console.log('Demo accounts ready:');
    console.log(`  Admin     ${DEMO_ACCOUNTS.admin.email} / ${DEMO_ACCOUNTS.admin.password}`);
    console.log(`  Operator  ${DEMO_ACCOUNTS.operator.email} / ${DEMO_ACCOUNTS.operator.password}`);
    console.log(`  Customer  NUIT ${DEMO_ACCOUNTS.customer.taxId} (its email on file) / ${DEMO_ACCOUNTS.customer.password}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
