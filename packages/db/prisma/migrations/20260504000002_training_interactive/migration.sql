-- Training interactive module tables

CREATE TABLE "training_user_progress" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "sectionsRead"   TEXT[] NOT NULL DEFAULT '{}',
  "exercisesDone"  TEXT[] NOT NULL DEFAULT '{}',
  "rolePlayCount"  INTEGER NOT NULL DEFAULT 0,
  "currentStreak"  INTEGER NOT NULL DEFAULT 0,
  "lastActivityAt" TIMESTAMP(3),
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_user_progress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_user_progress_userId_key" UNIQUE ("userId"),
  CONSTRAINT "training_user_progress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_user_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "role_play_sessions" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "scenario"   TEXT NOT NULL,
  "difficulty" TEXT NOT NULL,
  "objection"  TEXT,
  "transcript" JSONB NOT NULL,
  "debrief"    TEXT,
  "rating"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_play_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_play_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_play_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "role_play_sessions_tenantId_userId_idx" ON "role_play_sessions"("tenantId", "userId");

CREATE TABLE "training_exercise_answers" (
  "id"         TEXT NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "answer"     TEXT NOT NULL,
  "aiFeedback" TEXT,
  "status"     TEXT NOT NULL DEFAULT 'in_progress',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_exercise_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_exercise_answers_userId_exerciseId_key" UNIQUE ("userId", "exerciseId"),
  CONSTRAINT "training_exercise_answers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_exercise_answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "training_exercise_answers_tenantId_userId_idx" ON "training_exercise_answers"("tenantId", "userId");
