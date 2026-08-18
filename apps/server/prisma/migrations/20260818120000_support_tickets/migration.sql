-- Обращения в поддержку: человек описывает проблему, читает владелец приложения
CREATE TYPE "SupportKind" AS ENUM ('PROBLEM', 'BUG', 'IDEA');
CREATE TYPE "SupportStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE');

CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    -- Автор может удалить аккаунт; обращение остаётся, иначе теряется история багов
    "author_id" TEXT,
    "kind" "SupportKind" NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'NEW',
    "message" TEXT NOT NULL,
    "app_version" TEXT,
    "platform" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- Владелец разбирает новые сверху, поэтому индекс по состоянию и дате
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");

ALTER TABLE "support_tickets"
    ADD CONSTRAINT "support_tickets_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
