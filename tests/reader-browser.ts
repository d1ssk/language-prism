import { expect, type Browser, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { LANGUAGE_CODES } from "../src/lib/languages";
import { ROOT } from "../scripts/build/paths";

export async function checkAudioStream(browser: Browser, origin: string) {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const state = { plays: 0 };
    (window as any).__streamTest = state;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      state.plays++;
      return play.call(this);
    };
  });
  try {
    for (const locale of ["ja", "en"]) {
      await page.goto(`${origin}/${locale}/read/random-1/`);
      expect(await page.locator("#gap").inputValue()).toBe("0");
      const units = page.locator(".unit");
      const tail = units.nth(await units.count() - 2);
      const first = await tail.locator("[data-audio]").first().getAttribute("data-audio-key");
      await tail.locator(".play-from").click();
      const audio = page.locator("#audio-player");
      await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.05);
      const src = await audio.getAttribute("src");
      expect(src).toMatch(/^blob:/);
      // Cross a real clip boundary at accelerated speed. It must not call play
      // again or replace the media element's source.
      await audio.evaluate((el: HTMLAudioElement) => { el.playbackRate = 8; });
      await expect.poll(() => page.locator('[data-audio][aria-current="true"]').getAttribute("data-audio-key"), { timeout: 15000 }).not.toBe(first);
      expect(await audio.getAttribute("src")).toBe(src);
      expect(await page.evaluate(() => (window as any).__streamTest.plays)).toBe(1);
      await audio.evaluate((el: HTMLAudioElement) => { el.playbackRate = 1; el.pause(); });
      await expect(page.locator("#player-status")).toBeHidden();
      await audio.evaluate((el: HTMLAudioElement) => el.play());
      await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration)).toBeLessThan(Infinity);
      await audio.evaluate((el: HTMLAudioElement) => { el.currentTime = el.duration - 0.1; });
      await expect.poll(() => page.locator("#audio-player").getAttribute("src")).toBeNull();
      await expect(page.locator("#player-status")).toBeHidden();
    }

    // Shuffled playback also uses the continuous native audio stream.
    await page.goto(`${origin}/ja/read/random-1/`);
    await page.locator('#playback-order').selectOption('shuffle');
    await page.evaluate(() => { Math.random = () => 0; });
    await page.locator('#play-all').click();
    const shuffledAudio = page.locator('#audio-player');
    await expect.poll(() => shuffledAudio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.05);
    const shuffledSrc = await shuffledAudio.getAttribute('src');
    expect(shuffledSrc).toMatch(/^blob:/);
    await expect(page.locator('#playback-progress')).toHaveText(/ランダム \(1\//);
    await shuffledAudio.evaluate((el: HTMLAudioElement) => { el.playbackRate = 8; });
    await expect.poll(() => page.locator('[aria-current="true"][data-audio]').getAttribute('data-audio-key'), { timeout: 15000 }).toBe('u002/en');
    expect(await shuffledAudio.getAttribute('src')).toBe(shuffledSrc);
    expect(await page.evaluate(() => (window as any).__streamTest.plays)).toBe(1);
    await expect(page.locator('#playback-progress')).toHaveText(/ランダム \(2\//);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

    // Extend an already-buffered unit stream without replacing or restarting it.
    await page.goto(`${origin}/ja/read/random-1/`);
    await page.locator('.unit').nth(await page.locator('.unit').count() - 2).locator('.play-unit').click();
    const extendingAudio = page.locator('#audio-player');
    await expect.poll(() => extendingAudio.evaluate((el: HTMLAudioElement) => Number.isFinite(el.duration))).toBe(true);
    await extendingAudio.evaluate((el: HTMLAudioElement) => el.pause());
    const previous = await extendingAudio.evaluate((el: HTMLAudioElement) => ({ src: el.src, time: el.currentTime, duration: el.duration }));
    await page.locator('#continue-to-end').click();
    await expect.poll(() => extendingAudio.evaluate((el: HTMLAudioElement) => el.duration)).toBeGreaterThan(previous.duration);
    expect(await extendingAudio.evaluate((el: HTMLAudioElement) => ({ src: el.src, time: el.currentTime, paused: el.paused }))).toEqual({ src: previous.src, time: previous.time, paused: true });
    await expect(page.locator('#continue-to-end')).toBeDisabled();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

    // A long article buffers a bounded window, then refills evicted audio when
    // the user seeks back. The same source remains attached throughout.
    await page.goto(`${origin}/ja/read/random-1/`);
    let requests = 0;
    page.on("request", request => { if (request.url().endsWith(".mp3")) requests++; });
    await page.locator("#play-all").click();
    const audio = page.locator("#audio-player");
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0), { timeout: 15000 }).toBeGreaterThanOrEqual(90);
    expect(requests).toBeLessThan(100);
    const src = await audio.getAttribute("src");
    await audio.evaluate((el: HTMLAudioElement) => { el.currentTime = 75; });
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.buffered.start(0)), { timeout: 15000 }).toBeGreaterThan(30);
    await audio.evaluate((el: HTMLAudioElement) => { el.currentTime = 0; });
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 15000 }).toBeGreaterThan(0.05);
    expect(await audio.getAttribute("src")).toBe(src);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    expect(await audio.getAttribute("src")).toBeNull();
    await page.locator('[data-audio-key="u002/ko"]').click();
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.05);
    expect(await audio.getAttribute("src")).toMatch(/u002\/ko\.mp3$/);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    expect(errors).toEqual([]);
  } finally { await page.close(); }
}

export async function checkReader(browser: Browser, origin: string, mode: string, screenshots: string) {
  const work = JSON.parse(fs.readFileSync(path.join(ROOT, "content/public/practical/random-1/content.json"), "utf8"));
  const keys = work.units.flatMap((u: { id: string }) => LANGUAGE_CODES.map(code => `${u.id}/${code}`));
  const noJs = await browser.newPage({ javaScriptEnabled: false });
  try {
    await noJs.goto(`${origin}/ja/read/random-1/`);
    await expect(noJs.locator(".reading-text")).toHaveCount(keys.length);
    await expect(noJs.locator("noscript audio")).toHaveCount(keys.length);
    await expect(noJs.locator(".reader-toolbar")).toBeHidden();
    await expect(noJs.locator(".play-from:visible")).toHaveCount(0);
    await noJs.locator(".sentence-details summary").first().click();
    await expect(noJs.locator(".explanation").first()).toBeVisible();
  } finally { await noJs.close(); }
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    for (const locale of ["ja", "en"]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${origin}/${locale}/read/random-1/`);
      await expect(page.locator("h1")).toHaveText(locale === "ja" ? "ランダム 1" : "Random 1");
      await expect(page.locator(".reader-toolbar")).toBeVisible();
      await expect(page.locator('.reader-toolbar #play-all, .reader-toolbar #stop-audio')).toHaveCount(0);
      await expect(page.locator('#stop-audio')).toHaveCount(0);
      await expect(page.locator('.article-play-buttons #play-all')).toBeVisible();
      expect(await page.locator('.article-play-buttons').evaluate(el => {
        const play = el.querySelector('#play-all')!;
        const order = el.querySelector('.playback-order')!;
        const a = play.getBoundingClientRect(), b = order.getBoundingClientRect();
        return b.left > a.left && Math.abs((a.top + a.bottom) - (b.top + b.bottom)) < 2
          && getComputedStyle(play).fontSize === getComputedStyle(order).fontSize;
      })).toBe(true);
      await expect(page.locator(".audio-button:enabled")).toHaveCount(keys.length);
      await expect(page.locator(".play-unit:enabled")).toHaveCount(work.units.length);
      await expect(page.locator(".play-from:enabled")).toHaveCount(work.units.length);
      const displayCodes = locale === "en" ? ["en", "ja", "es", "fr", "de", "ru", "ar", "zh", "ko"] : LANGUAGE_CODES;
      expect(await page.locator(".reading-text").allTextContents()).toEqual(work.units.flatMap((u: any) => displayCodes.map(code => u.languages[code].text)));
      await expect(page.locator(".pronunciation-text")).toHaveCount(work.units.length * 2);
      await expect(page.locator('a[href="https://www.loc.gov/catdir/cpso/romanization/arabic.pdf"], a[href="https://web.mit.edu/jinzhang/www/pinyin/tones/"], a[href="https://madinaharabic.com/free-content/grammar/lesson-3/part-7"]')).toHaveCount(0);
      await expect(page.locator('a[href="https://learning.aljazeera.net/ar/node/248"]')).toHaveCount(1);
      for (const code of ["ar", "zh"]) {
        const block = page.locator(`#u001 [data-language="${code}"]`);
        await block.locator("summary").click();
        const reading = block.locator(".pronunciation-text");
        await expect(reading).toBeVisible();
        await expect(reading).toHaveText(work.units[0].languages[code].pronunciation.text);
        await expect(reading).toHaveAttribute("dir", "ltr");
        expect(await block.locator(".explanation").evaluate(el => el.firstElementChild?.classList.contains("pronunciation"))).toBe(true);
        await block.locator("summary").click();
      }
      await expect(page.locator('.reading-text[lang="ar"]')).toHaveCount(work.units.length);
      expect(await page.locator('.reading-text[lang="ar"]').first().getAttribute("dir")).toBe("rtl");
      await page.locator(".sentence-details summary").first().click();
      await expect(page.locator(".explanation").first()).toContainText(locale === "ja" ? "朝の時間" : "The past tense");
      await page.locator(".sentence-details summary").first().focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".explanation").first()).toBeHidden();
      await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-reader-desktop.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator("#u001 .play-from")).toBeVisible();
      await page.locator('#u001 [data-language="ar"] summary').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("h1").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-reader-mobile.png`) });
      await page.locator(".locale-nav a").click();
      await expect(page).toHaveURL(`${origin}/${locale === "ja" ? "en" : "ja"}/read/random-1/`);
    }
    await page.goto(`${origin}/ja/read/random-1/`);
    // Decode and play actual generated MP3s in Chrome, including a non-Latin language.
    for (const key of ["u001/ja", "u002/ar", "u003/zh", `${work.units.at(-1).id}/ko`]) {
      await page.locator(`[data-audio-key="${key}"]`).click();
      await expect.poll(() => page.locator("#audio-player").evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.15);
      expect(await page.locator("#audio-player").evaluate((el: HTMLAudioElement) => Number.isFinite(el.duration) && el.duration > 0)).toBe(true);
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      await expect(page.locator("#audio-player")).toBeVisible();
    }
    expect(errors).toEqual([]);
  } finally { await page.close(); }

  // Control media completion deterministically to exercise every queue transition.
  const context = await browser.newContext();
  await context.addInitScript(() => {
    // This context verifies the per-clip fallback independently of MSE.
    Object.defineProperty(window, "MediaSource", { value: undefined });
    const state = {
      played: [] as string[], reject: false,
      actions: {} as Record<string, () => void>,
    };
    (window as any).__mediaTest = state;
    Object.defineProperty(navigator, "mediaSession", { value: {
      metadata: null,
      playbackState: "none",
      setActionHandler(action: string, handler: () => void) { state.actions[action] = handler; },
    } });
    HTMLMediaElement.prototype.play = function () {
      state.played.push(this.getAttribute("src") || "");
      return state.reject ? Promise.reject(new Error("test rejection")) : Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
  });
  const mock = await context.newPage();
  const played = () => mock.evaluate(() => (window as any).__mediaTest.played.map((url: string) => url.match(/(u\d+\/[a-z]+)\.mp3$/)![1]));
  const reset = () => mock.evaluate(() => { (window as any).__mediaTest.played = []; });
  const ended = () => mock.locator("#audio-player").dispatchEvent("ended");
  async function setting(page: Page, id: string, value: string) {
    if (await page.locator("#audio-settings").isHidden()) {
      await page.locator(".audio-settings-toggle").click();
    }
    await page.locator(id).selectOption(value);
  }
  try {
    await mock.goto(`${origin}/ja/read/random-1/`);
    await setting(mock, "#gap", "0");
    await setting(mock, "#speed", "1.5");
    await expect(mock.locator('#continue-to-end')).toBeDisabled();
    await expect(mock.locator('#jump-to-playing')).toBeDisabled();
    await mock.locator('[data-audio-key="u002/ko"]').click();
    await expect(mock.locator('#playback-progress')).toBeHidden();
    await mock.evaluate(() => (window as any).__mediaTest.actions.pause());
    await mock.locator('#continue-to-end').click();
    await expect(mock.locator('#playback-progress')).toHaveText(`(18/${keys.length})`);
    expect(await played()).toEqual(['u002/ko']);
    expect(await mock.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');
    await expect(mock.locator('#continue-to-end')).toBeDisabled();
    await mock.emulateMedia({ reducedMotion: 'reduce' });
    await mock.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await mock.locator('#jump-to-playing').click();
    const visible = await mock.locator('[data-audio-key="u002/ko"]').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom < document.querySelector('.reader-toolbar')!.getBoundingClientRect().top;
    });
    expect(visible).toBe(true);
    expect(await played()).toEqual(['u002/ko']);
    await mock.evaluate(() => (window as any).__mediaTest.actions.play());
    await ended();
    expect(await played()).toEqual(['u002/ko', 'u002/ko', 'u003/ja']);
    await expect(mock.locator('#playback-progress')).toHaveText(`(19/${keys.length})`);
    await mock.evaluate(() => (window as any).__mediaTest.actions.stop());
    await expect(mock.locator('#playback-progress')).toBeHidden();
    await expect(mock.locator('#jump-to-playing')).toBeEnabled();
    await expect(mock.locator('#jump-to-playing')).toHaveText('最後に再生した文へ移動');
    await expect(mock.locator('#continue-to-end')).toBeDisabled();
    await mock.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await mock.locator('#jump-to-playing').click();
    expect(await mock.locator('[data-audio-key="u003/ja"]').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom < document.querySelector('.reader-toolbar')!.getBoundingClientRect().top;
    })).toBe(true);
    expect(await played()).toEqual(['u002/ko', 'u002/ko', 'u003/ja']);
    await mock.locator('[data-audio-key="u002/ko"]').click();
    await ended();
    await expect(mock.locator('#jump-to-playing')).toBeEnabled();
    await mock.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await mock.locator('#jump-to-playing').click();
    expect(await mock.locator('[data-audio-key="u002/ko"]').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom < document.querySelector('.reader-toolbar')!.getBoundingClientRect().top;
    })).toBe(true);
    await reset();
    // A zero-gap transition must run in the ended event, without waiting for a
    // background timer. Notification pause/play must retain the current queue.
    await mock.locator("#play-all").click();
    await expect(mock.locator('#playback-progress')).toHaveText(`(1/${keys.length})`);
    expect(await mock.evaluate(() => navigator.mediaSession.playbackState)).toBe("playing");
    expect(await mock.evaluate(() => navigator.mediaSession.metadata?.title)).toBe("ランダム 1");
    expect(await mock.evaluate(() => {
      document.querySelector("#audio-player")!.dispatchEvent(new Event("ended"));
      return (window as any).__mediaTest.played.length;
    })).toBe(2);
    await mock.evaluate(() => (window as any).__mediaTest.actions.pause());
    expect(await mock.evaluate(() => navigator.mediaSession.playbackState)).toBe("paused");
    await expect(mock.locator("#player-status")).toBeHidden();
    await mock.evaluate(() => (window as any).__mediaTest.actions.play());
    expect(await played()).toEqual(["u001/ja", "u001/en", "u001/en"]);
    await ended();
    expect(await played()).toEqual(["u001/ja", "u001/en", "u001/en", "u001/es"]);
    await mock.evaluate(() => (window as any).__mediaTest.actions.stop());
    expect(await mock.evaluate(() => navigator.mediaSession.playbackState)).toBe("none");
    expect(await mock.evaluate(() => navigator.mediaSession.metadata)).toBeNull();

    // Pausing between clips cancels the pending transition; resume starts the
    // next clip once, and the old timer must not later advance it again.
    await setting(mock, "#gap", "0.5");
    await reset();
    await mock.locator("#play-all").click();
    await ended();
    await mock.evaluate(() => (window as any).__mediaTest.actions.pause());
    await mock.waitForTimeout(650);
    expect(await played()).toEqual(["u001/ja"]);
    await mock.evaluate(() => (window as any).__mediaTest.actions.play());
    await mock.waitForTimeout(650);
    expect(await played()).toEqual(["u001/ja", "u001/en"]);
    await mock.evaluate(() => (window as any).__mediaTest.actions.stop());
    await reset();
    await setting(mock, "#gap", "0");
    const unitsTop = () => mock.locator(".units").evaluate(el => el.getBoundingClientRect().top + window.scrollY);
    const initialTop = await unitsTop();
    await mock.locator("#play-all").click();
    expect(await unitsTop()).toBe(initialTop);
    for (let i = 0; i < keys.length; i++) {
      await expect.poll(played).toEqual(keys.slice(0, i + 1));
      await expect(mock.locator(`[data-audio-key="${keys[i]}"]`)).toHaveAttribute("aria-current", "true");
      expect(await mock.locator("#audio-player").evaluate((el: HTMLAudioElement) => el.playbackRate)).toBe(1.5);
      await ended();
    }
    await expect(mock.locator("#player-status")).toBeHidden();
    expect(await unitsTop()).toBe(initialTop);
    await expect.poll(() => mock.locator("#audio-player").getAttribute("src")).toBeNull();
    await reset();
    await mock.locator("#u002 .play-unit").click();
    for (let i = 0; i < 9; i++) {
      await expect.poll(played).toEqual(keys.slice(9, 10 + i));
      await ended();
    }
    await expect.poll(() => mock.locator("#audio-player").getAttribute("src")).toBeNull();
    await reset();
    await mock.locator('[data-audio-key="u001/fr"]').click();
    await ended();
    expect(await played()).toEqual(["u001/fr"]);
    await expect.poll(() => mock.locator("#audio-player").getAttribute("src")).toBeNull();

    await setting(mock, "#gap", "0.5");
    await reset();
    await mock.locator("#play-all").click();
    await ended();
    await mock.evaluate(() => (window as any).__mediaTest.actions.stop());
    await mock.waitForTimeout(650);
    expect(await played()).toEqual(["u001/ja"]);
    await mock.locator("#play-all").click();
    await ended();
    await mock.locator('[data-audio-key="u002/ko"]').click();
    await mock.waitForTimeout(650);
    expect(await played()).toEqual(["u001/ja", "u001/ja", "u002/ko"]);
    await mock.locator("#audio-player").dispatchEvent("error");
    await expect(mock.locator("#player-status")).toContainText("読み込めませんでした");
    await expect.poll(() => mock.locator("#audio-player").getAttribute("src")).toBeNull();
    await mock.evaluate(() => { (window as any).__mediaTest.reject = true; });
    await mock.locator("#play-all").click();
    await expect(mock.locator("#player-status")).toContainText("再生できませんでした");
    await mock.evaluate(() => { (window as any).__mediaTest.reject = false; });

    // Starting partway through follows DOM order and retains the start position
    // after a notification pause/resume, without including earlier groups.
    await setting(mock, "#gap", "0");
    await reset();
    await mock.locator("#u002 .play-from").focus();
    await mock.keyboard.press("Enter");
    expect(await played()).toEqual([keys[9]]);
    await expect(mock.locator("#player-status")).toBeHidden();
    await mock.evaluate(() => (window as any).__mediaTest.actions.pause());
    await mock.evaluate(() => (window as any).__mediaTest.actions.play());
    await expect(mock.locator("#player-status")).toBeHidden();
    await ended();
    expect(await played()).toEqual([keys[9], keys[9], keys[10]]);
    await mock.evaluate(() => (window as any).__mediaTest.actions.stop());

    const tailUnit = work.units.at(-2).id;
    for (const locale of ["ja", "en"]) {
      await mock.goto(`${origin}/${locale}/read/random-1/`);
      await setting(mock, "#gap", "0");
      const order = locale === "ja" ? LANGUAGE_CODES : ["en", "ja", "es", "fr", "de", "ru", "ar", "zh", "ko"];
      const expected = work.units.slice(-2).flatMap((unit: { id: string }) => order.map(code => `${unit.id}/${code}`));
      await mock.locator(`#${tailUnit} .play-from`).click();
      for (let i = 0; i < expected.length; i++) {
        expect(await played()).toEqual(expected.slice(0, i + 1));
        await expect(mock.locator('#playback-progress')).toHaveText(`(${keys.length - expected.length + i + 1}/${keys.length})`);
        await expect(mock.locator("#player-status")).toBeHidden();
        await ended();
      }
      await expect.poll(() => mock.locator("#audio-player").getAttribute("src")).toBeNull();
      await expect(mock.locator('#playback-progress')).toBeHidden();
      await expect(mock.locator("#player-status")).toBeHidden();
    }
    await mock.goto(`${origin}/ja/read/random-1/`);

    // Changing playback state must not move the sentences, including on mobile.
    await mock.evaluate(() => { (window as any).__mediaTest.reject = false; });
    for (const width of [1440, 390]) {
      await mock.setViewportSize({ width, height: 900 });
      await setting(mock, "#gap", "0.5");
      const top = await unitsTop();
      await reset();
      await mock.locator("#play-all").click();
      expect(await unitsTop()).toBe(top);
      await ended();
      await expect(mock.locator("#player-status")).toBeHidden();
      await expect(mock.locator("#audio-player")).toBeVisible();
      expect(await unitsTop()).toBe(top);
      await expect.poll(played).toEqual(["u001/ja", "u001/en"]);
      expect(await unitsTop()).toBe(top);
      await mock.evaluate(() => (window as any).__mediaTest.actions.stop());
      expect(await unitsTop()).toBe(top);
    }

    // English UI: both whole-article and per-unit queues match the visible order.
    await mock.goto(`${origin}/en/read/random-1/`);
    await setting(mock, "#gap", "0");
    const englishKeys = work.units.flatMap((unit: { id: string }) =>
      ["en", "ja", "es", "fr", "de", "ru", "ar", "zh", "ko"].map(code => `${unit.id}/${code}`));
    for (const [selector, expected] of [["#play-all", englishKeys], ["#u002 .play-unit", englishKeys.slice(9, 18)]] as [string, string[]][]) {
      await reset();
      await mock.locator(selector).click();
      for (let i = 0; i < expected.length; i++) {
        await expect.poll(played).toEqual(expected.slice(0, i + 1));
        await ended();
      }
      await expect(mock.locator("#player-status")).toBeHidden();
    }
    await mock.goto(`${origin}/ja/read/random-1/`);

    // Shuffle only groups. Each language keeps its displayed order, each clip
    // occurs once, and selecting another order does not mutate an active queue.
    for (const locale of ['ja', 'en']) {
      await mock.goto(`${origin}/${locale}/read/random-1/`);
      await mock.emulateMedia({ reducedMotion: 'reduce' });
      await expect(mock.locator('#playback-order')).toHaveValue('listed');
      await mock.locator('#playback-order').selectOption('shuffle');
      await mock.evaluate(() => { Math.random = () => 0; });
      const languages = locale === 'ja' ? LANGUAGE_CODES : ['en', 'ja', 'es', 'fr', 'de', 'ru', 'ar', 'zh', 'ko'];
      const reordered = [...work.units.slice(1), work.units[0]];
      const expected = reordered.flatMap((unit: { id: string }) => languages.map(code => `${unit.id}/${code}`));
      await mock.locator('#play-all').click();
      await expect(mock.locator('#continue-to-end')).toBeDisabled();
      const label = locale === 'ja' ? 'ランダム' : 'Shuffled';
      await expect(mock.locator('#playback-progress')).toHaveText(`${label} (1/${expected.length})`);
      await mock.evaluate(() => (window as any).__mediaTest.actions.pause());
      await mock.locator('#playback-order').selectOption('listed');
      await mock.evaluate(() => (window as any).__mediaTest.actions.play());
      expect(await played()).toEqual([expected[0], expected[0]]);
      await reset();
      await mock.evaluate(count => {
        for (let i = 0; i < count; i++) document.querySelector('#audio-player')!.dispatchEvent(new Event('ended'));
      }, expected.length - 1);
      expect(await played()).toEqual(expected.slice(1));
      await expect(mock.locator('#playback-progress')).toHaveText(`${label} (${expected.length}/${expected.length})`);
      await mock.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await mock.locator('#jump-to-playing').click();
      expect(await mock.locator(`[data-audio-key="${expected.at(-1)}"]`).evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom < document.querySelector('.reader-toolbar')!.getBoundingClientRect().top;
      })).toBe(true);
      await ended();
      await expect.poll(() => mock.locator("#audio-player").getAttribute("src")).toBeNull();
      await expect(mock.locator('#playback-progress')).toBeHidden();
      await reset();
      await mock.locator('#playback-order').selectOption('shuffle');
      await mock.evaluate(() => { Math.random = () => 0.999999; });
      await mock.locator('#play-all').click();
      expect(await played()).toEqual([`u001/${languages[0]}`]);
      await mock.locator('[data-audio-key="u002/ko"]').click();
      await expect(mock.locator('#playback-progress')).toBeHidden();
      await mock.locator('#continue-to-end').click();
      await expect(mock.locator('#playback-progress')).toHaveText(`(18/${keys.length})`);
      await ended();
      expect((await played()).at(-1)).toBe(`u003/${languages[0]}`);
      await mock.evaluate(() => (window as any).__mediaTest.actions.stop());
    }
    await mock.goto(`${origin}/ja/read/random-1/`);

    // Omit just one audio reference in a fresh document; missing clips must be skipped.
    await mock.route("**/ja/read/random-1/", async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace(/ data-audio="[^"]+"/, '') });
    });
    await mock.reload();
    await setting(mock, "#gap", "0");
    await mock.locator("#play-all").click();
    await expect.poll(played).toEqual(["u001/en"]);
    await expect(mock.locator("#player-status")).toBeHidden();
    await mock.locator("#u001 .play-from").click();
    expect(await played()).toEqual(["u001/en", "u001/en"]);
    await expect(mock.locator("#player-status")).toBeHidden();
    await mock.evaluate(() => (window as any).__mediaTest.actions.stop());
    await reset();
    await mock.locator('#playback-order').selectOption('shuffle');
    await mock.evaluate(() => { Math.random = () => 0.999999; });
    await mock.locator('#play-all').click();
    await expect(mock.locator('#playback-progress')).toHaveText(`ランダム (1/${keys.length - 1})`);
    await mock.evaluate(count => {
      for (let i = 0; i < count; i++) document.querySelector('#audio-player')!.dispatchEvent(new Event('ended'));
    }, keys.length - 1);
    expect(await played()).toEqual(keys.slice(1));
    await expect.poll(() => mock.locator("#audio-player").getAttribute("src")).toBeNull();
  } finally { await context.close(); }
}
