-- Мультисервер: guilds + членство; существующее сообщество мигрирует
-- в легаси-сервер «Voxa» (все пользователи становятся его участниками).

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_url" TEXT,
    "owner_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_members" (
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_members_pkey" PRIMARY KEY ("guild_id","user_id")
);

-- Легаси-сервер: владелец — обладатель роли is_owner_role (если есть)
INSERT INTO "guilds" ("id", "name", "owner_id", "created_at", "updated_at")
SELECT
    '01980000-0000-7000-8000-000000000001',
    'Voxa',
    (SELECT ur."user_id" FROM "user_roles" ur
       JOIN "roles" r ON r."id" = ur."role_id"
      WHERE r."is_owner_role" = true
      ORDER BY ur."user_id" LIMIT 1),
    COALESCE((SELECT MIN("created_at") FROM "users"), CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP;

-- Все существующие пользователи — участники легаси-сервера
INSERT INTO "guild_members" ("guild_id", "user_id", "joined_at")
SELECT '01980000-0000-7000-8000-000000000001', "id", "created_at" FROM "users";

-- AlterTable + backfill: категории/каналы/роли/инвайты/баны принадлежат легаси-серверу
ALTER TABLE "categories" ADD COLUMN "guild_id" TEXT;
UPDATE "categories" SET "guild_id" = '01980000-0000-7000-8000-000000000001';
ALTER TABLE "categories" ALTER COLUMN "guild_id" SET NOT NULL;

ALTER TABLE "channels" ADD COLUMN "guild_id" TEXT;
UPDATE "channels" SET "guild_id" = '01980000-0000-7000-8000-000000000001';
ALTER TABLE "channels" ALTER COLUMN "guild_id" SET NOT NULL;

ALTER TABLE "roles" ADD COLUMN "guild_id" TEXT;
UPDATE "roles" SET "guild_id" = '01980000-0000-7000-8000-000000000001';
ALTER TABLE "roles" ALTER COLUMN "guild_id" SET NOT NULL;

ALTER TABLE "invites" ADD COLUMN "guild_id" TEXT;
UPDATE "invites" SET "guild_id" = '01980000-0000-7000-8000-000000000001';
ALTER TABLE "invites" ALTER COLUMN "guild_id" SET NOT NULL;

ALTER TABLE "bans" DROP CONSTRAINT "bans_pkey";
ALTER TABLE "bans" ADD COLUMN "guild_id" TEXT;
UPDATE "bans" SET "guild_id" = '01980000-0000-7000-8000-000000000001';
ALTER TABLE "bans" ALTER COLUMN "guild_id" SET NOT NULL;
ALTER TABLE "bans" ADD CONSTRAINT "bans_pkey" PRIMARY KEY ("guild_id", "user_id");

-- Аудит: существующие записи относились к сообществу
ALTER TABLE "audit_log" ADD COLUMN "guild_id" TEXT;
UPDATE "audit_log" SET "guild_id" = '01980000-0000-7000-8000-000000000001';

-- DropIndex: имена ролей уникальны в пределах сервера, а не глобально
DROP INDEX "roles_name_key";

-- CreateIndex
CREATE INDEX "guild_members_user_id_idx" ON "guild_members"("user_id");
CREATE INDEX "categories_guild_id_idx" ON "categories"("guild_id");
CREATE INDEX "channels_guild_id_idx" ON "channels"("guild_id");
CREATE UNIQUE INDEX "roles_guild_id_name_key" ON "roles"("guild_id", "name");

-- AddForeignKey
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bans" ADD CONSTRAINT "bans_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invites" ADD CONSTRAINT "invites_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channels" ADD CONSTRAINT "channels_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
