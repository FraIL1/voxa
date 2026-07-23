/*
  Warnings:

  - You are about to drop the column `timed_out_until` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "guild_members" ADD COLUMN     "timed_out_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "timed_out_until";
