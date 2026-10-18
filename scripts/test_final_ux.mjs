import http from 'http';

function checkHealth() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[TEST] Server health status:', res.statusCode, data);
        resolve(res.statusCode === 200);
      });
    }).on('error', (err) => {
      console.error('[TEST] Server health error:', err.message);
      reject(err);
    });
  });
}

async function run() {
  console.log('--- CIVICEYE ENDPOINT VERIFICATION ---');
  const healthy = await checkHealth();
  console.log('[TEST] Health check passed:', healthy);
}

run().catch(console.error);
