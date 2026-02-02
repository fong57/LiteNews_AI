// services/agenticWriter/nodes/draft.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');

/**
 * Node: from outline + newsItems produce raw draft (full article text).
 * @param {Object} state - Graph state with outline, newsItems, options
 * @returns {Promise<{ rawDraft: string }>}
 */
async function draftNode(state) {
  const { outline, newsItems, options } = state;
  const lang = (options && options.language) === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';

  const newsList = (newsItems || [])
    .slice(0, 15)
    .map((item, i) => `${i + 1}. ${item.title}\n   ${(item.description || '').slice(0, 300)}`)
    .join('\n\n');

  const systemPrompt = `You are a news article writer. Write the full article in ${lang} based on the outline and sources. Use clear paragraphs. Do not include JSON or meta-commentary. Output the article body only.`;
  const userPrompt = `Outline:
Headline: ${outline?.headline || 'Untitled'}
Sections: ${(outline?.sections || []).join(' | ')}

Sources:
${newsList || 'None'}

Write the complete article in ${lang} (several paragraphs). Output only the article text.`;

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);
  const rawDraft = typeof response.content === 'string' ? response.content : (response.content?.trim?.() || '');

  return { rawDraft };
}

module.exports = { draftNode };
