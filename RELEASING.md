# Releasing Rica BizTrack

How to publish a new version so shops get it automatically.

---

## One-time setup

### 1. Create the update signing key

Updates are signed so that shops only install updates that really come from you.

```bash
npx tauri signer generate -w ~/.tauri/rica-biztrack.key
```

Choose a password when asked. This creates two files:

| File | What to do |
|------|------------|
| `rica-biztrack.key` | **Private. Never commit it, never share it.** Keep a backup (e.g. a password manager). If you lose it, existing installs can never update again. |
| `rica-biztrack.key.pub` | Public. Paste its content into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` (replace `REPLACE_WITH_THE_CONTENT_OF_rica-biztrack.key.pub`), then commit. |

### 2. Add the GitHub secrets

GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | the full content of `rica-biztrack.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you chose |

### 3. Keep the repository public (or host the update file elsewhere)

The app downloads `latest.json` from
`https://github.com/Ricardo-Tesla/rica-bztrack/releases/latest/download/latest.json`.
This only works if the repository (or at least its releases) is public. If you make
the repository private, host the release files somewhere public and change
`plugins.updater.endpoints` in `tauri.conf.json`.

---

## Every release

1. Update the version number in **both** files (same number, e.g. `1.0.1`):
   - `src-tauri/tauri.conf.json` → `"version"`
   - `package.json` → `"version"`
2. Run the tests: `npm run test:run` and `cd src-tauri && cargo test --lib`.
3. Commit, then tag and push:
   ```bash
   git commit -am "Release 1.0.1"
   git tag v1.0.1
   git push && git push origin v1.0.1
   ```
4. GitHub Actions (**Release** workflow) builds the Windows installer and creates a
   **draft** release with `latest.json`.
5. Open GitHub → **Releases**, write what changed, and click **Publish release**.

Owners see *"Version 1.0.1 is available"* the next time they open the app online.

> Version numbers must always go **up** (1.0.0 → 1.0.1 → 1.1.0). The updater
> ignores versions that are not newer.

---

## Database changes

Never edit an existing migration in `src-tauri/src/database.rs` — shops already
have it applied and the app would refuse to start. Always **add a new migration**
with the next version number, and add a test in `src/tests/integration/` that
upgrades an old database (see *"Upgrading an existing shop"* in `auth.test.js`).

---

## Offline installer

The normal installer is small and uses Windows' built-in WebView2 (present on
Windows 11 and updated Windows 10). For PCs that never had internet, build the
offline installer, which includes WebView2 (~130 MB):

```bash
npm run tauri build -- --config src-tauri/tauri.offline.conf.json
```

---

## Windows "unknown publisher" warning (SmartScreen)

Unsigned installers show *"Windows protected your PC"*. Users can click
**More info → Run anyway**. To remove the warning, buy a code-signing certificate
(OV or EV) and set `bundle.windows.certificateThumbprint` in `tauri.conf.json`
(or sign in the GitHub workflow). EV certificates remove the warning immediately;
OV certificates build reputation over time.

---

## Translations

All texts are in English in the code (`t('Complete Sale')`). Translations live in
`src/i18n/rw.js` and `src/i18n/fr.js`. The test `src/tests/unit/i18n.test.js`
fails and lists any missing text, so a release can never ship half-translated.

**Before the first release, have a native Kinyarwanda speaker review `rw.js`.**
