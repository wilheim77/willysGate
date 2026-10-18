/**
 * One browser playthrough of Intereses, driven against a real dev server: title screen,
 * quick character creation, walk past Garrán and the miners (talking it through, not
 * fighting), cross to the plaza, and play out the trial's fight with the AI on both
 * sides until it ends.
 *
 * A reviewer process decision (docs/REVIEWS.md): one browser playthrough per demo, with
 * a 10s `scene.busy` watchdog so a stuck animation or a turn nobody can act on fails the
 * run instead of hanging a CI job forever.
 *
 * Opt-in (`npm run test:browser`), not part of `npm run check` — it starts its own dev
 * server, downloads nothing (Playwright's Chromium is a devDependency, installed once via
 * `npx playwright install chromium`), and takes much longer than the unit suite.
 *
 * Uses Playwright, since it wasn't already a project dependency: it's the standard tool
 * for driving a real browser from Node, and the project had no browser-automation
 * dependency at all before this.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BUSY_WATCHDOG_MS = 10_000;
const COMBAT_TIMEOUT_MS = 120_000;
const SERVER_READY_TIMEOUT_MS = 30_000;

function log(msg: string): void {
  console.log(`[smoke] ${msg}`);
}

/** 5173/5174/5176 are already used by other dev servers in this environment; ask the OS for one that's free. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : null;
      srv.close(() => (port ? resolve(port) : reject(new Error('could not find a free port'))));
    });
    srv.on('error', reject);
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev server at ${url} did not come up within ${timeoutMs}ms`);
}

function startDevServer(port: number): ChildProcess {
  // The local vite binary directly, not `npm run dev`: npm spawns vite as a grandchild,
  // so killing the npm process on cleanup can leave vite (and the port) running behind.
  const proc = spawn(join(ROOT, 'node_modules', '.bin', 'vite'), ['--port', String(port), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, GAME: 'intereses' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', (d: Buffer) => process.env.SMOKE_VERBOSE && process.stdout.write(`[vite] ${d}`));
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[vite:err] ${d}`));
  return proc;
}

type GameHandle = {
  store: { state: GameStateLike; dispatch(cmd: unknown): { ok: boolean; error?: { code: string; message: string } } };
  controller: { scene: { busy: boolean }; onTileSelected(tile: { x: number; y: number }): void };
  /** Bound to the running ruleset/state in src/main.ts — just pass the entity id. */
  nextAiCommand(entityId: string): unknown;
};
interface GameStateLike {
  map: { id: string; width: number; height: number };
  entities: Record<string, { id: string; controllerId: string; position: { x: number; y: number } }>;
  turn: { mode: 'exploration' | 'combat'; activeEntityId: string | null; round: number };
}

// page.evaluate() callbacks below run in the browser, where `window` is real — but this
// file's own tsconfig (tests/tsconfig.json) has no DOM lib, so `window` is otherwise
// unknown here. A plain ambient `const` (not `declare global`, which would need the real
// `Window` interface to merge with) is enough for these callbacks to type-check.
declare const window: { __game?: GameHandle };

/** Fails loudly instead of hanging forever if `scene.busy` never clears — the whole point of this script. */
async function waitForIdle(page: import('playwright').Page, maxMs = BUSY_WATCHDOG_MS): Promise<void> {
  const deadline = Date.now() + maxMs;
  for (;;) {
    const busy = await page.evaluate(() => window.__game!.controller.scene.busy);
    if (!busy) return;
    if (Date.now() > deadline) throw new Error(`scene.busy stayed true for more than ${maxMs}ms`);
    await page.waitForTimeout(150);
  }
}

/**
 * Advances every dialogue node that comes up (plain "Continuar"/"Terminar" steps included)
 * until #dialogue closes: clicks the first button whose text exactly matches one of
 * `preferredTexts` when present (the deliberate story choice this run wants), otherwise
 * the only button on a choice-less node, otherwise the first choice — which the content
 * guarantees is always available, per docs/DESIGN.md's "no critical info behind one roll".
 */
async function advanceDialogue(page: import('playwright').Page, preferredTexts: string[], maxSteps = 40): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const dialogue = page.locator('#dialogue');
    if (!(await dialogue.isVisible())) return;
    const buttons = dialogue.locator('.choices button');
    const count = await buttons.count();
    // Locked choices (a check the party can't pass, a "once" already spent) render disabled
    // rather than being removed — only ever consider ones a real player could actually click.
    const enabled: number[] = [];
    for (let b = 0; b < count; b++) if (await buttons.nth(b).isEnabled()) enabled.push(b);
    if (enabled.length === 0) {
      await page.waitForTimeout(150);
      continue;
    }
    let pick = enabled[0]!;
    for (const b of enabled) {
      const text = (await buttons.nth(b).innerText()).trim();
      if (preferredTexts.includes(text)) {
        pick = b;
        break;
      }
    }
    await buttons.nth(pick).click({ timeout: 5000, noWaitAfter: true });
    await page.waitForTimeout(120);
  }
  throw new Error(`dialogue did not close after ${maxSteps} steps`);
}

/**
 * Walks the leader toward `to`, handling any scene dialogue that interrupts the path
 * along the way (the engine halts movement at a scene zone boundary — see
 * engine/commands.ts's `haltsHere` — so one long-distance command needs re-issuing after
 * each dialogue closes), until either the leader arrives or the map itself changes
 * (an exit zone's own travel fired).
 */
async function walkToward(page: import('playwright').Page, to: { x: number; y: number }, preferredTexts: string[], maxAttempts = 12): Promise<void> {
  const startMap = await page.evaluate(() => window.__game!.store.state.map.id);
  for (let i = 0; i < maxAttempts; i++) {
    await waitForIdle(page);
    const state = await page.evaluate(() => window.__game!.store.state);
    if (state.map.id !== startMap) return; // an exit zone fired: we're on the next map already
    const leader = state.entities.hero!;
    if (leader.position.x === to.x && leader.position.y === to.y) return;
    log(`  move attempt ${i + 1}/${maxAttempts}: leader at (${leader.position.x},${leader.position.y}), heading to (${to.x},${to.y})`);
    await page.evaluate((tile) => window.__game!.controller.onTileSelected(tile), to);
    await waitForIdle(page);
    await advanceDialogue(page, preferredTexts);
    await page.evaluate(() => window.__game!.store.state.map.id); // settle a beat before the next poll
  }
  throw new Error(`did not reach (${to.x},${to.y}) after ${maxAttempts} move attempts`);
}

/**
 * Plays out a fight with the AI on both sides (mirrors GameController.scheduleAi, which
 * already drives enemy turns on its own via onIdle — this only needs to additionally
 * drive the player's own turns the same way) until combatEnded.
 */
async function playCombatWithAi(page: import('playwright').Page, timeoutMs = COMBAT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastTurnKey = '';
  let lastTurnChangeAt = Date.now();
  for (;;) {
    if (Date.now() > deadline) throw new Error(`combat did not end within ${timeoutMs}ms`);
    await waitForIdle(page);
    const state = await page.evaluate(() => window.__game!.store.state);
    if (state.turn.mode !== 'combat') return;
    const activeId = state.turn.activeEntityId;
    if (!activeId) {
      await page.waitForTimeout(150);
      continue;
    }
    const turnKey = `${state.turn.round}:${activeId}`;
    if (turnKey !== lastTurnKey) {
      lastTurnKey = turnKey;
      lastTurnChangeAt = Date.now();
    } else if (Date.now() - lastTurnChangeAt > BUSY_WATCHDOG_MS) {
      throw new Error(`turn ${turnKey} made no progress for more than ${BUSY_WATCHDOG_MS}ms (no command possible?)`);
    }
    const isPlayer = state.entities[activeId]!.controllerId.startsWith('player');
    if (!isPlayer) {
      // The client's own GameController.onIdle already drives this turn; just wait for it.
      await page.waitForTimeout(200);
      continue;
    }
    const result = await page.evaluate((id) => {
      const g = window.__game!;
      return g.store.dispatch(g.nextAiCommand(id));
    }, activeId);
    if (!result.ok) {
      // A plan the engine refuses must never stall the fight (mirrors controller.ts).
      await page.evaluate(
        (id) => window.__game!.store.dispatch({ type: 'endTurn', issuer: window.__game!.store.state.entities[id]!.controllerId, entityId: id }),
        activeId,
      );
    }
    await page.waitForTimeout(80);
  }
}

async function main(): Promise<void> {
  const port = await findFreePort();
  const url = `http://localhost:${port}`;
  log(`starting dev server on ${url}`);
  const server = startDevServer(port);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    await waitForServer(url, SERVER_READY_TIMEOUT_MS);
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    page.on('load', () => log(`  [page event] load fired (navigated to ${page.url()})`));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) log(`  [page event] frame navigated to ${frame.url()}`);
    });
    page.on('request', (req) => {
      if (req.isNavigationRequest()) log(`  [nav request] ${req.method()} ${req.url()}`);
    });
    page.on('console', (msg) => {
      if (process.env.SMOKE_VERBOSE) log(`  [console:${msg.type()}] ${msg.text()}`);
    });
    log('opening the game');
    await page.goto(url);
    await page.waitForFunction(() => !!window.__game, undefined, { timeout: 15_000 });

    log('title screen -> nueva partida');
    await page.getByRole('button', { name: 'Nueva partida' }).click({ noWaitAfter: true });
    log('creation screen -> partida rápida');
    await page.getByRole('button', { name: 'Partida rápida' }).click({ noWaitAfter: true });

    log('opening scene (if any)');
    await advanceDialogue(page, []);

    log('walking to the miners (Garrán first, then the toll) — picking the talk route');
    // Both sit on the path between the start (tile 3,9) and the exit to the plaza (the
    // single-column "a-hondonegra" zone at tile x=31 — maps use 32px tiles, see
    // engine/tiled.ts's toTile): aim at the exit itself and let the scenes along the way
    // interrupt the walk.
    await walkToward(page, { x: 31, y: 9 }, ['Vamos a Hondonegra. Camina con nosotros.', '[Garrán] Dejar que hable Garrán.']);

    log('crossing to the plaza');
    await page.waitForFunction(() => window.__game!.store.state.map.id === 'plaza', undefined, { timeout: 15_000 });

    log('starting the trial scene fight');
    await advanceDialogue(page, ['Cortar la soga. (Atacar a los fanáticos.)']);
    await page.waitForFunction(() => window.__game!.store.state.turn.mode === 'combat', undefined, { timeout: 15_000 });

    log('playing combat with the AI on both sides');
    await playCombatWithAi(page);

    if (consoleErrors.length) throw new Error(`page threw ${consoleErrors.length} error(s):\n${consoleErrors.join('\n')}`);
    log('OK: camino -> plaza -> fight resolved, nothing hung');
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }
}

const HARD_TIMEOUT_MS = 5 * 60_000;

Promise.race([
  main(),
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`smoke test exceeded the ${HARD_TIMEOUT_MS}ms hard timeout`)), HARD_TIMEOUT_MS)),
])
  .catch((err) => {
    console.error('[smoke] FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    // Belt and suspenders: a stray child process handle (vite, Chromium) must never keep
    // this process — and whatever's waiting on it, e.g. a CI job — alive past its own result.
    setTimeout(() => process.exit(process.exitCode ?? 0), 50);
  });
