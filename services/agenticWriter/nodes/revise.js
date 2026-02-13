// services/agenticWriter/nodes/revise.js
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
 * Node: from rawDraft (or revisedDraft when in feedback loop) + options + factCheckResults produce revisedDraft.
 * When re-entered from finalReview (assessment not "good"), revises using revisedDraft and finalReview feedback.
 * On connection error, passes through sourceDraft so the pipeline continues.
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
  const length = typeof options?.length === 'number' && options.length > 0 ? options.length : 800;

  const styleNotesFromFactCheck = factCheckResults
    ? `
以下事實問題已標出，修訂時請勿新增無依據的說法，且對狀態為「不確定」或「矛盾」之處避免使用過於肯定的用語。
評分：${factCheckResults.score}
`
    : '';

  const feedbackFromReview = isRevisionLoop && finalReview
    ? `
[終審意見 – 請依此修正以達刊登水準]
整體評估：${finalReview.overallAssessment || '尚待改進'}
待修正問題：${Array.isArray(finalReview.issues) ? finalReview.issues.join('；') : '未列出'}
建議修正：${Array.isArray(finalReview.suggestedFixes) ? finalReview.suggestedFixes.join('；') : '未列出'}
`
    : '';

  // Cap sample body length to avoid huge prompts (e.g. 多方觀點 has very long samples)
  const MAX_SAMPLE_BODY_CHARS = 600;
  const fewShotBlock = (config.sampleArticles && config.sampleArticles.length > 0)
    ? `
[同類型文章範例（修訂時請對齊此風格與格式）]
${config.sampleArticles.map((s, i) => {
      const body = (s.body || '').slice(0, MAX_SAMPLE_BODY_CHARS);
      const suffix = (s.body || '').length > MAX_SAMPLE_BODY_CHARS ? '…' : '';
      return `【範例 ${i + 1}】\n標題：${s.headline || ''}\n內文：\n${body}${suffix}`;
    }).join('\n\n')}

請依上述範例的風格與格式修訂文章。
`
    : '';

  const systemPrompt = `
你是一個香港專業報章的編輯。
- 語言：正式書面語，混合適量香港口語（如「市民」而非「居民」、「當局」而非「政府」），避免過度文言或俗語，符合香港新聞的語境習慣；
- 立場：客觀中立，以事實為核心，不加入個人評論，僅在引述時體現不同聲音；
- 若無來源，切勿捏造事實、數據或引述。
- 若資訊不足，請寫「暫無公開資料」，不要猜測。
- 對不確定的事項避免使用過於肯定的用語（例如「絕對」、「已證實」）。
- 新聞寫作規範：落實5W 核心要素（何人、何事、何時、何地、為何）；文中所有引用內容，必須標註發言人具體姓名和資訊來源媒體。標註方式應符合香港新聞規範，例如人物第一次出現時標註較詳細身份信息。標註方式應自然揉合到文章行文之中，例如「根據《明報》報導，特首李家超表示…」。
請就清晰度、文風及符合香港報章編採標準，以繁體中文修訂文章。

文章類型：${articleType}
${fewShotBlock}

[文章類型風格準則]
${config.styleGuidelines}
${(config.forbiddenPhrases && config.forbiddenPhrases.length) ? `\n請勿使用以下用語（若出現請替換或刪除）：${config.forbiddenPhrases.join('、')}。` : ''}
${(config.recommendedSignposts && config.recommendedSignposts.length) ? `\n在適當時可優先使用以下導引用語：${config.recommendedSignposts.join('、')}。` : ''}

語氣：${tone}
目標字數：${length} 字，請嚴格遵守。

${styleNotesFromFactCheck}
${feedbackFromReview}

輸出必須為 ${lang}。
僅回傳修訂後的文章內文，勿含說明或 JSON。
`.trim();

  const userPrompt = isRevisionLoop
    ? `
請依終審意見再次修訂本文。逐項處理所有待修正問題與建議，使結果達可刊登水準。

文章：
${sourceDraft}

僅以 ${lang} 輸出修訂後的文章。`.trim()
    : `
請修訂此文章。保留原意與主要結構，但提升清晰度與文風。

文章：
${sourceDraft}

僅以 ${lang} 輸出修訂後的文章。`.trim();

  const model = getModel();
  let revisedText = '';
  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt)
    ]);
    revisedText =
      typeof response.content === 'string'
        ? response.content
        : response.content?.trim?.() || sourceDraft || '';
  } catch (err) {
    if (isConnectionError(err)) {
      console.warn('[agenticWriter] revise skipped (connection error), passing through draft:', err.message);
      revisedText = sourceDraft;
    } else {
      throw err;
    }
  }

  const draft = revisedText || sourceDraft || '';
  return { revisedDraft: draft, revisionHistory: draft };
}

module.exports = { reviseNode };
