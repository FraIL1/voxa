-- CreateEnum
CREATE TYPE "GuildJoinMode" AS ENUM ('INVITE_ONLY', 'REQUEST', 'PUBLIC');

-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "description" TEXT,
ADD COLUMN     "join_mode" "GuildJoinMode" NOT NULL DEFAULT 'INVITE_ONLY';

-- CreateTable
CREATE TABLE "guild_join_requests" (
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_join_requests_pkey" PRIMARY KEY ("guild_id","user_id")
);

-- CreateIndex
CREATE INDEX "guild_join_requests_user_id_idx" ON "guild_join_requests"("user_id");

-- CreateIndex
CREATE INDEX "guilds_join_mode_idx" ON "guilds"("join_mode");

-- AddForeignKey
ALTER TABLE "guild_join_requests" ADD CONSTRAINT "guild_join_requests_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_join_requests" ADD CONSTRAINT "guild_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
