# Cuefollow Prompter

A private teleprompter that listens as you read and keeps your next line on the marker.

Speech recognition runs **on your device** by default. Your voice is never recorded, saved or sent anywhere.

Live site: https://juanvaljean.github.io/claude/

## Privacy

| | What happens |
|---|---|
| **Your voice** (default: *On this device*) | Recognised in your browser by the open-source [Vosk](https://alphacephei.com/vosk/) engine. Audio never leaves the device. |
| **Your voice** (optional: *Browser's online speech*) | The browser sends audio to Google (Chrome), Microsoft (Edge) or Apple (Safari). Requires a confirmation, and resets to *On this device* every time the app opens. |
| **Your script and settings** | Stored only in this browser (`localStorage`). |
| **Network** | The page only loads files from its own site. A Content-Security-Policy forbids connecting to any other server. No analytics, ads, trackers, accounts or third-party fonts. |
| **Hosting** | GitHub Pages serves the files, so GitHub sees visitors' IP addresses, like any web host. It never sees scripts or audio. |
| **Erase my data** | One button removes the script, settings, the downloaded speech models and the offline copy of the app from the browser. |

The privacy badge in the top bar always shows which mode is active.

## How it's built

Plain HTML, CSS and JavaScript. No build step, no server code.

```
index.html             page markup and security policy
app.js / app.css       the app
fonts.css, fonts/      self-hosted fonts (Atkinson Hyperlegible, Space Grotesk, JetBrains Mono)
vendor/vosk.js         vosk-browser 0.0.8, unchanged from npm (Apache-2.0)
sw.js                  offline support
manifest.webmanifest   lets you install it as an app
licenses/              third-party licenses
.github/workflows/     publishes the site and fetches the speech models
```

### Speech models

The models are **not stored in this repository**. Each time `main` is published, the GitHub Actions workflow downloads the official small models from Alpha Cephei, repackages them for the browser, and publishes them on this site:

- English: `vosk-model-small-en-us-0.15` (about 40 MB)
- Spanish: `vosk-model-small-es-0.42` (about 39 MB)

A browser downloads a model the first time you press **Listen** in that language, then keeps it, so it works offline afterward. The recogniser is limited to the words in your script, which makes the small models accurate enough for following along.

## Publishing (one-time setup)

In the repository on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

After that, every push to `main` publishes automatically. To update, edit the files, push, and bump `VERSION` in `sw.js` so installed copies refresh.

## Install it as an app

- **Chrome / Edge:** the install icon in the address bar.
- **Safari on Mac:** File → Add to Dock.
- **iPhone / iPad:** Share → Add to Home Screen.
- **Android:** browser menu → Install app.

## Browser support

| Browser | On this device (private) | Browser's online speech |
|---|---|---|
| Chrome, Edge | Yes | Yes |
| Safari (Mac, iPhone, iPad) | Yes | Yes |
| Firefox | Yes | No |

## Run it locally

The models aren't in the repository, so for a local test put a model archive at `models/vosk-model-small-en-us-0.15.tar.gz`. The archive should contain the `vosk-model-small-en-us-0.15` folder from the official zip. Then:

```
python3 -m http.server 8000
```

Open http://localhost:8000.
