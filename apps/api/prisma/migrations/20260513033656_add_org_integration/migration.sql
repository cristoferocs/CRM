-- CreateTable
CREATE TABLE "org_integrations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_integrations_orgId_idx" ON "org_integrations"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "org_integrations_orgId_provider_key" ON "org_integrations"("orgId", "provider");

-- AddForeignKey
ALTER TABLE "org_integrations" ADD CONSTRAINT "org_integrations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
