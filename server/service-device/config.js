process.loadEnvFile(new URL('./.env', import.meta.url));

export const GATEWAY_PORT = Number(process.env.GATEWAY_PORT);
export const SERVICE_ENDPOINTS = {
  user: process.env.USER_SERVICE_ENDPOINT,
  device: process.env.DEVICE_SERVICE_ENDPOINT,
};
export const USER_ROUTE_PREFIXES = ['/apiv1/user', '/apiv1/dashboard'];
export const DEVICE_ROUTE_PREFIX = '/apiv1/device';

export const USE_INTER_SERVICE_CALL_MOCK = true;