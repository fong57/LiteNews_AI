const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI is not set in .env file');
  process.exit(1);
}

async function createAdmin() {
  try {
    console.log('═══════════════════════════════════════');
    console.log('👤 Create Admin User Script');
    console.log('═══════════════════════════════════════\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ name: 'admin' });
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists. Updating...');
      existingAdmin.password = hashedPassword;
      existingAdmin.role = 'ADMIN';
      if (!existingAdmin.preferences) {
        existingAdmin.preferences = {
          sources: [],
          categories: ['general', 'technology', 'politics', 'business', 'sports'],
          defaultTimeframe: '24h'
        };
      }
      await existingAdmin.save();
      console.log('✅ Admin user updated!\n');
    } else {
      console.log('Creating admin user...');
      await User.create({
        name: 'admin',
        password: hashedPassword,
        role: 'ADMIN',
        preferences: {
          sources: [],
          categories: ['general', 'technology', 'politics', 'business', 'sports'],
          defaultTimeframe: '24h'
        },
        topicPreferences: {
          likedTopics: [],
          dislikedTopics: [],
          topicScores: {}
        }
      });
      console.log('✅ Admin user created!\n');
    }

    console.log('═══════════════════════════════════════');
    console.log('🔐 Admin Credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Role: ADMIN');
    console.log('═══════════════════════════════════════\n');

    await mongoose.connection.close();
    console.log('🔌 Database connection closed\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('whitelist') || error.message.includes('IP')) {
      console.error('\n💡 MongoDB Atlas IP Whitelist Issue:');
      console.error('   1. Go to: https://cloud.mongodb.com');
      console.error('   2. Select your cluster → Network Access');
      console.error('   3. Click "Add IP Address" → "Add Current IP Address"\n');
    }
    
    try {
      await mongoose.connection.close();
    } catch (e) {}
    
    process.exit(1);
  }
}

createAdmin();
