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
  });
} else {
  initDatabase();
}

module.exports = app;
