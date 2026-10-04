# Put Guidance Coach on GitHub and Cloudflare

You will create a new Cloudflare Worker called **guidance-coach**. This package contains the source and setup files; it has not created resources or passwords in your Cloudflare account.

You need GitHub and Cloudflare accounts. The AI runs through Cloudflare Workers AI, without an OpenAI API key. Cloudflare's usage allowances apply, and R2 storage must be activated in your account.

## 1. Extract the ZIP

Unzip `guidance-coach-cloudflare.zip` and open the `guidance-coach` folder. You should see `package.json`, `wrangler.jsonc`, `src`, `migrations`, `scripts` and this guide.

## 2. Create the two Cloudflare resources

In the Cloudflare dashboard, use the same account for everything below.

1. Open **Storage & databases → D1** and create a database named `guidance-coach-db`.
2. Copy its **Database ID**.
3. Open the extracted `wrangler.jsonc` in a text editor. Replace only `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the copied ID. Keep the surrounding double quotes and save the file.
4. Open **Storage & databases → R2 → Overview**. Activate R2 if prompted, then create a bucket named `guidance-coach-files`. Keep its public access disabled.

The D1 ID is configuration, not a password. It can be committed to GitHub. Database tables will be created automatically by the deployment command.

R2 activation uses Cloudflare's checkout flow. Read its displayed terms and current allowances. [Official R2 getting-started guide](https://developers.cloudflare.com/r2/get-started/).

## 3. Upload the source to GitHub

1. On GitHub, create a new repository named `guidance-coach`. Choose **Private** if you want the source accessible only to you and authorised collaborators.
2. Use **uploading an existing file**, or **Add file → Upload files** if the repository already exists.
3. Upload the **contents** of the extracted `guidance-coach` folder, with `package.json` at the repository's top level. Do not upload the ZIP itself or add an extra enclosing folder.
4. Include `.github`, `.gitignore`, `.nvmrc` and `.dev.vars.example`. On macOS, press Command + Shift + . to show hidden files; on Windows, enable **View → Show → Hidden items**. Never upload a real `.dev.vars` or `.env` file.
5. Commit the files to the `main` branch.

GitHub Desktop is another way to publish the whole folder if browser uploads are awkward. The included GitHub workflow checks the build and local runtime tests on pushes and pull requests; it does not need any secrets.

## 4. Connect GitHub to Cloudflare Workers

1. Open **Workers & Pages → Create application** and choose the option to import a Git repository / connect GitHub.
2. Authorise Cloudflare to read your new repository and select `guidance-coach`.
3. Choose a **Worker** project and use these settings:

| Setting | Value |
| --- | --- |
| Worker / project name | `guidance-coach` |
| Production branch | `main` |
| Root directory | Repository root / leave blank |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Build environment variable | `NODE_VERSION` = `22` |

4. Choose a **build API token** with **Account → D1 → Edit** permission. The token also needs the standard Worker deployment and R2 permissions. If Cloudflare creates its default build token, go to **My Profile → API Tokens**, edit that token to add **D1 Edit** for this account, then return to the Worker. This extra permission allows the deployment command to create the database tables.
5. Start the deployment (or retry the first build after updating the token). Cloudflare installs the dependencies, builds the site, applies the D1 migrations, and publishes the Worker and its assets. Binding names and resources are declared in `wrangler.jsonc`.
6. Wait for a successful production deployment, then open its `workers.dev` URL.

The initial page will say it is waiting for setup until you set the passwords below. A default deploy command of `npx wrangler deploy` would skip the database migrations; use **`npm run deploy`**.

[Official Workers Builds configuration guide](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## 5. Add the two sign-in secrets

Open the deployed **guidance-coach** Worker, then **Settings → Variables and Secrets**. Add these as **Secrets**, using two different values:

| Secret name | Your value |
| --- | --- |
| `ADMIN_PASSWORD` | A strong admin password, at least 12 characters |
| `LEARNER_ACCESS_CODE` | A separate code for learners, at least 8 characters |

Save and deploy the secret changes when Cloudflare prompts you. Set these on the **Worker runtime**, not only under the build settings. Keep the admin password private; give learners the learner code.

You do not need to add an AI API key. The `AI` binding in the configuration calls Workers AI directly. The model is configured as `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

## 6. Check the site

1. Visit your Worker URL and sign in using the **Admin** tab and admin password.
2. Open Admin, upload a guide, review the extracted text, and save it as a draft.
3. Publish the guide.
4. Sign out, select the **Learner** tab, and enter the learner code.
5. Open the guide and ask the coach to explain the first section. Check the displayed source quotation, then refresh to confirm the conversation is saved.

Your Worker URL followed by `/api/health` should show `"status":"ready"`. It checks database tables, storage and AI bindings, and both password settings. It does not run a paid AI request or prove that allowance is available.

## Updating the site

Commit source changes to the connected `main` branch. Cloudflare builds and deploys them automatically. Existing guidance, uploads and conversations stay in D1 and R2. New database changes belong in a new migration file; keep already-applied migrations unchanged.

The deployment preserves runtime variables set in the dashboard (`keep_vars` is enabled). If `ADMIN_PASSWORD` or `LEARNER_ACCESS_CODE` is also saved in Cloudflare's build environment, `npm run deploy` copies that value into an encrypted Worker runtime secret during deployment. Those build values override the corresponding runtime values on each deployment, so update both locations when changing a password, or remove the build copy and manage it only as a runtime secret. Password values are never committed or logged; the deployment removes its private temporary secret file afterwards.

Change either sign-in secret in Cloudflare whenever needed. Existing sessions for that role must sign in again. Learners keep their progress in the same browser unless they clear its cookies.

## Optional: deploy from your computer

Use Node.js 22.13 or newer. In a terminal inside the extracted project folder:

```sh
npm ci
npx wrangler login
npm run cf:setup
npm run deploy
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put LEARNER_ACCESS_CODE
```

Enter the two secret values when prompted. They are not written into the repository. Enable R2 in the dashboard before running `cf:setup`. That script creates or reuses the named D1 database and R2 bucket and writes your D1 ID into `wrangler.jsonc`. Commit that configuration before connecting GitHub automatic deployments.

If you have multiple Cloudflare accounts, set `CLOUDFLARE_ACCOUNT_ID` in your terminal or select the intended account when Wrangler asks. Use the same account for the database, bucket and Worker.

## If something needs fixing

| Message / symptom | Fix |
| --- | --- |
| “Add your real D1 database ID” | Replace the placeholder in `wrangler.jsonc` with your D1 Database ID and commit the change. |
| Database migration permission error | In the Worker build settings, use a Cloudflare build API token with D1 Edit permission for this account, alongside Worker deployment and R2 access permissions. |
| R2 bucket is missing / R2 is disabled | Activate R2 and create `guidance-coach-files` in the same account as the Worker. |
| Sign-in page is waiting for setup | Add both runtime secrets with the exact names and minimum lengths above, then deploy the secret changes. |
| “The AI allowance or rate limit has been reached” | Wait for allowance to reset or review your Cloudflare AI plan and usage. Saved progress is retained. |
| AI connection is missing | Check the Worker has the `AI` Workers AI binding declared in `wrangler.jsonc`. |
| A PDF has no readable text | Use a text-based PDF, a Word document, or paste the guidance text into the editor. |
| Worker name mismatch | Use `guidance-coach` for both the Cloudflare project and the `name` in `wrangler.jsonc`. |

The supported target is **Cloudflare Workers with static assets**. Use the Worker Git integration for this package.
