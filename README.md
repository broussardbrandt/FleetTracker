# TDI-Brooks Fleet Tracker

A live map of the TDI-Brooks research vessels (RV Nautilus, RV Gyre, RV Proteus, RV Brooks McCall, RV Miss Emma McCall) built from AIS positions. It is published with GitHub Pages and is built to be embedded on tdi-bi.com.

## How it works

- `index.html` is the map. It reads `positions.json` when it opens and again every 5 minutes.
- A GitHub Action (`.github/workflows/update-positions.yml`) runs every 10 minutes. It listens to AISStream.io for 4 minutes, writes any new fixes into `positions.json`, commits them, and redeploys the site.
- A vessel out of receiver range keeps its last known position. The page marks a fix older than 6 hours "Aging" and older than 2 days "Stale".
- Clicking a ship opens its page on tdi-bi.com.

## One-time setup (about 10 minutes)

1. **Get an AIS key.** Sign up at https://aisstream.io (free) and copy your API key.
2. **Create the repository.** On GitHub, create a new **public** repository, for example `fleet-tracker`, and upload everything in this folder, including the hidden `.github` folder.
   - Public matters. Scheduled Actions are free and unlimited on public repos. On a private repo this schedule would use up the 2,000 free monthly minutes in a few days.
3. **Add the key as a secret.** Repository → Settings → Secrets and variables → Actions → New repository secret. Name: `AISSTREAM_API_KEY`. Value: your key.
4. **Turn on Pages.** Repository → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
5. **Run it once.** Actions tab → "Update vessel positions" → Run workflow. When it finishes, the site is live at `https://broussardbrandt.github.io/FleetTracker/`.

After that it updates on its own. If GitHub is busy, scheduled runs can start a few minutes late.

## Putting it on tdi-bi.com

Add a Custom HTML block to the WordPress page and paste:

```html
<div style="position:relative;width:100%;height:clamp(380px,60vw,640px);border-radius:6px;overflow:hidden">
  <iframe src="https://broussardbrandt.github.io/FleetTracker/#embed"
          title="TDI-Brooks fleet positions"
          style="position:absolute;inset:0;width:100%;height:100%;border:0"
          loading="lazy"></iframe>
</div>
```

The height scales with screen width: 640px on a desktop, about 380px on a phone.

`#embed` shows the map on its own, without the header and vessel list, and needs Ctrl + scroll to zoom so it doesn't hijack scrolling on the website. Leave `#embed` off to embed the full page with the vessel list.

To serve it from a TDI address such as `fleet.tdi-bi.com`: add a CNAME DNS record pointing `fleet` to `<your-account>.github.io`, then enter the domain under Settings → Pages → Custom domain.

## Coverage

AISStream.io uses coastal receivers, so vessels in port or on the shelf update reliably. Vessels working well offshore (typically Gyre and Nautilus off West Africa) can go quiet until they come back into range. Continuous offshore tracking needs a satellite AIS provider such as Spire Maritime or Kpler. Only `scripts/update_positions.py` would need to change.

## Changing things

- **Vessel details, MMSIs, photos, TDI links:** the `FLEET` list near the top of the script in `index.html`. Photos are in `img/`.
- **Tracked MMSIs for the updater:** `FLEET` in `scripts/update_positions.py`. Keep both lists in step if an MMSI changes. Miss Emma McCall's MMSI changed to 577759000 when she was re-flagged to Vanuatu.
- **Map place names:** the `PLACES` list in `index.html`.
- **Update frequency:** the `cron` line in the workflow. Every 10 minutes is a sensible floor for GitHub Actions.
