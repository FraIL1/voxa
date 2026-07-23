-- AlterTable
ALTER TABLE "dm_messages" ADD COLUMN     "pinned_at" TIMESTAMP(3),
ADD COLUMN     "pinned_by_id" TEXT;

-- AlterTable
ALTER TABLE "dm_read_states" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "dm_reactions" (
    "id" TEXT NOT NULL,
    "dm_message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dm_reactions_dm_message_id_idx" ON "dm_reactions"("dm_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "dm_reactions_dm_message_id_user_id_emoji_key" ON "dm_reactions"("dm_message_id", "user_id", "emoji");

-- AddForeignKey
ALTER TABLE "dm_reactions" ADD CONSTRAINT "dm_reactions_dm_message_id_fkey" FOREIGN KEY ("dm_message_id") REFERENCES "dm_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_reactions" ADD CONSTRAINT "dm_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
