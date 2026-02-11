// services/agenticWriter/nodes/revise.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');
const { ARTICLE_TYPE_CONFIG } = require('../styleConfig');

/**
 * Node: from rawDraft + options (tone, length, articleType) + factCheckResults produce revisedDraft.
 * Acts as stylistic editor for LiteNews.
 * @param {Object} state - Graph state with rawDraft, options, factCheckResults
 * @returns {Promise<{ revisedDraft: string }>}
 */
async function reviseNode(state) {
  const { rawDraft, options, factCheckResults } = state;
  const articleType = options?.articleType || '懶人包';
  const config = ARTICLE_TYPE_CONFIG[articleType] || ARTICLE_TYPE_CONFIG['其他'];

  const lang = options?.language === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';
  const tone = options?.tone || 'neutral';
  const lengthHint =
    options?.length === 'short'
      ? 'Keep it concise.'
      : options?.length === 'long'
        ? 'You may expand with more detail.'
        : 'Keep similar length.';

  const styleNotesFromFactCheck = factCheckResults
    ? `
The following factual issues have been identified, make sure your revisions do not invent new unsupported claims and avoid overconfident language where status is "uncertain" or "contradicted".
Score: ${factCheckResults.score}
`
    : '';

  const systemPrompt = `
You are an editor for LiteNews.
Revise the article for clarity, style, and alignment with LiteNews guidelines.

Article type: ${articleType}

[Article type style guidelines]
${config.styleGuidelines}

Tone: ${tone}
Length hint: ${lengthHint}

${styleNotesFromFactCheck}

Output MUST remain in ${lang}.
Return only the revised article text, no explanations or JSON.
`.trim();

  const userPrompt = `
Revise this article. Keep the meaning and main structure, but improve clarity and style.

Article:
${rawDraft || ''}

Output only the revised article in ${lang}.`.trim();

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);
  const revisedDraft =
    typeof response.content === 'string'
      ? response.content
      : response.content?.trim?.() || rawDraft || '';

  return { revisedDraft: revisedDraft || rawDraft || '' };
}

module.exports = { reviseNode };
