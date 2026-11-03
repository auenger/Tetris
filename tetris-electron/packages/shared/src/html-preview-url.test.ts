import { expect, test } from "bun:test";
import { fromHtmlPreviewUrl, toHtmlPreviewUrl } from "./collab-file-url";

test('preview paths preserve case, Unicode, reserved characters and platform paths', () => {
  for (const file of ['/Users/Ryan/网页 #1?.HTML', '/Project/index.html', 'C:\\Users\\Ryan\\Index.html', '//server/Share/Page.htm']) {
    const url = new URL(toHtmlPreviewUrl(file));
    expect(url.hostname).toBe('local');
    expect(fromHtmlPreviewUrl(url.href)).toBe(file.replace(/\\/g, '/'));
  }
});

test('relative resources resolve from the HTML directory', () => {
  const page = toHtmlPreviewUrl('/Project/Pages/index.html');
  expect(fromHtmlPreviewUrl(new URL('../Assets/style.css', page).href)).toBe('/Project/Assets/style.css');
  expect(fromHtmlPreviewUrl(new URL('./脚本.js?v=2#module', page).href)).toBe('/Project/Pages/脚本.js');
  expect(() => fromHtmlPreviewUrl('https://local/tmp/test.html')).toThrow();
  expect(() => fromHtmlPreviewUrl('collab-preview://remote/tmp/test.html')).toThrow();
});
