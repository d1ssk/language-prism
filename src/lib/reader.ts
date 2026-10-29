import { isUiLocale, translate, type MessageKey } from "../i18n";
import { AudioStream } from "./audio-stream";
const uiLanguage = document.documentElement.lang;
const locale = isUiLocale(uiLanguage) ? uiLanguage : "ja";
const t = (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values);
const reader = document.querySelector<HTMLElement>("#reader");
if (reader && reader.querySelector("#audio-player")) {
  const speed = reader.querySelector<HTMLSelectElement>("#speed")!;
  const gap = reader.querySelector<HTMLSelectElement>("#gap")!;
  const audio = reader.querySelector<HTMLAudioElement>("#audio-player")!;
  const playAll = reader.querySelector<HTMLButtonElement>("#play-all")!;
  const playbackOrder = reader.querySelector<HTMLSelectElement>("#playback-order")!;
  const continueButton = reader.querySelector<HTMLButtonElement>("#continue-to-end")!;
  const jumpButton = reader.querySelector<HTMLButtonElement>("#jump-to-playing")!;
  const progress = reader.querySelector<HTMLElement>("#playback-progress")!;
  const status = reader.querySelector<HTMLElement>("#player-status")!;
  // Follow the displayed order: each unit, English first on the English UI.
  const buttons = [...reader.querySelectorAll<HTMLButtonElement>("[data-audio]")];
  let queue: HTMLButtonElement[] = [];
  let cursor = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let active = false;
  let waiting = false;
  let paused = false;
  let stream: AudioStream | undefined;
  let interval = 0;
  let playingToEnd = false;
  let shuffled = false;
  let lastPlayed: HTMLButtonElement | undefined;
  const updateActions = () => {
    progress.hidden = !active || !playingToEnd || !lastPlayed;
    progress.textContent = progress.hidden ? "" : shuffled
      ? `${t("shuffledPlayback")} (${queue.indexOf(lastPlayed!) + 1}/${queue.length})`
      : `(${buttons.indexOf(lastPlayed!) + 1}/${buttons.length})`;
    jumpButton.disabled = !lastPlayed;
    jumpButton.textContent = t(active && !waiting ? "jumpToPlaying" : "jumpToLastPlayed");
    continueButton.disabled = !active || shuffled || waiting || !queue[cursor] || queue.at(-1) === buttons.at(-1);
  };
  const session = navigator.mediaSession;
  const setPlaybackState = (state: MediaSessionPlaybackState) => {
    if (session) session.playbackState = state;
  };
  const toolbar = reader.querySelector<HTMLElement>(".reader-toolbar")!;
  toolbar.hidden = false;
  reader.querySelector<HTMLElement>(".article-play-buttons")!.hidden = false;
  updateActions();
  const settingsToggle = toolbar.querySelector<HTMLButtonElement>(".audio-settings-toggle")!;
  const settings = toolbar.querySelector<HTMLElement>("#audio-settings")!;
  settingsToggle.addEventListener("click", () => {
    settings.hidden = !settings.hidden;
    settingsToggle.setAttribute("aria-expanded", String(!settings.hidden));
  });
  // Reserve space for the floating controls, including expanded settings and zoom.
  const updateToolbarSpace = () => {
    document.documentElement.style.setProperty("--reader-toolbar-height", `${toolbar.getBoundingClientRect().height}px`);
  };
  new ResizeObserver(updateToolbarSpace).observe(toolbar);
  updateToolbarSpace();
  reader.querySelectorAll<HTMLButtonElement>(".audio-button, .play-unit, .play-from").forEach(button => button.hidden = false);
  const clearHighlight = () => buttons.forEach(button => {
    button.removeAttribute("aria-current");
    button.classList.remove("playing");
  });
  const stop = (message?: string) => {
    generation++;
    active = waiting = paused = false;
    playingToEnd = false;
    shuffled = false;
    clearTimeout(timer);
    stream?.dispose();
    stream = undefined;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    queue = [];
    clearHighlight();
    updateActions();
    if (session) {
      session.playbackState = "none";
      session.metadata = null;
    }
    status.textContent = message ?? "";
  };
  const showClip = () => {
    const button = queue[cursor];
    lastPlayed = button;
    updateActions();
    clearHighlight();
    button.classList.add("playing");
    button.setAttribute("aria-current", "true");
    if (session && "MediaMetadata" in window) {
      session.metadata = new MediaMetadata({
        title: document.querySelector("h1")?.textContent?.trim() || "language prism",
        artist: button.dataset.label,
        album: "language prism",
      });
    }
  };
  const playCurrent = async () => {
    if (!active) return;
    const token = generation;
    clearTimeout(timer);
    waiting = paused = false;
    audio.src = queue[cursor].dataset.audio!;
    audio.defaultPlaybackRate = audio.playbackRate = Number(speed.value);
    showClip();
    // Keep the playlist's intent during the short pause between clips.
    setPlaybackState("playing");
    try { await audio.play(); }
    catch { if (generation === token && active) stop(t("playbackFailed")); }
  };
  const start = (next: HTMLButtonElement[], toEnd = false, shuffle = false) => {
    stop();
    if (!next.length) { status.textContent = t("selectedNoAudio"); return; }
    queue = next;
    cursor = 0;
    active = true;
    playingToEnd = toEnd;
    shuffled = shuffle;
    interval = Number(gap.value);
    if (next.length > 1 && interval === 0 && AudioStream.supported()) {
      const token = generation;
      showClip();
      stream = new AudioStream(audio, next.map(button => button.dataset.audio!), index => {
        if (generation !== token || !active) return;
        cursor = index;
        showClip();
      }, () => { if (generation === token && active) stop(t("loadFailed")); });
      audio.defaultPlaybackRate = audio.playbackRate = Number(speed.value);
      setPlaybackState("playing");
      void audio.play().catch(() => {
        if (generation === token && active) stop(t("playbackFailed"));
      });
      return;
    }
    void playCurrent();
  };
  buttons.forEach(button => button.addEventListener("click", () => start([button])));
  playAll.addEventListener("click", () => {
    if (playbackOrder.value !== "shuffle") { start(buttons, true); return; }
    const order = [...units];
    // Fisher–Yates shuffles groups once per start; language order within each
    // group stays intact, and pause/resume retains the resulting queue.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    start(order.flatMap(unit => [...unit.querySelectorAll<HTMLButtonElement>("[data-audio]")]), true, true);
  });
  reader.querySelectorAll<HTMLButtonElement>(".play-unit").forEach(button => {
    button.addEventListener("click", () => {
      const unit = button.closest(".unit")!;
      start([...unit.querySelectorAll<HTMLButtonElement>("[data-audio]")]);
    });
  });
  const units = [...reader.querySelectorAll<HTMLElement>(".unit")];
  continueButton.addEventListener("click", () => {
    if (continueButton.disabled) return;
    const tail = buttons.slice(buttons.indexOf(queue.at(-1)!) + 1);
    queue.push(...tail);
    playingToEnd = true;
    // Extend the existing timeline without changing src, currentTime, or pause state.
    stream?.append(tail.map(button => button.dataset.audio!));
    updateActions();
  });
  jumpButton.addEventListener("click", () => {
    if (jumpButton.disabled) return;
    const target = lastPlayed!.closest<HTMLElement>("[data-language]")!;
    const rect = target.getBoundingClientRect();
    const visibleHeight = toolbar.getBoundingClientRect().top;
    window.scrollTo({
      top: window.scrollY + rect.top - Math.max(16, (visibleHeight - Math.min(rect.height, visibleHeight)) / 2),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  });
  units.forEach((unit, index) => {
    unit.querySelector<HTMLButtonElement>(".play-from")!.addEventListener("click", () => {
      const remaining = units.slice(index);
      start(
        remaining.flatMap(item => [...item.querySelectorAll<HTMLButtonElement>("[data-audio]")]),
        true,
      );
    });
  });
  const pause = () => {
    if (!active) return;
    paused = true;
    clearTimeout(timer);
    audio.pause();
    setPlaybackState("paused");
  };
  const resume = async () => {
    if (!active) return;
    // The cursor already points to the next clip while waiting. Do not replay
    // the ended clip when resuming from Android's notification controls.
    if (waiting) { await playCurrent(); return; }
    const token = generation;
    paused = false;
    try {
      await audio.play();
      if (generation === token && active) setPlaybackState("playing");
    } catch { if (generation === token && active) pause(); }
  };
  if (session) {
    for (const [action, handler] of [
      ["play", () => { void resume(); }],
      ["pause", pause],
      ["stop", () => stop()],
    ] as const) {
      // Some browsers expose Media Session but support only some actions.
      try { session.setActionHandler(action, handler); } catch { /* Optional control. */ }
    }
  }
  audio.addEventListener("play", () => {
    if (!active) return;
    if (waiting) { void playCurrent(); return; }
    paused = false;
    setPlaybackState("playing");
  });
  audio.addEventListener("pause", () => {
    // Loading another source and reaching its end can also emit pause events.
    if (active && !waiting && audio.paused && !audio.ended) pause();
  });
  audio.addEventListener("ended", () => {
    if (!active || waiting) return;
    if (stream) { stop(); return; }
    cursor++;
    if (cursor >= queue.length) { stop(); return; }
    waiting = true;
    updateActions();
    clearHighlight();
    const token = generation;
    const delay = interval * 1000;
    // No timer task is necessary when the user selected continuous playback.
    if (delay === 0) { void playCurrent(); return; }
    timer = setTimeout(() => {
      if (generation === token && !paused) void playCurrent();
    }, delay);
  });
  audio.addEventListener("error", () => { if (active) stop(t("loadFailed")); });
  speed.addEventListener("change", () => { audio.defaultPlaybackRate = audio.playbackRate = Number(speed.value); });
  window.addEventListener("pagehide", () => stop());
}
