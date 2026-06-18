const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });

const { initDatabase } = require('./utils/dbInit');

const authRouter = require('./routes/auth');
const reportsRouter = require('./routes/reports');
const usersRouter = require('./routes/users');
const ratesRouter = require('./routes/rates');
const logsRouter = require('./routes/logs');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', authRouter);
app.use('/api', reportsRouter);
app.use('/api', usersRouter);
app.use('/api', ratesRouter);
app.use('/api', logsRouter);

// Serve static assets in production
const buildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(buildPath));

// Fallback all other routes to React's index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Start Server
if (require.main === module || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log('Backend Server is running on port ' + port);
    initDatabase();
    
    // Copy App.js to App.txt for inspection
    try {
      const fs = require('fs');
      const srcFile = path.join(__dirname, '../frontend/src/App.js');
      const destFile = path.join(__dirname, '../frontend/src/App.txt');
      fs.copyFileSync(srcFile, destFile);
      console.log('Copied App.js to App.txt successfully.');
    } catch (err) {
      console.error('Failed to copy App.js to App.txt:', err);
    }
    
    // Copy images to frontend public and build directories for presentation
    try {
      const fs = require('fs');
      const srcDir = path.join(__dirname, '../images');
      const destPublicDir = path.join(__dirname, '../frontend/public/images');
      const destBuildDir = path.join(__dirname, '../frontend/build/images');
      
      const filesToCopy = ['dashboard_desktop.png', 'dashboard_mobile.png', 'system_logs.png'];
      
      const copyFiles = (src, dest) => {
        if (fs.existsSync(src)) {
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          filesToCopy.forEach(file => {
            const srcFile = path.join(src, file);
            const destFile = path.join(dest, file);
            if (fs.existsSync(srcFile)) {
              fs.copyFileSync(srcFile, destFile);
            }
          });
        }
      };
      
      copyFiles(srcDir, destPublicDir);
      copyFiles(srcDir, destBuildDir);
      console.log('Successfully synced presentation images to frontend assets.');
    } catch (copyErr) {
      console.error('Failed to sync presentation images on backend startup:', copyErr);
    }
  });
} else {
  initDatabase();
}

module.exports = app;
