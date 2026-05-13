-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'BRANCH_MANAGER';

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isHeadquarter" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_orgId_idx" ON "branches"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_orgId_code_key" ON "branches"("orgId", "code");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
