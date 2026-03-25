#!/bin/sh
set -e
# Run pending migrations
npx prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma
# Start server
node -r tsconfig-paths/register dist/src/index.js
