# School Manager - Starter Project

This is a starter full-stack School/University Management application (minimal, ready to extend).

**Important:** DO NOT commit real credentials. The project includes `.env.example` — fill your own `MONGO_URI`, `JWT_SECRET`, etc.

## What is included
- `backend/` - Node.js + Express + Mongoose starter with auth and basic CRUD routes.
- `frontend/` - Single-page app (vanilla JS) with responsive layout, hamburger menu and pages for Dashboard, Students, Teachers, Classes, Subjects, Parents, Payments, Exams, Quizzes, Reports, Notices, About, User Management, Vote, Login, Register.
- `seed.js` - simple script to seed admin and manager user (for local dev).
- `.env.example` - example environment variables.

## How to run (local)
1. Install MongoDB Atlas or local MongoDB and get `MONGO_URI`.
2. Backend:
   - `cd backend`
   - `npm install`
   - create `.env` from `.env.example` and set `MONGO_URI`, `JWT_SECRET`, `PORT` (default 5000)
   - `npm run dev` (uses nodemon) or `npm start`
3. Frontend:
   - Serve `frontend/index.html` (open in browser or use `npx serve frontend`)

## Deployment
- Frontend: Netlify (drag & drop `frontend` folder or use GitHub).
- Backend: Render, Heroku, or any Node host. Set env vars on host.

## Notes & Security
- You provided Atlas credentials in the conversation. **For security, this project does NOT include them.** Please update `.env` yourself.
- This is a starter scaffold. Extend controllers, validation, error handling, and UX as needed.
