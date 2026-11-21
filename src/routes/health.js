export default async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });
}
