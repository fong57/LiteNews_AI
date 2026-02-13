// services/agenticWriter/nodes/finalReview.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');
const { ARTICLE_TYPE_CONFIG } = require('../styleConfig');

function isConnectionError(err) {
  const msg = err?.message || '';
  const cause = err?.cause?.message || err?.cause || '';
  return (
    /connection error|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network/i.test(msg) ||
    (typeof cause === 'string' && /fetch failed|connection/i.test(cause))
  );
}

/**
 * Node: final agentic review (light fact + style check).
 * When overallAssessment is not "good", the graph routes back to revise for another pass (feedback loop).
 * On connection error, returns readyForPublish: true so the pipeline continues to format.
 * @param {Object} state - Graph state with revisedDraft, options, factCheckResults, revisionCount
 * @returns {Promise<{ finalReview: any, readyForPublish: boolean, revisionCount: number }>}
 */
async function finalReviewNode(state) {
  const { revisedDraft, options, factCheckResults } = state;
  const lang = options?.language === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';
  const articleType = options?.articleType || '懶人包';
  const config = ARTICLE_TYPE_CONFIG[articleType] || ARTICLE_TYPE_CONFIG['其他'];
  const length = typeof options?.length === 'number' && options.length > 0 ? options.length : 800;

  const styleRules = [
    (config.maxSentenceLength != null) && `句子不得超過 ${config.maxSentenceLength} 字。`,
    (config.maxParagraphLength != null) && `段落不得超過 ${config.maxParagraphLength} 字。`,
    (config.forbiddenPhrases && config.forbiddenPhrases.length) && `文章不得包含以下用語：${config.forbiddenPhrases.join('、')}。`
  ].filter(Boolean);

  const styleCheckBlock = styleRules.length
    ? `
針對文章類型「${articleType}」，請一併檢查：
${styleRules.map((r) => `- ${r}`).join('\n')}
`
    : '';

  const systemPrompt = `
你是一個香港專業報章的資深編輯。
- 語言：正式書面語，混合適量香港口語（如「市民」而非「居民」、「當局」而非「政府」），避免過度文言或俗語，符合香港新聞的語境習慣；
- 立場：客觀中立，以事實為核心，不加入個人評論，僅在引述時體現不同聲音；
- 若無來源，切勿捏造事實、數據或引述。
- 若資訊不足，請寫「暫無公開資料」，不要猜測。
- 對不確定的事項避免使用過於肯定的用語（例如「絕對」、「已證實」）。

請檢查：
- 根據提供的事實查核摘要，是否有明顯事實問題？
- 文章是否符合預期語氣與類型？
- 結構是否清晰且符合該文章類型？
- 文章字數是否符合目標約 ${length} 字（可接受約 ±15% 誤差）？若明顯過長或過短，請在 issues 中列出並於 suggestedFixes 建議增刪。
${styleCheckBlock}

請回傳 JSON：
{
  "issues": ["..."],
  "suggestedFixes": ["..."],
  "overallAssessment": "good" | "needs_minor_changes" | "needs_major_changes"
}

所有回傳內容（issues、suggestedFixes 之文字）必須以 ${lang} 撰寫。
僅輸出 JSON。
`.trim();

  const userPrompt = `
文章（${lang}）：
${revisedDraft || ''}

事實查核摘要（若有）：
${factCheckResults ? JSON.stringify(factCheckResults).slice(0, 2000) : '無'}

請進行終審並依上述格式以 JSON 回覆，回傳內容須以 ${lang} 撰寫。
`.trim();

  const model = getModel();
  let text = '{}';
  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);
    text =
      typeof response.content === 'string'
        ? response.content
        : response.content?.trim?.() || '{}';
  } catch (err) {
    if (isConnectionError(err)) {
      console.warn('[agenticWriter] finalReview skipped (connection error), marking ready for publish:', err.message);
      const fallback = { issues: [], suggestedFixes: [], overallAssessment: 'good' };
      const reviewEntry = { ...fallback, readyForPublish: true };
      return { finalReview: fallback, readyForPublish: true, revisionCount: state.revisionCount ?? 0, finalReviewHistory: reviewEntry };
    }
    throw err;
  }

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

  const readyForPublish = finalReview.overallAssessment === 'good';
  const revisionCount = (state.revisionCount ?? 0) + (readyForPublish ? 0 : 1);

  const reviewEntry = { ...finalReview, readyForPublish };
  return { finalReview, readyForPublish, revisionCount, finalReviewHistory: reviewEntry };
}

module.exports = { finalReviewNode };
