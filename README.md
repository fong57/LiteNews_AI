# LiteNews AI

An AI-powered news aggregation and recommendation system that fetches news from multiple sources (RSS, websites), uses **semantic embeddings** for intelligent clustering, categorizes topics using AI, and provides personalized recommendations based on user preferences.

## 🎯 Project Overview

LiteNews AI is a full-stack application that:
- **Aggregates** news from RSS feeds and websites
- **Embeds** articles using Sentence-BERT for semantic understanding
- **Clusters** related articles using vector similarity (MongoDB Atlas Vector Search)
- **Categorizes** topics (not individual items) using AI/LLM
- **Ranks** topics by relevance and user preferences
- **Personalizes** content based on user feedback and preferences

## ✨ Features

### Core Functionality
- **Multi-source News Fetching**: Fetch from RSS feeds and websites
- **Semantic Embeddings**: Generate 384-dimensional embeddings using Sentence-BERT
- **Vector-based Clustering**: Group related articles using cosine similarity
- **AI-powered Topic Categorization**: Categorize topics using LLM (Perplexity or mock mode)
- **Smart Ranking**: Rank topics by discussion score, recency, and user preferences
- **User Preferences**: Customize news sources, categories, and timeframes
- **Feedback System**: Like/dislike topics to improve recommendations
- **Timeframe Filtering**: View news from last 24 hours, 7 days, or 30 days

### Technical Features
- JWT-based authentication
- RESTful API with rate limiting
- MongoDB Atlas integration with Vector Search
- Sentence-BERT embeddings via @xenova/transformers
- Responsive React frontend (CDN-based, no build step)
- Mock LLM mode for testing without external APIs
- Real-time news processing

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express** - REST API server
- **MongoDB Atlas** - Cloud database with Vector Search (M10+)
- **Mongoose** - ODM for MongoDB
- **@xenova/transformers** - Sentence-BERT embeddings (all-MiniLM-L6-v2)
- **JWT** - Authentication
- **RSS Parser** - RSS feed parsing
- **Cheerio** - Web scraping
- **Axios** - HTTP client

### Frontend
- **React 18** (via CDN) - UI framework
- **Babel Standalone** - JSX transpilation
- **Modern CSS** - Responsive design

## 📋 Prerequisites

- Node.js (v18 or higher recommended)
- MongoDB Atlas M10+ cluster (for Vector Search support)
- (Optional) Perplexity API key for AI features

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd LiteNews_AI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   > Note: First run will download the Sentence-BERT model (~90MB) to `.cache/transformers/`

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   - `MONGODB_URI` - Your MongoDB Atlas connection string
   - `JWT_SECRET` - Secret key for JWT tokens
   - `PORT` - Server port (default: 4250)
   - `LLM_MODE` - AI provider: `perplexity` or `mock`
   - `PERPLEXITY_API_KEY` - Perplexity API key (if using)

4. **Initialize the database**
   
   **Option A: One-step full setup (Recommended)**
   ```bash
   npm run setup
   ```
   This resets the database and seeds all default data:
   - Creates admin user
   - Seeds default categories
   - Seeds default feed sources (RTHK RSS feeds)
   
   **Option B: Create admin user only**
   ```bash
   npm run create-admin
   ```

5. **Setup MongoDB Atlas Vector Search Index**
   ```bash
   npm run setup-vector-index
   ```
   This creates the required vector search index for semantic clustering.
   
   > If automatic setup fails, see [Manual Vector Index Setup](#manual-vector-index-setup) below.

6. **Start the server**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev_start
   ```

7. **Access the frontend**
   Open your browser to `http://localhost:4250`

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string | Required |
| `JWT_SECRET` | Secret key for JWT tokens | Required |
| `PORT` | Server port | `4250` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |
| `LLM_MODE` | LLM provider: `perplexity` or `mock` | `mock` |
| `PERPLEXITY_API_KEY` | Perplexity AI API key | Required if `LLM_MODE=perplexity` |
| `PERPLEXITY_MODEL` | Perplexity model name | `llama-3.1-sonar-small-128k-online` |
| `EMBEDDING_MODEL` | Sentence-BERT model | `Xenova/all-MiniLM-L6-v2` |
| `CLUSTERING_THRESHOLD` | Similarity threshold (0.0-1.0) | `0.65` |
| `MIN_CLUSTER_SIZE` | Minimum items per cluster | `1` |
| `MAX_CLUSTER_SIZE` | Maximum items per cluster | `20` |

### Setting Up News Sources

1. Login to the frontend
2. Click "Preferences" button
3. Add RSS feeds or website URLs
4. Set categories you're interested in
5. Configure default timeframe

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username and password (returns JWT token and user info)

### Users
- `GET /api/users/me` - Get current user info (protected)
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:userId` - Get user by ID (protected)
- `POST /api/users` - Create new user (admin only)
- `PUT /api/users/:userId` - Update user (admin or self)
- `DELETE /api/users/:userId` - Delete user (admin only)

### Preferences
- `GET /api/preferences` - Get user preferences (protected)
- `PUT /api/preferences/sources` - Update news sources (protected)
- `PUT /api/preferences/timeframe` - Update default timeframe (protected)
- `GET /api/preferences/categories/available` - Get available categories (protected, read-only)

### Categories (Admin Only)
- `GET /api/admin/categories` - Get all categories (admin only)
- `POST /api/admin/categories` - Create category (admin only)
- `PUT /api/admin/categories/:categoryId` - Update category (admin only)
- `DELETE /api/admin/categories/:categoryId` - Delete category (admin only)

### News
- `POST /api/news/fetch` - Fetch news from configured sources (protected)
- `GET /api/news/items` - Get news items, filter by `category` or `topicId` (protected)
- `POST /api/news/process` - Process news into topics via clustering (protected)

### Topics
- `GET /api/topics?category=<category>&limit=<limit>` - Get topics by category (protected)
- `POST /api/topics/:topicId/feedback` - Submit feedback (up/down) (protected)

### Health
- `GET /api/health` - Health check endpoint

## 📁 Project Structure

```
LiteNews_AI/
├── server.js                 # Main Express server
├── package.json              # Dependencies and scripts
├── .env                      # Environment variables (not in git)
├── .env.example             # Example environment file
│
├── models/                   # Mongoose models
│   ├── User.js              # User model with preferences
│   ├── NewsItem.js          # News article model (with embeddings)
│   ├── Topic.js             # Topic model (with category)
│   ├── FeedSource.js        # Feed source model
│   └── Category.js          # Category model
│
├── routes/                   # Express routes
│   ├── auth.js              # Authentication routes
│   ├── user.js              # User management routes
│   ├── preferences.js       # User preferences routes
│   ├── news.js              # News fetching/processing routes
│   ├── topics.js            # Topic routes
│   └── admin.js             # Admin routes (categories, sources)
│
├── services/                 # Business logic
│   ├── embedding/           # Semantic embedding service
│   │   └── index.js         # Sentence-BERT embeddings (@xenova/transformers)
│   ├── llm/                 # LLM provider system
│   │   ├── index.js         # Provider switch/router
│   │   └── providers/       # Individual LLM providers
│   │       ├── mock.js      # Keyword-based (no API needed)
│   │       └── perplexity.js # Perplexity AI API
│   ├── newsFetcher.js       # RSS/web scraping + embedding generation
│   ├── topicGrouper.js      # Vector clustering + topic categorization
│   └── rankingService.js    # Topic ranking service
│
├── middleware/               # Express middleware
│   └── auth.js              # JWT authentication middleware
│
├── utils/                    # Utility functions
│   └── userHelper.js        # User lookup helper
│
├── public/                   # Static files
│   └── index.html           # React frontend (single-page app)
│
├── scripts/                  # Utility scripts
│   ├── reset-db.js          # Database reset + seeding script
│   ├── create-admin.js      # Create admin user directly in database
│   ├── generate-admin-json.js # Generate admin user JSON for import
│   ├── init-feedsources.js  # Seed default feed sources
│   ├── setup-vector-index.js # Create MongoDB Atlas vector search index
│   └── test-perplexity.js   # Test Perplexity API connection
│
└── .cache/                   # Cache directory (auto-created)
    └── transformers/        # Downloaded Sentence-BERT model files
```

## 🎨 Frontend

The frontend is a single-page React application served from `public/index.html`. It includes:

- **Login Page**: Password-based authentication
- **Dashboard**: Main interface for news management
- **Topic Cards**: Display topics with summaries and news items
- **Preferences Modal**: Manage sources, categories, and settings
- **Feedback System**: Like/dislike topics
- **Category Filtering**: Filter topics by category

No build step required - React and Babel are loaded via CDN.

## 🔄 Workflow

1. **Setup**: Run `npm run setup` to initialize database with admin user and default data
2. **Vector Index**: Run `npm run setup-vector-index` to create the vector search index
3. **Configure**: Login and customize preferences (sources, categories, timeframe)
4. **Fetch**: Click "Fetch News" to retrieve articles and generate embeddings
5. **Process**: Click "Process Topics" to cluster articles and categorize topics
6. **Browse**: View topics by category, read articles, provide feedback
7. **Personalize**: System learns from your feedback to improve rankings

## 🧪 Development

### Running in Development Mode
```bash
npm run dev_start
```
Uses `nodemon` for auto-reload on file changes.

### LLM Provider Configuration

Set `LLM_MODE` in `.env` to choose your AI backend:

| Mode | Description | Requirements |
|------|-------------|--------------|
| `mock` | Keyword-based categorization (default) | None |
| `perplexity` | Perplexity AI API | `PERPLEXITY_API_KEY` |

**Example `.env` configuration:**
```bash
# Use Perplexity API
LLM_MODE=perplexity
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxx
PERPLEXITY_MODEL=llama-3.1-sonar-small-128k-online

# Or use mock mode (no AI, keyword-based)
LLM_MODE=mock

# Embedding configuration (optional)
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
CLUSTERING_THRESHOLD=0.65
```

**Perplexity Models:**
- `llama-3.1-sonar-small-128k-online` — Cheapest ($0.2/1M tokens)
- `llama-3.1-sonar-large-128k-online` — Better quality ($1/1M tokens)
- `llama-3.1-sonar-huge-128k-online` — Best quality ($5/1M tokens)

The system automatically falls back to mock mode if the configured provider is unavailable.

### NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev_start` | Start development server with auto-reload |
| `npm run setup` | **One-step full setup**: reset DB + admin + categories + feeds |
| `npm run setup-vector-index` | **Create MongoDB Atlas vector search index** |
| `npm run reset-db` | Reset database only (with confirmation prompt) |
| `npm run reset-db -- --force` | Reset database without confirmation |
| `npm run reset-db -- --with-admin` | Reset + create admin + seed categories + seed feeds |
| `npm run create-admin` | Create admin user only (if DB already has data) |
| `npm run generate-admin-json` | Generate admin JSON for MongoDB Compass import |
| `npm run init-feedsources` | Seed feed sources only (without reset) |
| `npm run init-feedsources -- --force` | Replace existing feed sources |
| `npm run test-perplexity` | Test Perplexity API connection |

**Quick Start:**
```bash
# Fresh installation - full setup
npm run setup
npm run setup-vector-index

# Start the server
npm run dev_start
```

## 🔍 Manual Vector Index Setup

If `npm run setup-vector-index` fails, create the index manually in MongoDB Atlas:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Select your cluster → **Search** → **Create Search Index**
3. Choose **JSON Editor**
4. Select your database and the `newsitems` collection
5. Set index name to: `news_embedding_index`
6. Paste this definition:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 384,
        "similarity": "cosine"
      },
      "topicId": {
        "type": "objectId"
      },
      "publishedAt": {
        "type": "date"
      }
    }
  }
}
```

7. Click **Create Search Index**
8. Wait for status to become **Active**

## 🔒 Security

- JWT-based authentication
- Rate limiting on API endpoints (100 requests per 15 minutes)
- CORS configuration
- Input validation
- Protected routes with middleware

## 📝 Architecture Notes

### News Processing Pipeline

```
1. Fetch News (newsFetcher.js)
   └── Parse RSS/scrape websites
   └── Generate Sentence-BERT embeddings (384 dimensions)
   └── Save to NewsItem collection

2. Cluster & Categorize (topicGrouper.js)
   └── Vector similarity clustering (MongoDB Atlas $vectorSearch)
   └── Fallback: Manual cosine similarity if Atlas unavailable
   └── Generate topic metadata (title, summary, tags) via LLM
   └── Categorize each topic (not individual items) via LLM
   └── Create Topic documents

3. Rank & Display (rankingService.js)
   └── Calculate discussion scores
   └── Apply user preference multipliers
   └── Return ranked topics by category
```

### Key Design Decisions

- **Topic-level categorization**: Categories are assigned to topics, not individual news items
- **Semantic clustering**: Uses vector embeddings instead of keyword matching for better grouping
- **Graceful fallbacks**: Manual clustering if Atlas Vector Search unavailable; mock LLM if API unavailable

## 🐛 Troubleshooting

### MongoDB Connection Issues
- Check your `MONGODB_URI` in `.env`
- Ensure IP is whitelisted in MongoDB Atlas
- Verify SSL/TLS settings

### Vector Search Not Working
- Ensure you're using MongoDB Atlas M10+ tier (Vector Search requires M10+)
- Run `npm run setup-vector-index` to create the index
- Check index status in Atlas UI (must be "Active")
- System will fallback to manual cosine similarity if unavailable

### Embedding Model Issues
- First run downloads ~90MB model to `.cache/transformers/`
- Ensure sufficient disk space
- Check Node.js version (v18+ recommended)

### "User not found" Errors
- Make sure admin user exists: Run `npm run setup` or `npm run create-admin`
- Check JWT token is valid and not expired

### LLM Errors
- If using Perplexity, verify API key is valid
- Use mock mode for testing: `LLM_MODE=mock`

### Frontend Not Loading
- Check server is running on correct port
- Verify static files are being served from `public/` directory

## 📄 License

ISC

## 👤 Author

LiteNews AI Development Team

---

**Happy News Reading! 📰**
