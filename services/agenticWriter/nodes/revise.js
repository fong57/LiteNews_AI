// services/agenticWriter/nodes/revise.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');
const { ARTICLE_TYPE_CONFIG } = require('../styleConfig');

/**
 * Node: from rawDraft (or revisedDraft when in feedback loop) + options + factCheckResults produce revisedDraft.
 * When re-entered from finalReview (assessment not "good"), revises using revisedDraft and finalReview feedback.
 * @param {Object} state - Graph state with rawDraft, revisedDraft?, options, factCheckResults?, finalReview?
 * @returns {Promise<{ revisedDraft: string }>}
 */
async function reviseNode(state) {
  const { rawDraft, revisedDraft, options, factCheckResults, finalReview } = state;

  // Feedback loop: re-revise using current revisedDraft and finalReview when assessment was not "good"
  const isRevisionLoop = finalReview && (revisedDraft != null && revisedDraft !== '');
  const sourceDraft = isRevisionLoop ? revisedDraft : (rawDraft || '');

  const publication = options?.publication || 'LiteNews';
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

  const feedbackFromReview = isRevisionLoop && finalReview
    ? `
[FINAL REVIEW FEEDBACK – address these to reach publication quality]
Overall assessment: ${finalReview.overallAssessment || 'needs improvement'}
Issues to fix: ${Array.isArray(finalReview.issues) ? finalReview.issues.join('; ') : 'None listed'}
Suggested fixes: ${Array.isArray(finalReview.suggestedFixes) ? finalReview.suggestedFixes.join('; ') : 'None listed'}
`
    : '';

  const systemPrompt = `
You are an editor for ${publication}.
- Do NOT invent facts, statistics, or quotes if no sources are provided.
- If information is missing, state "暂无公开数据" (no public data) instead of guessing.
- Avoid overconfident language (e.g., "definitely", "proven") for uncertain claims.
Revise the article for clarity, style, and alignment with ${publication} guidelines.

Article type: ${articleType}

[Article type style guidelines]
${config.styleGuidelines}

Tone: ${tone}
Length hint: ${lengthHint}

${styleNotesFromFactCheck}
${feedbackFromReview}

Output MUST remain in ${lang}.
Return only the revised article text, no explanations or JSON.
`.trim();

  const userPrompt = isRevisionLoop
    ? `
Revise this article again based on the final review feedback. Address every issue and suggested fix so the result is good enough for publication.

Article:
${sourceDraft}

Output only the revised article in ${lang}.`.trim()
    : `
Revise this article. Keep the meaning and main structure, but improve clarity and style.

Article:
${sourceDraft}

Output only the revised article in ${lang}.`.trim();

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);
  const revisedText =
    typeof response.content === 'string'
      ? response.content
      : response.content?.trim?.() || sourceDraft || '';

  return { revisedDraft: revisedText || sourceDraft || '' };
}

module.exports = { reviseNode };
