# Guidance Coach voice update

## Put the update live

1. Extract `guidance-coach-voice-update.zip`.
2. Open the `guidance-coach` folder inside it.
3. Open https://github.com/5tb7gtnj5y-lgtm/guidance-coach/upload/main .
4. Drag the contents of the extracted folder into the upload area. Upload the files and folders, not the ZIP or its outer `guidance-coach` folder.
5. Commit the changes to `main`. Cloudflare's connected build will deploy them using the existing `npm run build` and `npm run deploy` settings.
6. When the Cloudflare build succeeds, refresh https://guidance-coach.kmvbcbwmw2.workers.dev/ .

The update can also be committed directly through the connected GitHub app. Repository access was enabled on 4 October 2026. Cloudflare deploys commits to `main` using the existing build settings.

## Use voice

- **Read reply** reads the coach's latest explanation and question.
- **Read section** reads the selected guidance section.
- **Stop reading** immediately cancels playback.
- **Read replies aloud automatically** reads new successful coach replies. Restored conversation history is not replayed.
- **Voice** lets you choose a voice installed in your browser/device; British English is preferred automatically.
- **Talk** starts one microphone turn. Allow microphone access if requested.
- **Stop listening** finishes the turn. Review or edit the text in the answer box, then press Send. Dictation never sends by itself.

The microphone runs only after pressing Talk, for at most 60 seconds per turn. Starting dictation stops reading so the coach's audio is not captured as an answer. Switching guidance, opening Admin, changing the source section, restarting, signing out, hiding or leaving the page cancels audio.

Speech recognition and voices depend on browser/device support and policies. The app shows an explanation when speech is unavailable or permission is denied, and typing remains available. Your browser's speech service may process audio; this app does not upload or store audio recordings.

## Saved code version

`guidance-coach-working-before-voice-2026-10-04.zip` contains the code downloaded from GitHub before any voice changes, at commit `801a3ae9893fb23274b0b8820c7233eb6755a507`.

A permanent GitHub backup branch is also available: https://github.com/5tb7gtnj5y-lgtm/guidance-coach/tree/backup/working-before-voice-2026-10-04 .

To restore that code, extract its `guidance-coach` folder and replace the matching repository files, then remove the new `src/lib/voice.js`, `src/lib/voice.d.ts`, `src/lib/useVoice.ts`, `tests/voice.test.mjs`, and this document. Commit and deploy. Keep the existing Cloudflare database, bucket, and runtime secrets.

This is a code backup. Cloudflare passwords, uploaded files and database data remain in Cloudflare and are not included in it. The voice update does not change database schemas, stored guidance or sign-in settings.

## Validation

- TypeScript check passed.
- Production build passed.
- All 26 tests passed, including the existing application flow and 14 speech-controller tests.
- React DOM interaction checks with mock browser speech passed: reviewed dictation, no automatic sending, automatic reading of new replies, permission fallback, section reading, and cancellation on Admin/sign-out.
- Cloudflare Wrangler deployment dry-run passed against the existing bindings.
- Physical microphone and speaker playback were not tested. A full browser runner was unavailable in the execution environment.
