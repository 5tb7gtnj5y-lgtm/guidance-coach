# Guidance Coach

A guidance learning site with an AI coach. Administrators upload and publish guidance; learners work through its sections, ask questions, practise applying it, and see exact source quotations beside the coach's replies.

**Start with [INSTALLATION.md](INSTALLATION.md).** It explains how to upload this project to GitHub and deploy it on Cloudflare.

## Included

- Responsive React workspace and separate administrator / learner sign-in.
- PDF, Word `.docx`, text and Markdown upload, with editable extracted text before publishing.
- Drafts, publishing, version changes, original-file downloads and deletion.
- Section-by-section coaching, questions, practice examples and saved walkthroughs.
- Beginner, Intermediate and Advanced levels, scored practice answers and saved progress.
- An admin progress report using anonymous learner browser references.
- A focused learning screen with one guidance picker and the current coaching reply. Source guidance, conversation history, extra help and voice settings open when needed. Dictated answers are reviewed before sending; unsent answers must be sent or cleared before moving to the next step.
- Cloudflare Workers AI, D1 database, private R2 file storage and static assets.
- Database migrations, deployment scripts, pinned dependencies and GitHub build checks.

This is an independent deployment of the site. Uploads and chat history from another installation are not copied into this project. A fictional sample guide is included.

## Development

Use Node.js 22.13 or newer.

```sh
npm ci
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your local admin password and learner code. Keep it out of GitHub. Then:

```sh
npm run db:local
npm run dev
```

Open the localhost address printed by Wrangler. Local database and uploads stay local. Workers AI uses Cloudflare's remote AI service, so coaching requires a Cloudflare account, `npx wrangler login`, and available AI allowance. You can use the admin tools locally before connecting AI.

## Checks

```sh
npm run check
npm test
```

Tests run the actual bundled Worker in Cloudflare's local runtime with local D1 and R2. AI is replaced with a controlled test service: tests verify access control, publishing, uploads/downloads, persistent sessions, level isolation, scoring, duplicate and concurrent submissions, restricted progress reports, rejected fabricated quotations, guidance version changes and logout. They do not spend AI allowance or deploy to Cloudflare.

## Architecture

| Part | Files / binding |
| --- | --- |
| React frontend | `src/App.tsx`, `src/components/Workspace.tsx` |
| Text extraction | `src/lib/extract.ts` |
| Worker entrypoint and security headers | `src/worker.ts` |
| Cookie sessions and role checks | `src/auth.ts` |
| Uploads, guidance and coaching API | `src/lib/server.ts` |
| Section extraction, retrieval and quote validation | `src/lib/guidance.ts` |
| Learning levels, scoring and progress summaries | `src/lib/progress.ts`, `src/components/LearningProgress.tsx` |
| Database | `DB` binding, `migrations/` |
| Original uploaded files | `BUCKET` binding |
| AI inference | `AI` binding |
| Static frontend | `ASSETS` binding |

The model is set through `AI_MODEL` in `wrangler.jsonc`. Coaching retrieves up to six relevant source sections and recent conversation context. Responses must contain at least one quotation from a supplied section. Matching tolerates whitespace and straight/curly quotation marks, then restores the original source substring for display and highlighting. Changed words, numbers and incorrect section IDs remain rejected. A failed check triggers one fresh AI generation with guidance on quoting accurately. If both checks fail, the coach displays a clearly labelled source excerpt instead of the unverified explanation. Only the final response enters the saved conversation. Connection or allowance failures are not retried. This validates quotations; it does not independently verify every sentence of a model's explanation.

## Access and progress

The owner sets one admin password and a separate shared learner access code. Learners cannot edit guidance or open drafts. Sign-in sessions use HttpOnly cookies and hashed session tokens in D1. Changing a password or access code invalidates the corresponding sign-in sessions.

Learner progress belongs to that browser, identified by a cookie. Signing out keeps the browser identity so signing back in restores progress. Clearing cookies or changing devices creates a new learner identity. Admin can review scores under **Learner progress**, using anonymous browser references. This version does not include named user accounts or reporting by employee. Administrator sessions share the administrator identity.

## Learning levels and scores

Choose a guide and a learning level. Each level has its own saved conversation and score record. Beginner uses explanations and simple questions; Intermediate uses practical situations; Advanced asks for reasoned decisions and supported exceptions. All levels use the uploaded guidance.

Answer a practice question using **Answer for a score**, then **Check answer**. **Ask a question** gives ordinary coaching without awarding marks. Accuracy, applying the guidance and explaining your decision each receive 0–4 points; the server calculates a percentage out of 12. A score of 70% or more passes that section. Moving on does not award marks. **My progress** shows passed steps, each step’s best score, the average of best scores for attempted steps, and recent attempts. Unattempted sections have no score.

Scores are AI practice feedback, not a qualification or formal competence assessment. Restarting a walkthrough keeps scores; changing the guidance text creates a fresh record for its new version. Earlier version scores remain stored, but current progress and the admin report show only the current version. Deleting a guide deletes its conversations and scores. Failed source checks or AI errors do not save a score.

Migration `0003_learning_progress.sql` adds levels to existing sessions and creates the assessment history. Existing sessions become Beginner. `npm run deploy` applies all migrations before deploying.

## Limits

Up to 100 guides, 10 MB per upload, 200 pages per PDF, 240,000 characters and 180 extracted sections per guide. Scanned PDFs need readable text or pasted guidance; OCR is not included. A coaching session stores up to 120 messages. Editing source text increments its version and restarts existing walkthroughs when reopened.

Cloudflare usage and AI allowances apply. No OpenAI API key is required. See the official [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) pages for current account allowances and charges.
