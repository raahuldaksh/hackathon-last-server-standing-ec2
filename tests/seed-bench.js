const baseUrl = 'http://127.0.0.1:8080';

async function seed() {
  const products = [
    { id: 'p_bench_50k', name: 'Bench 50k Product', category: 'electronics', price: 1999, stock: 10000000 },
    { id: 'p_load_100', name: 'Ramp Product 100', category: 'electronics', price: 999, stock: 5000000 },
    { id: 'p_load_write_test', name: 'Write Test Product', category: 'flash_sale', price: 499, stock: 5000000 }
  ];

  for (const p of products) {
    const res = await fetch(`${baseUrl}/products`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(p)
    });
    const body = await res.text();
    console.log(`[Seed] ${p.id} -> HTTP ${res.status}: ${body}`);
  }
}

seed().catch(console.error);
