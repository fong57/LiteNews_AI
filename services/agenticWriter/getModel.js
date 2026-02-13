// services/agenticWriter/getModel.js
// Shared ChatPerplexity instance for graph nodes.
const { ChatPerplexity } = require('@langchain/community/chat_models/perplexity');

let _model = null;

function getModel() {
  if (!_model) {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error('PERPLEXITY_API_KEY is required for article writer');
    }
    _model = new ChatPerplexity({
      model: process.env.PERPLEXITY_MODEL || 'sonar',
      apiKey,
      temperature: 0.3,
      maxTokens: 4096,
      timeout: Number(process.env.PERPLEXITY_TIMEOUT_MS) || 60_000
    });
  }
  return _model;
}

module.exports = { getModel };
