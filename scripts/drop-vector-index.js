#!/usr/bin/env node
// scripts/drop-vector-index.js
// Drops the MongoDB Atlas Vector Search index (e.g. before recreating with a different dimension)

require('dotenv').config();
const mongoose = require('mongoose');

const INDEX_NAME = 'news_embedding_index';

async function dropVectorIndex() {
  console.log('🗑️  Drop MongoDB Atlas Vector Search Index\n');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable not set');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const collection = mongoose.connection.db.collection('newsitems');

    try {
      await collection.dropSearchIndex(INDEX_NAME);
      console.log(`✅ Vector search index "${INDEX_NAME}" dropped successfully.`);
      console.log('\n   Run `npm run setup-vector-index` to create a new index (dimension follows EMBEDDING_MODEL in .env).');
    } catch (error) {
      if (error.message && (error.message.includes('index not found') || error.message.includes('does not exist'))) {
        console.log(`   Index "${INDEX_NAME}" does not exist (nothing to drop).`);
      } else {
        throw error;
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Done.');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

if (require.main === module) {
  dropVectorIndex();
}

module.exports = { dropVectorIndex, INDEX_NAME };
