-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "whiteLabelSettings" JSONB;

-- CreateTable
CREATE TABLE "white_label_domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "white_label_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "white_label_domains_domain_key" ON "white_label_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "white_label_domains_orgId_key" ON "white_label_domains"("orgId");

-- CreateIndex
CREATE INDEX "white_label_domains_domain_idx" ON "white_label_domains"("domain");

-- AddForeignKey
ALTER TABLE "white_label_domains" ADD CONSTRAINT "white_label_domains_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
