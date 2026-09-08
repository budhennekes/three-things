const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = process.env.THREE_THINGS_SITE || 'file://' + path.resolve(__dirname, '../docs/index.html');
    const download = 'https://github.com/budhennekes/three-things/releases/download/v0.10.0/ThreeThings-0.10.0-mac-arm64.zip';
    for (const width of [320, 390, 900, 1400]) {
      await page.setViewportSize({width, height: 1000});
      await page.goto(url);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('.download').count(), 2);
      for (const link of await page.locator('.download').all()) {
        assert.equal(await link.getAttribute('href'), download);
      }
      assert((await page.locator('.download').first().boundingBox()).y < 1000, 'Download above the fold');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').textContent(), 'View on GitHub');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').textContent(), 'Download for Mac');
      assert.equal(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      assert.equal(await page.locator('img').count(), 2, 'Two photographic app examples');
      for (const image of await page.locator('img').all()) {
        assert(await image.getAttribute('alt'), 'Descriptive image alternative');
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(img => img.decode());
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const contrast = await page.evaluate(() => {
        const luminance = color => {
          const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255)
            .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return channels.reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
        };
        return [...document.querySelectorAll('p,figcaption,.download,.features span,.features b,header>a')].map(el => {
          let ancestor = el;
          while (ancestor.parentElement && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(ancestor).backgroundColor)) ancestor = ancestor.parentElement;
          const values = [luminance(getComputedStyle(el).color), luminance(getComputedStyle(ancestor).backgroundColor)].sort((a, b) => a - b);
          return {text: el.textContent.slice(0, 40), ratio: (values[1] + .05) / (values[0] + .05)};
        });
      });
      for (const item of contrast) assert(item.ratio >= 4.5, `Text contrast: ${JSON.stringify(item)}`);
      await page.locator('a[href="#install"]').click();
      const install = await page.locator('#install').boundingBox();
      assert(install.y >= -1 && install.y < 1000, 'Opening guidance scrolled into view');
      assert.match(await page.locator('.warning').textContent(), /notarized by Apple/);
      const out = path.resolve(__dirname, '../evidence-v010');
      fs.mkdirSync(out, {recursive: true});
      await page.screenshot({path: path.join(out, `page-${width}.png`), fullPage: true});
    }
    assert.deepEqual(errors, []);
    console.log('PASS page: 320/390/900/1400px; both images decode; correct download URLs; visible keyboard focus; text contrast >=4.5:1; opening guidance; no overflow or page errors. ' + url);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
