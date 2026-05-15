-- Tag manager: relational tags with per-tag color.
-- Backfills existing Contact.tags (String[]) into the new normalized tables.
-- The legacy `contacts.tags` column is intentionally kept by this migration so
-- in-flight readers don't break; a follow-up migration drops it after soak.

-- 1. Tags table
CREATE TABLE "tags" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "color"     TEXT NOT NULL DEFAULT '#7c5cfc',
    "orgId"     TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tags_orgId_name_key" ON "tags"("orgId", "name");
CREATE INDEX "tags_orgId_idx" ON "tags"("orgId");

ALTER TABLE "tags"
    ADD CONSTRAINT "tags_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Contact ↔ Tag junction
CREATE TABLE "contact_tags" (
    "contactId" TEXT NOT NULL,
    "tagId"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contactId", "tagId")
);

CREATE INDEX "contact_tags_tagId_idx" ON "contact_tags"("tagId");

ALTER TABLE "contact_tags"
    ADD CONSTRAINT "contact_tags_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "contacts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_tags"
    ADD CONSTRAINT "contact_tags_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "tags"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Deal ↔ Tag junction
CREATE TABLE "deal_tags" (
    "dealId"    TEXT NOT NULL,
    "tagId"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deal_tags_pkey" PRIMARY KEY ("dealId", "tagId")
);

CREATE INDEX "deal_tags_tagId_idx" ON "deal_tags"("tagId");

ALTER TABLE "deal_tags"
    ADD CONSTRAINT "deal_tags_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "deals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_tags"
    ADD CONSTRAINT "deal_tags_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "tags"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Backfill: extract distinct tags per org from contacts.tags and create
--    corresponding rows + links. Idempotent thanks to ON CONFLICT clauses.
INSERT INTO "tags" ("id", "name", "color", "orgId", "createdBy", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text)::uuid::text AS id,
    trim(t.name) AS name,
    '#7c5cfc'   AS color,
    c."orgId"   AS "orgId",
    NULL        AS "createdBy",
    NOW()       AS "createdAt",
    NOW()       AS "updatedAt"
FROM "contacts" c
CROSS JOIN LATERAL unnest(c."tags") AS t(name)
WHERE trim(t.name) <> ''
GROUP BY c."orgId", trim(t.name)
ON CONFLICT ("orgId", "name") DO NOTHING;

INSERT INTO "contact_tags" ("contactId", "tagId", "createdAt")
SELECT
    c.id           AS "contactId",
    tg.id          AS "tagId",
    c."createdAt"  AS "createdAt"
FROM "contacts" c
CROSS JOIN LATERAL unnest(c."tags") AS t(name)
JOIN "tags" tg
  ON tg."orgId" = c."orgId"
 AND tg.name   = trim(t.name)
ON CONFLICT ("contactId", "tagId") DO NOTHING;
