// services/agenticWriter/nodes/draft.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');
const { ARTICLE_TYPE_CONFIG } = require('../styleConfig');

/**
 * Node: from outline + newsItems + researchResults produce rawDraft (type-aware).
 * @param {Object} state - Graph state with outline, newsItems, researchResults, options
 * @returns {Promise<{ rawDraft: string }>}
 */
async function draftNode(state) {
  const { outline, newsItems, researchResults, options } = state;
  const articleType = options?.articleType || '懶人包';
  const config = ARTICLE_TYPE_CONFIG[articleType] || ARTICLE_TYPE_CONFIG['其他'];

  const lang = options?.language === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';

  const internalSnippets = (newsItems || [])
    .slice(0, 10)
    .map(
      (item, i) =>
        `${i + 1}. ${item.title}\n   ${(item.description || '').slice(0, 300)}`
    )
    .join('\n\n');

  const externalSnippets = (researchResults || [])
    .slice(0, options?.maxResearchArticles || 8)
    .map(
      (item, i) =>
        `${i + 1}. ${item.title}\n   ${(item.snippet || '').slice(0, 300)}`
    )
    .join('\n\n');

  const systemPrompt = `
You are a news article writer for LiteNews.
Write a ${articleType} article.

Follow these guidelines:

[Article type draft guidelines]
${config.draftGuidelines}

User extra instructions:
${options?.extraInstructions || 'None'}

Write the full article in ${lang} based on the outline and sources.
Use clear paragraphs. Do not include JSON or meta-commentary.
Output the article body only.
`.trim();

  const userPrompt = `
Outline:
Headline: ${outline?.headline || 'Untitled'}
Sections: ${(outline?.sections || []).join(' | ')}

Internal sources:
${internalSnippets || 'None'}

External research:
${externalSnippets || 'None'}

Write the complete article in ${lang} (several paragraphs).
Output only the article text.`.trim();

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);
  const rawDraft =
    typeof response.content === 'string'
      ? response.content
      : response.content?.trim?.() || '';

  return { rawDraft };
}

module.exports = { draftNode };
