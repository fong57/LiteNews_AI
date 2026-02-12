// server.js
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/litenews';

const app = express();

// Rate limiting – return JSON so API clients don't get parse errors
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ message: 'Too many requests – try again later!' });
  }
});
app.use('/api', apiLimiter);

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
}));

// Static files
app.use(express.static('public'));

// Middleware
app.use(express.json());

// MongoDB connection
const mongooseOptions = {
  // For MongoDB Atlas, SSL is required
  ssl: true,
  tls: true,
  // Allow self-signed certificates if needed (not recommended for production)
  tlsAllowInvalidCertificates: false,
  // Connection pool options
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

mongoose
  .connect(MONGODB_URI, mongooseOptions)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    const { start: startAutoSocialFetch } = require('./services/autoSocialFetchScheduler');
    const { start: startAutoNewsFetch } = require('./services/autoNewsFetchScheduler');
    startAutoSocialFetch();
    startAutoNewsFetch();
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// Routes
const authRoutes = require('./routes/auth.js');
const userRoutes = require('./routes/user.js');
const preferencesRoutes = require('./routes/preferences.js');
const newsRoutes = require('./routes/news.js');
const topicsRoutes = require('./routes/topics.js');
const adminRoutes = require('./routes/admin.js');
const socialRoutes = require('./routes/social.js');
const writerRoutes = require('./routes/writer.js');
const materialsRoutes = require('./routes/materials.js');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/topics', topicsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/writer', writerRoutes);
app.use('/api/materials', materialsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 4250;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ LiteNews_AI server started on http://localhost:${PORT}`);
  console.log(`📝 Mock LLM mode: ${process.env.USE_MOCK_LLM === 'true' ? 'ENABLED' : 'AUTO'}`);
});