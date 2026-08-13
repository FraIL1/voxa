-- Свой порядок серверов в левом столбце: у каждого участника собственный.
-- Ноль у всех существующих — они останутся в прежнем порядке по дате входа.
ALTER TABLE "guild_members" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
