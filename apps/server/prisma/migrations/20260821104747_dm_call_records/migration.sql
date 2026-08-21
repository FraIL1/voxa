-- CreateEnum
CREATE TYPE "DmMessageKind" AS ENUM ('TEXT', 'CALL');

-- AlterTable
ALTER TABLE "dm_messages" ADD COLUMN     "call_ended_at" TIMESTAMP(3),
ADD COLUMN     "call_started_at" TIMESTAMP(3),
ADD COLUMN     "kind" "DmMessageKind" NOT NULL DEFAULT 'TEXT';
