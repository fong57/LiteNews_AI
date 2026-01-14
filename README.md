# AI Journal – MERN Backend (v0)

A simple journaling web app backend built with the MERN stack.  
Users can authenticate, create journal entries in semi‑structured markdown, and store parsed text plus vector embeddings in MongoDB Atlas for future AI querying and a coaching chatbot.

---

## 1. Project Overview

This project is the backend API for an AI‑ready journaling app:

- Tech stack:
  - **Node.js + Express** for the REST API server.
  - **MongoDB Atlas (M0 free tier)** for cloud database.
  - **Mongoose** for object modeling.
  - **JWT‑based auth** for user login/registration.
  - **Markdown parsing** on the server to extract plain text and sections.
  - **Embeddings field** stored with each journal entry to support future vector search.

The frontend (React) will consume this API but is not included in this documentation.

---

## 2. Features (current scope)

- User registration and login with JWT.
- Protected journal APIs (each user only sees their own entries).
- Create, read, update, delete journal entries.
- Accept journal content as markdown and:
  - Store raw markdown.
  - Store derived plain text.
  - Store basic sections parsed from headings.
- Store an embedding field placeholder for each entry (ready to plug into an embedding API).

---

## 3. Project Structure

Approximate directory layout:

```text
ai-journal-server/
├─ server.js
├─ .env
├─ package.json
├─ models/
│  ├─ User.js
│  └─ JournalEntry.js
├─ routes/
│  ├─ auth.js
│  └─ journal.js
├─ middleware/
│  └─ auth.js
└─ ...
