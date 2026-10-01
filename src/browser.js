import net from 'node:net';
import { chromium } from 'playwright';

/** Grab an ephemeral port the OS says is free. */
export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Launch one Chromium that both Playwright and Lighthouse drive:
 * Playwright gets the CDP session, Lighthouse connects over the
 * remote-debugging port and opens its own tab.
 */
export async function launchBrowser({ headless = true } = {}) {
  const port = await freePort();
  const browser = await chromium.launch({
    headless,
    // Full Chromium (new headless) rather than the headless shell —
    // Lighthouse needs the screenshot + emulation surface it provides.
    channel: 'chromium',
    args: [
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,OptimizationHints',
    ],
  });
  return { browser, port };
}
