import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire("D:/FoodSave/package.json");
const { chromium } = require("@playwright/test");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1664, height: 720 }, deviceScaleFactor: 2 });
for (const name of process.argv.slice(2)) {
  await page.goto(pathToFileURL(resolve(`${name}.html`)).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${name}.png`, clip: { x: 0, y: 0, width: 1664, height: 720 } });
  console.log("ok", name);
}
await browser.close();
