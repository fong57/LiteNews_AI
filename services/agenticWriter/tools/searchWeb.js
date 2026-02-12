// services/agenticWriter/tools/searchWeb.js
// Web search for research and fact-check. Uses Tavily API when TAVILY_API_KEY is set.

const axios = require('axios');

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

/**
 * Run a web search and return normalized results.
 * @param {Object} opts
 * @param {string} opts.query - Search query
 * @param {number} [opts.maxResults=10] - Max results (Tavily allows 0-20)
 * @returns {Promise<Array<{ title: string, url: string, snippet: string, content: string }>>}
 */
async function searchWeb({ query, maxResults = 5 }) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !query || String(query).trim() === '') {
    return [];
  }

  const max = Math.min(20, Math.max(0, Number(maxResults) || 20));

  try {
    const { data } = await axios.post(
      TAVILY_SEARCH_URL,
      {
        query: String(query).trim(),
        max_results: max,
        search_depth: 'advanced', // basic, advanced, or deep (more expensive)
        include_answer: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        timeout: 20000
      }
    );

    const results = data.results || [];
    return results.map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: (r.content || '').slice(0, 500),
      content: r.content || ''
    }));
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error('[agenticWriter/searchWeb] Tavily error:', err.message);
    if (status != null) console.error('[agenticWriter/searchWeb] HTTP status:', status);
    if (data != null) console.error('[agenticWriter/searchWeb] Response:', typeof data === 'object' ? JSON.stringify(data).slice(0, 500) : data);
    if (err.code) console.error('[agenticWriter/searchWeb] Code:', err.code);
    if (err.stack) console.error('[agenticWriter/searchWeb] Stack:', err.stack);
    return [];
  }
}

module.exports = { searchWeb };
