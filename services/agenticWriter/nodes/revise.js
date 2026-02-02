// services/agenticWriter/nodes/revise.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');

/**
 * Node: from rawDraft + options (tone, length) produce revisedDraft.
 * @param {Object} state - Graph state with rawDraft, options
 * @returns {Promise<{ revisedDraft: string }>}
 */
async function reviseNode(state) {
  const { rawDraft, options } = state;
  const lang = (options && options.language) === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';
  const tone = (options && options.tone) || 'neutral';
  const lengthHint = (options && options.length) === 'short' ? 'Keep it concise.' : (options && options.length) === 'long' ? 'You may expand with more detail.' : 'Keep similar length.';

  const systemPrompt = `You are an editor. Revise the article for clarity and style. Output MUST remain in ${lang}. Return only the revised article text, no explanations or JSON.`;
  const userPrompt = `Revise this article. Tone: ${tone}. ${lengthHint}

Article:
${rawDraft || ''}

Output only the revised article in ${lang}.`;

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);
  const revisedDraft = typeof response.content === 'string' ? response.content : (response.content?.trim?.() || rawDraft || '');

  return { revisedDraft: revisedDraft || rawDraft || '' };
}

module.exports = { reviseNode };
