# Cuefollow Prompter

A teleprompter that listens as you read and keeps your next line on the marker.
Plain HTML/JS: no build step, no server code, no accounts.

## Files
- `index.html` – the whole app
- `manifest.webmanifest`, `icon*.png`, `icon.svg` – lets you install it like an app
- `sw.js` – makes it work offline after the first visit

## Put it online (pick one, all free)

The microphone only works on an `https://` address (or `localhost`), so host it rather than double-clicking the file.

**Netlify Drop (fastest, no account needed to try):** go to https://app.netlify.com/drop and drag the `cuefollow` folder onto the page. You get an https link in seconds.

**GitHub Pages:** create a repo, upload these files, then Settings → Pages → Deploy from branch → `main` / root. Your app appears at `https://<username>.github.io/<repo>/`.

**Cloudflare Pages / Vercel:** create a new project and upload the folder. Nothing to configure.

## Try it on your own computer
```
cd cuefollow
python3 -m http.server 8000
```
Then open http://localhost:8000 in Chrome or Edge.

## Install it like an app
- **Chrome / Edge (desktop):** the install icon in the address bar.
- **iPhone / iPad (Safari):** Share → Add to Home Screen.
- **Android (Chrome):** menu → Install app.

## Browser support for voice following
| Browser | Voice following |
|---|---|
| Chrome, Edge (desktop & Android) | Yes. Speech is processed by Google's/Microsoft's online service. |
| Safari (Mac, iPhone, iPad) | Yes. Speech is processed by Apple. |
| Firefox | No. Use Steady scroll. |

## Updating
Edit `index.html`, re-upload, and bump `VERSION` in `sw.js` so installed copies refresh their offline cache.
