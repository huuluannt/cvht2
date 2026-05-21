# CVHT2

CVHT2 is a standalone Vite + React + TypeScript web app for the academic-advisor chatbot of Khoa Sinh học - CNSH, Trường Đại học Khoa học tự nhiên, ĐHQG-HCM.

The chatbot answers only from uploaded advisor documents. If no relevant document chunk is found, it returns exactly:

```text
Tôi không tìm thấy thông tin này trong dữ liệu CVHT hiện có.
```

## Features

- Modern responsive chat UI with the initial CVHT greeting.
- Normal users choose Gemini or Groq and store their own API key only in browser `localStorage`.
- API key guide modal for Gemini and Groq.
- Google OAuth admin login.
- Admin allow-list through `ADMIN_EMAILS`.
- Admin uses server-side Gemini/Groq API keys from environment variables.
- Upload, list, delete, and re-index `.txt`, `.md`, `.pdf`, and `.docx` files up to 4 MB per request.
- Server-side text extraction, 500-1000 token chunking with overlap, JSON chunk storage, and keyword retrieval.
- Per-IP in-memory rate limiting, max question length, max context length, and clear API errors.

## Important Security Notes

- Do not commit real API keys. `.env.example` intentionally contains placeholders.
- User API keys are read from browser `localStorage` and sent only per chat request. They are not written to server storage, logs, cookies, or sessions.
- Server-side API keys are used only for authenticated admins and are never sent to the frontend.
- Rotate any API keys that were pasted into chat, tickets, screenshots, or commits.

## Environment Variables

Copy `.env.example` to `.env.local` for local work:

```bash
cp .env.example .env.local
```

Required variables:

```bash
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://cvht.vercel.app/api/auth/google/callback
ADMIN_EMAILS=huuluannt@gmail.com
SESSION_SECRET=
MAX_QUESTION_LENGTH=1200
MAX_CONTEXT_LENGTH=12000
CVHT_DATA_DIR=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CVHT_REDIS_STORE_KEY=cvht:store:v1
CVHT_REDIS_FILE_PREFIX=cvht:file:
CVHT_ALLOW_EPHEMERAL_STORAGE=false
```

Use a long random value for `SESSION_SECRET`, for example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Local Setup

Install dependencies:

```bash
npm install
```

Run only the Vite frontend:

```bash
npm run dev
```

Run the full app with Vercel serverless APIs:

```bash
npm run dev:vercel
```

Then open the local URL printed by Vercel CLI. Use this mode when testing chat, upload, Google OAuth callbacks, or admin APIs.

## Google OAuth Setup

1. Open Google Cloud Console.
2. Create or select a project.
3. Configure OAuth consent screen.
4. Create OAuth Client ID with application type `Web application`.
5. Add authorized redirect URI:

```text
https://cvht.vercel.app/api/auth/google/callback
```

For local testing, also add the local callback printed by `vercel dev`, usually:

```text
http://localhost:3000/api/auth/google/callback
```

6. Put the client id and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
7. Set `ADMIN_EMAILS` to comma-separated allowed admin emails.

## Iframe Embedding

CVHT2 opens Google admin login in a popup instead of navigating inside the iframe. Google blocks OAuth pages inside iframes, so embedded pages must use the popup flow.

If the parent page uses an iframe `sandbox` attribute, include popup permissions:

```html
<iframe
  src="https://cvht.vercel.app"
  sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
></iframe>
```

Production auth cookies are set with `SameSite=None; Secure` so the admin session can be sent while CVHT2 is embedded on another domain.

## Admin Login Troubleshooting

If `/api/auth/google/start` or `/api/auth/google/callback` shows a Vercel `FUNCTION_INVOCATION_FAILED` page, check these production environment variables first:

```bash
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
SESSION_SECRET
ADMIN_EMAILS
```

`SESSION_SECRET` must be set before OAuth starts and must stay stable between the start and callback requests. After changing Vercel environment variables, redeploy the project.

If Vercel logs show `ERR_MODULE_NOT_FOUND` for an `/api/*` route, check serverless function imports. This project uses ESM (`"type": "module"`), so relative imports in `api/**/*.ts` should use runtime `.js` specifiers, for example:

```ts
import { readSession } from "../_lib/auth.js";
```

## Vercel Deployment

1. Push the project to a Git provider.
2. Import the repository in Vercel.
3. Set production domain to:

```text
https://cvht.vercel.app/
```

4. Add all environment variables from `.env.example` in Vercel Project Settings.
5. Keep the production Google OAuth redirect URI exactly:

```text
https://cvht.vercel.app/api/auth/google/callback
```

6. Deploy.

## Storage Model

The storage adapter writes uploaded files and chunk JSON server-side:

- Local dev: `.cvht-data/`
- Vercel production: Upstash Redis through `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

Production needs shared storage because each Vercel serverless API route can run in a separate function instance. Do not rely on `/tmp` for uploaded RAG documents in production: `/api/admin/files` may see the uploaded chunks while `/api/chat` reads an empty store from another function instance.

To deploy production RAG:

1. Create an Upstash Redis database from Vercel Marketplace or Upstash.
2. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel Project Settings.
3. Redeploy.
4. Upload documents again from the admin panel.

`CVHT_ALLOW_EPHEMERAL_STORAGE=true` exists only for temporary demos. It can make uploaded files disappear after cold starts or across function instances.

Vercel Functions have a 4.5 MB request payload limit, so the app intentionally caps upload requests at 4 MB. Larger production uploads should use direct-to-storage upload.

## RAG Flow

1. Admin uploads supported files.
2. Server extracts text with UTF-8, `pdf-parse`, or `mammoth`.
3. Text is split into overlapping chunks.
4. Chunks are stored with `document_id`, `file_name`, `chunk_id`, `text`, and `created_at`.
5. Chat requests retrieve top keyword-matched chunks.
6. If no chunk is relevant, the exact fallback answer is returned without calling an LLM.
7. If chunks are found, the selected provider answers with the required CVHT system instruction.
8. The server appends a `Nguồn dữ liệu` section containing only the file names and chunk ids actually used.

## Scripts

```bash
npm run dev
npm run dev:vercel
npm run build
npm run lint
npm run preview
```
