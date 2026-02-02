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
// BGE: Small = 384, Base = 768, Large = 1024. MLE5Large (multilingual) = 1024
const EMBEDDING_MODEL_NAME = process.env.EMBEDDING_MODEL || 'MULTILINGUAL_E5_LARGE';

function getEmbeddingDimensions() {
  const name = EMBEDDING_MODEL_NAME.toUpperCase();
  const dimMap = {
    BGE_SMALL_EN: 384, BGE_BASE_EN: 768, BGE_LARGE_EN: 1024,
    BGE_SMALL_EN_V1_5: 384, BGE_BASE_EN_V1_5: 768, BGE_LARGE_EN_V1_5: 1024,
    BGE_SMALL_ZH: 512,
    MLE5_LARGE: 1024, MULTILINGUAL_E5_LARGE: 1024
  };
  return dimMap[name] ?? 1024;
}

const EMBEDDING_DIMENSIONS = getEmbeddingDimensions();

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
    'BGE_LARGE_EN_V1_5': EmbeddingModel.BGELargeENV15,
    'BGE_SMALL_ZH': EmbeddingModel.BGESmallZH,
    'MLE5_LARGE': EmbeddingModel.MLE5Large,
    'MULTILINGUAL_E5_LARGE': EmbeddingModel.MLE5Large
  };
  
  return modelMap[EMBEDDING_MODEL_NAME.toUpperCase()] || EmbeddingModel.MLE5Large;
}

/**
 * Get FastEmbed local_cache directory and tar filename for the current model.
 * Used for incomplete-extraction recovery (e.g. tokenizer.json not extracted from tar).
 */
function getModelCacheNames() {
  const name = (process.env.EMBEDDING_MODEL || 'MULTILINGUAL_E5_LARGE').toUpperCase();
  const dirMap = {
    'BGE_SMALL_EN': 'fast-bge-small-en',
    'BGE_BASE_EN': 'fast-bge-base-en',
    'BGE_LARGE_EN': 'fast-bge-large-en',
    'BGE_SMALL_EN_V1_5': 'fast-bge-small-en-v1.5',
    'BGE_BASE_EN_V1_5': 'fast-bge-base-en-v1.5',
    'BGE_LARGE_EN_V1_5': 'fast-bge-large-en-v1.5',
    'BGE_SMALL_ZH': 'fast-bge-small-zh-v1.5',
    'MLE5_LARGE': 'fast-multilingual-e5-large',
    'MULTILINGUAL_E5_LARGE': 'fast-multilingual-e5-large'
  };
  const cacheDirName = dirMap[name] || 'fast-multilingual-e5-large';
  return { cacheDirName, tarFileName: `${cacheDirName}.tar.gz` };
}

function isMLE5Large() {
  const name = (process.env.EMBEDDING_MODEL || 'MULTILINGUAL_E5_LARGE').toUpperCase();
  return name === 'MLE5_LARGE' || name === 'MULTILINGUAL_E5_LARGE';
}

/** MLE5Large / multilingual-e5 uses model.onnx; BGE models use model_optimized.onnx */
function getOnnxFileName() {
  return isMLE5Large() ? 'model.onnx' : 'model_optimized.onnx';
}

/** Required files for the current model (ONNX name differs by model). */
function getRequiredModelFiles() {
  const base = ['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'config.json'];
  return base.concat(getOnnxFileName());
}

/**
 * Try to fix incomplete model extraction by extracting missing files from the tar.
 * If the model dir does not exist, extracts the full archive. Otherwise extracts only missing files.
 * Returns true if extraction was attempted and succeeded (or nothing was missing).
 */
function tryExtractMissingModelFiles(localCacheDir, cacheDirName, tarFileName) {
  const modelCacheDir = path.join(localCacheDir, cacheDirName);
  const tarFile = path.join(localCacheDir, tarFileName);
  if (!fs.existsSync(tarFile)) {
    return false;
  }
  const { execSync } = require('child_process');
  // If model dir doesn't exist, do full extract (e.g. download finished but extraction never ran)
  if (!fs.existsSync(modelCacheDir)) {
    try {
      execSync(`tar -xzf "${tarFile}" -C "${localCacheDir}"`, { stdio: 'inherit' });
      console.log(`   ✅ Extracted model from archive (full extract)`);
      return true;
    } catch (extractError) {
      console.warn(`   ⚠️ Could not extract archive: ${extractError.message}`);
      return false;
    }
  }
  const requiredFiles = getRequiredModelFiles();
  const missingFiles = requiredFiles.filter(file => {
    return !fs.existsSync(path.join(modelCacheDir, file));
  });
  if (missingFiles.length === 0) {
    return true;
  }
  try {
    const members = missingFiles.map(f => `${cacheDirName}/${f}`).join(' ');
    execSync(`tar -xzf "${tarFile}" -C "${localCacheDir}" ${members}`, { stdio: 'inherit' });
    console.log(`   ✅ Extracted missing model files: ${missingFiles.join(', ')}`);
    return true;
  } catch (extractError) {
    console.warn(`   ⚠️ Could not extract from archive: ${extractError.message}`);
    return false;
  }
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
    // Skip for MLE5Large: let the library do full download+extract (avoids partial-state issues with ~2.2GB model)
    const localCacheDir = path.resolve(process.cwd(), 'local_cache');
    const { cacheDirName, tarFileName } = getModelCacheNames();
    const modelCacheDir = path.join(localCacheDir, cacheDirName);
    const tarFile = path.join(localCacheDir, tarFileName);
    if (!isMLE5Large()) {
      const requiredFiles = getRequiredModelFiles();
      const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(modelCacheDir, file)));
      if (fs.existsSync(tarFile) && (fs.existsSync(modelCacheDir) || missingFiles.length > 0)) {
        if (missingFiles.length > 0) {
          console.log(`   📦 Found incomplete model extraction (missing: ${missingFiles.join(', ')}), extracting...`);
          tryExtractMissingModelFiles(localCacheDir, cacheDirName, tarFileName);
        }
      }
    }

    if (isMLE5Large()) {
      console.log('   MULTILINGUAL_E5_LARGE (~2.2GB): ensure a stable network; download may take several minutes.');
    }
    console.log(`   Initializing model (will download from Qdrant GCS if not cached)...`);
    console.log(`   📥 Download will start when FlagEmbedding.init() is called...`);
    console.log(`   ⏳ Calling FlagEmbedding.init()...`);
    
    initPromise = FlagEmbedding.init({
      model: modelEnum,
      cacheDir: localCacheDir
    }).then((model) => {
      console.log(`   ✅ FlagEmbedding.init() completed - model ready`);
      return model;
    }).catch(async (initError) => {
      console.error(`   ❌ FlagEmbedding.init() failed: ${initError.message}`);
      
      // Handle corrupted ONNX model file
      if (initError.message && initError.message.includes('Protobuf parsing failed')) {
        const onnxFile = getOnnxFileName();
        console.error('   ⚠️ ONNX model file appears corrupted.');
        console.error('   Attempting to fix by re-extracting from archive...');
        
        const { cacheDirName, tarFileName } = getModelCacheNames();
        const modelCacheDir = path.join(localCacheDir, cacheDirName);
        const tarFile = path.join(localCacheDir, tarFileName);
        const onnxPath = path.join(modelCacheDir, onnxFile);
        
        if (fs.existsSync(tarFile) && fs.existsSync(onnxPath)) {
          try {
            // Remove corrupted file
            fs.unlinkSync(onnxPath);
            console.log(`   🗑️  Removed corrupted model file`);
            
            // Re-extract from archive
            const { execSync } = require('child_process');
            execSync(`tar -xzf "${tarFile}" -C "${localCacheDir}" ${cacheDirName}/${onnxFile}`, { stdio: 'inherit' });
            console.log(`   ✅ Re-extracted model file from archive`);
            
            // Retry initialization
            console.log(`   🔄 Retrying FlagEmbedding.init()...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return FlagEmbedding.init({ model: modelEnum, cacheDir: localCacheDir });
          } catch (fixError) {
            console.error(`   ❌ Failed to fix corrupted model: ${fixError.message}`);
            console.error(`   💡 Solution: Delete local_cache directory and let FastEmbed re-download`);
            throw new Error('Corrupted model file - delete local_cache/ and restart to re-download');
          }
        } else {
          throw new Error('Corrupted model file detected but cannot fix - delete local_cache/ and restart');
        }
      }

      // Handle tokenizer load errors (corrupted/truncated tokenizer.json, e.g. after partial download)
      if (initError.message && (initError.message.includes('Error loading from file') || initError.message.includes('EOF while parsing'))) {
        const { cacheDirName } = getModelCacheNames();
        const cachePath = path.join(localCacheDir, cacheDirName);
        const tarPath = path.join(localCacheDir, `${cacheDirName}.tar.gz`);
        const retryCacheDir = path.resolve(process.cwd(), 'local_cache');
        // Auto-retry once: clear cache and re-download
        if (fs.existsSync(cachePath) || fs.existsSync(tarPath)) {
          console.error('   ⚠️ Tokenizer or model files appear corrupted or incomplete (e.g. partial download).');
          console.error('   Clearing cache and retrying download once...');
          try {
            if (fs.existsSync(cachePath)) fs.rmSync(cachePath, { recursive: true });
            if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
            console.log('   🔄 Retrying FlagEmbedding.init() with fresh download...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return FlagEmbedding.init({ model: modelEnum, cacheDir: retryCacheDir });
          } catch (retryErr) {
            console.error(`   ❌ Retry failed: ${retryErr.message}`);
          }
        }
        console.error('');
        console.error('   MULTILINGUAL_E5_LARGE is ~2.2GB; partial downloads can cause this error.');
        console.error('   • Use a stable network and wait for the download progress to reach 100%.');
        console.error('   • Manually delete cache and restart:');
        console.error(`     rm -rf "${cachePath}" "${tarPath}"`);
        console.error('   • Or use a smaller Chinese-capable model in .env: EMBEDDING_MODEL=BGE_SMALL_ZH (512 dim)');
        diagnosticState.suggestedFix = `Delete local_cache/${cacheDirName} and ${cacheDirName}.tar.gz, then restart; or set EMBEDDING_MODEL=BGE_SMALL_ZH`;
        throw new Error('Corrupted/incomplete model cache - delete local_cache/' + cacheDirName + ' and the .tar.gz, then restart; or try EMBEDDING_MODEL=BGE_SMALL_ZH');
      }
      
      // If initialization fails with tokenizer error, try extracting from tar (incomplete extraction)
      if (initError.message && initError.message.includes('Tokenizer file not found')) {
        const { cacheDirName, tarFileName } = getModelCacheNames();
        console.error('   ⚠️ Tokenizer/model files not found. Trying to extract from archive...');
        const extracted = tryExtractMissingModelFiles(localCacheDir, cacheDirName, tarFileName);
        if (extracted) {
          console.log('   🔄 Retrying FlagEmbedding.init()...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return FlagEmbedding.init({ model: modelEnum, cacheDir: localCacheDir });
        }
        console.error('   Possible causes: no archive in local_cache, or extraction failed.');
        console.error('   Try: ensure internet connection, or delete local_cache/ and restart.');
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('   🔄 Retrying FlagEmbedding.init()...');
        return FlagEmbedding.init({ model: modelEnum, cacheDir: localCacheDir });
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
    if (error.message && (error.message.includes('Tokenizer file not found') || error.message.includes('No internet connection') || error.message.includes('Protobuf parsing failed') || error.message.includes('Corrupted model') || error.message.includes('Error loading from file') || error.message.includes('EOF while parsing') || error.message.includes('Corrupted/incomplete model cache'))) {
      console.error('❌ Failed to load embedding model');
      console.error('');
      
      if (error.message.includes('Error loading from file') || error.message.includes('EOF while parsing') || error.message.includes('Corrupted/incomplete model cache')) {
        const { cacheDirName } = getModelCacheNames();
        console.error('   ⚠️  CORRUPTED OR INCOMPLETE MODEL CACHE');
        console.error('');
        console.error('   Tokenizer or model files appear corrupted (e.g. truncated tokenizer.json from partial download).');
        if (isMLE5Large()) {
          console.error('   MULTILINGUAL_E5_LARGE is ~2.2GB; use a stable network and wait for download to reach 100%.');
        }
        console.error('');
        console.error('   • Delete cache and restart: rm -rf local_cache/' + cacheDirName + ' local_cache/' + cacheDirName + '.tar.gz');
        console.error('   • Or use a smaller model: set EMBEDDING_MODEL=BGE_SMALL_ZH in .env (512 dim, Chinese-capable).');
        console.error('');
        diagnosticState.suggestedFix = `Delete local_cache/${cacheDirName} and ${cacheDirName}.tar.gz, then restart; or set EMBEDDING_MODEL=BGE_SMALL_ZH`;
      } else if (error.message.includes('No internet connection')) {
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

// Max description length used for embedding (reduces source-specific wording variance)
const NEWS_DESCRIPTION_CAP = parseInt(process.env.NEWS_EMBED_DESC_CAP, 10) || 400;
// Below this length, description is considered "too short" and we fall back to content prefix (if present)
const NEWS_DESCRIPTION_MIN_LENGTH = parseInt(process.env.NEWS_EMBED_DESC_MIN_LENGTH, 10) || 50;

/**
 * Normalize text before embedding to improve similarity for same-story articles across sources.
 * - Lowercase, trim, collapse repeated whitespace, strip leading/trailing punctuation.
 * @param {string} raw - Raw text
 * @returns {string} - Normalized text
 */
function normalizeTextForEmbedding(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  // Strip leading/trailing punctuation and spaces again
  s = s.replace(/^[\s.,;:!?'"-]+|[\s.,;:!?'"-]+$/g, '').trim();
  return s;
}

/**
 * Get the text that would be embedded for a news item (title + normalized, capped description).
 * If description is missing or very short, falls back to a short prefix of content so the item
 * still gets a meaningful vector.
 * @param {Object} newsItem - News item with title, description, and optional content
 * @returns {string} - Text to embed (throws if item has no title and no description/content)
 */
function getNewsEmbeddingText(newsItem) {
  const title = normalizeTextForEmbedding(newsItem.title || '');
  let rawDesc = newsItem.description || '';
  let desc = normalizeTextForEmbedding(rawDesc.slice(0, NEWS_DESCRIPTION_CAP));

  // Fallback: when description is missing or very short, use a short prefix of content
  if (desc.length < NEWS_DESCRIPTION_MIN_LENGTH) {
    const rawContent = (newsItem.content || '').trim();
    if (rawContent.length > 0) {
      desc = normalizeTextForEmbedding(rawContent.slice(0, NEWS_DESCRIPTION_CAP));
    }
  }

  const text = [title, desc].filter(Boolean).join('. ').trim();

  if (!text || text === '.') {
    throw new Error('News item must have title or description');
  }

  return text;
}

/**
 * Generate embedding for a news item (combines title and normalized, capped description)
 * Normalization and description cap improve clustering of same story from different sources.
 * @param {Object} newsItem - News item with title and description
 * @returns {Promise<number[]>} - Embedding vector
 */
async function generateNewsEmbedding(newsItem) {
  const text = getNewsEmbeddingText(newsItem);
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
  getNewsEmbeddingText,
  cosineSimilarity,
  isAvailable,
  getDimensions,
  getDiagnostics,
  EMBEDDING_DIMENSIONS,
  initializeModel
};
