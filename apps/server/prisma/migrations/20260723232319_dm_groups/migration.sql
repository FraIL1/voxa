-- Групповые ЛС: диалог = набор участников. Существующие 1-на-1 сохраняются:
-- их пара переносится в участников, а pairKey оставляет одну строку на пару.

-- CreateTable
CREATE TABLE "dm_participants" (
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

CREATE INDEX "dm_participants_user_id_idx" ON "dm_participants"("user_id");

-- AlterTable: новые поля диалога
ALTER TABLE "dm_conversations"
    ADD COLUMN "is_group" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "name" TEXT,
    ADD COLUMN "icon_url" TEXT,
    ADD COLUMN "owner_id" TEXT,
    ADD COLUMN "pair_key" TEXT;

-- Бэкфилл участников из существующих пар
INSERT INTO "dm_participants" ("conversation_id", "user_id")
SELECT "id", "user_a_id" FROM "dm_conversations"
UNION
SELECT "id", "user_b_id" FROM "dm_conversations";

-- Бэкфилл pairKey (канонический порядок: меньший id первым)
UPDATE "dm_conversations"
SET "pair_key" = LEAST("user_a_id", "user_b_id") || ':' || GREATEST("user_a_id", "user_b_id");

-- FK и уникальность
ALTER TABLE "dm_participants" ADD CONSTRAINT "dm_participants_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "dm_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dm_participants" ADD CONSTRAINT "dm_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "dm_conversations_pair_key_key" ON "dm_conversations"("pair_key");

ALTER TABLE "dm_conversations" ADD CONSTRAINT "dm_conversations_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Убираем старую парную схему
ALTER TABLE "dm_conversations" DROP CONSTRAINT "dm_conversations_user_a_id_fkey";
ALTER TABLE "dm_conversations" DROP CONSTRAINT "dm_conversations_user_b_id_fkey";
DROP INDEX "dm_conversations_user_a_id_user_b_id_key";
DROP INDEX IF EXISTS "dm_conversations_user_a_id_idx";
DROP INDEX IF EXISTS "dm_conversations_user_b_id_idx";
ALTER TABLE "dm_conversations" DROP COLUMN "user_a_id", DROP COLUMN "user_b_id";
