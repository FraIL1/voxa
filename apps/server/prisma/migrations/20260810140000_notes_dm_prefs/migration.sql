-- Личные заметки и свои имена для других людей
CREATE TABLE "user_notes" (
    "owner_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "note" TEXT,
    "alias" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notes_pkey" PRIMARY KEY ("owner_id","target_id")
);

CREATE INDEX "user_notes_target_id_idx" ON "user_notes"("target_id");

ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_target_id_fkey"
    FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Личные настройки диалога: скрытие из списка и заглушение уведомлений
ALTER TABLE "dm_participants" ADD COLUMN "hidden_at" TIMESTAMP(3);
ALTER TABLE "dm_participants" ADD COLUMN "muted_until" TIMESTAMP(3);
