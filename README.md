AshishHub — Complete Starter App

This project includes the premium dark mobile-friendly frontend, server-side access-key generation/validation, and the Ashish AI chat backend.

## Requirements
- Node.js 18 or newer
- An OpenAI API key to enable real AI responses

## Run locally
1. Extract the ZIP.
2. Copy `.env.example` to `.env`.
3. Set a private `ADMIN_PIN` in `.env`.
4. Add your OpenAI API key to `OPENAI_API_KEY` in `.env` to activate Ashish AI.
5. In the project folder, run:
   ```bash
   npm install
   npm start
   ```
6. Open `http://localhost:3000`.

## Generate student keys
- Open the **Admin Key Generator** section in AshishHub.
- Enter the same `ADMIN_PIN` you set in `.env`.
- Generate and share the displayed key with a student.
- The student enters the key on the welcome screen.
- Keys are stored server-side as SHA-256 hashes in `keys.json`, not in browser storage.

## AI setup
The browser calls `/api/ai/chat`. The server calls the OpenAI API using `OPENAI_API_KEY`; the secret is never exposed to the browser. API usage may incur charges. Keep the key private and configure usage limits in your provider account.

## Deploy
Deploy this Node.js app to a host that supports persistent storage and environment variables. Configure `ADMIN_PIN` and `OPENAI_API_KEY` in the host's environment settings. If the host uses an ephemeral filesystem, replace `keys.json` storage with a managed database before production.

## Important
- `https://stream.aryavidya.cc/` and `https://vercel.app/` are included as requested. Confirm the second URL is the actual destination for your own hosted study portal; `vercel.app` is a hosting domain, not necessarily your deployed app URL.
- This is a starter app, not a full production security audit. Before public launch, add HTTPS, rate limiting, login/session management, database storage, backups, and abuse controls.
- Example resource links are placeholders. Replace them with your own legitimate notes/PDF URLs.
