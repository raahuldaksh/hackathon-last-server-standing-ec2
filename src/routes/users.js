import { getUserOrders } from '../services/orderService.js';
import { validationError } from '../utils/errors.js';

export default async function userRoutes(fastify) {
  // GET /users/:userId/orders - One user's order history
  fastify.get('/users/:userId/orders', async (request, reply) => {
    const { userId } = request.params;

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw validationError('userId must be a non-empty string');
    }

    const result = getUserOrders(userId);
    return reply.status(200).send(result);
  });
}
