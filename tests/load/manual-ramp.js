import autocannon from 'autocannon';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8080';
const mode = process.env.LOAD_MODE || 'read';
const productId =
  process.env.PRODUCT_ID || (mode === 'write' ? 'p_load_write_test' : 'p_load_100');
const duration = Number.parseInt(process.env.STEP_DURATION || '15', 10);
const maxErrorPercent = Number.parseFloat(process.env.MAX_ERROR_PERCENT || '1');
const stopP99Ms = Number.parseInt(process.env.STOP_P99_MS || '100', 10);
const steps = (process.env.RPS_STEPS || '1000,2000,3000,5000,10000,15000,20000,30000,50000')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10));

if (!Number.isInteger(duration) || duration < 3 || duration > 60) {
  throw new Error('STEP_DURATION must be an integer from 3 to 60 seconds.');
}

if (
  steps.length === 0 ||
  steps.some((rps) => !Number.isInteger(rps) || rps < 1 || rps > 100000)
) {
  throw new Error('RPS_STEPS must contain integers from 1 to 100000.');
}

const target = new URL(baseUrl);
if (!['http:', 'https:'].includes(target.protocol)) {
  throw new Error('BASE_URL must use HTTP or HTTPS.');
}
if (!['read', 'write', 'mixed'].includes(mode)) {
  throw new Error('LOAD_MODE must be "read", "write", or "mixed".');
}

const productPath = `/products/${encodeURIComponent(productId)}`;
const productUrl = new URL(productPath, target).toString();
const orderUrl = new URL('/orders', target).toString();

async function checkReady() {
  const response = await fetch(new URL('/health', target), {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}.`);
  }
}

async function ensureProduct() {
  // Check if product exists
  const checkRes = await fetch(new URL(productPath, target), {
    signal: AbortSignal.timeout(3000),
  });
  if (checkRes.ok) {
    return checkRes.json();
  }

  // Auto-seed product if missing
  console.log(`Auto-seeding test product "${productId}"...`);
  const createRes = await fetch(new URL('/products', target), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: productId,
      name: 'Benchmark Target Product',
      category: 'c_benchmark',
      price: 999,
      stock: 5000000, // 5 million stock for high RPS load testing
    }),
    signal: AbortSignal.timeout(3000),
  });

  if (!createRes.ok && createRes.status !== 409) {
    throw new Error(`Failed to create test product: HTTP ${createRes.status}`);
  }

  const res = await fetch(new URL(productPath, target), { signal: AbortSignal.timeout(3000) });
  return res.json();
}

async function monitorHealth() {
  let running = true;
  let checks = 0;
  let failures = 0;

  const monitor = (async () => {
    while (running) {
      try {
        await checkReady();
      } catch {
        failures++;
      }
      checks++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  })();

  return {
    stop: async () => {
      running = false;
      await monitor;
      return { checks, failures };
    },
  };
}

async function runRamp() {
  console.log(`\n======================================================`);
  console.log(`Last Server Standing - Progressive Capacity Benchmark`);
  console.log(`Target: ${baseUrl} | Mode: ${mode} | Product: ${productId}`);
  console.log(`======================================================\n`);

  await checkReady();
  const product = await ensureProduct();
  const totalStockNeeded = duration * steps.reduce((total, rps) => total + rps, 0);

  console.log(`Mode: ${mode}; Target endpoint: ${mode === 'read' ? productUrl : orderUrl}`);
  console.log(`Each step duration: ${duration}s; Steps: ${steps.join(', ')} req/s`);
  console.log(`Target product stock: ${product.stock} (needed: ${mode === 'write' ? totalStockNeeded : 0})\n`);

  let highestStableRps = 0;
  let highestSpecTargetRps = 0;

  for (const rps of steps) {
    // Sizing connections sensibly for high throughput
    const connections = Math.min(2000, Math.max(50, Math.ceil(rps / 20)));
    const health = await monitorHealth();

    const instance = autocannon({
      url: mode === 'read' ? productUrl : orderUrl,
      method: mode === 'read' ? 'GET' : 'POST',
      connections,
      overallRate: rps,
      duration,
      pipelining: 1,
      timeout: 5,
      ignoreCoordinatedOmission: true,
      ...(mode === 'write'
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ userId: 'u_load_[<id>]', productId }),
            idReplacement: true,
          }
        : {}),
    });

    const result = await instance;
    const healthResult = await health.stop();
    const successful = result['2xx'] || 0;
    const failedPercent = result.requests.total
      ? Math.min(
          100,
          ((result.non2xx + result.errors) / result.requests.total) * 100
        )
      : 100;
    const achievedRps = Math.round(result.requests.average);
    const rateMet = achievedRps >= rps * 0.85; // 85-90% target threshold
    const p99 = result.latency.p99;
    const p97 = result.latency.p97_5 ?? result.latency.p90;
    const specTargetMet =
      rateMet && failedPercent <= 1 && p99 <= 100 && healthResult.failures === 0;
    const stable =
      rateMet &&
      failedPercent <= maxErrorPercent &&
      p99 <= Math.min(stopP99Ms, 100) &&
      healthResult.failures === 0;

    console.log(
      `${rps.toString().padStart(5)} target req/s | ` +
      `${achievedRps.toString().padStart(5)} actual req/s | ` +
      `${connections} conns | ` +
      `p50: ${result.latency.p50 ?? 'n/a'}ms, ` +
      `p97.5: ${p97 ?? 'n/a'}ms, ` +
      `p99: ${p99 ?? 'n/a'}ms | ` +
      `Errors: ${failedPercent.toFixed(2)}% | ` +
      `2xx: ${successful} | ` +
      `Non-2xx: ${result.non2xx} | ` +
      `Timeouts: ${result.timeouts} | ` +
      `Health Misses: ${healthResult.failures}/${healthResult.checks}`
    );

    if (!stable) {
      console.log(
        `\n⚠️ Stopping ramp at ${rps} req/s: ` +
        `Achieved ${achievedRps} req/s (Target met: ${rateMet}), ` +
        `p99: ${p99}ms (Limit: ${stopP99Ms}ms), ` +
        `Error rate: ${failedPercent.toFixed(2)}% (Limit: ${maxErrorPercent}%), ` +
        `Health misses: ${healthResult.failures}`
      );
      break;
    }

    highestStableRps = rps;
    if (specTargetMet) {
      highestSpecTargetRps = rps;
    }
  }

  console.log('\n======================================================');
  console.log(`🏆 Benchmark Summary:`);
  console.log(`Highest Stable Tested Step: ${highestStableRps} req/s`);
  console.log(`Highest Step Meeting Competition Spec (p99 <= 100ms, err <= 1%): ${highestSpecTargetRps} req/s`);
  console.log(`======================================================\n`);
}

runRamp().catch((error) => {
  console.error(`Manual ramp test failed: ${error.message}`);
  process.exitCode = 1;
});
