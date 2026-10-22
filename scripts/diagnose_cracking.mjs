import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function sendAnalyzeRequest(filePath, description = '') {
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const filename = path.basename(filePath);

  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`
  );
  const postDesc = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="description"\r\n\r\n` +
    `${description}\r\n--${boundary}--\r\n`
  );

  const body = Buffer.concat([pre, fileBuffer, postDesc]);

  const response = await fetch(`${BASE_URL}/api/analyze-road`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString(),
    },
    body: body,
  });

  return await response.json();
}

async function testAllCracking() {
  const dir = 'AI/test_images/alligator_cracking';
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const res = await sendAnalyzeRequest(full, 'Alligator cracking across road');
    console.log(`${f}: State=${res.predictionState}, Detected=${res.displayIssueName}, Conf=${res.confidence}%, Priority=${res.priority}`);
  }

  const dir2 = 'AI/test_images/cracking';
  const files2 = fs.readdirSync(dir2);
  for (const f of files2) {
    const full = path.join(dir2, f);
    const res = await sendAnalyzeRequest(full, 'Road cracking');
    console.log(`cracking/${f}: State=${res.predictionState}, Detected=${res.displayIssueName}, Conf=${res.confidence}%, Priority=${res.priority}`);
  }
}

testAllCracking().catch(console.error);
