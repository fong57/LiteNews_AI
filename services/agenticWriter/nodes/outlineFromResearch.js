// services/agenticWriter/nodes/outlineFromResearch.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');
const { ARTICLE_TYPE_CONFIG } = require('../styleConfig');

/**
 * Node: build outline using topic + internal newsItems + external research + articleType.
 * @param {Object} state - Graph state with topic, newsItems, researchResults, options
 * @returns {Promise<{ outline: { headline: string, sections: string[] } }>}
 */
async function outlineFromResearchNode(state) {
  const { topic, newsItems, researchResults, options } = state;
  const articleType = options?.articleType || '懶人包';
  const config = ARTICLE_TYPE_CONFIG[articleType] || ARTICLE_TYPE_CONFIG['其他'];

  const lang = options?.language === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';

  const internalSnippets = (newsItems || [])
    .slice(0, 10)
    .map(
      (item, idx) =>
        `${idx + 1}. ${item.title}\n   ${(item.description || '').slice(0, 200)}`
    )
    .join('\n\n');

  const externalSnippets = (researchResults || [])
    .slice(0, options?.maxResearchArticles || 8)
    .map(
      (item, idx) =>
        `${idx + 1}. ${item.title}\n   ${(item.snippet || '').slice(0, 200)}`
    )
    .join('\n\n');

  const systemPrompt = `
You are an article outline assistant for a ${articleType} article for LiteNews.
Follow these guidelines:

[Article type outline guidelines]
${config.outlineGuidelines}

Output MUST be in ${lang}.
Return valid JSON only, no markdown or explanations.
`.trim();

  const userPrompt = `
Topic:
- Title: ${topic?.title || 'Untitled'}
- Summary: ${topic?.summary || 'N/A'}

Internal news items:
${internalSnippets || 'None'}

External research articles:
${externalSnippets || 'None'}

User extra instructions (if any):
${options?.extraInstructions || 'None'}

Generate a concise outline in ${lang} with:
- "headline": string
- "sections": array of 3-7 section titles (strings) in logical order.

Return ONLY a JSON object:
{"headline": "...", "sections": ["...", "...", "..."]}`.trim();

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);

  const text =
    typeof response.content === 'string'
      ? response.content
      : response.content?.trim?.() || '';

  let outline = {
    headline: topic?.title || 'Untitled',
    sections: []
  };

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      outline = {
        headline: parsed.headline || outline.headline,
        sections: Array.isArray(parsed.sections) ? parsed.sections : outline.sections
      };
    } catch {
      // keep default
    }
  }

  return { outline };
}

module.exports = { outlineFromResearchNode };
