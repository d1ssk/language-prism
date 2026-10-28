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
  const stopButton = reader.querySelector<HTMLButtonElement>("#stop-audio")!;
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
  let skipped = "";
  let startUnit: number | undefined;
  let stream: AudioStream | undefined;
  let interval = 0;
  const session = navigator.mediaSession;
  const setPlaybackState = (state: MediaSessionPlaybackState) => {
    if (session) session.playbackState = state;
  };
  const showCurrent = () => {
    const from = startUnit === undefined ? "" : `${t("playingFrom", { count: startUnit })} · `;
    status.textContent = `${from}${queue[cursor].dataset.label} · ${cursor + 1} / ${queue.length}${skipped}`;
  };
  reader.querySelector<HTMLElement>(".reader-toolbar")!.hidden = false;
  reader.querySelectorAll<HTMLButtonElement>(".audio-button, .play-unit, .play-from").forEach(button => button.hidden = false);
  const clearHighlight = () => buttons.forEach(button => {
    button.removeAttribute("aria-current");
    button.classList.remove("playing");
  });
  const stop = (message?: string) => {
    generation++;
    active = waiting = paused = false;
    clearTimeout(timer);
    stream?.dispose();
    stream = undefined;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    queue = [];
    startUnit = undefined;
    clearHighlight();
    stopButton.disabled = true;
    if (session) {
      session.playbackState = "none";
      session.metadata = null;
    }
    if (message) status.textContent = message;
  };
  const showClip = () => {
    const button = queue[cursor];
    clearHighlight();
    button.classList.add("playing");
    button.setAttribute("aria-current", "true");
    showCurrent();
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
  const start = (next: HTMLButtonElement[], expected = next.length, fromUnit?: number) => {
    stop();
    if (!next.length) { status.textContent = t("selectedNoAudio"); return; }
    skipped = expected > next.length ? t("skipped", { count: expected - next.length }) : "";
    queue = next;
    startUnit = fromUnit;
    cursor = 0;
    active = true;
    interval = Number(gap.value);
    stopButton.disabled = false;
    if (next.length > 1 && interval === 0 && AudioStream.supported()) {
      const token = generation;
      showClip();
      stream = new AudioStream(audio, next.map(button => button.dataset.audio!), index => {
        if (generation !== token || !active) return;
        cursor = index;
        showClip();
        if (paused) status.textContent = t("paused");
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
  playAll.addEventListener("click", () => start(buttons, reader.querySelectorAll("[data-language]").length));
  reader.querySelectorAll<HTMLButtonElement>(".play-unit").forEach(button => {
    button.addEventListener("click", () => {
      const unit = button.closest(".unit")!;
      start([...unit.querySelectorAll<HTMLButtonElement>("[data-audio]")], unit.querySelectorAll("[data-language]").length);
    });
  });
  const units = [...reader.querySelectorAll<HTMLElement>(".unit")];
  units.forEach((unit, index) => {
    unit.querySelector<HTMLButtonElement>(".play-from")!.addEventListener("click", () => {
      const remaining = units.slice(index);
      start(
        remaining.flatMap(item => [...item.querySelectorAll<HTMLButtonElement>("[data-audio]")]),
        remaining.reduce((count, item) => count + item.querySelectorAll("[data-language]").length, 0),
        index + 1,
      );
    });
  });
  stopButton.addEventListener("click", () => stop(t("stopped")));
  const pause = () => {
    if (!active) return;
    paused = true;
    clearTimeout(timer);
    audio.pause();
    status.textContent = t("paused");
    setPlaybackState("paused");
  };
  const resume = async () => {
    if (!active) return;
    // The cursor already points to the next clip while waiting. Do not replay
    // the ended clip when resuming from Android's notification controls.
    if (waiting) { await playCurrent(); return; }
    const token = generation;
    paused = false;
    showCurrent();
    try {
      await audio.play();
      if (generation === token && active) setPlaybackState("playing");
    } catch { if (generation === token && active) pause(); }
  };
  if (session) {
    for (const [action, handler] of [
      ["play", () => { void resume(); }],
      ["pause", pause],
      ["stop", () => stop(t("stopped"))],
    ] as const) {
      // Some browsers expose Media Session but support only some actions.
      try { session.setActionHandler(action, handler); } catch { /* Optional control. */ }
    }
  }
  audio.addEventListener("play", () => {
    if (!active) return;
    if (waiting) { void playCurrent(); return; }
    paused = false;
    showCurrent();
    setPlaybackState("playing");
  });
  audio.addEventListener("pause", () => {
    // Loading another source and reaching its end can also emit pause events.
    if (active && !waiting && audio.paused && !audio.ended) pause();
  });
  audio.addEventListener("ended", () => {
    if (!active || waiting) return;
    if (stream) { stop(t("finished") + skipped); return; }
    cursor++;
    if (cursor >= queue.length) { stop(t("finished") + skipped); return; }
    waiting = true;
    clearHighlight();
    status.textContent = t("waiting");
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
