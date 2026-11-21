import { buildApp } from '../src/app.js';
import { getDatabase, closeDatabase } from '../src/db/connection.js';
import { productCache } from '../src/cache/productCache.js';
import assert from 'node:assert/strict';

let app;
let db;

async function setup() {
  db = getDatabase();
  db.exec('DELETE FROM orders; DELETE FROM products;');
  productCache.clear();
  app = buildApp();
  await app.ready();
}

async function teardown() {
  await app.close();
  closeDatabase();
}

async function runConcurrencyTests() {
  console.log('⚡ Starting Concurrency & Invariant Verification Tests...\n');
  await setup();

  // -----------------------------------------------------------------
  // TEST A: THE LAST UNIT
  // 1 unit in stock, 50 distinct users pressing Buy at the exact same moment
  // -----------------------------------------------------------------
  console.log('--- TEST A: THE LAST UNIT (50 Concurrent Buyers, 1 Unit) ---');
  const createResA = await app.inject({
    method: 'POST',
    url: '/products',
    payload: {
      id: 'plast1',
      name: 'Last One Phone',
      category: 'ctest',
      price: 100,
      stock: 1,
    },
  });
  assert.equal(createResA.statusCode, 201);

  // Send 50 concurrent orders
  const promisesA = [];
  for (let i = 1; i <= 50; i++) {
    promisesA.push(
      app.inject({
        method: 'POST',
        url: '/orders',
        payload: { userId: `u_${i}`, productId: 'plast1' },
      })
    );
  }

  const resultsA = await Promise.all(promisesA);
  const statusCountsA = {};
  for (const res of resultsA) {
    statusCountsA[res.statusCode] = (statusCountsA[res.statusCode] || 0) + 1;
  }

  console.log('Status code distribution:', statusCountsA);
  assert.equal(statusCountsA[201], 1, 'Expected exactly one HTTP 201');
  assert.equal(statusCountsA[409], 49, 'Expected exactly 49 HTTP 409 responses');

  // Verify stock in database
  const finalProductA = db.prepare('SELECT stock FROM products WHERE id = ?').get('plast1');
  assert.equal(finalProductA.stock, 0, 'Final stock must be exactly 0');

  // Verify orders in database
  const totalOrdersA = db.prepare('SELECT COUNT(*) AS count FROM orders WHERE product_id = ?').get('plast1');
  assert.equal(totalOrdersA.count, 1, 'Exactly 1 order must be recorded in database');
  console.log('✓ TEST A PASSED: Exactly 1 winner, 49 rejected, stock = 0, no oversell!\n');

  // -----------------------------------------------------------------
  // TEST B: THE DOUBLE CLICK
  // 1000 units in stock, same user sends 20 simultaneous duplicate orders
  // -----------------------------------------------------------------
  console.log('--- TEST B: THE DOUBLE CLICK (20 Concurrent Duplicate Requests, Same User) ---');
  const createResB = await app.inject({
    method: 'POST',
    url: '/products',
    payload: {
      id: 'pclick1',
      name: 'Click Test Phone',
      category: 'ctest',
      price: 100,
      stock: 1000,
    },
  });
  assert.equal(createResB.statusCode, 201);

  const promisesB = [];
  for (let i = 1; i <= 20; i++) {
    promisesB.push(
      app.inject({
        method: 'POST',
        url: '/orders',
        payload: { userId: 'udouble1', productId: 'pclick1' },
      })
    );
  }

  const resultsB = await Promise.all(promisesB);
  const statusCountsB = {};
  for (const res of resultsB) {
    statusCountsB[res.statusCode] = (statusCountsB[res.statusCode] || 0) + 1;
  }

  console.log('Status code distribution:', statusCountsB);
  assert.equal(statusCountsB[201], 1, 'Expected exactly one HTTP 201');
  assert.equal(statusCountsB[409], 19, 'Expected exactly 19 HTTP 409 responses');

  // Verify stock in database
  const finalProductB = db.prepare('SELECT stock FROM products WHERE id = ?').get('pclick1');
  assert.equal(finalProductB.stock, 999, 'Final stock must be exactly 999');

  // Verify orders in database
  const totalOrdersB = db.prepare('SELECT COUNT(*) AS count FROM orders WHERE product_id = ? AND user_id = ?').get('pclick1', 'udouble1');
  assert.equal(totalOrdersB.count, 1, 'Exactly 1 order must be recorded for this user');

  // Verify user's order list
  const userOrdersRes = await app.inject({ method: 'GET', url: '/users/udouble1/orders' });
  assert.equal(userOrdersRes.statusCode, 200);
  assert.equal(userOrdersRes.json().orders.length, 1);
  assert.equal(userOrdersRes.json().orders[0].productId, 'pclick1');
  console.log('✓ TEST B PASSED: Exactly 1 order created, 19 duplicate clicks rejected, stock = 999!\n');

  // -----------------------------------------------------------------
  // TEST D: DATA RECONCILIATION AUDIT
  // -----------------------------------------------------------------
  console.log('--- TEST D: DATA RECONCILIATION AUDIT ---');
  const allProducts = db.prepare('SELECT id, stock FROM products').all();
  for (const p of allProducts) {
    const ordersCount = db.prepare('SELECT COUNT(*) AS count FROM orders WHERE product_id = ?').get(p.id).count;
    assert.ok(p.stock >= 0, `Invariant 3 violated: Negative stock for ${p.id}`);
    console.log(`Product ${p.id}: Remaining Stock = ${p.stock}, Total Orders = ${ordersCount}`);
  }

  console.log('\n========================================');
  console.log('ALL CONCURRENCY & RECONCILIATION INVARIANTS PASSED (100%)');
  console.log('========================================\n');

  await teardown();
}

runConcurrencyTests().catch((err) => {
  console.error('Concurrency Test Suite Failed:', err);
  process.exit(1);
});
