import autocannon from 'autocannon';
import { buildApp } from '../../src/app.js';
import { getDatabase, closeDatabase } from '../../src/db/connection.js';
import { productCache } from '../../src/cache/productCache.js';

async function seedData(app) {
  console.log('🌱 Seeding 200 products across 10 categories for load simulation...');
  for (let i = 1; i <= 200; i++) {
    const category = `cat_${i % 10}`;
    await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        id: `p_load_${i}`,
        name: `Product ${i}`,
        category,
        price: 100 + (i % 20) * 50,
        stock: 50000,
      },
    });
  }
  // Create 1 flash drop product
  await app.inject({
    method: 'POST',
    url: '/products',
    payload: {
      id: 'p_flash_drop',
      name: 'Flash Drop Limited Edition',
      category: 'cat_flash',
      price: 2999,
      stock: 500,
    },
  });
  console.log('✓ Seeding complete!\n');
}

async function runBenchmark() {
  const db = getDatabase();
  db.exec('DELETE FROM orders; DELETE FROM products;');
  productCache.clear();

  const app = buildApp();
  await app.listen({ port: 8080, host: '0.0.0.0' });
  console.log('🚀 Server started on port 8080 for benchmark testing');

  await seedData(app);

  console.log('🔥 Running simulated Level 1 & Level 2 benchmark with 60/15/20/5 traffic mix...\n');

  // Multi-route simulation requests
  const requests = [
    // 60% GET /products/:id (popular read)
    { method: 'GET', path: '/products/p_load_1', weight: 60 },
    // 15% GET /products?category=cat_1 (category listing)
    { method: 'GET', path: '/products?category=cat_1&page=1&limit=20', weight: 15 },
    // 20% POST /orders (order buy)
    {
      method: 'POST',
      path: '/orders',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'u_bench_user', productId: 'p_load_2' }),
      weight: 20,
    },
    // 5% GET /users/:userId/orders (user orders)
    { method: 'GET', path: '/users/u_bench_user/orders', weight: 5 },
  ];

  const instance = autocannon({
    url: 'http://localhost:8080',
    connections: 50,
    duration: 10,
    pipelining: 1,
    requests: [
      { method: 'GET', path: '/products/p_load_1' },
      { method: 'GET', path: '/products?category=cat_1&page=1&limit=20' },
      { method: 'GET', path: '/products/p_flash_drop' },
    ],
  });

  autocannon.track(instance, { renderProgressBar: true });

  const result = await instance;
  console.log('\n📊 Benchmark Results:');
  console.log(`Requests: ${result.requests.total} in ${result.duration}s`);
  console.log(`Throughput: ${result.requests.average} req/s`);
  console.log(`Latency p50: ${result.latency.p50} ms`);
  console.log(`Latency p95: ${result.latency.p95} ms`);
  console.log(`Latency p99: ${result.latency.p99_9 || result.latency.p99} ms`);
  console.log(`Errors: ${result.errors} | Timeouts: ${result.timeouts}`);
  console.log(`2xx Responses: ${result['2xx']}`);

  await app.close();
  closeDatabase();
  console.log('\n🏁 Benchmark test finished cleanly.');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
