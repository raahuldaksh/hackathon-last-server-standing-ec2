import { purchaseOrder } from '../services/orderService.js';
import { validationError } from '../utils/errors.js';

export default async function orderRoutes(fastify) {
  // POST /orders - Buy one unit
  fastify.post('/orders', async (request, reply) => {
    const body = request.body;

    if (!body || typeof body !== 'object') {
      throw validationError('Request body must be a JSON object');
    }

    const { userId, productId } = body;

    // Validate userId
    if (
      typeof userId !== 'string' ||
      userId.trim().length === 0 ||
      userId.length > 64
    ) {
      throw validationError('userId must be a non-empty string up to 64 characters');
    }

    // Validate productId
    if (
      typeof productId !== 'string' ||
      productId.trim().length === 0 ||
      productId.length > 64
    ) {
      throw validationError('productId must be a non-empty string up to 64 characters');
    }

    const order = await purchaseOrder(userId, productId);
    return reply.status(201).send(order);
  });
}
