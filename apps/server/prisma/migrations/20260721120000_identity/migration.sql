-- Идентичность: отображаемое имя (свободно меняется) + ник на сервере.
-- username остаётся неизменяемым уникальным логином.
ALTER TABLE "users" ADD COLUMN "display_name" TEXT;
UPDATE "users" SET "display_name" = "username";
ALTER TABLE "users" ALTER COLUMN "display_name" SET NOT NULL;

ALTER TABLE "guild_members" ADD COLUMN "nickname" TEXT;
