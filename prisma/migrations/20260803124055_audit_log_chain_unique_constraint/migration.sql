-- A tenant's audit chain is only linear if two entries can never claim the
-- same predecessor. Postgres treats each NULL as distinct in a unique index,
-- so this also caps a tenant at exactly one genesis entry (previousHash null).
CREATE UNIQUE INDEX "AuditLog_tenantId_previousHash_key" ON "AuditLog"("tenantId", "previousHash");
