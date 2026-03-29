export const encryptionKey = new sst.Secret("ProcellaEncryptionKey");
export const devAuthToken = new sst.Secret("ProcellaDevAuthToken");
export const descopeManagementKey = new sst.Secret("ProcellaDescopeManagementKey");
export const otelEndpoint = new sst.Secret("ProcellaOtelEndpoint");
export const otelHeaders = new sst.Secret("ProcellaOtelHeaders");

export const allSecrets = [
	encryptionKey,
	devAuthToken,
	descopeManagementKey,
	otelEndpoint,
	otelHeaders,
];
