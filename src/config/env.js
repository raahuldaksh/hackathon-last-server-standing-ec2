import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'production',
  dbPath: process.env.DB_PATH || path.join(projectRoot, 'data', 'shop.db'),
  stockCacheTtlMs: 1900, // Safe buffer under the official 2000 ms rule
  maxConnections: 10000,
  keepAliveTimeout: 65000,
};
