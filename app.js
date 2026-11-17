(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const KEY = "cf:"; // every localStorage key this app writes starts with this
  const store = {
    get(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch {} }
  };

  const SAMPLE = `Good evening, and thanks for tuning in.

Tonight I want to talk about something small that changed the way I work: reading from a prompter that actually listens.

[pause, smile]

For years I scrolled my notes by hand, or asked a friend to sit behind the camera and keep pace with me. Every time I slowed down to make a point, the words ran away. Every time I sped up, I caught myself staring at a blank line.

This one follows my voice. When I stop, it stops. When I skip ahead, it finds me again.

[look at camera]

So if you've ever lost your place mid-sentence, try reading this paragraph out loud and watch the highlight keep up with you.

Thanks for watching. I'll see you next week.`;

  // Offline speech models, served from this site (see .github/workflows/pages.yml).
  const MODELS = {
    en: { url: "models/vosk-model-small-en-us-0.15.tar.gz", name: "English", size: "40 MB" },
    es: { url: "models/vosk-model-small-es-0.42.tar.gz", name: "Spanish", size: "39 MB" }
  };

  const els = {
    script: $("script"), copy: $("copy"), stage: $("stage"),
    size: $("size"), measure: $("measure"), mirror: $("mirror"), wpm: $("wpm")
  };

  // ---------- settings ----------
  const defaultLang = /^es\b/i.test(navigator.language || "") ? "es-ES" : "en-US";
  const settings = Object.assign({ lang: defaultLang, size: 56, measure: 28, mirror: false, wpm: 150, speed: 45 }, store.get("settings", {}));
  if (![...$("lang").options].some(o => o.value === settings.lang)) settings.lang = defaultLang;
  els.script.value = store.get("script", SAMPLE);

  function applySettings(persist = true) {
    els.size.value = settings.size; $("sizeVal").textContent = settings.size + "px";
    els.measure.value = settings.measure; $("measureVal").textContent = settings.measure + "ch";
    els.mirror.checked = settings.mirror; $("mirrorBtn").setAttribute("aria-pressed", settings.mirror);
    els.wpm.value = settings.wpm; $("wpmVal").textContent = settings.wpm; $("mWpm").textContent = settings.wpm;
    $("speed").value = settings.speed;
    $("lang").value = settings.lang;
    const small = matchMedia("(max-width: 760px)").matches;
    els.copy.style.setProperty("--size", Math.round(settings.size * (small ? .6 : 1)) + "px");
    els.copy.style.setProperty("--measure", settings.measure + "ch");
    els.copy.classList.toggle("mirror", settings.mirror);
    if (persist) store.set("settings", settings);
    updateMeta();
  }
  els.size.oninput = () => { settings.size = +els.size.value; applySettings(); keepInView(true); };
  els.measure.oninput = () => { settings.measure = +els.measure.value; applySettings(); };
  els.mirror.onchange = () => { settings.mirror = els.mirror.checked; applySettings(); };
  $("lang").onchange = () => { settings.lang = $("lang").value; applySettings(); };
  els.wpm.oninput = () => { settings.wpm = +els.wpm.value; applySettings(); };
  $("speed").oninput = () => { settings.speed = +$("speed").value; store.set("settings", settings); };
  $("mirrorBtn").onclick = () => { settings.mirror = !settings.mirror; applySettings(); };
  $("smaller").onclick = () => { settings.size = Math.max(28, settings.size - 4); applySettings(); keepInView(true); };
  $("bigger").onclick = () => { settings.size = Math.min(120, settings.size + 4); applySettings(); keepInView(true); };
  addEventListener("resize", () => applySettings(false));

  let saveT;
  els.script.oninput = () => { updateMeta(); clearTimeout(saveT); saveT = setTimeout(() => store.set("script", els.script.value), 300); };
  $("sampleBtn").onclick = () => { els.script.value = SAMPLE; store.set("script", SAMPLE); updateMeta(); };

  function updateMeta() {
    const n = (els.script.value.replace(/\[[^\]]*\]/g, " ").match(/\S+/g) || []).length;
    $("mWords").textContent = n;
    const secs = Math.round(n / settings.wpm * 60);
    $("mTime").textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
  }

  // ---------- script model ----------
  const norm = w => w.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
  let tokens = [];   // {el, n, raw, cue, mi}
  let match = [];    // indices into tokens of words we listen for
  let cursor = 0;    // index into match: next word to be read

  function build() {
    els.copy.textContent = "";
    tokens = []; match = [];
    let inCue = false;
    els.script.value.split(/\n\s*\n|\n/).forEach(para => {
      if (!para.trim()) return;
      const p = document.createElement("p");
      para.trim().split(/\s+/).forEach((raw, k, arr) => {
        if (raw.startsWith("[")) inCue = true;
        const cue = inCue;
        if (raw.includes("]")) inCue = false;
        const s = document.createElement("span");
        s.className = "w" + (cue ? " cue" : "");
        s.textContent = raw;
        const n = cue ? "" : norm(raw);
        const t = { el: s, n, raw, cue, mi: -1 };
        if (n) { t.mi = match.length; match.push(tokens.length); }
        s.dataset.i = tokens.length;
        tokens.push(t);
        p.appendChild(s);
        if (k < arr.length - 1) p.appendChild(document.createTextNode(" "));
      });
      els.copy.appendChild(p);
    });
    setCursor(0, true);
  }

  // The words the offline recogniser should listen for: the script's own words, plus "[unk]" for anything else.
  function scriptVocabulary() {
    const words = new Set();
    let inCue = false;
    for (const raw of els.script.value.split(/\s+/)) {
      if (raw.startsWith("[")) inCue = true;
      const cue = inCue;
      if (raw.includes("]")) inCue = false;
      if (cue) continue;
      const w = raw.toLowerCase().replace(/[’]/g, "'").replace(/[^\p{L}\p{N}']/gu, "").replace(/^'+|'+$/g, "");
      if (w) words.add(w);
    }
    return [...words];
  }

  function setCursor(c, force) {
    c = Math.max(0, Math.min(match.length, c));
    if (c === cursor && !force) return;
    const lo = Math.min(c, cursor), hi = Math.max(c, cursor);
    cursor = c;
    const nextTok = cursor < match.length ? match[cursor] : tokens.length;
    const range = force ? [0, tokens.length] : [lo === 0 ? 0 : match[lo - 1] ?? 0, hi < match.length ? match[hi] + 1 : tokens.length];
    for (let i = range[0]; i < range[1]; i++) {
      tokens[i].el.classList.toggle("done", i < nextTok);
      tokens[i].el.classList.toggle("now", i === nextTok);
    }
    $("prog").textContent = cursor + " / " + match.length;
    keepInView();
  }

  els.copy.addEventListener("click", e => {
    const s = e.target.closest(".w"); if (!s) return;
    let i = +s.dataset.i;
    while (i < tokens.length && tokens[i].mi < 0) i++;
    setCursor(i < tokens.length ? tokens[i].mi : match.length, true);
    recentFinal = []; lastPartial = "";
  });

  // ---------- smooth scroll to keep the next word on the marker ----------
  let target = 0, raf = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function keepInView(jump) {
    if (scrolling) return;
    const idx = cursor < match.length ? match[cursor] : tokens.length - 1;
    const el = tokens[idx]?.el; if (!el) return;
    target = Math.max(0, el.offsetTop - els.stage.clientHeight * 0.34 + el.offsetHeight * 0.1);
    if (jump || reduce) { els.stage.scrollTop = target; return; }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    const d = target - els.stage.scrollTop;
    if (Math.abs(d) < 1) { els.stage.scrollTop = target; raf = 0; return; }
    els.stage.scrollTop += d * 0.12;
    raf = requestAnimationFrame(tick);
  }

  // ---------- voice alignment ----------
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const m = []; for (let i = 0; i <= a.length; i++) m[i] = [i];
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i-1][j] + 1, m[i][j-1] + 1, m[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    return m[a.length][b.length];
  }
  function sim(a, b) {
    if (a === b) return 1;
    const L = Math.min(a.length, b.length);
    if (L >= 4 && (a.startsWith(b) || b.startsWith(a))) return .8;
    const d = lev(a, b), tol = L >= 7 ? 2 : L >= 4 ? 1 : 0;
    return d <= tol ? .7 : 0;
  }
  // How well do the last spoken words line up if the final one is script word p?
  function scoreAt(spoken, p) {
    let score = 0, i = p, misses = 0;
    for (let j = spoken.length - 1; j >= 0 && i >= 0 && misses < 3; j--) {
      const s = spoken[j];
      let hit = 0, at = -1;
      for (let k = 0; k <= 1 && i - k >= 0; k++) { // allow one skipped script word
        const v = sim(s, tokens[match[i - k]].n);
        if (v > hit) { hit = v; at = i - k; }
      }
      if (hit) { score += hit - (at < i ? .25 : 0); i = at - 1; }
      else misses++;
      if (j === spoken.length - 1 && !hit) return 0; // last word must land on p
    }
    return score;
  }
  let recentFinal = [], lastPartial = "";
  const words = t => t.split(/\s+/).map(norm).filter(w => w && w !== "unk");
  function follow() {
    const spoken = recentFinal.concat(words(lastPartial)).slice(-7);
    if (!spoken.length || !match.length) return;
    let best = -1, bestScore = 0;
    // Look up to 40 words ahead easily; further jumps (skipped paragraphs) need 3+ words in a row to match.
    const from = Math.max(0, cursor - 3), to = Math.min(match.length - 1, cursor + 150);
    for (let p = from; p <= to; p++) {
      const dist = Math.max(0, p - cursor);
      const raw = scoreAt(spoken, p);
      if (dist > 40 && raw < 3) continue;
      const s = raw - Math.min(dist, 40) * 0.03;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    const near = best >= cursor - 1 && best <= cursor + 1;
    if (best >= 0 && (bestScore >= 1.6 || (near && bestScore >= 0.7))) {
      if (best + 1 > cursor) setCursor(best + 1);
    }
  }

  // ---------- shared engine plumbing ----------
  // Both engines expose: onState / onPartial / onFinal, start(), stop(), active().
  function makeEmitter() {
    const h = { state: [], partial: [], final: [] };
    return {
      emit: (k, v) => h[k].forEach(f => f(v)),
      api: { onState: f => h.state.push(f), onPartial: f => h.partial.push(f), onFinal: f => h.final.push(f) }
    };
  }

  // ---------- engine 1: offline, on this device (Vosk, WebAssembly) ----------
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.Vosk) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error("script"));
      document.head.appendChild(s);
    });
  }
  function makeOfflineEngine() {
    const { emit, api } = makeEmitter();
    let state = "idle", ctx = null, stream = null, node = null, sink = null, rec = null;
    const models = {}; // lang -> Promise<Model>
    const setState = (s, reason) => { state = s; emit("state", reason ? { state: s, reason } : { state: s }); };

    function getModel(lang) {
      if (!models[lang]) {
        const m = MODELS[lang];
        const cached = store.get("model:" + lang, false);
        toast(cached ? `Loading the ${m.name} speech model…` : `Downloading the ${m.name} speech model (about ${m.size}, first time only). After this it works offline.`, 0);
        models[lang] = loadScript("vendor/vosk.js")
          .then(() => window.Vosk.createModel(new URL(m.url, location.href).href, -1))
          .then(model => { store.set("model:" + lang, true); hideToast(); return model; })
          .catch(err => { delete models[lang]; store.set("model:" + lang, false); throw err; });
      }
      return models[lang];
    }

    function teardown() {
      try { node && (node.onaudioprocess = null, node.disconnect()); } catch {}
      try { sink && sink.disconnect(); } catch {}
      try { stream && stream.getTracks().forEach(t => t.stop()); } catch {}
      try { ctx && ctx.close(); } catch {}
      try { rec && rec.remove(); } catch {}
      ctx = stream = node = sink = rec = null;
    }

    api.active = () => state !== "idle";
    api.start = () => {
      if (state !== "idle") return Promise.resolve();
      const lang = settings.lang.slice(0, 2) === "es" ? "es" : "en";
      setState("starting");
      // Created inside the click so the browser lets audio run.
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const vocab = JSON.stringify(scriptVocabulary().concat("[unk]"));
      return Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false })
          .then(s => { stream = s; }, err => { throw { code: err && err.name === "NotFoundError" ? "no_mic" : "not_granted" }; }),
        getModel(lang).catch(() => { throw { code: navigator.onLine ? "model_missing" : "model_offline" }; })
      ]).then(([, model]) => {
        if (state !== "starting") { teardown(); return; } // stopped while loading
        rec = new model.KaldiRecognizer(ctx.sampleRate, vocab);
        rec.on("partialresult", m => emit("partial", { text: m.result.partial || "" }));
        rec.on("result", m => { emit("partial", { text: "" }); if (m.result.text) emit("final", { text: " " + m.result.text }); });
        const src = ctx.createMediaStreamSource(stream);
        node = ctx.createScriptProcessor(4096, 1, 1);
        node.onaudioprocess = e => { try { rec && rec.acceptWaveform(e.inputBuffer); } catch {} };
        sink = ctx.createGain(); sink.gain.value = 0; // keeps the processor running without playing your voice back
        src.connect(node); node.connect(sink); sink.connect(ctx.destination);
        return ctx.resume().then(() => setState("listening"));
      }).catch(err => {
        teardown(); hideToast();
        setState("idle", (err && err.code) || "upstream_error");
      });
    };
    api.stop = () => {
      if (state === "idle") return Promise.resolve();
      try { rec && rec.retrieveFinalResult(); } catch {}
      teardown();
      setState("idle", "stopped");
      return Promise.resolve();
    };
    api.forget = () => { // used by "Erase my data"
      api.stop();
      Object.values(models).forEach(p => p.then(m => m.terminate(), () => {}));
      for (const k in models) delete models[k];
    };
    return api;
  }

  // ---------- engine 2: the browser's online speech (Chrome, Edge, Safari) ----------
  // Browsers end a session after a silence or about a minute, so it restarts itself until you press stop.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function makeCloudEngine() {
    if (!SR) return null;
    const { emit, api } = makeEmitter();
    let rec = null, want = false, state = "idle", fatal = null, restarts = 0;
    const setState = (s, reason) => { state = s; emit("state", reason ? { state: s, reason } : { state: s }); };
    function open() {
      rec = new SR();
      rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.lang = settings.lang;
      rec.onstart = () => { restarts = 0; setState("listening"); };
      rec.onresult = e => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) emit("final", { text: " " + r[0].transcript.trim() });
          else interim += r[0].transcript;
        }
        emit("partial", { text: interim.trim() });
      };
      rec.onerror = e => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") fatal = "not_granted";
        else if (e.error === "audio-capture") fatal = "no_mic";
        else if (e.error === "network") fatal = "cloud_network";
        else if (e.error === "language-not-supported") fatal = "unavailable";
      };
      rec.onend = () => {
        emit("partial", { text: "" });
        if (want && !fatal && !document.hidden && restarts++ < 5) { try { rec.start(); return; } catch {} }
        const reason = fatal || (document.hidden && want ? "hidden" : "stopped");
        want = false; fatal = null; rec = null;
        setState("idle", reason);
      };
    }
    document.addEventListener("visibilitychange", () => { if (document.hidden && rec) rec.stop(); });
    api.active = () => state !== "idle";
    api.start = () => {
      if (state !== "idle") return Promise.resolve();
      want = true; fatal = null; open(); setState("starting");
      try { rec.start(); } catch { setState("idle", "upstream_error"); }
      return Promise.resolve();
    };
    api.stop = () => { want = false; if (rec) { setState("finishing"); rec.stop(); } return Promise.resolve(); };
    api.forget = () => api.stop();
    return api;
  }

  // ---------- engine choice and privacy badge ----------
  // Online speech is never remembered: every launch starts private.
  let engineName = "offline";
  const engines = { offline: null, cloud: null };
  const vendor = (() => {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return "Microsoft";
    if (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Android/.test(ua)) return "Apple";
    return "Google";
  })();
  $("cloudVendor").textContent = vendor;
  if (!SR) {
    $("engCloud").disabled = true;
    $("cloudNote").textContent = "Not available in this browser.";
  } else {
    $("cloudNote").textContent = `More accurate. Sends your audio to ${vendor}. This session only.`;
  }

  function engine() {
    if (!engines[engineName]) {
      const e = engineName === "cloud" ? makeCloudEngine() : makeOfflineEngine();
      if (!e) return null;
      e.onState(({ state, reason }) => onEngineState(state, reason));
      e.onPartial(({ text }) => { lastPartial = text || ""; showHeard(); follow(); });
      e.onFinal(({ text }) => { recentFinal = recentFinal.concat(words(text)).slice(-12); lastPartial = ""; showHeard(); follow(); });
      engines[engineName] = e;
    }
    return engines[engineName];
  }
  function setEngine(name) {
    if (name === engineName) return;
    Object.values(engines).forEach(e => e && e.active() && e.stop());
    engineName = name;
    $("engOffline").checked = name === "offline"; $("engCloud").checked = name === "cloud";
    const cloud = name === "cloud";
    $("privacyBadge").classList.toggle("cloud", cloud);
    $("badgeText").textContent = cloud ? `Online speech: ${vendor}` : "Private: on this device";
  }
  $("engOffline").onchange = () => setEngine("offline");
  $("engCloud").onchange = () => {
    $("engOffline").checked = true; $("engCloud").checked = false; // stays private until confirmed
    openDialog("cloudDialog");
  };
  $("cloudOk").onclick = () => { closeDialog("cloudDialog"); setEngine("cloud"); };
  $("cloudCancel").onclick = () => closeDialog("cloudDialog");
  $("privacyBadge").onclick = () => openDialog("privacyDialog");
  $("privacyBtn").onclick = () => openDialog("privacyDialog");
  $("privacyClose").onclick = () => closeDialog("privacyDialog");
  function openDialog(id) { const d = $(id); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
  function closeDialog(id) { const d = $(id); if (d.close) d.close(); else d.removeAttribute("open"); }

  // ---------- listening UI ----------
  let listening = false;
  function setLamp(on) {
    listening = on;
    $("lamp").classList.toggle("on", on); $("barLamp").classList.toggle("on", on);
    $("listenBtn").classList.toggle("on", on);
    $("listenLabel").textContent = on ? "Listening" : "Listen";
  }
  function toast(msg, ms = 5000) {
    const t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); if (ms) toast.t = setTimeout(() => t.hidden = true, ms);
  }
  function hideToast() { clearTimeout(toast.t); $("toast").hidden = true; }
  const REASONS = {
    not_granted: "Microphone access is blocked. Allow it from the icon in the address bar, or use Steady scroll.",
    no_mic: "No microphone found. Plug one in and press Listen again.",
    unavailable: "Online speech isn't available for this language in this browser. Switch back to On this device.",
    cloud_network: "Online speech needs an internet connection. Switch to On this device to keep going offline.",
    model_missing: "The speech model couldn't be loaded from this site. If you just deployed, wait a few minutes and try again.",
    model_offline: "The speech model hasn't been downloaded yet, and you're offline. Connect once to download it.",
    upstream_error: "Listening stopped unexpectedly. Press Listen to start again.",
    hidden: "Listening paused because the app was hidden. Press Listen to resume."
  };
  function onEngineState(state, reason) {
    setLamp(state === "listening");
    $("listenLabel").textContent = state === "starting" ? "Starting…" : state === "listening" ? "Listening" : "Listen";
    if (state === "idle") {
      $("heard").hidden = true;
      if (reason && REASONS[reason]) toast(REASONS[reason], 8000);
    }
  }
  function showHeard() {
    const txt = (recentFinal.slice(-6).join(" ") + " " + lastPartial.replace(/\[unk\]/g, "…")).trim();
    $("heard").hidden = !txt || !listening; $("heard").textContent = "Heard: " + txt;
  }
  function toggleListen() {
    const e = engine(); if (!e) return;
    if (e.active()) { e.stop(); return; }
    if (scrolling) toggleScroll();
    recentFinal = []; lastPartial = "";
    e.start();
  }
  $("listenBtn").onclick = toggleListen;

  // ---------- steady scroll fallback ----------
  let scrolling = false, last = 0, acc = 0;
  function toggleScroll() {
    scrolling = !scrolling;
    $("scrollBtn").setAttribute("aria-pressed", scrolling);
    $("speedWrap").hidden = !scrolling;
    if (scrolling) {
      const e = engines[engineName]; if (e && e.active()) e.stop();
      cancelAnimationFrame(raf); raf = 0; last = performance.now(); acc = els.stage.scrollTop;
      requestAnimationFrame(steady);
    } else syncCursorToScroll();
  }
  function steady(t) {
    if (!scrolling) return;
    acc += settings.speed * (t - last) / 1000; last = t;
    els.stage.scrollTop = acc;
    requestAnimationFrame(steady);
  }
  function syncCursorToScroll() {
    const line = els.stage.scrollTop + els.stage.clientHeight * 0.34;
    let c = 0; for (; c < match.length; c++) if (tokens[match[c]].el.offsetTop + 4 > line) break;
    setCursor(c, true);
  }
  $("scrollBtn").onclick = toggleScroll;
  $("restartBtn").onclick = () => { recentFinal = []; lastPartial = ""; if (scrolling) acc = 0; setCursor(0, true); keepInView(true); if (scrolling) els.stage.scrollTop = 0; };

  // ---------- erase my data ----------
  let eraseArmed = 0;
  $("eraseBtn").onclick = async () => {
    const b = $("eraseBtn");
    if (!eraseArmed) {
      b.classList.add("armed"); b.textContent = "Erase script, settings and speech models? Tap again";
      eraseArmed = setTimeout(() => { eraseArmed = 0; b.classList.remove("armed"); b.textContent = "Erase my data"; }, 5000);
      return;
    }
    clearTimeout(eraseArmed); eraseArmed = 0;
    b.textContent = "Erasing…"; b.disabled = true;
    Object.values(engines).forEach(e => e && e.forget && e.forget());
    try { Object.keys(localStorage).filter(k => k.startsWith(KEY)).forEach(k => localStorage.removeItem(k)); } catch {}
    try { sessionStorage.clear(); } catch {}
    // The offline engine keeps its models in IndexedDB under "/vosk".
    try {
      const names = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : ["/vosk"];
      await Promise.all(names.filter(n => n === "/vosk" || /^cuefollow/i.test(n || "")).map(n => new Promise(r => {
        const req = indexedDB.deleteDatabase(n); req.onsuccess = req.onerror = req.onblocked = () => r();
      })));
    } catch {}
    try { for (const k of await caches.keys()) if (k.startsWith("cuefollow")) await caches.delete(k); } catch {}
    try {
      const here = new URL(".", location.href).href;
      for (const r of await navigator.serviceWorker.getRegistrations()) if (r.scope === here) await r.unregister();
    } catch {}
    b.textContent = "Erased. Reloading…";
    setTimeout(() => location.reload(), 600);
  };

  // ---------- views ----------
  let wake = null;
  async function lockWake() { try { wake = await navigator.wakeLock?.request("screen"); } catch {} }
  function show(view) {
    const prompt = view === "prompt";
    $("editorView").hidden = prompt; $("prompterView").hidden = !prompt;
    $("tabEdit").setAttribute("aria-selected", !prompt); $("tabPrompt").setAttribute("aria-selected", prompt);
    if (prompt) { store.set("script", els.script.value); build(); applySettings(false); requestAnimationFrame(() => keepInView(true)); lockWake(); }
    else { const e = engines[engineName]; if (e && e.active()) e.stop(); if (scrolling) toggleScroll(); wake?.release?.().catch(() => {}); }
  }
  $("tabEdit").onclick = () => show("edit");
  $("tabPrompt").onclick = () => show("prompt");
  $("startBtn").onclick = () => show("prompt");
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("prompterView").hidden) lockWake(); });

  $("fsBtn").onclick = async () => {
    try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); }
    catch { toast("Fullscreen isn't available here.", 3000); }
  };

  document.addEventListener("keydown", e => {
    if ($("prompterView").hidden || e.target.matches("input, textarea, select") || document.querySelector("dialog[open]")) return;
    if (e.code === "Space") { e.preventDefault(); scrolling ? toggleScroll() : toggleListen(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setCursor(cursor + 1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setCursor(cursor - 1); }
    else if (e.key === "Escape") show("edit");
  });

  applySettings(false);

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
