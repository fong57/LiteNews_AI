#!/usr/bin/env node
// scripts/setup-vector-index.js
// Sets up MongoDB Atlas Vector Search index for news embeddings

require('dotenv').config();
const mongoose = require('mongoose');

// Must match embedding model: BGE small/base = 384/768, BGE large = 1024, MULTILINGUAL_E5_LARGE = 1024
function getEmbeddingDimensions() {
  const name = (process.env.EMBEDDING_MODEL || 'MULTILINGUAL_E5_LARGE').toUpperCase();
  const dimMap = {
    BGE_SMALL_EN: 384, BGE_BASE_EN: 768, BGE_LARGE_EN: 1024,
    BGE_SMALL_EN_V1_5: 384, BGE_BASE_EN_V1_5: 768, BGE_LARGE_EN_V1_5: 1024,
    BGE_SMALL_ZH: 512,
    MLE5_LARGE: 1024, MULTILINGUAL_E5_LARGE: 1024
  };
  return dimMap[name] ?? 1024;
}

const EMBEDDING_DIMENSIONS = getEmbeddingDimensions();
const INDEX_NAME = 'news_embedding_index';

async function setupVectorIndex() {
  const modelName = (process.env.EMBEDDING_MODEL || 'MULTILINGUAL_E5_LARGE').toUpperCase();
  console.log('🔧 MongoDB Atlas Vector Search Index Setup\n');
  console.log(`   EMBEDDING_MODEL: ${modelName} → dimensions: ${EMBEDDING_DIMENSIONS}\n`);

  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable not set');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('newsitems');

    // Check if vector search index already exists
    console.log(`\n📋 Checking for existing vector search index "${INDEX_NAME}"...`);

    try {
      const indexes = await collection.listSearchIndexes().toArray();
      const existingIndex = indexes.find(idx => idx.name === INDEX_NAME);

      if (existingIndex) {
        console.log(`✅ Vector search index "${INDEX_NAME}" already exists`);
        console.log('   Status:', existingIndex.status || 'active');
        console.log(`   Configured dimension (from EMBEDDING_MODEL): ${EMBEDDING_DIMENSIONS}`);
        console.log('   To recreate with a different dimension: npm run drop-vector-index && npm run setup-vector-index');
        await mongoose.disconnect();
        return;
      }
    } catch (error) {
      // listSearchIndexes might not be available on older drivers or non-Atlas
      console.log('   Unable to check existing indexes:', error.message);
    }

    // Create the vector search index
    console.log(`\n🚀 Creating vector search index "${INDEX_NAME}" (dimensions: ${EMBEDDING_DIMENSIONS})...`);

    const indexDefinition = {
      name: INDEX_NAME,
      definition: {
        mappings: {
          dynamic: false,
          fields: {
            embedding: {
              type: 'knnVector',
              dimensions: EMBEDDING_DIMENSIONS,
              similarity: 'cosine'
            },
            // Include additional fields for filtering
            topicId: {
              type: 'objectId'
            },
            publishedAt: {
              type: 'date'
            }
          }
        }
      }
    };

    try {
      await collection.createSearchIndex(indexDefinition);
      console.log(`✅ Vector search index "${INDEX_NAME}" created successfully! (dimensions: ${EMBEDDING_DIMENSIONS})`);
      console.log('\n⏳ Note: Index may take a few minutes to become active.');
      console.log('   Check status in MongoDB Atlas UI: Database > Search > Indexes');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`✅ Vector search index "${INDEX_NAME}" already exists`);
        console.log(`   Configured dimension (from EMBEDDING_MODEL): ${EMBEDDING_DIMENSIONS}`);
      } else {
        throw error;
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Setup complete!');

  } catch (error) {
    console.error('\n❌ Error setting up vector index:', error.message);

    // Provide manual setup instructions
    console.log('\n' + '='.repeat(60));
    console.log('📝 MANUAL SETUP INSTRUCTIONS');
    console.log('='.repeat(60));
    console.log(`
If automatic index creation failed, you can create the index manually
in the MongoDB Atlas UI:

1. Go to MongoDB Atlas (https://cloud.mongodb.com)
2. Select your cluster
3. Click "Search" in the left sidebar
4. Click "Create Search Index"
5. Select "JSON Editor"
6. Select your database and the "newsitems" collection
7. Set index name to: ${INDEX_NAME}
8. Paste this index definition:

{
  "mappings": {
    "dynamic": false,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": ${EMBEDDING_DIMENSIONS},
        "similarity": "cosine"
      },
      "topicId": {
        "type": "objectId"
      },
      "publishedAt": {
        "type": "date"
      }
    }
  }
}

9. Click "Create Search Index"
10. Wait for the index status to become "Active"

=`.repeat(60));

    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setupVectorIndex();
}

module.exports = { setupVectorIndex, INDEX_NAME, EMBEDDING_DIMENSIONS };
