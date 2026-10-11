import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright";
import type { YikYakConfig } from "../config";

/** Something that can put a post on Yik Yak (or pretend to) and return a screenshot file path. */
export interface YikYakDriver {
  readonly name: string;
  /** True when this driver posts to the real Yik Yak. Only real posts are rate limited. */
  readonly real: boolean;
  post(text: string): Promise<string>;
  close?(): Promise<void>;
}

function screenshotPath(stateDir: string, prefix: string): string {
  return path.join(stateDir, "screenshots", `${prefix}-${Date.now()}.png`);
}

const PLAYWRIGHT_HINT =
  "Install the browser once with: pnpm --filter @agent-pledge/local-agent exec playwright install chromium";

/**
 * Posts from our logged-in Yik Yak session in a visible (headful) Chromium window, so the projected
 * laptop shows the post happening. The persistent profile in YIKYAK_PROFILE_DIR keeps the login.
 * URL and selectors come from env because the real site is unconfirmed until #28.
 */
export class PlaywrightDriver implements YikYakDriver {
  readonly name = "playwright";
  readonly real = true;
  private context: BrowserContext | null = null;

  constructor(
    private readonly cfg: YikYakConfig,
    private readonly stateDir: string,
  ) {}

  private async ctx(): Promise<BrowserContext> {
    if (this.context) return this.context;
    const { chromium } = await import("playwright");
    await mkdir(this.cfg.profileDir, { recursive: true });
    try {
      this.context = await chromium.launchPersistentContext(this.cfg.profileDir, {
        headless: false,
        viewport: { width: 1100, height: 900 },
        ...(this.cfg.browserChannel ? { channel: this.cfg.browserChannel } : {}),
      });
    } catch (err) {
      throw new Error(
        `could not start Chromium for Yik Yak: ${(err as Error).message}. ${PLAYWRIGHT_HINT}`,
      );
    }
    this.context.on("close", () => (this.context = null));
    return this.context;
  }

  async post(text: string): Promise<string> {
    const context = await this.ctx();
    const page = context.pages()[0] ?? (await context.newPage());
    await page.bringToFront();
    await page.goto(this.cfg.url, { waitUntil: "domcontentloaded" });
    if (this.cfg.composeSelector) await page.click(this.cfg.composeSelector, { timeout: 15_000 });
    await page.fill(this.cfg.textSelector, text, { timeout: 15_000 });
    await page.click(this.cfg.submitSelector, { timeout: 15_000 });
    await page.waitForTimeout(this.cfg.postWaitMs);
    const file = screenshotPath(this.stateDir, "yikyak");
    await mkdir(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file });
    return file;
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The Yik Yak-style card the render driver screenshots. Exported for tests. */
export function renderCardHtml(text: string, at = new Date()): string {
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#1b1c22;font-family:-apple-system,Helvetica,Arial,sans-serif;display:flex;justify-content:center;padding:32px}
  .card{width:420px;background:#2a2c35;border-radius:18px;padding:22px 24px;color:#f4f4f6;box-shadow:0 6px 24px rgba(0,0,0,.4)}
  .top{display:flex;align-items:center;gap:10px;margin-bottom:14px;color:#9ea2b0;font-size:14px}
  .dot{width:34px;height:34px;border-radius:50%;background:#45d6a3;display:flex;align-items:center;justify-content:center;font-size:18px}
  .text{font-size:19px;line-height:1.4;white-space:pre-wrap;word-break:break-word}
  .foot{display:flex;justify-content:space-between;margin-top:18px;color:#9ea2b0;font-size:14px}
  .tag{margin-top:14px;font-size:12px;color:#ffb347}
  </style></head><body><div class="card">
  <div class="top"><div class="dot">&#129436;</div><span>Nearby &middot; ${escapeHtml(time)}</span></div>
  <div class="text">${escapeHtml(text)}</div>
  <div class="foot"><span>&#128172; 0</span><span>&#9650; 1 &#9660;</span></div>
  <div class="tag">Preview render (not a real Yik Yak post)</div>
  </div></body></html>`;
}

/**
 * Fallback: renders the post as a Yik Yak-style card in headless Chromium and screenshots it.
 * It does NOT post anything. Every use is logged as "not a real post".
 */
export class RenderDriver implements YikYakDriver {
  readonly name = "render";
  readonly real = false;

  constructor(private readonly stateDir: string) {}

  async post(text: string): Promise<string> {
    const { chromium } = await import("playwright");
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      throw new Error(
        `could not start headless Chromium: ${(err as Error).message}. ${PLAYWRIGHT_HINT}`,
      );
    }
    try {
      const page = await browser.newPage({ viewport: { width: 484, height: 400 } });
      await page.setContent(renderCardHtml(text));
      const file = screenshotPath(this.stateDir, "render");
      await mkdir(path.dirname(file), { recursive: true });
      await page.locator(".card").screenshot({ path: file });
      return file;
    } finally {
      await browser.close();
    }
  }
}

/** Placeholder for a computer-use agent driving the Yik Yak iPhone app on the Mac (PRD 8 caution). */
export class ComputerUseDriver implements YikYakDriver {
  readonly name = "computer-use";
  readonly real = true;
  post(_text: string): Promise<string> {
    return Promise.reject(new Error("computer-use Yik Yak driver is not implemented, see #28"));
  }
}

export function createDriver(cfg: YikYakConfig, stateDir: string): YikYakDriver {
  switch (cfg.driver) {
    case "playwright":
      return new PlaywrightDriver(cfg, stateDir);
    case "computer-use":
      return new ComputerUseDriver();
    case "render":
      return new RenderDriver(stateDir);
  }
}
