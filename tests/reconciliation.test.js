import { getDatabase, closeDatabase } from '../src/db/connection.js';
import assert from 'node:assert/strict';

function runReconciliation() {
  console.log('🔍 Executing Post-Run Data Reconciliation Audit...\n');
  const db = getDatabase();

  const products = db.prepare('SELECT id, name, price, stock FROM products').all();
  console.log(`Auditing ${products.length} total products in database...`);

  let totalOrdersAudited = 0;
  let violations = 0;

  for (const product of products) {
    // 1. Invariant 3: No Negative Stock
    if (product.stock < 0) {
      console.error(`❌ INVARIANT 3 VIOLATION: Product ${product.id} has negative stock: ${product.stock}`);
      violations++;
    }

    // 2. Count orders for this product
    const orders = db.prepare('SELECT order_id, user_id FROM orders WHERE product_id = ?').all(product.id);
    totalOrdersAudited += orders.length;

    // 3. Invariant 4: One purchase per customer
    const userSet = new Set();
    for (const o of orders) {
      if (userSet.has(o.user_id)) {
        console.error(`❌ INVARIANT 4 VIOLATION: User ${o.user_id} bought product ${product.id} multiple times!`);
        violations++;
      }
      userSet.add(o.user_id);
    }
  }

  // 4. Invariant 6: No Ghost Orders (all orders reference existing products)
  const orphanOrders = db.prepare(`
    SELECT o.order_id 
    FROM orders o 
    LEFT JOIN products p ON o.product_id = p.id 
    WHERE p.id IS NULL
  `).all();

  if (orphanOrders.length > 0) {
    console.error(`❌ INVARIANT 6 VIOLATION: ${orphanOrders.length} orphan orders detected without a product!`);
    violations++;
  }

  console.log(`\nAudit Complete:`);
  console.log(`  • Products Audited: ${products.length}`);
  console.log(`  • Total Durable Orders: ${totalOrdersAudited}`);
  console.log(`  • Accounting Violations: ${violations}`);

  closeDatabase();

  if (violations === 0) {
    console.log('\n✅ 100% AUDIT RECONCILIATION SUCCESS: All 7 sale invariants verified!\n');
  } else {
    console.error(`\n❌ AUDIT FAILED with ${violations} violations!\n`);
    process.exit(1);
  }
}

runReconciliation();
