// services/agenticWriter/nodes/outline.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');

/**
 * Node: from topic + newsItems produce outline (headline + sections).
 * @param {Object} state - Graph state with topic, newsItems, options
 * @returns {Promise<{ outline: { headline, sections } }>}
 */
async function outlineNode(state) {
  const { topic, newsItems, options } = state;
  const lang = (options && options.language) === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';

  const newsList = (newsItems || [])
    .slice(0, 15)
    .map((item, i) => `${i + 1}. ${item.title}\n   ${(item.description || '').slice(0, 200)}`)
    .join('\n\n');

  const systemPrompt = `You are an article outline assistant. Output MUST be in ${lang}. Return valid JSON only, no markdown or explanations.`;
  const userPrompt = `Topic: ${topic?.title || 'Untitled'}
Summary: ${topic?.summary || 'N/A'}

Related news snippets:
${newsList || 'None'}

Generate a short article outline in ${lang}:
1. headline: One compelling headline (string).
2. sections: Array of 3-5 section titles (short phrases), in order.

Return ONLY a JSON object: {"headline": "...", "sections": ["...", "..."]}`;

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);
  const text = typeof response.content === 'string' ? response.content : response.content?.trim?.() || '';

  let outline = { headline: topic?.title || 'Untitled', sections: [] };
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      outline = {
        headline: parsed.headline || outline.headline,
        sections: Array.isArray(parsed.sections) ? parsed.sections : outline.sections
      };
    } catch (_) {
      // keep default
    }
  }

  return { outline };
}

module.exports = { outlineNode };
