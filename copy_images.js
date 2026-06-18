const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\User\\.gemini\\antigravity-ide\\brain\\b6872eb1-415e-4dc2-b179-9a138536bd02';
const destDir = 'd:\\PythonScript\\images';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = {
  'media__1781167857333.png': 'dashboard_desktop.png',
  'media__1781165840289.png': 'dashboard_mobile.png',
  'media__1781164714153.png': 'system_logs.png'
};

for (const [src, dest] of Object.entries(files)) {
  const srcPath = path.join(srcDir, src);
  const destPath = path.join(destDir, dest);
  try {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} to ${dest}`);
  } catch (err) {
    console.error(`Failed to copy ${src}:`, err);
  }
}
