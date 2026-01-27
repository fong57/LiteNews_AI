// services/embedding/index.js
// Semantic embedding service using FastEmbed
// FastEmbed provides fast, lightweight embeddings without Sharp dependency

const fs = require('fs');
const path = require('path');
const https = require('https');

let FastEmbed = null;
let fastEmbedError = null;
let embeddingModel = null;
let modelInitError = null;

// Diagnostic state tracking
let diagnosticState = {
  moduleLoadFailed: false,
  modelInitFailed: false,
  lastError: null,
  suggestedFix: null
};

// Try to load FastEmbed with graceful error handling
try {
  FastEmbed = require('fastembed');
} catch (error) {
  fastEmbedError = error;
  diagnosticState.moduleLoadFailed = true;
  diagnosticState.lastError = error;
  console.error('❌ Failed to load fastembed:', error.message);
  console.error('   Please run: npm install fastembed');
}

// Model configuration
// Using BAAI/bge-small-en-v1.5 (384 dimensions) - top performance, fast inference
// Alternative models: EmbeddingModel.BGEBaseEN, EmbeddingModel.BGESmallEN, etc.
const EMBEDDING_MODEL_NAME = process.env.EMBEDDING_MODEL || 'BGE_SMALL_EN';
const EMBEDDING_DIMENSIONS = 384;

// Singleton model instance
let isInitializing = false;
let initPromise = null;

/**
 * Map model name string to FastEmbed EmbeddingModel enum
 */
function getModelEnum() {
  const { EmbeddingModel } = FastEmbed || {};
  if (!EmbeddingModel) return null;
  
  const modelMap = {
    'BGE_SMALL_EN': EmbeddingModel.BGESmallEN,
    'BGE_BASE_EN': EmbeddingModel.BGEBaseEN,
    'BGE_LARGE_EN': EmbeddingModel.BGELargeEN,
    'BGE_SMALL_EN_V1_5': EmbeddingModel.BGESmallENV15,
    'BGE_BASE_EN_V1_5': EmbeddingModel.BGEBaseENV15,
    'BGE_LARGE_EN_V1_5': EmbeddingModel.BGELargeENV15
  };
  
  return modelMap[EMBEDDING_MODEL_NAME.toUpperCase()] || EmbeddingModel.BGESmallENV15;
}

/**
 * Check if internet connectivity is available (for model downloads)
 */
async function checkInternetConnectivity() {
  return new Promise((resolve) => {
    const req = https.get('https://huggingface.co', { timeout: 5000 }, (res) => {
      resolve(true);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Initialize the embedding model (lazy loading)
 */
async function initializeModel() {
  // Check if FastEmbed is available
  if (!FastEmbed) {
    throw new Error(
      'Embedding service unavailable: fastembed module failed to load. ' +
      'Please run: npm install fastembed'
    );
  }

  if (embeddingModel) {
    return embeddingModel;
  }

  if (isInitializing) {
    return initPromise;
  }

  isInitializing = true;
  console.log(`🧠 Loading embedding model: ${EMBEDDING_MODEL_NAME}...`);

  try {
    // Check internet connectivity before attempting download
    console.log(`   Checking internet connectivity (required for first-time model download)...`);
    const hasInternet = await checkInternetConnectivity();
    
    if (!hasInternet) {
      throw new Error(
        'No internet connection detected. FastEmbed requires internet access to download model files from Hugging Face on first use. ' +
        'Please ensure you have internet connectivity and try again.'
      );
    }
    console.log(`   ✓ Internet connection available`);

    const { FlagEmbedding } = FastEmbed;
    const modelEnum = getModelEnum();
    
    if (!modelEnum) {
      throw new Error('Failed to get model enum from FastEmbed');
    }

    // Ensure cache directory exists
    const cacheDir = path.join(process.cwd(), '.cache', 'fastembed');
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        console.log(`   Created cache directory: ${cacheDir}`);
      }
    } catch (dirError) {
      console.warn(`   ⚠️ Could not create cache directory: ${dirError.message}`);
      // Continue anyway - FastEmbed will use its default cache location
    }

    // Check if FastEmbed's local_cache directory exists and has incomplete/corrupted extraction
    const localCacheDir = path.join(process.cwd(), 'local_cache');
    const modelCacheDir = path.join(localCacheDir, 'fast-bge-small-en');
    const tarFile = path.join(localCacheDir, 'fast-bge-small-en.tar.gz');
    
    // Check for missing or potentially corrupted files
    if (fs.existsSync(tarFile) && fs.existsSync(modelCacheDir)) {
      const requiredFiles = [
        'tokenizer.json',
        'tokenizer_config.json',
        'special_tokens_map.json',
        'config.json',
        'model_optimized.onnx'
      ];
      
      const missingFiles = requiredFiles.filter(file => {
        const filePath = path.join(modelCacheDir, file);
        return !fs.existsSync(filePath);
      });
      
      if (missingFiles.length > 0) {
        console.log(`   📦 Found incomplete model extraction (missing: ${missingFiles.join(', ')}), extracting...`);
        try {
          const { execSync } = require('child_process');
          const filesToExtract = missingFiles.map(f => `fast-bge-small-en/${f}`).join(' ');
          execSync(`tar -xzf "${tarFile}" -C "${localCacheDir}" ${filesToExtract} 2>/dev/null || true`, { stdio: 'inherit' });
          console.log(`   ✅ Extracted missing model files`);
        } catch (extractError) {
          console.warn(`   ⚠️ Could not extract model files: ${extractError.message}`);
        }
      }
    }

    console.log(`   Initializing model (will download from Hugging Face if not cached)...`);
    console.log(`   This may take a few minutes on first run.`);
    console.log(`   📥 Download will start now when FlagEmbedding.init() is called...`);
    
    // Initialize FastEmbed with the specified model
    // FastEmbed will automatically download model files from Hugging Face on first use
    // The download happens INSIDE FlagEmbedding.init() - it's synchronous with initialization
    // Note: FastEmbed uses its own cache mechanism - models are downloaded to
    // a cache directory managed by the library (typically in user's home directory)
    console.log(`   ⏳ Calling FlagEmbedding.init() - download should start immediately...`);
    
    initPromise = FlagEmbedding.init({
      model: modelEnum
    }).then((model) => {
      console.log(`   ✅ FlagEmbedding.init() completed - model ready`);
      return model;
    }).catch(async (initError) => {
      console.error(`   ❌ FlagEmbedding.init() failed: ${initError.message}`);
      
      // Handle corrupted ONNX model file
      if (initError.message && initError.message.includes('Protobuf parsing failed')) {
        console.error('   ⚠️ ONNX model file appears corrupted.');
        console.error('   Attempting to fix by re-extracting from archive...');
        
        const localCacheDir = path.join(process.cwd(), 'local_cache');
        const modelCacheDir = path.join(localCacheDir, 'fast-bge-small-en');
        const tarFile = path.join(localCacheDir, 'fast-bge-small-en.tar.gz');
        const onnxPath = path.join(modelCacheDir, 'model_optimized.onnx');
        
        if (fs.existsSync(tarFile) && fs.existsSync(onnxPath)) {
          try {
            // Remove corrupted file
            fs.unlinkSync(onnxPath);
            console.log(`   🗑️  Removed corrupted model file`);
            
            // Re-extract from archive
            const { execSync } = require('child_process');
            execSync(`tar -xzf "${tarFile}" -C "${localCacheDir}" fast-bge-small-en/model_optimized.onnx 2>/dev/null || true`, { stdio: 'inherit' });
            console.log(`   ✅ Re-extracted model file from archive`);
            
            // Retry initialization
            console.log(`   🔄 Retrying FlagEmbedding.init()...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return FlagEmbedding.init({ model: modelEnum });
          } catch (fixError) {
            console.error(`   ❌ Failed to fix corrupted model: ${fixError.message}`);
            console.error(`   💡 Solution: Delete local_cache directory and let FastEmbed re-download`);
            throw new Error('Corrupted model file - delete local_cache/ and restart to re-download');
          }
        } else {
          throw new Error('Corrupted model file detected but cannot fix - delete local_cache/ and restart');
        }
      }
      
      // If initialization fails with tokenizer error, it might be a download issue
      if (initError.message && initError.message.includes('Tokenizer file not found')) {
        console.error('   ⚠️ Model files not found. This usually means:');
        console.error('      1. Download failed or did not start');
        console.error('      2. Network issue preventing download from Hugging Face');
        console.error('      3. Cache directory permission issue');
        console.error('      4. Firewall/proxy blocking hf.co');
        console.error('');
        console.error('   The download should have started when FlagEmbedding.init() was called.');
        console.error('   If you see this error, the download likely failed silently.');
        console.error('');
        console.error('   Attempting to retry initialization in 5 seconds...');
        console.error('   (This gives more time for any background download to complete)');
        
        // Wait longer before retry to allow any background download to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('   🔄 Retrying FlagEmbedding.init()...');
        return FlagEmbedding.init({ model: modelEnum });
      }
      throw initError;
    });

    embeddingModel = await initPromise;
    console.log(`✅ Embedding model loaded successfully (${EMBEDDING_DIMENSIONS} dimensions)`);
    
    // Clear any previous model init errors on success
    modelInitError = null;
    diagnosticState.modelInitFailed = false;
    return embeddingModel;
  } catch (error) {
    modelInitError = error;
    diagnosticState.modelInitFailed = true;
    diagnosticState.lastError = error;
    
    // Provide helpful error message for missing or corrupted model files
    if (error.message && (error.message.includes('Tokenizer file not found') || error.message.includes('No internet connection') || error.message.includes('Protobuf parsing failed') || error.message.includes('Corrupted model'))) {
      console.error('❌ Failed to load embedding model');
      console.error('');
      
      if (error.message.includes('No internet connection')) {
        console.error('   ⚠️  NO INTERNET CONNECTION DETECTED');
        console.error('');
        console.error('   FastEmbed requires internet access to download model files from Hugging Face.');
        console.error('   This is a one-time download (~100MB) that gets cached locally.');
        console.error('');
        console.error('   Solutions:');
        console.error('   1. Connect to the internet');
        console.error('   2. Restart the server after connecting');
        console.error('   3. The model will be downloaded automatically on first use');
        console.error('');
        diagnosticState.suggestedFix = 'Connect to internet and restart server - model will download automatically';
      } else if (error.message.includes('Protobuf parsing failed') || error.message.includes('Corrupted model')) {
        console.error('   ⚠️  CORRUPTED MODEL FILE DETECTED');
        console.error('');
        console.error('   The ONNX model file appears to be corrupted or incomplete.');
        console.error('');
        console.error('   Solutions:');
        console.error('   1. Delete the local_cache directory and restart:');
        console.error('      rm -rf local_cache/');
        console.error('      (FastEmbed will re-download the model)');
        console.error('   2. Or manually re-extract from the tar.gz archive');
        console.error('');
        console.error('   Error details:', error.message);
        diagnosticState.suggestedFix = 'Delete local_cache/ directory and restart server to re-download model';
      } else {
        console.error('   FastEmbed needs to download model files from Hugging Face.');
        console.error('   This should happen automatically on first use.');
        console.error('');
        console.error('   Possible causes:');
        console.error('   1. No internet connection (required for first-time download)');
        console.error('   2. Download in progress (wait 1-2 minutes and try again)');
        console.error('   3. Insufficient disk space (~100MB required)');
        console.error('   4. Cache directory permission issues');
        console.error('   5. Firewall/proxy blocking Hugging Face (hf.co)');
        console.error('');
        console.error('   Solutions:');
        console.error('   - Ensure internet connection is available');
        console.error('   - Wait a few minutes for download to complete');
        console.error('   - Check disk space and permissions');
        console.error('   - Restart the server to retry download');
        console.error('');
        console.error('   Error details:', error.message);
        diagnosticState.suggestedFix = 'Ensure internet connection and wait for model download, or restart server';
      }
    } else {
      console.error('❌ Failed to load embedding model:', error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
      }
    }
    
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

  const model = await initializeModel();

  // Truncate very long text to avoid memory issues
  const truncatedText = text.slice(0, 8000);

  // Generate embedding using FastEmbed's passageEmbed method
  // FastEmbed returns embeddings as Float32Array, convert to regular array
  const embeddings = model.passageEmbed([truncatedText], 1);
  
  // FastEmbed returns an async generator, get the first batch
  let embedding = null;
  for await (const batch of embeddings) {
    embedding = batch[0];
    break;
  }

  if (!embedding) {
    throw new Error('Failed to generate embedding');
  }

  // Convert to regular array (already normalized by FastEmbed)
  return Array.from(embedding);
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

  const model = await initializeModel();

  // Filter and truncate texts
  const processedTexts = texts
    .map(t => (t || '').slice(0, 8000))
    .filter(t => t.length > 0);

  if (processedTexts.length === 0) {
    // Return zero vectors for all empty texts
    return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0));
  }

  const allEmbeddings = [];
  const BATCH_SIZE = 32;

  try {
    // Generate embeddings using FastEmbed's passageEmbed method
    // It returns an async generator that yields batches
    const embeddings = model.passageEmbed(processedTexts, BATCH_SIZE);
    
    let processedCount = 0;
    for await (const batch of embeddings) {
      // Convert each embedding in the batch to regular array
      for (const embedding of batch) {
        allEmbeddings.push(Array.from(embedding));
        processedCount++;
      }
      
      // Log progress for large batches
      if (texts.length > BATCH_SIZE) {
        console.log(`   Embedded ${processedCount}/${processedTexts.length} items`);
      }
    }

    // If we have fewer embeddings than texts (due to filtering), pad with zero vectors
    while (allEmbeddings.length < texts.length) {
      allEmbeddings.push(new Array(EMBEDDING_DIMENSIONS).fill(0));
    }
  } catch (error) {
    console.error(`   ⚠️ Error generating embeddings:`, error.message);
    // Return zero vectors for all texts on error
    return texts.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0));
  }

  return allEmbeddings;
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
  // First check if FastEmbed module loaded
  if (!FastEmbed) {
    console.warn('⚠️  Embedding unavailable: fastembed module failed to load');
    if (fastEmbedError) {
      console.warn(`   Error: ${fastEmbedError.message}`);
      console.warn('   Fix: npm install fastembed');
    }
    return false;
  }
  
  // Then check if model can be initialized
  try {
    await initializeModel();
    return true;
  } catch (error) {
    // Log the specific error for debugging
    if (error.message && !error.message.includes('already initializing')) {
      console.warn('⚠️  Embedding service check failed:', error.message);
    }
    return false;
  }
}

/**
 * Get embedding dimensions
 */
function getDimensions() {
  return EMBEDDING_DIMENSIONS;
}

/**
 * Get detailed diagnostic information about embedding service availability
 * @returns {Object} Diagnostic information with status, error, and fix suggestions
 */
function getDiagnostics() {
  let status = 'available';
  let errorMessage = null;
  let suggestedFix = null;
  
  if (!FastEmbed) {
    status = 'module_load_failed';
    errorMessage = fastEmbedError ? fastEmbedError.message : 'Unknown error loading fastembed';
    suggestedFix = 'npm install fastembed';
  } else if (modelInitError) {
    status = 'model_init_failed';
    errorMessage = modelInitError.message;
  } else if (embeddingModel) {
    status = 'available';
  } else {
    // Model exists but not initialized yet
    status = 'not_initialized';
  }
  
  return {
    status,
    error: errorMessage || diagnosticState.lastError?.message || null,
    suggestedFix: suggestedFix || diagnosticState.suggestedFix || null,
    fastEmbedLoaded: !!FastEmbed,
    modelInitialized: !!embeddingModel
  };
}

module.exports = {
  generateEmbedding,
  generateEmbeddings,
  generateNewsEmbedding,
  cosineSimilarity,
  isAvailable,
  getDimensions,
  getDiagnostics,
  EMBEDDING_DIMENSIONS
};
