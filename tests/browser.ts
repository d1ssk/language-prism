// Explicit browser QA for the archive and sentence player. npm test does not launch a browser.
import { chromium, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { checkReader, checkAudioStream } from "./reader-browser";
import { ROOT, inside } from "../scripts/build/paths";
import { displayLanguages } from "../src/lib/languages";
const screenshots = path.join(ROOT, ".cache/screenshots");
const audioLibrarySlugs = ["baudelaire-letranger", "turgenev-sparrow", "su-shi-red-cliff-opening", "soseki-kusamakura-opening", "darwin-origin", "descartes-method", "smith-wealth", "rousseau-contract", "mencius-fish", "cervantes-quixote"];
const textLibrarySlugs = ["declaration-independence", "paine-common-sense", "communist-manifesto", "ibn-khaldun-injustice", "lincoln-gettysburg-address", "euclid-elements", "caesar-gaul", "bhagavad-gita", "red-chamber", "dante-comedy"];
const librarySlugs = [...audioLibrarySlugs, ...textLibrarySlugs];
const newTextArticles = {
  grammar: ["existence-and-location", "negation-and-questions", "experiences"],
  practical: ["greetings", "first-conversations", "asking-for-clarification", "ordering-at-a-cafe", "directions-and-transport"],
};
fs.mkdirSync(screenshots, { recursive: true });
async function serve(mode: string) {
  const root = path.join(ROOT, "dist", mode);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!inside(root, file)) {
      response.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      "Content-Type",
      (
        {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css",
          ".js": "text/javascript",
          ".json": "application/json",
        } as Record<string, string>
      )[path.extname(file)] || "application/octet-stream",
    );
    fs.createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  };
}
const browser = await chromium.launch({
  ...(process.env.PRISM_BROWSER_EXECUTABLE
    ? { executablePath: process.env.PRISM_BROWSER_EXECUTABLE }
    : process.platform === "darwin"
      ? { channel: "chrome" }
      : {}),
  headless: true,
});
try {
  for (const mode of ["public", "local"]) {
    if (!fs.existsSync(path.join(ROOT, "dist", mode, "index.html"))) continue;
    const site = await serve(mode);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      javaScriptEnabled: false,
    });
    try {
      await page.goto(site.url);
      await expect(page).toHaveURL(site.url + "/ja/");
      for (const locale of ["ja", "en"] as const) {
        const other = locale === "ja" ? "en" : "ja";
        const otherLabel = other === "ja" ? "日本語" : "English";
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${site.url}/${locale}/`);
        await page.bringToFront();
        await page.waitForTimeout(150);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("h1")).toHaveText("language prism");
        await expect(
          page.locator('.work-card, input[type="search"]'),
        ).toHaveCount(0);
        await expect(page.locator(".masthead")).toHaveCount(1);
        await expect(page.locator(".masthead .brand")).toHaveAttribute("href", `/${locale}/`);
        await expect(page.locator(".collection-links a")).toHaveCount(3);
        await expect(page.locator(".collection-links a")).toHaveText(["Practical →", "Grammar →", "Library →"]);
        await expect(page.locator(".home-prose").getByRole("link", { name: "Chatterbox", exact: true })).toHaveAttribute("href", "https://github.com/resemble-ai/chatterbox");
        await expect(page.locator("footer a")).toHaveText("© Daichi Sasaki");
        await expect(page.locator("footer a")).toHaveAttribute(
          "href",
          "https://d1ssk.github.io/",
        );
        await expect(page.locator(".home-prose")).toContainText(
          locale === "ja"
            ? "特別な選定基準はありません"
            : "without any particular selection criteria",
        );
        const practical = await page
          .locator(".collection-links a")
          .nth(0)
          .boundingBox();
        const grammar = await page
          .locator(".collection-links a")
          .nth(1)
          .boundingBox();
        const library = await page.locator(".collection-links a").nth(2).boundingBox();
        expect(grammar!.y).toBeGreaterThanOrEqual(practical!.y + practical!.height);
        expect(library!.y).toBeGreaterThanOrEqual(
          grammar!.y + grammar!.height,
        );
        const style = await page.evaluate(() => {
          const body = getComputedStyle(document.querySelector(".home-prose")!);
          const link = getComputedStyle(
            document.querySelector(".collection-links a")!,
          );
          return {
            bodyFamily: body.fontFamily,
            linkFamily: link.fontFamily,
            bodySize: parseFloat(body.fontSize),
            linkSize: parseFloat(link.fontSize),
            border: parseFloat(link.borderTopWidth),
          };
        });
        expect(style.linkFamily).not.toBe(style.bodyFamily);
        expect(style.linkFamily).toContain("Georgia");
        expect(style.linkSize).toBeGreaterThan(style.bodySize);
        expect(style.border).toBeGreaterThan(0);
        await page.screenshot({
          path: path.join(screenshots, `${mode}-${locale}-home-desktop.png`),
          fullPage: true,
        });
        await page
          .locator(".locale-nav")
          .getByRole("link", { name: otherLabel })
          .click();
        await expect(page).toHaveURL(`${site.url}/${other}/`);
        await page.goto(`${site.url}/${locale}/`);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await page.waitForTimeout(150);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: path.join(screenshots, `${mode}-${locale}-home-mobile.png`),
          fullPage: true,
        });
        await page.locator(".guide-link").click();
        await expect(page).toHaveURL(`${site.url}/${locale}/guide/`);
        await expect(page.locator("h1")).toHaveText(locale === "ja" ? "表記・学習ガイド" : "Notation and study guide");
        await expect(page.locator("#references li")).toHaveCount(3);
        await expect(page.locator("#arabic")).toContainText("ā / ī / ū");
        await expect(page.locator("#pinyin")).toContainText("hǎojiǔ");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-guide-mobile.png`), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-guide-desktop.png`), fullPage: true });
        await page.locator(".locale-nav").getByRole("link", { name: otherLabel }).click();
        await expect(page).toHaveURL(`${site.url}/${other}/guide/`);
        await page.locator(".back-link").click();
        await expect(page).toHaveURL(`${site.url}/${other}/`);
        await page.goto(`${site.url}/${locale}/`);
        await page.setViewportSize({ width: 390, height: 844 });
        for (const title of ["Practical", "Grammar", "Library"]) {
          const collection = title.toLowerCase();
          await page.getByRole("link", { name: title, exact: false }).click();
          await expect(page).toHaveURL(`${site.url}/${locale}/${collection}/`);
          await expect(page.locator("h1")).toHaveText(title);
          await expect(page.locator(".work-header .intro")).toHaveCount(0);
          if (collection === "library") {
            await expect(page.locator(".empty-state")).toHaveCount(0);
            await expect(page.locator(".work-card")).toHaveCount(librarySlugs.length);
            await expect(page.locator(".library-list")).toHaveCount(1);
            await expect(page.locator("main h2")).toHaveCount(0);
            for (const slug of librarySlugs) {
              const work = JSON.parse(fs.readFileSync(path.join(ROOT, "content/public/library", slug, "content.json"), "utf8"));
              const link = page.locator(`.work-card a[href="/${locale}/read/${slug}/"]`);
              await expect(link).toHaveText(`${work.bibliography.originalTitle} — ${work.bibliography.originalAuthor}`);
              await expect(link.locator("bdi")).toHaveAttribute("lang", work.originalLanguage);
              const description = link.locator("..").locator(".work-description");
              await expect(description).toContainText(`${work.bibliography.title[locale]} — ${work.bibliography.author[locale]}`);
              if (work.excerpt.location) await expect(description).toContainText(work.excerpt.location[locale]);
              const status = link.locator("..").locator(".work-audio-status");
              if (audioLibrarySlugs.includes(slug)) {
                await expect(status).toHaveText(locale === "ja" ? "音声あり" : "With audio");
                await expect(status.locator("svg")).toHaveAttribute("aria-hidden", "true");
              } else {
                await expect(status).toHaveCount(0);
              }
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-library-mobile.png`), fullPage: true });
            await page.locator(".library-plans-link a").click();
            await expect(page).toHaveURL(`${site.url}/${locale}/library/plans/`);
            await expect(page.locator("h1")).toHaveText(locale === "ja" ? "今後扱いたい題材" : "Future Library selections");
            await expect(page.locator(".plans-list")).toHaveCount(1);
            await expect(page.locator(".plans-list > li")).toHaveCount(39);
            await expect(page.locator(".plans-list h2")).toHaveCount(39);
            await expect(page.locator('.library-plans a[href^="http"]')).toHaveCount(0);
            await expect(page.locator(".plans-list h2 a")).toHaveCount(0);
            await expect(page.locator(".plan-passage")).toHaveCount(39);
            await expect(page.locator(".plan-description")).toHaveCount(39);
            for (const slug of [...librarySlugs]) {
              await expect(page.locator(`#${slug}`)).toHaveCount(0);
            }
            await expect(page.locator(".plans-list h2").first()).toHaveText(locale === "ja" ? "『荘子』" : "Zhuangzi");
            await expect(page.locator("#hobbes-leviathan .plan-passage")).toHaveText(locale === "ja" ? "候補箇所：第13章" : "Passage: Chapter 13");
            await expect(page.locator("#kant-critique .plan-note")).toHaveCount(0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-library-plans-mobile.png`) });
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.waitForTimeout(150);
            await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-library-plans-desktop.png`) });
            await page.locator(".locale-nav").getByRole("link", { name: otherLabel }).click();
            await expect(page).toHaveURL(`${site.url}/${other}/library/plans/`);
            await page.locator(".back-link").click();
            await expect(page).toHaveURL(`${site.url}/${other}/library/`);
            await page.goto(`${site.url}/${locale}/library/`);
            await page.setViewportSize({ width: 390, height: 844 });
          } else {
            await expect(page.locator(".work-card")).toHaveCount(collection === "grammar" ? 3 : 6);
            if (collection === "practical") {
              expect(await page.locator(".work-card a").evaluateAll(els => els.map(el => el.getAttribute("href")))).toEqual(["random-1", "greetings", "first-conversations", "asking-for-clarification", "directions-and-transport", "ordering-at-a-cafe"].map(slug => `/${locale}/read/${slug}/`));
              await expect(page.locator(`.work-card a[href="/${locale}/read/random-1/"]`)).toHaveText(locale === "ja" ? "ランダム 1" : "Random 1");
              await expect(page.locator(".work-card .work-audio-status")).toHaveText(locale === "ja" ? "音声あり" : "With audio");
            } else {
              await expect(page.locator(".work-card .work-audio-status")).toHaveCount(0);
            }
            await expect(page.locator(".work-description")).toHaveCount(0);
            await expect(page.locator(".library-plans-link")).toHaveCount(0);
            for (const slug of newTextArticles[collection as keyof typeof newTextArticles]) {
              const work = JSON.parse(fs.readFileSync(path.join(ROOT, "content/public", collection, slug, "content.json"), "utf8"));
              await page.locator(`.work-card a[href="/${locale}/read/${slug}/"]`).click();
              await expect(page.locator("h1")).toHaveText(work.title[locale]);
              await expect(page.locator(".unit")).toHaveCount(work.units.length);
              expect(await page.locator(".unit").evaluateAll(els => els.map(el => el.id))).toEqual(work.units.map((unit: { id: string }) => unit.id));
              const sectionTitles = work.units.filter((unit: { heading?: unknown }) => unit.heading);
              await expect(page.locator(".unit-section-title")).toHaveText(sectionTitles.map((unit: { heading: Record<string, string> }) => unit.heading[locale]));
              const entries = work.units.flatMap((unit: { languages: Record<string, unknown> }) => Object.values(unit.languages)) as { pronunciation?: unknown }[];
              await expect(page.locator(".reading-text")).toHaveCount(entries.length);
              await expect(page.locator("audio, .reader-toolbar")).toHaveCount(0);
              await expect(page.locator(".pronunciation-text")).toHaveCount(entries.filter(entry => entry.pronunciation).length);
              await expect(page.locator(".language-block").first()).toHaveAttribute("data-language", locale);
              await page.locator('#u001 [data-language="ar"] summary').click();
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
              if (slug === "existence-and-location" || slug === "ordering-at-a-cafe")
                await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-${slug}-mobile.png`) });
              if (slug === "greetings") {
                await expect(page.locator(".missing-language")).toHaveCount(0);
                await expect(page.locator("#u019 .no-equivalent")).toHaveCount(7);
                await expect(page.locator("#u019 .reading-text")).toHaveCount(2);
                await expect(page.locator("#u019 .no-equivalent .audio-button, #u019 .no-equivalent .reading-text")).toHaveCount(0);
                await expect(page.locator('#u019 [data-language="en"]')).toContainText("Enjoy your meal");
                await page.locator('#u019 [data-language="en"] summary').click();
                await expect(page.locator('#u019 [data-language="en"] p')).toBeVisible();
                await page.locator("#u019").scrollIntoViewIfNeeded();
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                await page.screenshot({ path: path.join(screenshots, `${mode}-${locale}-greetings-no-equivalent-mobile.png`) });
              }
              await page.locator(".locale-nav").getByRole("link", { name: otherLabel }).click();
              await expect(page).toHaveURL(`${site.url}/${other}/read/${slug}/`);
              await expect(page.locator("h1")).toHaveText(work.title[other]);
              await expect(page.locator(".unit-section-title")).toHaveText(sectionTitles.map((unit: { heading: Record<string, string> }) => unit.heading[other]));
              await page.locator(".back-link").click();
              await expect(page).toHaveURL(`${site.url}/${other}/${collection}/`);
              await page.goto(`${site.url}/${locale}/${collection}/`);
            }
          }
          await page
            .locator(".locale-nav")
            .getByRole("link", { name: otherLabel })
            .click();
          await expect(page).toHaveURL(`${site.url}/${other}/${collection}/`);
          await page.locator(".back-link").click();
          await expect(page).toHaveURL(`${site.url}/${other}/`);
          await page.goto(`${site.url}/${locale}/`);
        }
      }
      for (const collection of ["practical", "grammar", "library"]) {
        await page.goto(`${site.url}/${collection}/`);
        await expect(page).toHaveURL(`${site.url}/ja/${collection}/`);
      }
      for (const route of [
        "/fr/",
        "/search-index.json",
        "/ja/read/a-small-conversation/",
        "/en/read/after-the-rain/",
        "/en/read/private-notebook/",
      ]) {
        expect((await page.request.get(site.url + route)).status()).toBe(404);
      }
      const libraryReader = await browser.newPage();
      try {
        for (const slug of audioLibrarySlugs) {
          const work = JSON.parse(fs.readFileSync(path.join(ROOT, "content/public/library", slug, "content.json"), "utf8"));
          const firstUnit = work.units[0];
          const lastUnit = work.units.at(-1);
          for (const locale of ["ja", "en"]) {
            await libraryReader.goto(`${site.url}/${locale}/read/${slug}/`);
            const originalTitle = `${work.bibliography.originalTitle} — ${work.bibliography.originalAuthor}`;
            await expect(libraryReader.locator("h1")).toHaveText(originalTitle);
            await expect(libraryReader).toHaveTitle(`${originalTitle} — language prism`);
            await expect(libraryReader.locator("h1 bdi")).toHaveAttribute("lang", work.originalLanguage);
            await expect(libraryReader.locator(".work-header .work-description")).toContainText(`${work.bibliography.title[locale]} — ${work.bibliography.author[locale]}`);
            if (work.excerpt.location) await expect(libraryReader.locator(".work-header .work-description")).toContainText(work.excerpt.location[locale]);
            await expect(libraryReader.locator(".unit")).toHaveCount(work.units.length);
            expect(await libraryReader.locator(".unit").evaluateAll(els => els.map(el => el.id))).toEqual(work.units.map((unit: { id: string }) => unit.id));
            await expect(libraryReader.locator(".audio-button:enabled")).toHaveCount(work.units.length * 9);
            await expect(libraryReader.locator(".pronunciation-text")).toHaveCount(work.units.length * 2);
            await expect(libraryReader.locator(".original-text")).toHaveCount(work.units.length);
            await expect(libraryReader.locator(`.original-text[lang="${work.originalLanguage}"]`)).toHaveCount(work.units.length);
            expect(await libraryReader.locator(".original-text").first().evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
            await expect(libraryReader.locator(".language-block").first()).toHaveAttribute("data-language", locale);
            await expect(libraryReader.locator(".source-details a")).toHaveAttribute("href", work.sourceURL);
            await libraryReader.setViewportSize({ width: 390, height: 844 });
            await libraryReader.locator(`#${firstUnit.id} [data-language="ar"] summary`).click();
            expect(await libraryReader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await libraryReader.locator("h1").scrollIntoViewIfNeeded();
            await libraryReader.screenshot({ path: path.join(screenshots, `${mode}-${locale}-${slug}-mobile.png`) });
            for (const unit of [firstUnit, lastUnit]) {
              await libraryReader.locator(`[data-audio-key="${unit.id}/${work.originalLanguage}"]`).click();
              await expect.poll(() => libraryReader.locator("#audio-player").evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.15);
              await libraryReader.locator("#stop-audio").click();
            }
          }
        }
      } finally { await libraryReader.close(); }
      const textReader = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const textErrors: string[] = [];
      const textMedia: string[] = [];
      textReader.on("pageerror", error => textErrors.push(error.message));
      textReader.on("request", request => { if (request.resourceType() === "media") textMedia.push(request.url()); });
      try {
        for (const slug of textLibrarySlugs) {
          const work = JSON.parse(fs.readFileSync(path.join(ROOT, "content/public/library", slug, "content.json"), "utf8"));
          for (const locale of ["ja", "en"]) {
            await textReader.goto(`${site.url}/${locale}/read/${slug}/`);
            await expect(textReader.locator(".unit")).toHaveCount(work.units.length);
            await expect(textReader.locator("audio, .reader-toolbar, .audio-button:visible, .play-unit:visible")).toHaveCount(0);
            await expect(textReader.locator(".reader > .notice")).toBeVisible();
            await expect(textReader.locator(".pronunciation-text")).toHaveCount(work.units.length * 2);
            const codes = locale === "ja" ? ["ja", "en", "es", "fr", "de", "ru", "ar", "zh", "ko"] : ["en", "ja", "es", "fr", "de", "ru", "ar", "zh", "ko"];
            if (!codes.includes(work.originalLanguage)) codes.splice(1, 0, work.originalLanguage);
            const rendered = await textReader.locator(".unit").evaluateAll(units => units.map(unit => ({
              id: unit.id,
              codes: Array.from(unit.querySelectorAll(".language-block")).map(el => el.getAttribute("data-language")),
              texts: Array.from(unit.querySelectorAll(".reading-text")).map(el => el.textContent),
              original: unit.querySelector(".original-text")?.getAttribute("lang"),
            })));
            expect(rendered).toEqual(work.units.map((unit: any) => ({ id: unit.id, codes, texts: codes.map(code => unit.languages[code].text), original: work.originalLanguage })));
            await textReader.locator(".source-details summary").click();
            await expect(textReader.locator(".source-details a")).toHaveAttribute("href", work.sourceURL);
            await textReader.locator(".source-details summary").click();
            await textReader.locator(".unit").first().locator('[data-language="ar"] summary').click();
            expect(await textReader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await textReader.locator("h1").scrollIntoViewIfNeeded();
            await textReader.screenshot({ path: path.join(screenshots, `${mode}-${locale}-${slug}-mobile.png`) });
            await textReader.locator(".locale-nav a").click();
            await expect(textReader).toHaveURL(`${site.url}/${locale === "ja" ? "en" : "ja"}/read/${slug}/`);
          }
        }
        expect(textErrors).toEqual([]);
        expect(textMedia).toEqual([]);
      } finally { await textReader.close(); }
      // Prepended passages retain old IDs; playback must follow text order, not ID order.
      const queueContext = await browser.newContext();
      await queueContext.addInitScript(() => {
        Object.defineProperty(window, "MediaSource", { value: undefined });
        (window as any).__libraryPlayed = [];
        HTMLMediaElement.prototype.play = function () {
          (window as any).__libraryPlayed.push(this.getAttribute("src"));
          return Promise.resolve();
        };
        HTMLMediaElement.prototype.pause = function () {};
        HTMLMediaElement.prototype.load = function () {};
      });
      const queuePage = await queueContext.newPage();
      try {
        const work = JSON.parse(fs.readFileSync(path.join(ROOT, "content/public/library/darwin-origin/content.json"), "utf8"));
        for (const locale of ["ja", "en"] as const) {
          await queuePage.goto(`${site.url}/${locale}/read/darwin-origin/`);
          await queuePage.locator(".audio-settings").evaluate((el: HTMLDetailsElement) => el.open = true);
          await queuePage.locator("#gap").selectOption("0");
          const expected = work.units.flatMap((unit: { id: string }) => displayLanguages(locale).map(language => `${unit.id}/${language.code}`));
          const played = () => queuePage.evaluate(() => (window as any).__libraryPlayed.map((url: string) => url.match(/(u\d+\/[a-z]+)\.mp3$/)![1]));
          await queuePage.locator("#play-all").click();
          for (let i = 0; i < expected.length; i++) {
            await expect.poll(played).toEqual(expected.slice(0, i + 1));
            await queuePage.locator("#audio-player").dispatchEvent("ended");
          }
          await expect(queuePage.locator("#stop-audio")).toBeDisabled();
        }
      } finally { await queueContext.close(); }
      await checkAudioStream(browser, site.url);
      console.log(`${mode}: continuous MP3 stream, pause/resume, bounded buffering and seeking OK`);
      await checkReader(browser, site.url, mode, screenshots);
      console.log(`${mode}: bilingual navigation, serif block links, lists, reader, playback and mobile OK`);
    } finally {
      await page.close();
      await new Promise<void>((resolve) => site.server.close(() => resolve()));
    }
  }
} finally {
  await browser.close();
}
