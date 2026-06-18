const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'images');
const destDir = path.join(__dirname, 'frontend', 'public', 'images');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = [
  'dashboard_desktop.png',
  'dashboard_mobile.png',
  'system_logs.png'
];

files.forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  try {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Successfully copied ${file} to public/images/`);
  } catch (err) {
    console.error(`Failed to copy ${file}:`, err);
  }
});
