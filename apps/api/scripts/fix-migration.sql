UPDATE "_prisma_migrations"
SET finished_at = NOW(), applied_steps_count = 1, logs = NULL
WHERE migration_name = '20260504000001_training_target_users'
  AND finished_at IS NULL;
