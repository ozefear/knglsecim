const fs = require('fs');
const path = require('path');
const https = require('https');

const publicDir = path.join(__dirname, 'public');
const targetPath = path.join(publicDir, 'turkey.svg');
const url = 'https://raw.githubusercontent.com/ali-han/Turkey-SVG-Map/master/src/turkey.svg';

try {
  // Ensure public folder exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log('Created public folder.');
  }

  console.log(`Downloading full Turkey SVG map from: ${url}`);
  
  const file = fs.createWriteStream(targetPath);
  
  https.get(url, (response) => {
    if (response.statusCode !== 200) {
      console.error(`ERROR: Failed to download SVG map. Status Code: ${response.statusCode}`);
      process.exit(1);
    }
    
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      const stats = fs.statSync(targetPath);
      console.log(`SUCCESS: Full Turkey SVG map downloaded. Size: ${stats.size} bytes.`);
      console.log(`File saved at: ${targetPath}`);
    });
  }).on('error', (err) => {
    fs.unlink(targetPath, () => {}); // Delete temp file on error
    console.error('Download error:', err.message);
    process.exit(1);
  });

} catch (error) {
  console.error('Error setting up the SVG map:', error);
  process.exit(1);
}
