import { PrismaClient, UserRole, ServiceType, TenantPlan } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-pool-co' },
    update: {},
    create: {
      name: 'Demo Pool Co',
      slug: 'demo-pool-co',
      serviceTypes: [ServiceType.pool],
      plan: TenantPlan.professional,
      status: 'active',
      timezone: 'America/Phoenix',
    },
  });

  console.log(`✅ Tenant: ${tenant.name}`);

  // Create owner user
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'owner@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'owner@demo.com',
      passwordHash,
      firstName: 'Alex',
      lastName: 'Owner',
      role: UserRole.owner,
      status: 'active',
    },
  });

  console.log(`✅ Owner: ${owner.email}`);

  // Create technician
  const tech = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'tech@demo.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'tech@demo.com',
      passwordHash,
      firstName: 'Sam',
      lastName: 'Tech',
      role: UserRole.technician,
      status: 'active',
      skills: ['pool_cleaning', 'pool_repair'],
      isAvailable: true,
    },
  });

  console.log(`✅ Technician: ${tech.email}`);

  // Create demo customer
  const customer = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      phone: '+16025551234',
      status: 'active',
      serviceAddresses: {
        create: {
          label: 'Home',
          street: '123 Main St',
          city: 'Scottsdale',
          state: 'AZ',
          zip: '85251',
          lat: 33.4942,
          lng: -111.9261,
          isPrimary: true,
        },
      },
    },
  });

  console.log(`✅ Customer: ${customer.firstName} ${customer.lastName}`);

  console.log('✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
