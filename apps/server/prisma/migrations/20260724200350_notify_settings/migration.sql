-- CreateEnum
CREATE TYPE "NotifyMode" AS ENUM ('ALL', 'MENTIONS', 'NONE');

-- AlterTable
ALTER TABLE "channel_read_states" ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "guild_members" ADD COLUMN     "notify_mode" "NotifyMode" NOT NULL DEFAULT 'ALL';
