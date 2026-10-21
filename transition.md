# Updating to the new version

Steps to move `broussardbrandt/FleetTracker` onto this branch. In short: the AIS feed and the GitHub Action are gone, and the page calls the internal positions API directly.

1. **Disable the bot.** Actions → "Update vessel positions" → `···` → **Disable workflow**.
   Do this first: it commits to `main` every 10 minutes and will conflict with the merge.

2. **Merge the branch into `main`.**
   If git flags `positions.json` (modified on `main`, deleted here), keep the deletion: `git rm positions.json`.

3. **Switch Pages to branch deploys.** Settings → Pages → Source: **Deploy from a branch** → `main`, `/ (root)`.
   The workflow used to deploy the site. Without this change, nothing publishes.

4. **Remove the AIS key.** Settings → Secrets and variables → Actions → delete `AISSTREAM_API_KEY`. Revoke it at aisstream.io if it's no longer needed.

5. **Check the site** at `https://broussardbrandt.github.io/FleetTracker/` and `/#embed`. It should show five vessels with recent positions. The WordPress embed URL doesn't change.

See `README.md` for how the new version is put together.
