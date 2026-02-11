// services/agenticWriter/nodes/finalReview.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');

/**
 * Node: final agentic review (light fact + style check).
 * @param {Object} state - Graph state with revisedDraft, options, factCheckResults
 * @returns {Promise<{ finalReview: any, readyForPublish: boolean }>}
 */
async function finalReviewNode(state) {
  const { revisedDraft, options, factCheckResults } = state;
  const lang = options?.language === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';

  const systemPrompt = `
You are a senior editor performing a final review.

Check:
- Are there obvious factual issues based on the provided factCheck summary?
- Does the article match the intended tone and article type?
- Is the structure clear and appropriate for the article type?

Return JSON:
{
  "issues": ["..."],
  "suggestedFixes": ["..."],
  "overallAssessment": "good" | "needs_minor_changes" | "needs_major_changes"
}

Output JSON only.
`.trim();

  const userPrompt = `
Article (in ${lang}):
${revisedDraft || ''}

Fact check summary (if any):
${factCheckResults ? JSON.stringify(factCheckResults).slice(0, 2000) : 'None'}

Perform the final review and respond in JSON as specified.
`.trim();

  const model = getModel();
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);
  const text =
    typeof response.content === 'string'
      ? response.content
      : response.content?.trim?.() || '{}';

  let finalReview = {
    issues: [],
    suggestedFixes: [],
    overallAssessment: 'good'
  };
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      finalReview = {
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestedFixes: Array.isArray(parsed.suggestedFixes)
          ? parsed.suggestedFixes
          : [],
        overallAssessment: parsed.overallAssessment || 'good'
      };
    } catch {
      // ignore
    }
  }

  const readyForPublish =
    finalReview.overallAssessment === 'good' ||
    finalReview.overallAssessment === 'needs_minor_changes';

  return { finalReview, readyForPublish };
}

module.exports = { finalReviewNode };
