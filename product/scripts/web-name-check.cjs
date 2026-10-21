/**
 * QA-03 optional web check (not part of npm test; needs playwright-core + Chrome):
 *   npx expo export --platform web --output-dir /tmp/ia-web && (cd /tmp/ia-web && python3 -m http.server 8101 &)
 *   NODE_PATH=<dir with playwright-core> node scripts/web-name-check.cjs http://127.0.0.1:8101/
 * Chrome 626px wide, Hearthlight → Warden, name set instantly with fill() and via paste/insertText,
 * then Begin campaign; asserts the saved character is 'Brannoch'.
 */
const { chromium } = require('playwright-core');
const url = process.argv[2] || 'http://127.0.0.1:8101/';
const chrome = process.env.CHROME || '/usr/bin/google-chrome';
(async () => {
  const b = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  let failed = false;
  for (const mode of ['fill', 'paste']) {
    const p = await b.newPage({ viewport: { width: 626, height: 900 } });
    await p.goto(url); await p.getByText('New campaign').click();
    await p.getByText('Hearthlight').first().click();
    await p.getByText('Warden', { exact: true }).first().click();
    const inp = p.locator('input').first();
    if (mode === 'fill') await inp.fill('Brannoch');
    else { await inp.focus(); await p.keyboard.insertText('Brannoch'); }
    await p.getByText('Begin campaign').click();
    await p.waitForTimeout(1500);
    const saved = await p.evaluate(() => Object.values(localStorage).join('\n'));
    const names = [...new Set([...saved.matchAll(/"name":"(Bran[^"]*)"/g)].map((m) => m[1]))];
    const ok = names.length === 1 && names[0] === 'Brannoch';
    console.log(`${mode}: saved ${JSON.stringify(names)} ${ok ? 'ok' : 'FAIL'}`);
    failed ||= !ok; await p.close();
  }
  await b.close(); process.exit(failed ? 1 : 0);
})();
