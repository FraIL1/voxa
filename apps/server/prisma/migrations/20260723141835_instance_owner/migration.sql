-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_instance_owner" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "instance_bans" (
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "banned_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instance_bans_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "instance_bans" ADD CONSTRAINT "instance_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instance_bans" ADD CONSTRAINT "instance_bans_banned_by_id_fkey" FOREIGN KEY ("banned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
