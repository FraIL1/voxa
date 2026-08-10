-- Аватары в S3 и режимы присутствия со своей строкой статуса
CREATE TYPE "PresenceMode" AS ENUM ('ONLINE', 'IDLE', 'DND', 'INVISIBLE');

ALTER TABLE "users" ADD COLUMN "avatar_key" TEXT;
ALTER TABLE "users" ADD COLUMN "presence_mode" "PresenceMode" NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "users" ADD COLUMN "status_text" TEXT;
