const express = require('express');
const JournalEntry = require('../models/JournalEntry');
const auth = require('../middleware/auth');

const router = express.Router();

// Helper function to parse markdown and extract plain text and sections
function parseMarkdown(markdown) {
  // Convert markdown to plain text (strip formatting)
  const plainText = markdown
    .replace(/#{1,6}\s+/g, '') // Remove headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links (keep text)
    .replace(/`([^`]+)`/g, '$1') // Remove code
    .replace(/\n{2,}/g, '\n\n') // Normalize line breaks
    .trim();

  // Extract sections by headings
  const sections = [];
  const lines = markdown.split('\n');
  let currentHeading = null;
  let currentContent = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section if exists
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      // Start new section
      currentHeading = headingMatch[2].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  return { plainText, sections };
}

// Helper function to generate placeholder embedding
function generatePlaceholderEmbedding(text) {
  // Placeholder: return empty array for now
  // This will be replaced with actual embedding API integration
  return [];
}

// All routes require authentication
router.use(auth);

// POST /api/journal - Create entry
router.post('/', async (req, res) => {
  try {
    const { title, markdown, date, tags } = req.body;

    if (!markdown) {
      return res.status(400).json({ error: 'Markdown content is required' });
    }

    // Parse markdown
    const { plainText, sections } = parseMarkdown(markdown);

    // Generate embedding (placeholder)
    const embedding = generatePlaceholderEmbedding(plainText);

    // Create journal entry
    const entry = new JournalEntry({
      userId: req.user.id,
      date: date ? new Date(date) : new Date(),
      title: title || '',
      rawMarkdown: markdown,
      plainText,
      tags: tags || [],
      sections,
      embedding,
    });

    await entry.save();

    // Return entry (omit embedding from response or truncate it)
    const entryObj = entry.toObject();
    entryObj.embedding = entryObj.embedding.length > 0 ? '[embedding stored]' : [];

    res.status(201).json(entryObj);
  } catch (error) {
    console.error('Create entry error:', error);
    res.status(500).json({ error: 'Server error creating entry' });
  }
});

// GET /api/journal - List entries
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = { userId: req.user.id };

    // Add date filters if provided
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    const entries = await JournalEntry.find(query)
      .sort({ date: -1 }) // Newest first
      .select('-embedding') // Exclude embedding from list
      .lean();

    res.json(entries);
  } catch (error) {
    console.error('List entries error:', error);
    res.status(500).json({ error: 'Server error fetching entries' });
  }
});

// GET /api/journal/:id - Get single entry
router.get('/:id', async (req, res) => {
  try {
    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const entryObj = entry.toObject();
    entryObj.embedding = entryObj.embedding.length > 0 ? '[embedding stored]' : [];

    res.json(entryObj);
  } catch (error) {
    console.error('Get entry error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.status(500).json({ error: 'Server error fetching entry' });
  }
});

// PUT /api/journal/:id - Update entry
router.put('/:id', async (req, res) => {
  try {
    const { title, markdown, date, tags } = req.body;

    // Find entry and verify ownership
    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Update fields
    if (title !== undefined) entry.title = title;
    if (date !== undefined) entry.date = new Date(date);
    if (tags !== undefined) entry.tags = tags;

    // If markdown changed, re-parse
    if (markdown !== undefined) {
      entry.rawMarkdown = markdown;
      const { plainText, sections } = parseMarkdown(markdown);
      entry.plainText = plainText;
      entry.sections = sections;
      // Re-generate embedding
      entry.embedding = generatePlaceholderEmbedding(plainText);
    }

    await entry.save();

    const entryObj = entry.toObject();
    entryObj.embedding = entryObj.embedding.length > 0 ? '[embedding stored]' : [];

    res.json(entryObj);
  } catch (error) {
    console.error('Update entry error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.status(500).json({ error: 'Server error updating entry' });
  }
});

// DELETE /api/journal/:id - Delete entry
router.delete('/:id', async (req, res) => {
  try {
    const entry = await JournalEntry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ message: 'Entry deleted successfully' });
  } catch (error) {
    console.error('Delete entry error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.status(500).json({ error: 'Server error deleting entry' });
  }
});

module.exports = router;

