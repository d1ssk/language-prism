import { isUiLocale, translate, type MessageKey } from "../i18n";
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
  let skipped = "";
  reader.querySelector<HTMLElement>(".reader-toolbar")!.hidden = false;
  reader.querySelectorAll<HTMLButtonElement>(".audio-button, .play-unit").forEach(button => button.hidden = false);
  const clearHighlight = () => buttons.forEach(button => {
    button.removeAttribute("aria-current");
    button.classList.remove("playing");
  });
  const stop = (message?: string) => {
    generation++;
    active = waiting = false;
    clearTimeout(timer);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    queue = [];
    clearHighlight();
    stopButton.disabled = true;
    if (message) status.textContent = message;
  };
  const playCurrent = async () => {
    if (!active) return;
    const token = generation;
    const button = queue[cursor];
    waiting = false;
    clearHighlight();
    button.classList.add("playing");
    button.setAttribute("aria-current", "true");
    audio.src = button.dataset.audio!;
    audio.defaultPlaybackRate = audio.playbackRate = Number(speed.value);
    status.textContent = `${button.dataset.label} · ${cursor + 1} / ${queue.length}${skipped}`;
    try { await audio.play(); }
    catch { if (generation === token && active) stop(t("playbackFailed")); }
  };
  const start = (next: HTMLButtonElement[], expected = next.length) => {
    stop();
    if (!next.length) { status.textContent = t("selectedNoAudio"); return; }
    skipped = expected > next.length ? t("skipped", { count: expected - next.length }) : "";
    queue = next;
    cursor = 0;
    active = true;
    stopButton.disabled = false;
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
  stopButton.addEventListener("click", () => stop(t("stopped")));
  audio.addEventListener("ended", () => {
    if (!active || waiting) return;
    cursor++;
    if (cursor >= queue.length) { stop(t("finished") + skipped); return; }
    waiting = true;
    clearHighlight();
    status.textContent = t("waiting");
    const token = generation;
    timer = setTimeout(() => { if (generation === token) void playCurrent(); }, Number(gap.value) * 1000);
  });
  audio.addEventListener("error", () => { if (active) stop(t("loadFailed")); });
  speed.addEventListener("change", () => { audio.defaultPlaybackRate = audio.playbackRate = Number(speed.value); });
  window.addEventListener("pagehide", () => stop());
}
