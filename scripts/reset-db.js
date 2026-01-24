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

// Import all models to ensure schemas are registered
const User = require('../models/User');
const NewsItem = require('../models/NewsItem');
const Topic = require('../models/Topic');
const FeedSource = require('../models/FeedSource');
const Category = require('../models/Category');

async function resetDatabase() {
  try {
    console.log('═══════════════════════════════════════');
    console.log('🗑️  Database Reset Script');
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

    // Step 2: Get database name and list collections
    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    console.log(`📊 Database: ${dbName}\n`);

    const collections = await db.listCollections().toArray();
    console.log(`📋 Found ${collections.length} collection(s):`);
    collections.forEach(col => {
      console.log(`   - ${col.name}`);
    });
    console.log('');

    if (collections.length === 0) {
      console.log('ℹ️  Database is already empty.\n');
    } else {
      // Step 3: Drop all collections
      console.log('🗑️  Dropping all collections...');
      for (const collection of collections) {
        try {
          await db.collection(collection.name).drop();
          console.log(`   ✓ Dropped: ${collection.name}`);
        } catch (error) {
          console.log(`   ⚠️  Could not drop ${collection.name}: ${error.message}`);
        }
      }
      console.log('');
    }

    // Step 4: Recreate indexes by ensuring models are registered
    console.log('🔧 Recreating indexes and schemas...');
    
    // Models are already imported at the top, which registers them with mongoose
    // Now we ensure indexes are created by calling createIndexes on each model
    const modelNames = ['User', 'NewsItem', 'Topic', 'FeedSource', 'Category'];
    
    for (const modelName of modelNames) {
      try {
        const Model = mongoose.models[modelName];
        if (Model) {
          // Create indexes defined in the schema
          await Model.createIndexes();
          // Get index count
          const indexes = await Model.collection.getIndexes();
          const indexCount = Object.keys(indexes).length;
          console.log(`   ✓ ${modelName}: ${indexCount} index(es) created`);
        } else {
          console.log(`   ⚠️  ${modelName}: Model not found (may not be imported yet)`);
        }
      } catch (error) {
        // If collection doesn't exist yet, that's okay - it will be created on first use
        if (error.message.includes('not found') || error.message.includes('does not exist')) {
          console.log(`   ℹ️  ${modelName}: Collection will be created on first use`);
        } else {
          console.log(`   ⚠️  ${modelName}: ${error.message}`);
        }
      }
    }
    console.log('');

    // Step 5: Verify collections are empty
    console.log('✅ Verifying reset...');
    const remainingCollections = await db.listCollections().toArray();
    if (remainingCollections.length === 0) {
      console.log('   ✓ All collections cleared\n');
    } else {
      console.log(`   ℹ️  ${remainingCollections.length} collection(s) remain (may be system collections)\n`);
    }

    // Check for --with-admin flag
    const withAdminFlag = process.argv.includes('--with-admin') || process.argv.includes('-a');
    
    if (withAdminFlag) {
      console.log('👤 Creating admin user (--with-admin flag detected)...\n');
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await User.create({
        name: 'admin',
        password: hashedPassword,
        role: 'ADMIN',
        preferences: {
          sources: [],
          defaultTimeframe: '24h'
        },
        topicPreferences: {
          likedTopics: [],
          dislikedTopics: [],
          topicScores: {}
        }
      });
      console.log('✅ Admin user created!');
      console.log('   Username: admin');
      console.log('   Password: admin123\n');

      // Seed default categories
      console.log('📂 Seeding default categories...');
      const defaultCategories = [
        { name: 'general', displayName: 'General', sortOrder: 0 },
        { name: 'technology', displayName: 'Technology', sortOrder: 1 },
        { name: 'politics', displayName: 'Politics', sortOrder: 2 },
        { name: 'business', displayName: 'Business', sortOrder: 3 },
        { name: 'sports', displayName: 'Sports', sortOrder: 4 }
      ];

      for (const cat of defaultCategories) {
        await Category.create(cat);
      }
      console.log('✅ Default categories created!\n');

      // Seed default feed sources
      console.log('📰 Seeding default feed sources...');
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

      for (const source of defaultFeedSources) {
        await FeedSource.create(source);
        console.log(`   ✓ ${source.name}`);
      }
      console.log('✅ Default feed sources created!\n');
    }

    // Success message
    console.log('═══════════════════════════════════════');
    console.log('✅ Database reset completed successfully!');
    console.log('═══════════════════════════════════════');
    console.log('\n📝 Next steps:');
    if (!withAdminFlag) {
      console.log('   1. Run: npm run create-admin');
    }
    console.log(`   ${withAdminFlag ? '1' : '2'}. Start the server: npm start`);
    console.log(`   ${withAdminFlag ? '2' : '3'}. Login and configure preferences\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n═══════════════════════════════════════');
    console.error('❌ Database reset FAILED');
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

// Check for --force flag
const forceFlag = process.argv.includes('--force') || process.argv.includes('-f');

// Confirm before proceeding (unless --force flag is used)
if (forceFlag) {
  console.log('⚠️  --force flag detected: Proceeding without confirmation\n');
  resetDatabase();
} else if (process.stdin.isTTY) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('⚠️  WARNING: This will DELETE ALL DATA in the database. Continue? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
      rl.close();
      resetDatabase();
    } else {
      console.log('\n❌ Reset cancelled by user.');
      rl.close();
      process.exit(0);
    }
  });
} else {
  // Non-interactive mode without --force - require confirmation
  console.log('⚠️  Non-interactive mode detected.');
  console.log('   Use --force or -f flag to proceed without confirmation.\n');
  process.exit(1);
}
