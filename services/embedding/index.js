// services/embedding/index.js
// Semantic embedding service using Sentence-BERT
// Uses @xenova/transformers for JS-native transformer models

const { pipeline, env } = require('@xenova/transformers');

// Configure transformers.js
env.cacheDir = './.cache/transformers';
env.allowLocalModels = true;

// Model configuration
// all-MiniLM-L6-v2 is a fast, high-quality sentence embedding model (384 dimensions)
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSIONS = 384;

// Singleton pipeline instance
let embeddingPipeline = null;
let isInitializing = false;
let initPromise = null;

/**
 * Initialize the embedding pipeline (lazy loading)
 */
async function initializePipeline() {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  if (isInitializing) {
    return initPromise;
  }

  isInitializing = true;
  console.log(`🧠 Loading embedding model: ${EMBEDDING_MODEL}...`);

  initPromise = pipeline('feature-extraction', EMBEDDING_MODEL, {
    quantized: true // Use quantized model for faster inference
  });

  try {
    embeddingPipeline = await initPromise;
    console.log(`✅ Embedding model loaded successfully (${EMBEDDING_DIMENSIONS} dimensions)`);
    return embeddingPipeline;
  } catch (error) {
    console.error('❌ Failed to load embedding model:', error.message);
    isInitializing = false;
    initPromise = null;
    throw error;
  }
}

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  const pipe = await initializePipeline();

  // Truncate very long text to avoid memory issues
  const truncatedText = text.slice(0, 8000);

  // Generate embedding
  const output = await pipe(truncatedText, {
    pooling: 'mean',
    normalize: true
  });

  // Convert to regular array
  return Array.from(output.data);
}

/**
 * Generate embeddings for multiple texts (batched)
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
async function generateEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Texts must be a non-empty array');
  }

  const pipe = await initializePipeline();

  // Process in batches to manage memory
  const BATCH_SIZE = 32;
  const embeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => (t || '').slice(0, 8000));

    for (const text of batch) {
      if (text) {
        const output = await pipe(text, {
          pooling: 'mean',
          normalize: true
        });
        embeddings.push(Array.from(output.data));
      } else {
        // Return zero vector for empty text
        embeddings.push(new Array(EMBEDDING_DIMENSIONS).fill(0));
      }
    }

    // Log progress for large batches
    if (texts.length > BATCH_SIZE) {
      console.log(`   Embedded ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length} items`);
    }
  }

  return embeddings;
}

/**
 * Generate embedding for a news item (combines title and description)
 * @param {Object} newsItem - News item with title and description
 * @returns {Promise<number[]>} - Embedding vector
 */
async function generateNewsEmbedding(newsItem) {
  // Combine title and description for richer semantic representation
  const text = `${newsItem.title || ''}. ${newsItem.description || ''}`.trim();

  if (!text || text === '.') {
    throw new Error('News item must have title or description');
  }

  return generateEmbedding(text);
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {number[]} embedding1 
 * @param {number[]} embedding2 
 * @returns {number} - Similarity score between -1 and 1
 */
function cosineSimilarity(embedding1, embedding2) {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Check if embedding service is available
 */
async function isAvailable() {
  try {
    await initializePipeline();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get embedding dimensions
 */
function getDimensions() {
  return EMBEDDING_DIMENSIONS;
}

module.exports = {
  generateEmbedding,
  generateEmbeddings,
  generateNewsEmbedding,
  cosineSimilarity,
  isAvailable,
  getDimensions,
  EMBEDDING_DIMENSIONS
};
