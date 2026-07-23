-- CreateTable
CREATE TABLE "registration_invites" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_by_id" TEXT,
    "max_uses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_invites_code_key" ON "registration_invites"("code");

-- AddForeignKey
ALTER TABLE "registration_invites" ADD CONSTRAINT "registration_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
