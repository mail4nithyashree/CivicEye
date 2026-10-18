// Endpoint verification script
import http from 'http';

async function testEndpoint(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  console.log('Testing /health endpoint...');
  try {
    const health = await testEndpoint('http://localhost:3000/health');
    console.log('Health status:', health.statusCode);
    console.log('Health response:', health.data);
  } catch (err) {
    console.error('Health test failed:', err);
  }

  console.log('\nTesting /api/send-email endpoint for SWM notification...');
  try {
    const postData = JSON.stringify({
      complaintId: 'CE9999',
      issueType: 'Garbage Overflow',
      description: 'Garbage overflow near college gate',
      citizenEmail: 'kasbiyaml@gmail.com',
      department: 'Solid Waste Management',
      routingStatus: 'Moved to Solid Waste Management',
    });
    const emailRes = await testEndpoint('http://localhost:3000/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      }
    }, postData);
    console.log('Email response status:', emailRes.statusCode);
    console.log('Email response body:', emailRes.data);
  } catch (err) {
    console.error('Email test failed:', err);
  }
}

run();
