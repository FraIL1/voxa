-- Карточка профиля: рассказ о себе и акцентный цвет
ALTER TABLE "users" ADD COLUMN "bio" TEXT;
ALTER TABLE "users" ADD COLUMN "accent_color" TEXT;
