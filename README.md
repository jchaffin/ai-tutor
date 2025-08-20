# AI Tutor

An AI-powered tutoring application built with Next.js, Prisma, and OpenAI.

## Local Development Setup

### Prerequisites
- Node.js 20.x
- Docker and Docker Compose
- npm or yarn

### Database Setup

1. **Start the local PostgreSQL database:**
   ```bash
   npm run db:up
   ```

2. **Set up your environment variables:**
   ```bash
   cp env.local.example .env.local
   # Edit .env.local with your actual values
   ```

3. **Push the database schema:**
   ```bash
   npm run db:push
   ```

4. **Seed the database (optional):**
   ```bash
   npm run db:seed
   ```

### Development Commands

- **Start development server:** `npm run dev`
- **Start database:** `npm run db:up`
- **Stop database:** `npm run db:down`
- **Reset database:** `npm run db:reset`
- **Open Prisma Studio:** `npm run db:studio`
- **Push schema changes:** `npm run db:push`

### Database Management

The project uses PostgreSQL with Docker for local development. The database will be available at `localhost:5432` with:
- Database: `ai_tutor`
- Username: `postgres`
- Password: `postgres`

## Features

- AI-powered tutoring with document analysis
- PDF document upload and processing
- Real-time chat interface
- User authentication with NextAuth.js
- Document highlighting and annotations

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** NextAuth.js
- **AI:** OpenAI API
- **PDF Processing:** PDF.js, pdf-parse
