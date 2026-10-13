import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/database/seed.js';

const prisma = new PrismaClient();

seedDatabase(prisma)
  .then(() => console.log('Seed completed.'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
