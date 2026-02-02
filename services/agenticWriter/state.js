// services/agenticWriter/state.js
// State shape for the article-writing graph (plain object description for reference).
// Actual schema is defined in graph.js via Annotation.Root.

/**
 * State passed between nodes:
 * - topic: { title, summary, category, tags } (plain object from Topic)
 * - newsItems: Array<{ title, description, content?, url }> (plain objects from NewsItem)
 * - options: { tone, length, language }
 * - outline: { headline, sections: string[] } | null
 * - rawDraft: string | null
 * - revisedDraft: string | null
 * - finalArticle: { title, body } | null
 * - error: string | null
 */
module.exports = {};
