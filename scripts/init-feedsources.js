const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI is not set in .env file');
  process.exit(1);
}

// Import FeedSource model
const FeedSource = require('../models/FeedSource');

// Default feed sources data
const defaultFeedSources = [
  {
    name: 'RTHK本地新聞',
    type: 'rss',
    url: 'https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml',
    remark: '預設',
    isActive: true
  },
  {
    name: 'RTHK大中華新聞',
    type: 'rss',
    url: 'https://rthk.hk/rthk/news/rss/c_expressnews_greaterchina.xml',
    remark: '預設',
    isActive: true
  },
  {
    name: 'RTHK國際新聞',
    type: 'rss',
    url: 'https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml',
    remark: '預設',
    isActive: true
  },
  {
    name: 'RTHK財經新聞',
    type: 'rss',
    url: 'https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml',
    remark: '預設',
    isActive: true
  },
  {
    name: 'RTHK體育新聞',
    type: 'rss',
    url: 'https://rthk.hk/rthk/news/rss/c_expressnews_csport.xml',
    remark: '預設',
    isActive: true
  }
];

async function initFeedSources() {
  try {
    console.log('═══════════════════════════════════════');
    console.log('📰 FeedSource Initialization Script');
    console.log('═══════════════════════════════════════\n');

    // Step 1: Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      ssl: true,
      tls: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB\n');

    // Step 2: Check for existing feed sources
    const existingCount = await FeedSource.countDocuments();
    console.log(`📊 Existing feed sources: ${existingCount}\n`);

    // Check for --force flag to replace existing sources
    const forceFlag = process.argv.includes('--force') || process.argv.includes('-f');
    
    if (existingCount > 0 && !forceFlag) {
      console.log('ℹ️  Feed sources already exist.');
      console.log('   Use --force or -f flag to replace existing sources.\n');
      
      console.log('📋 Current feed sources:');
      const existing = await FeedSource.find().select('name type url isActive');
      existing.forEach((source, index) => {
        const status = source.isActive ? '✓' : '✗';
        console.log(`   ${index + 1}. [${status}] ${source.name} (${source.type})`);
      });
      console.log('');
      
      process.exit(0);
    }

    // Step 3: Clear existing sources if --force flag is used
    if (existingCount > 0 && forceFlag) {
      console.log('⚠️  --force flag detected: Clearing existing feed sources...');
      await FeedSource.deleteMany({});
      console.log('✅ Existing feed sources cleared\n');
    }

    // Step 4: Insert default feed sources
    console.log('📥 Inserting default feed sources...\n');
    
    const insertedSources = [];
    for (const sourceData of defaultFeedSources) {
      const source = await FeedSource.create(sourceData);
      insertedSources.push(source);
      console.log(`   ✓ ${source.name}`);
      console.log(`     URL: ${source.url}`);
    }
    console.log('');

    // Step 5: Verify insertion
    const totalCount = await FeedSource.countDocuments();
    console.log('═══════════════════════════════════════');
    console.log('✅ FeedSource initialization completed!');
    console.log('═══════════════════════════════════════');
    console.log(`\n📊 Total feed sources: ${totalCount}`);
    console.log('\n📝 Next steps:');
    console.log('   1. Start the server: npm start');
    console.log('   2. Go to Admin panel to manage feed sources');
    console.log('   3. Trigger news fetch to test the sources\n');

    process.exit(0);
  } catch (error) {
    console.error('\n═══════════════════════════════════════');
    console.error('❌ FeedSource initialization FAILED');
    console.error('═══════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await mongoose.connection.close();
      console.log('🔌 Database connection closed\n');
    } catch (closeError) {
      console.error('⚠️  Error closing connection:', closeError.message);
    }
  }
}

// Run the initialization
initFeedSources();
