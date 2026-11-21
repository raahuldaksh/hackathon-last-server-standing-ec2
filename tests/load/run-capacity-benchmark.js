import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import autocannon from 'autocannon';

const port = 8080;
const baseUrl = `http://127.0.0.1:${port}`;
const testProductId = 'p_bench_50k';

async function waitForHealth(maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return true;
    } catch {
      // Wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server failed to become healthy on port ' + port);
}

async function seedTestProduct() {
  console.log('🌱 Seeding target benchmark product with 10M stock...');
  const res = await fetch(`${baseUrl}/products`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: testProductId,
      name: 'High Performance Flash Drop Product',
      category: 'c_bench',
      price: 1999,
      stock: 10000000,
    }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error('Failed to seed benchmark product: ' + res.status);
  }
  console.log('✓ Product ready for load testing!\n');
}

async function runLevel(targetRps, durationSec = 10) {
  const connections = Math.min(2500, Math.max(50, Math.ceil(targetRps / 20)));

  const result = await autocannon({
    url: `${baseUrl}/products/${testProductId}`,
    method: 'GET',
    connections,
    overallRate: targetRps,
    duration: durationSec,
    pipelining: 1,
    timeout: 5,
    ignoreCoordinatedOmission: true,
  });

  const achievedRps = Math.round(result.requests.average);
  const p99 = result.latency.p99;
  const p97 = result.latency.p97_5 ?? result.latency.p90;
  const p50 = result.latency.p50;
  const errorRate = result.requests.total
    ? Number((((result.non2xx + result.errors) / result.requests.total) * 100).toFixed(2))
    : 100;

  const passed = achievedRps >= targetRps * 0.85 && p99 <= 100 && errorRate <= 1.0;

  return {
    targetRps,
    achievedRps,
    connections,
    p50,
    p97,
    p99,
    totalRequests: result.requests.total,
    errors: result.errors,
    timeouts: result.timeouts,
    non2xx: result.non2xx,
    errorRate,
    passed,
  };
}

async function main() {
  console.log('===============================================================');
  console.log('🚀 LAST SERVER STANDING — 50K+ RPS CAPACITY BENCHMARK RUNNER');
  console.log('===============================================================\n');

  // 1. Spawn server process
  console.log('Starting production server (src/server.js)...');
  const serverProcess = spawn('node', ['src/server.js'], {
    env: { ...process.env, PORT: String(port), CLUSTER_ENABLED: 'true' },
    stdio: 'inherit',
  });

  const cleanup = () => {
    try {
      serverProcess.kill('SIGTERM');
    } catch {}
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    await waitForHealth();
    console.log('✓ Server is healthy and listening on port ' + port);
    await seedTestProduct();

    const levels = [1000, 2000, 5000, 10000, 15000, 20000, 30000, 40000, 50000];
    const results = [];
    let highestPassedRps = 0;

    console.log('-------------------------------------------------------------------------------------------------------');
    console.log('Target RPS | Achieved RPS | Connections | p50 (ms) | p97.5 (ms) | p99 (ms) | Errors (%) | Status');
    console.log('-------------------------------------------------------------------------------------------------------');

    for (const rps of levels) {
      const res = await runLevel(rps, 8);
      results.push(res);

      const status = res.passed ? '✓ PASS' : '✗ FAIL';
      if (res.passed) {
        highestPassedRps = rps;
      }

      console.log(
        `${String(res.targetRps).padStart(10)} | ` +
        `${String(res.achievedRps).padStart(12)} | ` +
        `${String(res.connections).padStart(11)} | ` +
        `${String(res.p50).padStart(8)} | ` +
        `${String(res.p97).padStart(10)} | ` +
        `${String(res.p99).padStart(8)} | ` +
        `${String(res.errorRate + '%').padStart(10)} | ` +
        `${status}`
      );

      if (!res.passed) {
        console.log(`\nStopping ramp at ${rps} req/s: p99=${res.p99}ms (limit 100ms) or errorRate=${res.errorRate}%`);
        break;
      }

      // 1-second pause between steps to let sockets settle
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log('-------------------------------------------------------------------------------------------------------\n');
    console.log(`🏆 MAXIMUM RULE-COMPLIANT SUSTAINED CAPACITY: ${highestPassedRps} RPS`);

    // Save report
    const reportDir = path.resolve('benchmark-reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const reportPath = path.join(reportDir, `capacity-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), highestPassedRps, results }, null, 2));
    console.log(`✓ Report saved to ${reportPath}\n`);

  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
