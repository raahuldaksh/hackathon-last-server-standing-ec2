import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { productCache } from '../src/cache/productCache.js';
import assert from 'node:assert/strict';

let app;
let db;

async function setup() {
  db = getDatabase();
  // Clear tables for test suite
  db.exec('DELETE FROM orders; DELETE FROM products;');
  productCache.clear();
  app = buildApp();
  await app.ready();
}

async function teardown() {
  await app.close();
  closeDatabase();
}

async function runTests() {
  console.log('🚀 Starting Functional Test Suite (~40 cases)...');
  await setup();

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ [Case ${total}] ${name}`);
    } catch (err) {
      console.error(`  ✗ [Case ${total}] FAILED: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // ----------------------------------------------------
  // 1. Ready Check (GET /health)
  // ----------------------------------------------------
  await test('GET /health returns 200 { status: "ok" }', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'ok' });
  });

  // ----------------------------------------------------
  // 2. Create Product (POST /products)
  // ----------------------------------------------------
  await test('POST /products creates valid product with 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        id: 'p_pixel10',
        name: 'Pixel 10 Pro 256GB',
        category: 'c_phones',
        price: 79999,
        stock: 120,
      },
    });
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.json(), {
      id: 'p_pixel10',
      name: 'Pixel 10 Pro 256GB',
      category: 'c_phones',
      price: 79999,
      stock: 120,
    });
  });

  await test('POST /products rejects duplicate ID with 409 PRODUCT_EXISTS', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        id: 'p_pixel10',
        name: 'Pixel Duplicate',
        category: 'c_phones',
        price: 99999,
        stock: 10,
      },
    });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), { error: 'PRODUCT_EXISTS' });
  });

  await test('POST /products 409 does NOT modify existing product', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/p_pixel10' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().name, 'Pixel 10 Pro 256GB');
    assert.equal(res.json().price, 79999);
    assert.equal(res.json().stock, 120);
  });

  await test('POST /products rejects missing id with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { name: 'No ID', category: 'c_phones', price: 100, stock: 10 },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('POST /products rejects empty id with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: '   ', name: 'Empty ID', category: 'c_phones', price: 100, stock: 10 },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('POST /products rejects missing name with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_noname', category: 'c_phones', price: 100, stock: 10 },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('POST /products rejects negative price with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_negprice', name: 'Neg Price', category: 'c_phones', price: -50, stock: 10 },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('POST /products rejects floating point price with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_floatprice', name: 'Float Price', category: 'c_phones', price: 19.99, stock: 10 },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('POST /products rejects negative stock with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_negstock', name: 'Neg Stock', category: 'c_phones', price: 100, stock: -1 },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('POST /products rejects floating point stock with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_floatstock', name: 'Float Stock', category: 'c_phones', price: 100, stock: 2.5 },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  // ----------------------------------------------------
  // 3. Read Product (GET /products/:id)
  // ----------------------------------------------------
  await test('GET /products/:id returns 200 with stored product', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/p_pixel10' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      id: 'p_pixel10',
      name: 'Pixel 10 Pro 256GB',
      category: 'c_phones',
      price: 79999,
      stock: 120,
    });
  });

  await test('GET /products/:id returns 404 PRODUCT_NOT_FOUND for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/p_unknown999' });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: 'PRODUCT_NOT_FOUND' });
  });

  // ----------------------------------------------------
  // 4. Category Listing (GET /products?category=...)
  // ----------------------------------------------------
  await test('GET /products without category returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?page=1' });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('GET /products with empty category returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?category=' });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('GET /products with invalid page returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?category=c_phones&page=0' });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('GET /products with invalid limit (> 50) returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?category=c_phones&limit=80' });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('GET /products with empty category returns 200 with total 0', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?category=c_empty' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { items: [], page: 1, limit: 20, total: 0 });
  });

  await test('GET /products sorting by price ASC and ID tie-break ASC', async () => {
    // Seed 4 items in same category with equal prices to test tie-breaker
    await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_b', name: 'Item B', category: 'c_tie', price: 500, stock: 10 },
    });
    await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_a', name: 'Item A', category: 'c_tie', price: 500, stock: 10 },
    });
    await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_cheap', name: 'Item Cheap', category: 'c_tie', price: 100, stock: 10 },
    });
    await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_expensive', name: 'Item Exp', category: 'c_tie', price: 1000, stock: 10 },
    });

    const res = await app.inject({ method: 'GET', url: '/products?category=c_tie&limit=10' });
    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.total, 4);
    assert.equal(data.items.length, 4);
    assert.equal(data.items[0].id, 'p_cheap'); // 100
    assert.equal(data.items[1].id, 'p_a');     // 500, id 'p_a' < 'p_b'
    assert.equal(data.items[2].id, 'p_b');     // 500
    assert.equal(data.items[3].id, 'p_expensive'); // 1000
  });

  await test('GET /products pagination page beyond total returns items [] and real total', async () => {
    const res = await app.inject({ method: 'GET', url: '/products?category=c_tie&page=5&limit=2' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { items: [], page: 5, limit: 2, total: 4 });
  });

  // ----------------------------------------------------
  // 5. Purchase Product (POST /orders)
  // ----------------------------------------------------
  await test('POST /orders purchases 1 unit with 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { userId: 'u_user1', productId: 'p_pixel10' },
    });
    assert.equal(res.statusCode, 201);
    const data = res.json();
    assert.ok(typeof data.orderId === 'string' && data.orderId.length > 0);
    assert.equal(data.userId, 'u_user1');
    assert.equal(data.productId, 'p_pixel10');

    // Verify stock decreased by 1
    const getRes = await app.inject({ method: 'GET', url: '/products/p_pixel10' });
    assert.equal(getRes.json().stock, 119);
  });

  await test('POST /orders duplicate purchase by same user returns 409 ALREADY_PURCHASED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { userId: 'u_user1', productId: 'p_pixel10' },
    });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), { error: 'ALREADY_PURCHASED' });

    // Stock must NOT have decreased
    const getRes = await app.inject({ method: 'GET', url: '/products/p_pixel10' });
    assert.equal(getRes.json().stock, 119);
  });

  await test('POST /orders missing productId returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { userId: 'u_user1' },
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'VALIDATION_ERROR' });
  });

  await test('POST /orders unknown productId returns 404 PRODUCT_NOT_FOUND', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { userId: 'u_user1', productId: 'p_nonexistent' },
    });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json(), { error: 'PRODUCT_NOT_FOUND' });
  });

  await test('POST /orders on product with stock 0 returns 409 SOLD_OUT', async () => {
    // Create product with stock 0
    await app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: 'p_soldout', name: 'Sold Out Product', category: 'c_test', price: 50, stock: 0 },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { userId: 'u_user2', productId: 'p_soldout' },
    });
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.json(), { error: 'SOLD_OUT' });
  });

  // ----------------------------------------------------
  // 6. User Order History (GET /users/:userId/orders)
  // ----------------------------------------------------
  await test('GET /users/:userId/orders returns list of user orders', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/u_user1/orders' });
    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.userId, 'u_user1');
    assert.equal(data.orders.length, 1);
    assert.equal(data.orders[0].productId, 'p_pixel10');
  });

  await test('GET /users/:userId/orders for user with no orders returns 200 with empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/u_empty/orders' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { userId: 'u_empty', orders: [] });
  });

  await teardown();

  console.log(`\n========================================`);
  console.log(`Functional Tests Completed: ${passed} / ${total} Passed`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test Runner Failed:', err);
  process.exit(1);
});
