export const encryptionKey = new sst.Secret("ProcellaEncryptionKey");
export const devAuthToken = new sst.Secret("ProcellaDevAuthToken");
export const descopeManagementKey = new sst.Secret("ProcellaDescopeManagementKey");
export const otelEndpoint = new sst.Secret("ProcellaOtelEndpoint");
export const otelHeaders = new sst.Secret("ProcellaOtelHeaders");
export const ticketSigningKey = new sst.Secret("ProcellaTicketSigningKey");

// sharedSecrets are linked into every Lambda (API + GC). descopeManagementKey
// is excluded because GC runs in dev auth mode and never calls Descope APIs.
// API-only secrets (ticketSigningKey, descopeManagementKey) are linked
// explicitly per-function in api.ts and web-api.ts.
// cronSecret is intentionally NOT declared — the AWS deploy uses a dedicated
// gc Lambda (gc-bootstrap.ts) that calls GCWorker.runOnce() directly, so the
// HTTP /cron/gc route in createApp() is never served from this infra. The route
// remains in the codebase for Vercel/Render deploys that drive cron over HTTP.
export const sharedSecrets = [encryptionKey, devAuthToken, otelEndpoint, otelHeaders];

// API-only secrets, linked explicitly in api.ts / web-api.ts. Aliased for
// readability where multiple API-scoped secrets are spread together.
export const apiOnlySecrets = [...sharedSecrets, descopeManagementKey];

/** @deprecated Use sharedSecrets (gc) or apiOnlySecrets (api/web-api) instead. */
export const allSecrets = apiOnlySecrets;
