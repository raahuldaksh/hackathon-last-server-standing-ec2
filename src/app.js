import Fastify from 'fastify';
import { AppError } from './utils/errors.js';
import healthRoutes from './routes/health.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import userRoutes from './routes/users.js';

export function buildApp(opts = {}) {
  const app = Fastify({
    logger: false, // Zero console logging overhead for maximum RPS
    keepAliveTimeout: 65000,
    ...opts,
  });

  // Centralized Error Handler matching official spec
  app.setErrorHandler((error, request, reply) => {
    // 1. Custom domain AppError (e.g., PRODUCT_NOT_FOUND, SOLD_OUT, ALREADY_PURCHASED, etc.)
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.errorCode });
    }

    // 2. Fastify validation or JSON body parsing error
    if (
      error.validation ||
      error.statusCode === 400 ||
      error.name === 'SyntaxError'
    ) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR' });
    }

    // 3. Fallback for unhandled errors
    return reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });

  // Handle 404 for unknown routes
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({ error: 'NOT_FOUND' });
  });

  // Register all official endpoint routes
  app.register(healthRoutes);
  app.register(productRoutes);
  app.register(orderRoutes);
  app.register(userRoutes);

  return app;
}
