'use strict';
// Fixes a failed _prisma_migrations record so migrate deploy can proceed.
// Run with: node scripts/fix-migration.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "_prisma_migrations"
     SET finished_at = NOW(), applied_steps_count = 1, logs = NULL
     WHERE migration_name = '20260504000001_training_target_users'
       AND finished_at IS NULL`
  );
  console.log(`fix-migration: updated ${result} row(s)`);
}

main()
  .catch(e => { console.error('fix-migration error:', e.message); })
  .finally(() => prisma.$disconnect());
