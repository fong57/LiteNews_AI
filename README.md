# LiteNews AI

An AI-powered news aggregation and recommendation system that fetches news from multiple sources (RSS, websites), categorizes them using AI, groups related articles into topics, and provides personalized recommendations based on user preferences.

## 🎯 Project Overview

LiteNews AI is a full-stack application that:
- **Aggregates** news from RSS feeds and websites
- **Categorizes** articles using AI/LLM (Ollama or mock mode)
- **Groups** related articles into intelligent topics
- **Ranks** topics by relevance and user preferences
- **Personalizes** content based on user feedback and preferences

## ✨ Features

### Core Functionality
- **Multi-source News Fetching**: Fetch from RSS feeds and websites
- **AI-powered Categorization**: Automatically categorize news articles using LLM
- **Topic Grouping**: Group related articles into coherent topics with AI-generated summaries
- **Smart Ranking**: Rank topics by discussion score, recency, and user preferences
- **User Preferences**: Customize news sources, categories, and timeframes
- **Feedback System**: Like/dislike topics to improve recommendations
- **Timeframe Filtering**: View news from last 24 hours, 7 days, or 30 days

### Technical Features
- JWT-based authentication
- RESTful API with rate limiting
- MongoDB Atlas integration
- Responsive React frontend (CDN-based, no build step)
- Mock LLM mode for testing without Ollama
- Real-time news processing

## 🛠️ Tech Stack

### Backend
- **Node.js** + **Express** - REST API server
- **MongoDB Atlas** - Cloud database
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication
- **RSS Parser** - RSS feed parsing
- **Cheerio** - Web scraping
- **Axios** - HTTP client
- **Ollama** (optional) - Local LLM for AI features

### Frontend
- **React 18** (via CDN) - UI framework
- **Babel Standalone** - JSX transpilation
- **Modern CSS** - Responsive design

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account (or local MongoDB)
- (Optional) Ollama installed and running for AI features

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

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   - `MONGODB_URI` - Your MongoDB connection string
   - `JWT_SECRET` - Secret key for JWT tokens
   - `PORT` - Server port (default: 4250)
   - `OLLAMA_BASE_URL` - Ollama server URL (if using)
   - `USE_MOCK_LLM` - Set to `true` to use mock mode

4. **Create admin user**
   
   **Option A: Direct database creation (Recommended)**
   ```bash
   npm run create-admin
   ```
   This connects to MongoDB and creates the admin user directly.
   
   **Option B: Generate JSON and import via MongoDB Compass**
   ```bash
   npm run generate-admin-json
   ```
   This creates `admin-user.json` in the project root. Then import it manually via MongoDB Compass.
   
   **Option C: Reset database with admin user**
   ```bash
   npm run reset-db -- --with-admin
   ```
   This clears all data and creates the admin user in one step.
   
   **Default admin credentials:**
   - Username: `admin`
   - Password: `admin123`

5. **Start the server**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev_start
   ```

6. **Access the frontend**
   Open your browser to `http://localhost:4250`

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/litenews` |
| `JWT_SECRET` | Secret key for JWT tokens | Required |
| `PORT` | Server port | `4250` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model name | `llama3.2` |
| `USE_MOCK_LLM` | Force mock LLM mode | `false` |

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
- `PUT /api/preferences/categories` - Update categories (protected)
- `PUT /api/preferences/timeframe` - Update default timeframe (protected)

### News
- `POST /api/news/fetch` - Fetch news from configured sources (protected)
- `GET /api/news/items` - Get news items (protected)
- `POST /api/news/process` - Process news into topics (protected)

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
│   ├── NewsItem.js          # News article model
│   ├── Topic.js             # Topic model
│   └── FeedSource.js        # Feed source model
│
├── routes/                   # Express routes
│   ├── auth.js              # Authentication routes
│   ├── user.js              # User management routes
│   ├── preferences.js       # User preferences routes
│   ├── news.js              # News fetching/processing routes
│   └── topics.js            # Topic routes
│
├── services/                 # Business logic
│   ├── newsFetcher.js       # RSS/web scraping service
│   ├── topicGrouper.js      # Topic grouping service
│   ├── rankingService.js    # Topic ranking service
│   └── llmService.js        # LLM/AI service (Ollama or mock)
│
├── middleware/               # Express middleware
│   └── auth.js              # JWT authentication middleware
│
├── utils/                    # Utility functions
│   └── userHelper.js        # User lookup helper
│
├── public/                   # Static files
│   ├── index.html           # React frontend (single-page app)
│   └── style.css            # Legacy styles (not used)
│
├── scripts/                  # Utility scripts
│   ├── add-user.js          # User creation script
│   ├── test-db.js           # Database test script
│   ├── reset-db.js          # Database reset script
│   ├── create-admin.js      # Create admin user directly in database
│   └── generate-admin-json.js # Generate admin user JSON for import
│
├── admin-user.json          # Admin user JSON (generated, for MongoDB Compass import)
└── admin-user-single.json   # Alternative single-document format
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

1. **Setup**: Create admin user and configure preferences
2. **Fetch**: Click "Fetch News" to retrieve articles from sources
3. **Process**: Click "Process Topics" to categorize and group articles
4. **Browse**: View topics by category, read articles, provide feedback
5. **Personalize**: System learns from your feedback to improve rankings

## 🧪 Development

### Running in Development Mode
```bash
npm run dev_start
```
Uses `nodemon` for auto-reload on file changes.

### Mock LLM Mode
Set `USE_MOCK_LLM=true` in `.env` to use mock AI responses without Ollama. Useful for:
- Testing without LLM setup
- Development without GPU
- Faster iteration

### Database Scripts
```bash
# Test database connection
node scripts/test-db.js

# Create admin user directly in database
npm run create-admin

# Generate admin user JSON for MongoDB Compass import
npm run generate-admin-json

# Reset database (clears all data and recreates indexes)
npm run reset-db

# Reset database AND create admin user in one step
npm run reset-db -- --with-admin
# or with force flag (no confirmation prompt)
npm run reset-db -- --force --with-admin
```

## 🔒 Security

- JWT-based authentication
- Rate limiting on API endpoints (100 requests per 15 minutes)
- CORS configuration
- Input validation
- Protected routes with middleware

## 📝 Notes

- The system uses a single "admin" user identified by name (not ObjectId)
- News items are deduplicated by URL
- Topics are ranked by discussion score, recency, and user preferences
- Feedback (likes/dislikes) affects future topic rankings
- Mock LLM mode provides basic keyword-based categorization

## 🐛 Troubleshooting

### MongoDB Connection Issues
- Check your `MONGODB_URI` in `.env`
- Ensure IP is whitelisted in MongoDB Atlas
- Verify SSL/TLS settings

### "User not found" Errors
- Make sure admin user exists: Generate and import `admin-user.json` via MongoDB Compass
- Run `npm run generate-admin-json` to create the JSON file
- Check JWT token is valid and not expired

### LLM Errors
- If using Ollama, ensure it's running: `ollama serve`
- Use mock mode for testing: `USE_MOCK_LLM=true`

### Frontend Not Loading
- Check server is running on correct port
- Verify static files are being served from `public/` directory

## 📄 License

ISC

## 👤 Author

LiteNews AI Development Team

---

**Happy News Reading! 📰**
