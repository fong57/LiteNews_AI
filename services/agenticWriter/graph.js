// services/agenticWriter/graph.js
/*
StateGraph: Core LangGraph class to build stateful, sequential workflows (defines nodes and edges between them).
Annotation: LangGraph utility to define the schema of the workflow state (what data is passed between nodes).
The other imports are custom node functions (each node is a step in the writing process, e.g., researchNode handles research, draftNode writes the first draft). These nodes are modular (stored in /nodes folder) for maintainability.
*/
const { StateGraph, Annotation } = require('@langchain/langgraph');
const { researchNode } = require('./nodes/research');
const { outlineFromResearchNode } = require('./nodes/outlineFromResearch');
const { draftNode } = require('./nodes/draft');
const { factCheckNode } = require('./nodes/factCheck');
const { reviseNode } = require('./nodes/revise');
const { finalReviewNode } = require('./nodes/finalReview');
const { formatNode } = require('./nodes/format');

// Max revision loops from finalReview back to revise (avoid infinite loop).
const MAX_REVISION_ATTEMPTS = 5;

// Reducer to append a single value or array to state (for history fields).
const appendReducer = (left, right) => {
  if (right == null) return left || [];
  if (Array.isArray(right)) return (left || []).concat(right);
  return (left || []).concat([right]);
};

// State schema: each key stores the latest value from nodes (no reducers).
// revisionHistory and finalReviewHistory use reducers to accumulate all revisions/reviews.
const ArticleWriterState = Annotation.Root({
  topic: Annotation(),
  newsItems: Annotation(),
  options: Annotation(),
  researchResults: Annotation(),
  outline: Annotation(),
  rawDraft: Annotation(),
  revisedDraft: Annotation(),
  revisionHistory: Annotation({
    reducer: appendReducer,
    default: () => []
  }),
  factCheckResults: Annotation(),
  factCheckScore: Annotation(),
  styleNotes: Annotation(),
  finalReview: Annotation(),
  finalReviewHistory: Annotation({
    reducer: appendReducer,
    default: () => []
  }),
  readyForPublish: Annotation(),
  revisionCount: Annotation(),
  finalArticle: Annotation(),
  error: Annotation()
});

// Build the state graph
const graphBuilder = new StateGraph(ArticleWriterState) // Initializes a new state graph with the defined ArticleWriterState schema.
  // Add nodes (each node = a step in the workflow)
  .addNode('research', researchNode)
  .addNode('makeOutline', outlineFromResearchNode)
  .addNode('draft', draftNode)
  .addNode('factCheck', factCheckNode)
  .addNode('revise', reviseNode)
  .addNode('doFinalReview', finalReviewNode)
  .addNode('format', formatNode)
  // Add edges (defines the workflow order)
  .addEdge('__start__', 'research')
  .addEdge('research', 'makeOutline')
  .addEdge('makeOutline', 'draft')
  .addEdge('draft', 'factCheck')
  .addConditionalEdges(
    'factCheck',
    (state) => (state.factCheckScore != null && state.factCheckScore < 0.5) ? 'research' : 'revise',
    ['research', 'revise']
  )
  .addEdge('revise', 'doFinalReview')
  .addConditionalEdges(
    'doFinalReview',
    (state) => {
      if (state.readyForPublish) return 'format';
      const count = state.revisionCount ?? 0;
      if (count >= MAX_REVISION_ATTEMPTS) return 'format'; // cap attempts, publish as-is
      return 'revise';
    },
    ['format', 'revise']
  )
  .addEdge('format', '__end__');

const compiledGraph = graphBuilder.compile(); // Compile the Graph (make it executable)

module.exports = { compiledGraph, ArticleWriterState }; // Export the Compiled Graph
