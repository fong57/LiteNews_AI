// services/agenticWriter/state.js
// State shape for the article-writing graph (plain object description for reference).
// Actual schema is defined in graph.js via Annotation.Root.

/**
 * State passed between nodes:
 * - topic: { title, summary, category, tags } (plain object from Topic)
 * - newsItems: Array<{ title, description, content?, url }> (plain objects from NewsItem)
 * - options: WriterJobOptions (tone, length, language, articleType, extraInstructions, etc.)
 * - researchResults: Array<{ title, url, snippet, content }> from web search
 * - outline: { headline, sections: string[] } | null
 * - rawDraft: string | null
 * - revisedDraft: string | null
 * - factCheckResults: { claims, score } | null
 * - factCheckScore: number | null
 * - styleNotes: any
 * - finalReview: { issues, suggestedFixes, overallAssessment } | null
 * - readyForPublish: boolean | null
 * - revisionCount: number (incremented when finalReview sends back to revise; caps revision loop)
 * - finalArticle: { title, body } | null
 * - error: string | null
 */
module.exports = {};
