import { Environment } from './environment.model';

// Desarrollo local: el proxy de `proxy.conf.json` reenvía /api al BFF en localhost:5001.
export const environment: Environment = {
  dataAccessMode: 'backend',
  apiBaseUrl: '/api',
};
