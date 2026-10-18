import fs from 'fs';
import path from 'path';

async function testBackend() {
  const imagePath = path.resolve('assets/images/icon.png');
  const buffer = fs.readFileSync(imagePath);
  const blob = new Blob([buffer], { type: 'image/png' });

  console.log('Testing /api/validate-road...');
  const fd1 = new FormData();
  fd1.append('image', blob, 'icon.png');
  const r1 = await fetch('http://localhost:3000/api/validate-road', {
    method: 'POST',
    body: fd1,
  });
  console.log('validate-road status:', r1.status);
  const data1 = await r1.json();
  console.log('validate-road response:', data1);

  console.log('\nTesting /api/analyze-road...');
  const fd2 = new FormData();
  fd2.append('image', blob, 'icon.png');
  const r2 = await fetch('http://localhost:3000/api/analyze-road', {
    method: 'POST',
    body: fd2,
  });
  console.log('analyze-road status:', r2.status);
  const data2 = await r2.json();
  console.log('analyze-road response:', data2);

  console.log('\nTesting /api/analyze-road with pothole image...');
  const potholePath = path.resolve('assets/models/pothole_user_crop.jpg');
  const potholeBuffer = fs.readFileSync(potholePath);
  const potholeBlob = new Blob([potholeBuffer], { type: 'image/jpeg' });
  const fdPothole = new FormData();
  fdPothole.append('image', potholeBlob, 'pothole.jpg');
  const rPothole = await fetch('http://localhost:3000/api/analyze-road', {
    method: 'POST',
    body: fdPothole,
  });
  console.log('analyze-road (pothole) status:', rPothole.status);
  const dataPothole = await rPothole.json();
  console.log('analyze-road (pothole) response:', dataPothole);

  console.log('\nTesting /api/upload-image (Cloudinary)...');
  const fd3 = new FormData();
  fd3.append('image', blob, 'icon.png');
  const r3 = await fetch('http://localhost:3000/api/upload-image', {
    method: 'POST',
    body: fd3,
  });
  console.log('upload-image status:', r3.status);
  const data3 = await r3.json();
  console.log('upload-image response:', data3);
}

testBackend().then(() => process.exit(0)).catch(err => {
  console.error('Error testing backend:', err);
  process.exit(1);
});
