// Same packaged link-copy.js in two contexts. No Core, Hub or YouTube API needed.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.argv[2]);
const root = path.resolve(__dirname, '..');
const files = JSON.parse(fs.readFileSync(path.join(root, 'pack.json'))).resources.map(r => r.file);
const html = '<!doctype html><html lang="en"><body><a id="article" href="../first">Article</a><button id="copy">Copy article</button><ytd-app><ytd-watch-flexy><ytd-watch-metadata><h1>Fixture</h1><div id="actions"><div id="top-level-buttons-computed"></div></div></ytd-watch-metadata></ytd-watch-flexy></ytd-app></body></html>';
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
  const checks = [];
  try {
    async function setup(url) {
      const ctx = await browser.newContext();
      let requests = 0;
      await ctx.route('**/*', route => {
        if (route.request().url().includes('/api/timedtext')) {
          requests++;
          return route.fulfill({ contentType: 'text/xml', body: '<transcript>fixture</transcript>' });
        }
        return route.fulfill({ contentType: 'text/html', body: html });
      });
      const page = await ctx.newPage();
      await page.goto(url);
      await page.evaluate(() => {
        window.copies = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { copies.push(text); return Promise.resolve(); } } });
      });
      return { ctx, page, requests: () => requests };
    }
    async function load(page, names) {
      for (const name of names) await page.addScriptTag({ content: fs.readFileSync(path.join(root, name), 'utf8') });
    }
    // A plain DOM selector supplies the link. No YouTube modules exist here.
    {
      const { ctx, page, requests } = await setup('https://links.example/articles/start');
      await load(page, ['link-copy.js']);
      await page.evaluate(() => {
        const { select_link, copy_link, browser_clipboard } = TapLinkCopy;
        const selected = select_link('#article', document);
        const clipboard = browser_clipboard(navigator, document);
        document.querySelector('#copy').onclick = () => {
          window.result = copy_link(selected, clipboard).then(() => 'copied', error => error.message);
        };
      });
      await page.locator('#copy').click();
      assert.equal(await page.evaluate(() => result), 'copied');
      await page.locator('#article').evaluate(el => el.setAttribute('href', '/second?q=1'));
      await page.locator('#copy').click();
      assert.equal(await page.evaluate(() => result), 'copied');
      assert.deepEqual(await page.evaluate(() => copies), ['https://links.example/first', 'https://links.example/second?q=1']);
      await page.locator('#article').evaluate(el => el.remove());
      await page.locator('#copy').click();
      assert.equal(await page.evaluate(() => result), 'link not found');
      assert.equal(await page.evaluate(() => copies.length), 2);
      assert.equal(requests(), 0);
      assert.equal(await page.evaluate(() => typeof TapYouTubeLinkPolicy), 'undefined');
      // Clipboard failure is reported; no fake success and no leftover textarea.
      assert.equal(await page.evaluate(async () => {
        const doc = { body: document.body, createElement: tag => document.createElement(tag), execCommand: () => false };
        const cb = TapLinkCopy.browser_clipboard({ clipboard: { writeText: () => Promise.reject(Error('denied')) } }, doc);
        return TapLinkCopy.copy_link(() => 'https://links.example/', cb).then(() => 'wrong', e => e.message);
      }), 'copy failed');
      assert.equal(await page.locator('textarea').count(), 0);
      checks.push('plain DOM: relative link, changed href, missing link, clipboard failure');
      await ctx.close();
    }
    for (const mode of ['toggle', 'module-absent', 'caption-throws']) {
      const { ctx, page, requests } = await setup('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      await page.evaluate(() => {
        window.ytInitialPlayerResponse = { videoDetails: { videoId: 'dQw4w9WgXcQ' }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ' }] } } };
      });
      await load(page, files.filter(name => mode !== 'module-absent' || !['youtube-captions.js', 'caption-status.js'].includes(name)));
      if (mode === 'toggle') await page.evaluate(() => __tapYoutubeCopyLinks.setCaptionsEnabled(false));
      if (mode === 'caption-throws') await page.evaluate(() => { TapYouTubeCaptions.request_captions = () => { throw Error('caption adapter failed'); }; });
      await page.getByRole('button', { name: 'Copy video URL https://youtu.be/dQw4w9WgXcQ', exact: true }).click();
      await page.waitForFunction(() => copies.length === 1);
      // Wait through the event loop; disabled/absent behavior never schedules a fetch.
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
      assert.equal(requests(), 0);
      assert.deepEqual(await page.evaluate(() => copies), ['https://youtu.be/dQw4w9WgXcQ']);
      assert.equal(await page.evaluate(() => __tapYoutubeCopyLinks.lastCaptionRequest), null);
      if (mode === 'toggle') {
        await page.evaluate(() => __tapYoutubeCopyLinks.setCaptionsEnabled(true));
        // Flash changes the accessible label briefly; wait for its normal label.
        await page.getByRole('button', { name: 'Copy video URL https://youtu.be/dQw4w9WgXcQ', exact: true }).click();
        await page.waitForFunction(() => __tapYoutubeCopyLinks.lastCaptionRequest?.status === 'fetched');
        assert.equal(requests(), 1);
        assert.deepEqual(await page.evaluate(() => copies), ['https://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ']);
      }
      checks.push('YouTube: ' + mode + ', same Copy');
      await ctx.close();
    }
    console.log(JSON.stringify({ passed: true, scope: 'real Chrome; synthetic documents and HTTP; packaged source resources', browser: browser.version(), checks }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
