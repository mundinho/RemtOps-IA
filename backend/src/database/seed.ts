import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/auth.js';
import { daysFromNow, rentalDays } from '../utils/dates.js';

/**
 * Demo dataset (Mozambique, amounts in MZN). Dates are relative to "today" so every scenario
 * stays valid whenever the demo runs.
 *
 * Rental request scenarios (QR code → agents):
 *  1 APPROVED              EQP-001 Excavator  + CUS-001  clean history, valid docs, nothing owed
 *  2 BLOCKED (maintenance) EQP-002 Bulldozer  status says AVAILABLE, service 21 days overdue
 *  3 HUMAN REVIEW (risk)   EQP-003 Generator  + CUS-002  expired insurance + 3 late returns in last 5
 *  4 REJECTED (rented)     EQP-004 Crane      already rented to CUS-003
 *  5 HUMAN REVIEW (finance)EQP-003 Generator  + CUS-003  good history but an overdue payment
 *
 * Monitoring cycle findings (no request needed — agents act on their own):
 *  Maintenance  EQP-007 over its engine-hour limit · EQP-005 at 95% of limit + recurring hydraulic reports
 *  Finance      EQP-008 rental ends tomorrow with 25 000 MZN pending · CUS-002 payment now overdue
 *  Risk         CUS-002 late-return pattern · EQP-009 not returned · EQP-010 "rented" with no rental ·
 *               EQP-001 meter shows 28 h/day during a past rental
 *  Notification return reminder (EQP-008) · overdue return (EQP-009) · prioritised ops alerts
 */
export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  await clearDatabase(prisma);

  const customers = await createCustomers(prisma);
  const equipment = await createEquipment(prisma);
  await createMaintenanceHistory(prisma, equipment);
  await createRentalHistory(prisma, customers, equipment);
  await ensureDemoAccounts(prisma);
}

/** Demo sign-ins (local demo only). Idempotent, so it also upgrades a database seeded before logins existed. */
export const DEMO_ACCOUNTS = {
  admin: { email: 'admin@demo.local', password: 'admin123' },
  operator: { email: 'operador@demo.local', password: 'operador123' },
  customer: { taxId: '400123456', password: 'cliente123' }, // CUS-001 Construções Silva
};

export async function ensureDemoAccounts(prisma: PrismaClient): Promise<void> {
  // Fully autonomous: staff accounts observe the dashboard — no reviewer role is needed.
  const staff = [
    { name: 'Admin', role: 'ADMIN' as const, ...DEMO_ACCOUNTS.admin },
    { name: 'Operador', role: 'OPERATOR' as const, ...DEMO_ACCOUNTS.operator },
  ];
  for (const { password, ...user } of staff) {
    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({ where: { email: user.email }, update: { passwordHash, isActive: true }, create: { ...user, passwordHash } });
  }

  const customer = await prisma.customer.findUnique({ where: { taxId: DEMO_ACCOUNTS.customer.taxId } });
  if (customer) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        loginEmail: customer.email,
        passwordHash: await hashPassword(DEMO_ACCOUNTS.customer.password),
        accountStatus: 'ACTIVE',
        accountDecisionReason: 'Demo account created by the seed.',
      },
    });
  }
}

async function clearDatabase(prisma: PrismaClient): Promise<void> {
  // Children before parents
  await prisma.auditLog.deleteMany();
  await prisma.agentToolCall.deleteMany();
  await prisma.humanReview.deleteMany();
  await prisma.agentExecution.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.mpesaTransaction.deleteMany();
  await prisma.rentalDocument.deleteMany();
  await prisma.rental.deleteMany();
  await prisma.maintenanceOrder.deleteMany();
  await prisma.equipmentMaintenance.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
}

type IdMap = Record<string, string>;

async function createCustomers(prisma: PrismaClient): Promise<IdMap> {
  let docNumber = 100000;
  const valid = (type: Prisma.RentalDocumentCreateWithoutCustomerInput['type'], years: number) => ({
    type,
    status: 'VALID' as const,
    documentNumber: `${type.slice(0, 3)}-${docNumber++}`,
    issuedAt: daysFromNow(-365),
    expiresAt: daysFromNow(365 * years),
  });

  const definitions: Prisma.CustomerCreateInput[] = [
    {
      code: 'CUS-001',
      companyName: 'Construções Silva, Lda',
      taxId: '400123456', // NUIT
      contactName: 'João Silva',
      email: 'joao.silva@construcoessilva.co.mz',
      phone: '+258 84 123 4567',
      creditLimit: 5_000_000,
      documents: {
        create: [
          valid('ID_DOCUMENT', 2),
          valid('INSURANCE_CERTIFICATE', 1),
          valid('OPERATOR_LICENSE', 3),
          valid('COMPANY_REGISTRATION', 5),
        ],
      },
    },
    {
      code: 'CUS-002',
      companyName: 'Obras Rápidas, Lda',
      taxId: '400987654',
      contactName: 'Rui Machava',
      email: 'rui.machava@obrasrapidas.co.mz',
      phone: '+258 82 111 2222',
      creditLimit: 600_000,
      documents: {
        create: [
          valid('ID_DOCUMENT', 2),
          {
            type: 'INSURANCE_CERTIFICATE',
            status: 'EXPIRED',
            documentNumber: 'INS-447120',
            issuedAt: daysFromNow(-380),
            expiresAt: daysFromNow(-15),
          },
        ],
      },
    },
    {
      code: 'CUS-003',
      companyName: 'Engenharia Norte, SA',
      taxId: '400333444',
      contactName: 'Marta Nhantumbo',
      email: 'marta.nhantumbo@engnorte.co.mz',
      phone: '+258 86 333 4444',
      creditLimit: 10_000_000,
      documents: {
        create: [
          valid('ID_DOCUMENT', 2),
          valid('INSURANCE_CERTIFICATE', 1),
          valid('OPERATOR_LICENSE', 2),
          valid('COMPANY_REGISTRATION', 5),
        ],
      },
    },
    {
      code: 'CUS-004',
      companyName: 'Demolições Express, Lda',
      taxId: '400777888',
      contactName: 'Paulo Cossa',
      email: 'paulo@demolicoesexpress.co.mz',
      isBlocked: true,
      notes: 'Blocked by finance: unpaid invoices and severe equipment damage in 2025.',
      documents: { create: [valid('ID_DOCUMENT', 2), valid('INSURANCE_CERTIFICATE', 1)] },
    },
    {
      code: 'CUS-005',
      companyName: 'Nova Obra Construções, Lda',
      taxId: '400555666',
      contactName: 'Sofia Mondlane',
      email: 'sofia@novaobra.co.mz',
      phone: '+258 87 555 6666',
      creditLimit: 800_000,
      notes: 'New customer since this quarter.',
      documents: {
        create: [valid('ID_DOCUMENT', 2), valid('INSURANCE_CERTIFICATE', 1), valid('COMPANY_REGISTRATION', 5)],
      },
    },
    // Live-demo customers: fully documented, so their own QR requests can be approved
    {
      code: 'CUS-006',
      companyName: 'Raimundo Chitava',
      taxId: '215181881',
      contactName: 'Raimundo Chitava',
      email: 'raimundochitava@icloud.com',
      phone: '+258845916612',
      creditLimit: 2_000_000,
      notes: 'Documents checked and registered by the admin.',
      documents: {
        create: [
          valid('ID_DOCUMENT', 2),
          valid('INSURANCE_CERTIFICATE', 1),
          valid('OPERATOR_LICENSE', 3),
          valid('COMPANY_REGISTRATION', 5),
        ],
      },
    },
    {
      code: 'CUS-007',
      companyName: 'Adriano Uaeca',
      taxId: '400111222',
      contactName: 'Adriano Uaeca',
      email: 'adriano.uaeca@example.com',
      creditLimit: 2_000_000,
      notes: 'Registered by the admin. Documents checked.',
      documents: {
        create: [
          valid('ID_DOCUMENT', 2),
          valid('INSURANCE_CERTIFICATE', 1),
          valid('OPERATOR_LICENSE', 3),
          valid('COMPANY_REGISTRATION', 5),
        ],
      },
    },
  ];

  const ids: IdMap = {};
  for (const data of definitions) {
    const customer = await prisma.customer.create({ data });
    ids[customer.code] = customer.id;
  }
  return ids;
}

async function createEquipment(prisma: PrismaClient): Promise<IdMap> {
  const definitions: Prisma.EquipmentCreateInput[] = [
    {
      code: 'EQP-001',
      name: 'Escavadora CAT 320',
      type: 'EXCAVATOR',
      brand: 'Caterpillar',
      model: '320 GC',
      serialNumber: 'CAT0320GCX1001',
      dailyRate: 30_000,
      location: 'Estaleiro Maputo',
      lastMaintenanceAt: daysFromNow(-30),
      nextMaintenanceDue: daysFromNow(60),
      requiresOperatorLicense: true,
      usageHours: 4_200,
      hoursAtLastService: 4_000,
      serviceIntervalHours: 500,
    },
    {
      code: 'EQP-002',
      name: 'Bulldozer Komatsu D65',
      type: 'BULLDOZER',
      brand: 'Komatsu',
      model: 'D65PX-18',
      serialNumber: 'KMT-D65-88412',
      // Intentionally AVAILABLE: the status field alone looks fine — only the agent catches the overdue service.
      status: 'AVAILABLE',
      dailyRate: 35_000,
      location: 'Estaleiro Maputo',
      lastMaintenanceAt: daysFromNow(-200),
      nextMaintenanceDue: daysFromNow(-21),
      requiresOperatorLicense: true,
      usageHours: 6_100,
      hoursAtLastService: 5_700,
      serviceIntervalHours: 500,
    },
    {
      code: 'EQP-003',
      name: 'Gerador Atlas Copco QAS 100',
      type: 'GENERATOR',
      brand: 'Atlas Copco',
      model: 'QAS 100',
      serialNumber: 'ACQ100-55210',
      dailyRate: 8_000,
      location: 'Estaleiro Matola',
      lastMaintenanceAt: daysFromNow(-45),
      nextMaintenanceDue: daysFromNow(45),
      usageHours: 2_900,
      hoursAtLastService: 2_600,
      serviceIntervalHours: 500,
    },
    {
      code: 'EQP-004',
      name: 'Grua Liebherr LTM 1050',
      type: 'CRANE',
      brand: 'Liebherr',
      model: 'LTM 1050-3.1',
      serialNumber: 'LBH-1050-30077',
      status: 'RENTED',
      dailyRate: 80_000,
      location: 'Obra — Engenharia Norte, Nampula',
      lastMaintenanceAt: daysFromNow(-20),
      nextMaintenanceDue: daysFromNow(100),
      requiresOperatorLicense: true,
      usageHours: 3_100,
      hoursAtLastService: 3_000,
      serviceIntervalHours: 400,
    },
    {
      code: 'EQP-005',
      name: 'Mini-carregadora Bobcat S70',
      type: 'LOADER',
      brand: 'Bobcat',
      model: 'S70',
      serialNumber: 'BOB-S70-77120',
      dailyRate: 12_000,
      location: 'Estaleiro Matola',
      lastMaintenanceAt: daysFromNow(-15),
      nextMaintenanceDue: daysFromNow(75),
      usageHours: 1_880, // 380 h since service — 95% of its 400 h interval
      hoursAtLastService: 1_500,
      serviceIntervalHours: 400,
    },
    {
      code: 'EQP-006',
      name: 'Cilindro Compactador BOMAG BW 120',
      type: 'COMPACTOR',
      brand: 'BOMAG',
      model: 'BW 120 AD-5',
      serialNumber: 'BMG-120-41009',
      status: 'MAINTENANCE',
      dailyRate: 10_000,
      location: 'Oficina Central, Maputo',
      lastMaintenanceAt: daysFromNow(-90),
      nextMaintenanceDue: daysFromNow(5),
      usageHours: 900,
      hoursAtLastService: 700,
      serviceIntervalHours: 300,
    },
    {
      code: 'EQP-007',
      name: 'Retroescavadora JCB 3CX',
      type: 'EXCAVATOR',
      brand: 'JCB',
      model: '3CX Eco',
      serialNumber: 'JCB-3CX-23023',
      dailyRate: 25_000,
      location: 'Estaleiro Beira',
      lastMaintenanceAt: daysFromNow(-70),
      nextMaintenanceDue: daysFromNow(20),
      requiresOperatorLicense: true,
      usageHours: 2_510, // 510 h since service — over its 500 h limit
      hoursAtLastService: 2_000,
      serviceIntervalHours: 500,
    },
    {
      code: 'EQP-008',
      name: 'Gerador Cummins C150',
      type: 'GENERATOR',
      brand: 'Cummins',
      model: 'C150 D5',
      serialNumber: 'CMN-C150-66001',
      status: 'RENTED',
      dailyRate: 5_000,
      location: 'Obra — Nova Obra, Matola',
      lastMaintenanceAt: daysFromNow(-40),
      nextMaintenanceDue: daysFromNow(50),
      usageHours: 1_200,
      hoursAtLastService: 1_100,
      serviceIntervalHours: 500,
    },
    {
      code: 'EQP-009',
      name: 'Placa Vibratória Wacker DPU 6555',
      type: 'COMPACTOR',
      brand: 'Wacker Neuson',
      model: 'DPU 6555',
      serialNumber: 'WCK-6555-90210',
      status: 'RENTED',
      dailyRate: 3_000,
      location: 'Obra — Obras Rápidas, Maputo',
      lastMaintenanceAt: daysFromNow(-60),
      nextMaintenanceDue: daysFromNow(30),
      usageHours: 700,
      hoursAtLastService: 600,
      serviceIntervalHours: 250,
    },
    {
      code: 'EQP-010',
      name: 'Betoneira Imer Syntesi 350',
      type: 'OTHER',
      brand: 'Imer',
      model: 'Syntesi 350',
      serialNumber: 'IMR-350-11223',
      // Data inconsistency on purpose: marked RENTED but no rental exists. The Risk Agent flags it.
      status: 'RENTED',
      dailyRate: 2_500,
      location: 'Estaleiro Maputo',
      lastMaintenanceAt: daysFromNow(-25),
      nextMaintenanceDue: daysFromNow(65),
      usageHours: 300,
      hoursAtLastService: 250,
      serviceIntervalHours: 250,
    },
  ];

  const ids: IdMap = {};
  for (const data of definitions) {
    const equipment = await prisma.equipment.create({ data });
    ids[equipment.code] = equipment.id;
  }
  return ids;
}

async function createMaintenanceHistory(prisma: PrismaClient, eq: IdMap): Promise<void> {
  const service = (code: string, daysAgo: number, nextInDays: number): Prisma.EquipmentMaintenanceCreateManyInput => ({
    equipmentId: eq[code]!,
    type: 'SCHEDULED_SERVICE',
    status: 'RESOLVED',
    description: 'Scheduled service: oil, filters, hydraulic check, safety systems.',
    performedBy: 'Oficina Central',
    performedAt: daysFromNow(-daysAgo),
    nextDueAt: daysFromNow(nextInDays),
    reportedAt: daysFromNow(-daysAgo),
    resolvedAt: daysFromNow(-daysAgo),
  });

  const inspection = (code: string, daysAgo: number): Prisma.EquipmentMaintenanceCreateManyInput => ({
    equipmentId: eq[code]!,
    type: 'INSPECTION',
    status: 'RESOLVED',
    severity: 'LOW',
    description: 'Periodic safety inspection — no defects found.',
    performedBy: 'Inspetor Certificado',
    performedAt: daysFromNow(-daysAgo),
    reportedAt: daysFromNow(-daysAgo),
    resolvedAt: daysFromNow(-daysAgo),
  });

  const resolvedIssue = (code: string, daysAgo: number, description: string): Prisma.EquipmentMaintenanceCreateManyInput => ({
    equipmentId: eq[code]!,
    type: 'ISSUE_REPORT',
    status: 'RESOLVED',
    severity: 'MEDIUM',
    description,
    performedBy: 'Oficina Central',
    reportedAt: daysFromNow(-daysAgo),
    performedAt: daysFromNow(-daysAgo + 1),
    resolvedAt: daysFromNow(-daysAgo + 1),
  });

  await prisma.equipmentMaintenance.createMany({
    data: [
      service('EQP-001', 210, -120),
      service('EQP-001', 30, 60),
      inspection('EQP-001', 30),

      service('EQP-002', 200, -21),
      inspection('EQP-002', 200),

      service('EQP-003', 45, 45),

      service('EQP-004', 20, 100),
      inspection('EQP-004', 20),

      service('EQP-005', 15, 75),
      // Recurring hydraulic problem, worded differently each time — spotting the pattern is an AI task.
      resolvedIssue('EQP-005', 120, 'Fuga de óleo no cilindro hidráulico do braço esquerdo. Vedante substituído.'),
      resolvedIssue('EQP-005', 60, 'Perda de pressão hidráulica ao elevar carga. Mangueira de alta pressão reapertada.'),
      {
        equipmentId: eq['EQP-005']!,
        type: 'ISSUE_REPORT',
        status: 'OPEN',
        severity: null, // unclassified on purpose — the Maintenance Agent classifies it
        description: 'Operador reporta ruído anormal no sistema hidráulico ao elevar carga e ligeira perda de força nos braços.',
        reportedAt: daysFromNow(-2),
      },

      service('EQP-006', 90, 5),
      {
        equipmentId: eq['EQP-006']!,
        type: 'REPAIR',
        status: 'IN_PROGRESS',
        severity: 'HIGH',
        description: 'Substituição do rolamento do tambor vibratório.',
        performedBy: 'Oficina Central',
        reportedAt: daysFromNow(-6),
      },

      service('EQP-007', 70, 20),
      service('EQP-008', 40, 50),
      service('EQP-009', 60, 30),
      service('EQP-010', 25, 65),
    ],
  });
}

async function createRentalHistory(prisma: PrismaClient, cus: IdMap, eq: IdMap): Promise<void> {
  const rates = Object.fromEntries(
    (await prisma.equipment.findMany({ select: { code: true, dailyRate: true } })).map((e) => [e.code, Number(e.dailyRate)]),
  );
  let rentalSeq = 0;
  let paymentSeq = 0;

  async function rental(input: {
    customer: string;
    equipment: string;
    startInDays: number;
    days: number;
    status: 'COMPLETED' | 'ACTIVE';
    lateDays?: number;
    damageNotes?: string;
    hoursUsed?: number;
    paymentMethod?: 'MPESA' | 'EMOLA' | 'BANK_TRANSFER' | 'CARD' | 'CASH';
    /** Payment state; defaults to PAID for completed rentals and PENDING (due at the end) for active ones. */
    payment?: { status: 'PAID' | 'PENDING' | 'OVERDUE'; dueInDays: number; amount?: number };
  }) {
    const startDate = daysFromNow(input.startInDays);
    const endDate = daysFromNow(input.startInDays + input.days - 1);
    const dailyRate = rates[input.equipment]!;
    const totalAmount = dailyRate * rentalDays(startDate, endDate);
    rentalSeq += 1;

    const created = await prisma.rental.create({
      data: {
        code: `RNT-${startDate.getFullYear()}-${String(rentalSeq).padStart(4, '0')}`,
        customerId: cus[input.customer]!,
        equipmentId: eq[input.equipment]!,
        startDate,
        endDate,
        dailyRate,
        totalAmount,
        status: input.status,
        workflowStep: 'DONE',
        decisionReason: 'Historical rental (imported before agent automation).',
        decidedAt: startDate,
        createdAt: daysFromNow(input.startInDays - 3), // requested a few days before the start
        actualReturnAt:
          input.status === 'COMPLETED' ? daysFromNow(input.startInDays + input.days - 1 + (input.lateDays ?? 0)) : null,
        lateDays: input.lateDays ?? 0,
        damageReported: Boolean(input.damageNotes),
        damageNotes: input.damageNotes ?? null,
        hoursUsed: input.status === 'COMPLETED' ? (input.hoursUsed ?? input.days * 8) : null,
        paymentMethod: input.paymentMethod ?? 'BANK_TRANSFER',
      },
    });

    const payment = input.payment ?? {
      status: input.status === 'COMPLETED' ? ('PAID' as const) : ('PENDING' as const),
      dueInDays: input.startInDays + input.days - 1,
    };
    paymentSeq += 1;
    await prisma.payment.create({
      data: {
        reference: `PAY-${startDate.getFullYear()}-${String(paymentSeq).padStart(4, '0')}`,
        rentalId: created.id,
        customerId: created.customerId,
        amount: payment.amount ?? totalAmount,
        dueDate: daysFromNow(payment.dueInDays),
        status: payment.status,
        paidAt: payment.status === 'PAID' ? daysFromNow(payment.dueInDays) : null,
        method: input.paymentMethod ?? 'BANK_TRANSFER',
      },
    });
  }

  // CUS-001: long, clean history, everything paid → low risk
  const cus001Equipment = ['EQP-001', 'EQP-003', 'EQP-005', 'EQP-006'];
  for (let i = 0; i < 12; i++) {
    await rental({
      customer: 'CUS-001',
      equipment: cus001Equipment[i % cus001Equipment.length]!,
      startInDays: -700 + i * 55,
      days: 7 + (i % 3) * 3,
      status: 'COMPLETED',
    });
  }

  // CUS-002: 3 late returns in the last 5 rentals, one damage — and a machine not yet returned
  await rental({ customer: 'CUS-002', equipment: 'EQP-003', startInDays: -330, days: 10, status: 'COMPLETED' });
  await rental({ customer: 'CUS-002', equipment: 'EQP-005', startInDays: -250, days: 7, status: 'COMPLETED', lateDays: 5 });
  await rental({
    customer: 'CUS-002',
    equipment: 'EQP-001',
    startInDays: -170,
    days: 14,
    status: 'COMPLETED',
    damageNotes: 'Deep scratches on the cabin and a broken side mirror.',
  });
  await rental({ customer: 'CUS-002', equipment: 'EQP-003', startInDays: -90, days: 10, status: 'COMPLETED', lateDays: 9 });
  await rental({ customer: 'CUS-002', equipment: 'EQP-005', startInDays: -40, days: 7, status: 'COMPLETED', lateDays: 3 });
  // Ended 2 days ago, still out, payment was due at the end → overdue return + payment going overdue
  await rental({
    customer: 'CUS-002',
    equipment: 'EQP-009',
    startInDays: -12,
    days: 11,
    status: 'ACTIVE',
    payment: { status: 'PENDING', dueInDays: -2 },
  });

  // CUS-003: good returns, but one past meter reading is impossible (28 h/day) and a large invoice is overdue
  await rental({ customer: 'CUS-003', equipment: 'EQP-001', startInDays: -400, days: 21, status: 'COMPLETED', hoursUsed: 600 });
  await rental({
    customer: 'CUS-003',
    equipment: 'EQP-004',
    startInDays: -180,
    days: 30,
    status: 'COMPLETED',
    payment: { status: 'OVERDUE', dueInDays: -150 },
  });
  await rental({ customer: 'CUS-003', equipment: 'EQP-004', startInDays: -5, days: 26, status: 'ACTIVE' });

  // CUS-004: blocked customer with a damaged, late return in the past
  await rental({
    customer: 'CUS-004',
    equipment: 'EQP-002',
    startInDays: -420,
    days: 10,
    status: 'COMPLETED',
    lateDays: 12,
    damageNotes: 'Blade hydraulic cylinder damaged due to misuse.',
  });

  // CUS-005: generator ending tomorrow with 25 000 MZN still to pay (5 days × 5 000)
  await rental({ customer: 'CUS-005', equipment: 'EQP-008', startInDays: -3, days: 5, status: 'ACTIVE', paymentMethod: 'MPESA' });
}
