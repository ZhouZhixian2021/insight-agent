/** Fixed Playwright operations for configured scholarly search forms. */
import type { BrowserAcademicOptions, BrowserAcademicSite } from './types.ts'

/**
 * Serialize trusted selectors and an unmodified query into one atomic browser operation.
 * @param site Search form and official URL restrictions.
 * @param query Caller query, used only as input text.
 * @param maximumResults Maximum paper pages read from the first results page.
 * @param options Navigation and metadata bounds.
 * @returns Playwright function source for the existing DSH browser tool.
 */
export function academicBrowserScript(site: BrowserAcademicSite, query: string, maximumResults: number,
  options: BrowserAcademicOptions): string {
  const input = JSON.stringify({ site, query, maximumResults, origin: new URL(site.url).origin,
    timeout: options.operationTimeoutMs, metadataLimit: options.maximumMetadataCharacters })
  return `async (page) => {
    const input = ${input};
    const check = async (response) => {
      if (response && response.status() >= 400) throw new Error('Academic website refused navigation');
      if (!page.url().startsWith(input.origin + '/')) throw new Error('Academic website redirected outside its origin');
    };
    await check(await page.goto(input.site.url, { waitUntil: 'commit', timeout: input.timeout }));
    const box = page.locator(input.site.inputSelector);
    await box.fill(input.query, { timeout: input.timeout });
    const submit = () => input.site.submitSelector ? page.locator(input.site.submitSelector).click({ timeout: input.timeout }) : box.press('Enter', { timeout: input.timeout });
    if (input.site.mode === 'submit') {
      const [response] = await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: input.timeout }), submit()]);
      await check(response);
    } else await submit();
    await page.locator(input.site.readySelector).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: input.timeout });
    const found = await page.evaluate(({ site, maximumResults }) => {
      const pattern = new RegExp(site.paperUrlPattern);
      const rewrite = site.resultUrlRewrite;
      const urls = [...new Set(Array.from(document.querySelectorAll(site.resultSelector))
        .filter(node => node instanceof HTMLAnchorElement && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        .map(node => rewrite ? node.href.replace(new RegExp(rewrite.pattern), rewrite.replacement) : node.href)
        .filter(url => new URL(url).origin === new URL(site.url).origin && pattern.test(url)))];
      const next = site.nextSelector && Array.from(document.querySelectorAll(site.nextSelector)).some(node => node.getClientRects().length);
      return { urls: urls.slice(0, maximumResults), truncated: urls.length > maximumResults || !!next };
    }, input);
    const papers = [];
    for (const url of found.urls) {
      await check(await page.goto(url, { waitUntil: 'domcontentloaded', timeout: input.timeout }));
      if (!new RegExp(input.site.paperUrlPattern).test(page.url())) throw new Error('Unexpected academic paper redirect');
      const html = await page.evaluate(() => {
        const tags = Array.from(document.querySelectorAll('meta[name]')).filter(node => /^(citation_|dc\\.)/i.test(node.getAttribute('name') || ''));
        const abstract = document.querySelector('#abstract, .acl-abstract');
        return tags.map(node => node.outerHTML).join('') + (abstract ? abstract.outerHTML : '');
      });
      if (html.length > input.metadataLimit) throw new Error('Academic metadata exceeds configured limit');
      papers.push({ url: page.url(), html });
    }
    return { papers, truncated: found.truncated };
  }`
}
