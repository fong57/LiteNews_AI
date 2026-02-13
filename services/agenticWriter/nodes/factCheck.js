// services/agenticWriter/nodes/factCheck.js
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { getModel } = require('../getModel');
const { searchWeb } = require('../tools/searchWeb');

function isConnectionError(err) {
  const msg = err?.message || '';
  const cause = err?.cause?.message || err?.cause || '';
  return (
    /connection error|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network/i.test(msg) ||
    (typeof cause === 'string' && /fetch failed|connection/i.test(cause))
  );
}

/**
 * Node: fact-check the draft and produce factCheckResults + factCheckScore.
 * On connection/API errors, returns score 1.0 and empty results so the pipeline continues.
 * @param {Object} state - Graph state with rawDraft, options
 * @returns {Promise<{ factCheckResults: any, factCheckScore: number }>}
 */
async function factCheckNode(state) {
  const { rawDraft, options } = state;
  const lang = options?.language === 'zh-TW' ? '繁體中文' : 'Traditional Chinese';

  try {
    return await runFactCheck(state, rawDraft, lang);
  } catch (err) {
    if (isConnectionError(err)) {
      console.warn('[agenticWriter] factCheck skipped (connection error), continuing pipeline:', err.message);
      return {
        factCheckResults: { claims: [], score: 1.0, skipped: true },
        factCheckScore: 1.0
      };
    }
    throw err;
  }
}

async function runFactCheck(state, rawDraft, lang) {
  // 1. Ask model to extract key factual claims
  const extractSystem = `
You are a fact-checking assistant.
Extract the most important factual claims from the article.
Return JSON with:
{"claims": [{"id": "c1", "text": "...", "importance": 1-5}]}
Output only JSON.
`.trim();

  // Cap draft length to avoid oversized API payloads (e.g. 多方觀點 produces long drafts)
  const MAX_DRAFT_CHARS = 5000;
  const draftForExtract = (rawDraft || '').slice(0, MAX_DRAFT_CHARS);
  const extractUser = `
Article (in ${lang}):
${draftForExtract}${(rawDraft || '').length > MAX_DRAFT_CHARS ? '\n…' : ''}

Extract 10-20 factual claims (short sentences) that can be checked.
`.trim();

  const model = getModel();
  const extractResp = await model.invoke([
    new SystemMessage(extractSystem),
    new HumanMessage(extractUser)
  ]);
  const extractText =
    typeof extractResp.content === 'string'
      ? extractResp.content
      : extractResp.content?.trim?.() || '{}';

  let claims = [];
  const match = extractText.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      claims = Array.isArray(parsed.claims) ? parsed.claims : [];
    } catch {
      // ignore
    }
  }

  // 2. For each claim, run a web search to check support
  const results = [];
  for (const claim of claims.slice(0, 15)) {
    const searchResult = await searchWeb({
      query: claim.text,
      maxResults: 3
    });

    const checkSystem = `
You are a strict fact-checking assistant.
Given a claim and some web search snippets, decide whether it is:
- "supported"
- "contradicted"
- "uncertain"

Return JSON:
{"status": "...", "reason": "..."}
Output only JSON.
`.trim();

    const snippets = (searchResult || [])
      .map((r, i) => `${i + 1}. ${r.title}\n${(r.snippet || '').slice(0, 300)}`)
      .join('\n\n');

    const checkUser = `
Claim:
${claim.text}

Web search snippets:
${snippets || 'None'}

Decide the status and explain briefly.
`.trim();

    const checkResp = await model.invoke([
      new SystemMessage(checkSystem),
      new HumanMessage(checkUser)
    ]);
    const checkText =
      typeof checkResp.content === 'string'
        ? checkResp.content
        : checkResp.content?.trim?.() || '{}';

    let status = 'uncertain';
    let reason = '';
    const m2 = checkText.match(/\{[\s\S]*\}/);
    if (m2) {
      try {
        const parsed = JSON.parse(m2[0]);
        status = parsed.status || status;
        reason = parsed.reason || reason;
      } catch {
        // ignore
      }
    }

    results.push({
      id: claim.id,
      text: claim.text,
      importance: claim.importance,
      status,
      reason,
      evidenceSnippets: searchResult || []
    });
  }

  // 3. Compute a simple score: fraction of important claims supported
  const important = results.filter((r) => (r.importance || 3) >= 3);
  const supported = important.filter((r) => r.status === 'supported');
  const factCheckScore =
    important.length > 0 ? supported.length / important.length : 1.0;

  const factCheckResults = {
    claims: results,
    score: factCheckScore
  };

  return { factCheckResults, factCheckScore };
}

module.exports = { factCheckNode };
