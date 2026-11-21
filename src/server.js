import cluster from 'node:cluster';
import os from 'node:os';
import { buildApp } from './app.js';
import { getDatabase, closeDatabase } from './db/connection.js';
import { config } from './config/env.js';

const isClusterEnabled =
  process.env.CLUSTER_ENABLED !== 'false' &&
  process.env.NODE_ENV !== 'test' &&
  !process.env.NO_CLUSTER;

const numCPUs = Math.min(2, os.cpus().length || 2);

if (isClusterEnabled && cluster.isPrimary) {
  console.log(`[Last Server Standing] Master process ${process.pid} is running`);
  console.log(`[Last Server Standing] Forking ${numCPUs} workers matching machine vCPUs...`);

  // Initialize DB once in master to guarantee tables and WAL are initialized
  const db = getDatabase();
  db.prepare('SELECT 1').get();

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Last Server Standing] Worker ${worker.process.pid} died (${signal || code}). Auto-restarting...`);
    cluster.fork();
  });
} else {
  // Worker process (or single process mode if cluster disabled)
  async function startWorker() {
    // 1. Initialize and verify database connection
    try {
      const db = getDatabase();
      db.prepare('SELECT 1').get();
    } catch (err) {
      console.error(`Fatal [Worker ${process.pid}]: Database initialization failed:`, err);
      process.exit(1);
    }

    // 2. Build Fastify application
    const app = buildApp();

    // 3. Graceful shutdown handler
    const shutdown = async () => {
      try {
        await app.close();
        closeDatabase();
      } catch {
        // Force exit
      }
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // 4. Start listening on 0.0.0.0:8080
    try {
      await app.listen({
        port: config.port,
        host: config.host,
      });
      console.log(`[Worker ${process.pid}] Listening on ${config.host}:${config.port}`);
    } catch (err) {
      console.error(`Fatal [Worker ${process.pid}]: Failed to start HTTP server:`, err);
      closeDatabase();
      process.exit(1);
    }
  }

  startWorker();
}
