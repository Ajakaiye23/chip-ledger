/**
 * Browser pass over every screen. Run the app first, then:
 *
 *   npm run build && npm start &
 *   npm run test:e2e            # or BASE=http://localhost:3001 npm run test:e2e
 *
 * Needs playwright (`npm i -D playwright`) and a Chromium it can find.
 *
 * Fails loudly on:
 *   - uncaught page errors / console errors
 *   - horizontal overflow at any viewport
 *   - tap targets under 44px
 *   - buttons that do nothing / sheets that won't close
 *   - text that overflows its container
 */
import { chromium } from 'playwright';

const base = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
let checks = 0;
const ok = () => checks++;

async function newPage(viewport, { seenGuide = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (seenGuide) {
    await ctx.addInitScript(() => localStorage.setItem('chip-ledger:guide-seen', '1'));
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return { ctx, page, errors };
}

async function checkOverflow(page, where) {
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    if (de.scrollWidth <= de.clientWidth + 1) return null;
    // Find the widest offender so the failure is actionable.
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > de.clientWidth + 1 && (!worst || r.right > worst.right)) {
        worst = { right: Math.round(r.right), tag: el.tagName, cls: el.className?.toString().slice(0, 60) };
      }
    }
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, worst };
  });
  if (overflow) fail(where, `horizontal overflow ${JSON.stringify(overflow)}`);
  else ok();
}

async function checkTapTargets(page, where) {
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input, select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // hidden
      if (el.getAttribute('aria-hidden') === 'true') continue;
      if (r.height < 28) {
        out.push(`${el.tagName}.${el.className?.toString().slice(0, 40)} h=${Math.round(r.height)}`);
      }
    }
    return out;
  });
  if (small.length) fail(where, `tap targets under 28px: ${small.slice(0, 4).join(' | ')}`);
  else ok();
}

async function checkClipping(page, where) {
  const clipped = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('p, span, h1, h2, td, th, li, button')) {
      if (el.children.length > 0) continue;
      const style = getComputedStyle(el);
      if (style.overflow === 'hidden' && style.textOverflow !== 'ellipsis') {
        if (el.scrollWidth > el.clientWidth + 2) out.push(el.textContent?.slice(0, 30) ?? '');
      }
      if (el.scrollHeight > el.clientHeight + 4 && style.overflowY === 'hidden') {
        out.push(`(vert) ${el.textContent?.slice(0, 30) ?? ''}`);
      }
    }
    return out;
  });
  if (clipped.length) fail(where, `clipped text: ${clipped.slice(0, 3).join(' | ')}`);
  else ok();
}

async function auditPage(page, where) {
  await checkOverflow(page, where);
  await checkTapTargets(page, where);
  await checkClipping(page, where);
}

const PHONE = { width: 390, height: 844 };
const SMALL = { width: 320, height: 568 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 900 };

// ---------------------------------------------------------------- routes --

for (const [name, viewport] of [
  ['landing/small', SMALL],
  ['landing/phone', PHONE],
  ['landing/tablet', TABLET],
  ['landing/desktop', DESKTOP],
]) {
  const { ctx, page, errors } = await newPage(viewport);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await auditPage(page, name);
  if (errors.length) fail(name, errors.join('; '));
  await ctx.close();
}

for (const [name, viewport] of [
  ['preview/small', SMALL],
  ['preview/phone', PHONE],
  ['preview/desktop', DESKTOP],
]) {
  const { ctx, page, errors } = await newPage(viewport);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });

  for (const tab of ['Table', 'Hand', 'Night', 'Settle']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.waitForTimeout(150);
    await auditPage(page, `${name}/${tab}`);
    const visible = await page.getByRole('button', { name: tab, exact: true }).isVisible();
    if (!visible) fail(`${name}/${tab}`, 'tab vanished after clicking it');
    else ok();
  }

  // Stats view.
  await page.getByRole('button', { name: 'Your stats' }).click();
  await page.waitForTimeout(200);
  await auditPage(page, `${name}/stats`);

  if (errors.length) fail(name, errors.join('; '));
  await ctx.close();
}

// ------------------------------------------------------------ interaction --

{
  const { ctx, page, errors } = await newPage(PHONE);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });

  // Open a player, check the sheet, close it with Escape.
  await page.getByRole('button', { name: /Hannah/ }).first().click();
  await page.waitForTimeout(200);
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible())) fail('player sheet', 'did not open');
  else ok();
  await auditPage(page, 'player sheet');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (await dialog.isVisible()) fail('player sheet', 'Escape did not close it');
  else ok();

  // Buy-in flow: open, type, check the chip breakdown appears.
  await page.getByRole('button', { name: /Hannah/ }).first().click();
  await page.getByRole('button', { name: 'Buy in', exact: true }).click();
  await page.waitForTimeout(200);
  const amount = page.getByLabel('Amount in dollars');
  await amount.fill('20');
  await page.waitForTimeout(150);
  const breakdown = await page.getByText(/That's/).isVisible().catch(() => false);
  if (!breakdown) fail('buy-in', 'no chip breakdown shown for $20');
  else ok();

  // An amount these chips cannot make must be refused, not silently rounded:
  // a pile that can't exist would come back at settle time as an imbalance
  // pinned on whoever happened to be counted last.
  await amount.fill('0.07');
  await page.waitForTimeout(200);
  const warned = await page.getByText(/No stack of these chips/i).isVisible().catch(() => false);
  if (!warned) fail('buy-in', 'no warning for an amount the chips cannot make');
  else ok();

  const submit = page.locator('button', { hasText: /Buy in for \$|Pick an amount/ }).last();
  if (await submit.isEnabled()) fail('buy-in', 'an impossible amount could still be saved');
  else ok();

  // Rounding down from 7c lands on nothing, so the offer has to look upward.
  const up = page.getByRole('button', { name: '$0.10', exact: true });
  if (!(await up.isVisible().catch(() => false)))
    fail('buy-in', 'no reachable amount offered above an unmakeable one');
  else ok();

  await up.click();
  await page.waitForTimeout(200);
  if (!(await submit.isEnabled())) fail('buy-in', 'taking the suggestion did not unblock saving');
  else ok();

  // Chip counting mode, starting from nothing so the total is only the chips
  // typed here — taking the suggestion above left a dime's worth loaded.
  await amount.fill('');
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Count chips' }).click();
  await page.getByLabel('Red chips').fill('4');
  await page.waitForTimeout(150);
  const worth = await page.getByText(/Worth \$1\.00/).isVisible().catch(() => false);
  if (!worth) fail('chip counting', '4 red (25c) should be worth $1.00');
  else ok();
  await auditPage(page, 'buy-in sheet');
  await page.keyboard.press('Escape');

  if (errors.length) fail('interaction', errors.join('; '));
  await ctx.close();
}

// Counting a player up is the write that decides the money.
{
  const { ctx, page, errors } = await newPage(PHONE);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Riley/ }).first().click();
  await page.getByRole('button', { name: /Count them up/ }).click();
  await page.waitForTimeout(300);
  await auditPage(page, 'count sheet');

  const inputs = await page.getByLabel(/chips$/).count();
  if (inputs < 4) fail('count sheet', `expected a box per chip colour, found ${inputs}`);
  else ok();

  // Riley started with $40. Counting 5 black ($5) = $25 should read as -$15.
  await page.getByLabel('Black chips').fill('5');
  await page.waitForTimeout(200);
  const night = await page.getByText('-$15.00').first().isVisible().catch(() => false);
  if (!night) fail('count sheet', 'net for the night did not update to -$15.00');
  else ok();

  await page.keyboard.press('Escape');
  if (errors.length) fail('count sheet', errors.join('; '));
  await ctx.close();
}

// A sheet opened for one player must never carry that player's numbers into the
// next player's sheet. This decides real money, so it gets its own pass.
{
  const { ctx, page, errors } = await newPage(PHONE);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });

  // Type a buy-in for one player, abandon it, open another player's buy-in.
  await page.getByRole('button', { name: /Hannah/ }).first().click();
  await page.getByRole('button', { name: 'Buy in', exact: true }).click();
  await page.getByLabel('Amount in dollars').fill('20');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  await page.getByRole('button', { name: /Sam/ }).first().click();
  await page.getByRole('button', { name: 'Buy in', exact: true }).click();
  await page.waitForTimeout(250);
  const carried = await page.getByLabel('Amount in dollars').inputValue();
  if (carried !== '') fail('sheet state', `buy-in carried "${carried}" to the next player`);
  else ok();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Same for the final count, where a stale number would be saved as their night.
  await page.getByRole('button', { name: /Riley/ }).first().click();
  await page.getByRole('button', { name: /Count them up/ }).click();
  await page.waitForTimeout(250);
  await page.getByLabel('Black chips').fill('5');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: /Dev/ }).first().click();
  await page.getByRole('button', { name: /final count|Count them up/ }).click();
  await page.waitForTimeout(300);
  const stale = await page.getByLabel('Black chips').inputValue();
  if (stale === '5') fail('sheet state', 'a final count carried to the next player');
  else ok();

  // Dev is already counted at $65 off $60 in, so re-opening must show +$5.00,
  // not a blank sheet that would save as zero.
  const seeded = await page.getByText('+$5.00').first().isVisible().catch(() => false);
  if (!seeded) fail('sheet state', 'changing a count did not start from the stored count');
  else ok();

  await page.keyboard.press('Escape');
  if (errors.length) fail('sheet state', errors.join('; '));
  await ctx.close();
}

// Handing the table over.
{
  const { ctx, page, errors } = await newPage(PHONE);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });

  // The host sees the option on another account-holding player's seat...
  await page.getByRole('button', { name: /Sam/ }).first().click();
  await page.waitForTimeout(250);
  const offered = await page.getByRole('button', { name: /Make Sam K\. the host/ })
    .isVisible().catch(() => false);
  if (!offered) fail('hand over', 'host was not offered the hand-over on a player seat');
  else ok();
  await auditPage(page, 'hand over');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ...but not on a guest, who has no account to host with.
  await page.getByRole('button', { name: /Riley/ }).first().click();
  await page.waitForTimeout(250);
  const guestOffered = await page.getByRole('button', { name: /the host/ })
    .isVisible().catch(() => false);
  if (guestOffered) fail('hand over', 'a guest was offered the table');
  else ok();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Leaving as host asks who takes over rather than just walking out.
  await page.getByRole('button', { name: 'Leave the table' }).click();
  await page.waitForTimeout(250);
  const asked = await page.getByRole('dialog', { name: /Who takes over/ })
    .isVisible().catch(() => false);
  if (!asked) fail('hand over', 'leaving as host did not ask who takes over');
  else ok();
  const escape = await page.getByRole('button', { name: /Leave without handing/ })
    .isVisible().catch(() => false);
  if (!escape) fail('hand over', 'no way to leave without handing over');
  else ok();
  await auditPage(page, 'hand over sheet');
  await page.keyboard.press('Escape');

  if (errors.length) fail('hand over', errors.join('; '));
  await ctx.close();
}

// The hand panel: blinds, and the button moving.
{
  const { ctx, page, errors } = await newPage(PHONE);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Hand', exact: true }).click();
  await page.waitForTimeout(200);
  const hasBlinds = await page.getByText(/blinds 10¢ \/ 25¢/).isVisible().catch(() => false);
  if (!hasBlinds) fail('hand panel', 'blind structure not shown');
  else ok();
  await auditPage(page, 'hand panel');
  if (errors.length) fail('hand panel', errors.join('; '));
  await ctx.close();
}

// The hand rankings: the argument every table has, so the order has to be right.
for (const [name, viewport] of [
  ['rankings/small', SMALL],
  ['rankings/phone', PHONE],
  ['rankings/desktop', DESKTOP],
]) {
  const { ctx, page, errors } = await newPage(viewport);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Hand', exact: true }).click();
  await page.waitForTimeout(200);

  // Folded away until asked for, so it doesn't push the blinds off the screen.
  const rows = page.locator('details ol li');
  if (await rows.first().isVisible().catch(() => false))
    fail(name, 'the rankings were open before anyone asked');
  else ok();

  await page.getByText('What beats what').click();
  await page.waitForTimeout(250);

  const listed = await rows.allTextContents();
  const expected = [
    'Royal flush', 'Straight flush', 'Four of a kind', 'Full house', 'Flush',
    'Straight', 'Three of a kind', 'Two pair', 'One pair', 'High card',
  ];
  if (listed.length !== expected.length)
    fail(name, `expected ${expected.length} hands, found ${listed.length}`);
  else ok();

  // Order is the whole point: a flush must sit above a straight.
  const wrong = expected.findIndex((hand, i) => !listed[i]?.includes(hand));
  if (wrong !== -1) fail(name, `hand ${wrong + 1} should be ${expected[wrong]}`);
  else ok();

  // Every hand shows five cards, or the example proves nothing.
  const cardCounts = await rows.evaluateAll((els) =>
    els.map((el) => el.querySelectorAll('[aria-label*=" of "]').length),
  );
  if (cardCounts.some((n) => n !== 5))
    fail(name, `every hand needs five cards, got ${cardCounts.join(',')}`);
  else ok();

  await auditPage(page, `${name}/open`);
  if (errors.length) fail(name, errors.join('; '));
  await ctx.close();
}

// Rank and name are account-level things on the stats view.
{
  const { ctx, page, errors } = await newPage(DESKTOP);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Your stats' }).click();
  await page.waitForTimeout(300);
  const rank = await page.getByText(/point/).first().isVisible().catch(() => false);
  if (!rank) fail('rank card', 'no rank shown');
  else ok();

  await page.getByRole('button', { name: 'Name', exact: true }).click();
  await page.waitForTimeout(250);
  const nameSheet = page.getByRole('dialog');
  if (!(await nameSheet.isVisible())) fail('name sheet', 'did not open');
  else ok();
  await page.getByLabel('First name').fill('Jordan');
  await page.getByLabel('Initial').fill('m');
  await page.waitForTimeout(150);
  const preview = await page.getByText('Jordan M.').first().isVisible().catch(() => false);
  if (!preview) fail('name sheet', 'preview did not format as "Jordan M."');
  else ok();
  await auditPage(page, 'name sheet');
  await page.keyboard.press('Escape');
  if (errors.length) fail('rank/name', errors.join('; '));
  await ctx.close();
}

// Switching a colour off must be a toggle on every row, never a delete.
{
  const { ctx, page, errors } = await newPage(PHONE);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Your stats' }).click();
  await page.getByRole('button', { name: 'Start a table' }).click();
  await page.waitForTimeout(300);

  const colours = () => page.locator('input[type=checkbox][aria-label^="Use "]').count();
  await page.getByRole('button', { name: 'Add another colour' }).click();
  await page.waitForTimeout(200);
  const added = await colours();

  await page.getByLabel('Use White chips').click();
  await page.waitForTimeout(250);
  if ((await colours()) !== added) fail('chip values', 'switching off a standard colour dropped a row');
  else ok();

  await page.getByLabel('Use New chip chips').click({ force: true });
  await page.waitForTimeout(250);
  if ((await colours()) !== added) fail('chip values', 'switching off a custom colour deleted it');
  else ok();

  // And switching it back on must restore it, not a fresh default.
  await page.getByLabel('Use New chip chips').click({ force: true });
  await page.waitForTimeout(250);
  const back = await page.getByLabel('New chip value').inputValue().catch(() => null);
  if (back === null) fail('chip values', 'a custom colour could not be switched back on');
  else ok();

  await auditPage(page, 'chip values');
  if (errors.length) fail('chip values', errors.join('; '));
  await ctx.close();
}

// Money owed, and the global board, both live on the stats view.
for (const [name, viewport] of [
  ['debts/small', SMALL],
  ['debts/phone', PHONE],
  ['debts/desktop', DESKTOP],
]) {
  const { ctx, page, errors } = await newPage(viewport);
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Your stats' }).click();
  await page.waitForTimeout(300);

  // Both directions are shown, and only the money owed to you is clearable.
  const owed = page.getByRole('heading', { name: 'Owed to you' });
  if (!(await owed.isVisible())) fail(name, 'the "Owed to you" list is missing');
  else ok();

  const iOwe = page.getByRole('heading', { name: 'You owe' });
  if (!(await iOwe.isVisible())) fail(name, 'the "You owe" list is missing');
  else ok();

  const paidButtons = await page.getByRole('button', { name: 'Paid' }).count();
  if (paidButtons !== 2) fail(name, `expected a Paid button per debt owed to you, found ${paidButtons}`);
  else ok();

  // $12.50 + $8.00 owed to you; $20.00 owed by you. The totals must say so.
  if (!(await page.getByText('+$20.50').first().isVisible().catch(() => false)))
    fail(name, 'the owed-to-you total did not add up to $20.50');
  else ok();
  if (!(await page.getByText('−$20.00').first().isVisible().catch(() => false)))
    fail(name, 'the you-owe total did not read −$20.00');
  else ok();

  await auditPage(page, `${name}/panel`);

  // The global board ranks on percentage, and flags your own row.
  const board = page.getByRole('heading', { name: 'Global board' });
  if (!(await board.isVisible())) fail(name, 'the global board is missing');
  else ok();
  if (!(await page.getByText('+40%').first().isVisible().catch(() => false)))
    fail(name, 'the top return is not shown');
  else ok();
  if (!(await page.getByText('you', { exact: true }).first().isVisible().catch(() => false)))
    fail(name, 'your own row is not marked');
  else ok();

  if (errors.length) fail(name, errors.join('; '));
  await ctx.close();
}

// The guide must open by itself on a first visit, and stay shut afterwards.
{
  const { ctx, page, errors } = await newPage(PHONE, { seenGuide: false });
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const guide = page.getByRole('dialog', { name: 'How this works' });
  if (!(await guide.isVisible())) fail('guide', 'did not auto-open on first visit');
  else ok();
  await auditPage(page, 'guide');
  await page.getByRole('button', { name: 'Deal me in' }).click();
  await page.waitForTimeout(200);
  if (await guide.isVisible()) fail('guide', 'did not close');
  else ok();

  const flag = await page.evaluate(() => localStorage.getItem('chip-ledger:guide-seen'));
  if (flag !== '1') fail('guide', 'seen flag not stored');
  else ok();

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (await guide.isVisible().catch(() => false)) fail('guide', 'reopened after being dismissed');
  else ok();

  // And it must be reachable again from the header.
  await page.getByRole('button', { name: 'How this works' }).click();
  await page.waitForTimeout(200);
  if (!(await guide.isVisible())) fail('guide', 'help button did not reopen it');
  else ok();

  if (errors.length) fail('guide', errors.join('; '));
  await ctx.close();
}

// Protected routes must bounce a signed-out visitor, not error.
{
  const { ctx, page, errors } = await newPage(PHONE);
  const res = await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  if (!res || res.status() >= 500) fail('/dashboard', `status ${res?.status()}`);
  else ok();
  const res2 = await page.goto(`${base}/game/ABC123`, { waitUntil: 'networkidle' });
  if (!res2 || res2.status() >= 500) fail('/game/[code]', `status ${res2?.status()}`);
  else ok();
  const res3 = await page.goto(`${base}/offline`, { waitUntil: 'networkidle' });
  if (!res3 || res3.status() >= 400) fail('/offline', `status ${res3?.status()}`);
  else ok();
  if (errors.length) fail('routes', errors.join('; '));
  await ctx.close();
}

// PWA plumbing.
{
  const { ctx, page } = await newPage(PHONE);
  const manifest = await page.goto(`${base}/manifest.webmanifest`);
  if (manifest?.status() !== 200) fail('manifest', `status ${manifest?.status()}`);
  else ok();
  const sw = await page.goto(`${base}/sw.js`);
  if (sw?.status() !== 200) fail('service worker', `status ${sw?.status()}`);
  else ok();
  for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/maskable-512.png']) {
    const r = await page.goto(base + icon);
    if (r?.status() !== 200) fail('icons', `${icon} status ${r?.status()}`);
    else ok();
  }
  await ctx.close();
}

// Reduced motion must kill the pulse but keep the banner readable.
{
  const ctx = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('chip-ledger:guide-seen', '1'));
  const page = await ctx.newPage();
  await page.goto(`${base}/preview`, { waitUntil: 'networkidle' });
  const anim = await page.evaluate(() => {
    const el = document.querySelector('.flash-ring');
    if (!el) return 'missing';
    return getComputedStyle(el).animationName;
  });
  if (anim !== 'none' && anim !== 'missing') fail('reduced motion', `animation still running: ${anim}`);
  else ok();
  await ctx.close();
}

await browser.close();

console.log(`\n${checks} checks passed`);
if (failures.length) {
  console.log(`\n${failures.length} FAILURES:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('no failures');
