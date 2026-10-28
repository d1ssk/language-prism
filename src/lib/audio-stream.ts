// Keep the media element playing across MP3 boundaries. Only a small window is
// buffered; long articles must not be decoded or downloaded entirely up front.
export class AudioStream {
  static supported() {
    return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg");
  }

  private source = new MediaSource();
  private controller = new AbortController();
  private url = URL.createObjectURL(this.source);
  private buffer?: SourceBuffer;
  private ends: number[] = [];
  private next = 0;
  private current = -1;
  private busy = false;
  private refill?: number;

  constructor(
    private audio: HTMLAudioElement,
    private urls: string[],
    private onClip: (index: number) => void,
    private onError: () => void,
  ) {
    const { signal } = this.controller;
    this.source.addEventListener("sourceopen", () => {
      if (this.buffer) return;
      try {
        this.buffer = this.source.addSourceBuffer("audio/mpeg");
        this.buffer.mode = "sequence";
        void this.pump();
      } catch { this.fail(); }
    }, { signal });
    audio.addEventListener("timeupdate", () => {
      this.updateClip();
      void this.pump();
    }, { signal });
    audio.addEventListener("seeking", () => {
      const time = audio.currentTime;
      const ranges = this.buffer?.buffered;
      const buffered = ranges && Array.from({ length: ranges.length }, (_, index) =>
        time >= ranges.start(index) && time < ranges.end(index)).some(Boolean);
      const index = this.ends.findIndex(end => end > time);
      if (!buffered && index >= 0) this.refill = index;
      this.updateClip();
      void this.pump();
    }, { signal });
    audio.src = this.url;
  }

  dispose() {
    this.controller.abort();
    URL.revokeObjectURL(this.url);
  }

  private fail() {
    if (!this.controller.signal.aborted) this.onError();
  }

  private updateClip() {
    const index = this.ends.findIndex(end => end > this.audio.currentTime);
    if (index >= 0 && index !== this.current) {
      this.current = index;
      this.onClip(index);
    }
  }

  private update(operation: () => void) {
    const buffer = this.buffer!;
    const { signal } = this.controller;
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        buffer.removeEventListener("updateend", done);
        buffer.removeEventListener("error", failed);
        signal.removeEventListener("abort", failed);
      };
      const done = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("Audio buffer interrupted")); };
      buffer.addEventListener("updateend", done, { once: true });
      buffer.addEventListener("error", failed, { once: true });
      signal.addEventListener("abort", failed, { once: true });
      if (signal.aborted) { failed(); return; }
      try { operation(); } catch (error) { cleanup(); reject(error); }
    });
  }

  private async pump() {
    if (this.busy || !this.buffer || this.controller.signal.aborted || this.source.readyState === "closed") return;
    if (this.source.readyState === "ended" && this.refill === undefined) return;
    this.busy = true;
    const buffer = this.buffer;
    const { signal } = this.controller;
    try {
      while ((this.next < this.urls.length || this.refill !== undefined) && !signal.aborted) {
        if (this.refill !== undefined) {
          this.next = this.refill;
          this.refill = undefined;
        }
        const end = this.next > 0 ? this.ends[this.next - 1] : 0;
        // Leave at least 90 seconds of continuous native playback available.
        if (end - this.audio.currentTime >= 90) break;
        const response = await fetch(this.urls[this.next], { signal });
        if (!response.ok) throw new Error("Audio request failed");
        const bytes = await response.arrayBuffer();
        if (signal.aborted) return;
        const keepFrom = this.audio.currentTime - 30;
        if (buffer.buffered.length && keepFrom > buffer.buffered.start(0)) {
          await this.update(() => buffer.remove(buffer.buffered.start(0), keepFrom));
        }
        const keepUntil = this.audio.currentTime + 120;
        if (buffer.buffered.length && buffer.buffered.end(buffer.buffered.length - 1) > keepUntil) {
          await this.update(() => buffer.remove(keepUntil, buffer.buffered.end(buffer.buffered.length - 1)));
        }
        // Explicit offsets also let a seek refill audio already evicted from
        // memory. Setting timestampOffset reopens an ended MediaSource.
        buffer.timestampOffset = end;
        await this.update(() => buffer.appendBuffer(bytes));
        if (!buffer.buffered.length) throw new Error("Empty audio buffer");
        const appendedEnd = buffer.timestampOffset;
        if (appendedEnd <= end) throw new Error("Audio timeline did not advance");
        this.ends[this.next] = appendedEnd;
        this.next++;
        this.updateClip();
      }
      if (!signal.aborted && this.next === this.urls.length && this.source.readyState === "open") {
        this.source.endOfStream();
      }
    } catch { this.fail(); }
    finally { this.busy = false; }
  }
}
