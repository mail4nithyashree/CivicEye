import fs from 'fs';
import path from 'path';

async function testPotholes() {
  const dir = 'AI/test_images/pothole';
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const p = path.join(dir, f);
    const buf = fs.readFileSync(p);
    const boundary = '----Boundary' + Date.now();
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\npothole on road\r\n--${boundary}--\r\n`)
    ]);
    const res = await fetch('http://localhost:3000/api/analyze-road', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body
    });
    const j = await res.json();
    console.log(`${f} => ${j.displayIssueName} | State: ${j.predictionState} | Conf: ${j.confidence}% | Priority: ${j.priority}`);
  }
}
testPotholes();
