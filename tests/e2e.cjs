/* Safe Shelf — end-to-end smoke tests (Playwright, headless Chromium).
 *
 * Run via the webapp-testing helper so the static server is managed for you:
 *   python3 .claude/skills/webapp-testing/scripts/with_server.py \
 *     --server "python3 -m http.server 8931 --directory safe-shelf" --port 8931 \
 *     -- node safe-shelf/tests/e2e.cjs
 *
 * Covers: onboarding, profile creation, deterministic verdicts (manual entry),
 * allergen blocking, cart, tab navigation, and the SVG icon system. Network
 * CDNs (Supabase, fonts) are blocked offline by design — the app is local-first,
 * so these flows run without them.
 */
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8931";
let pass = 0, fail = 0;
const fails = [];
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; fails.push(name); console.log("  ✗ " + name); }
}

async function freshApp(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE + "/app.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "networkidle" });
  return page;
}

async function createProfile(page, name, allergens, conditions) {
  // onboarding auto-opens the form; otherwise open it
  await page.waitForTimeout(800);
  if (await page.locator("#modalBackdrop").isHidden()) {
    await page.locator('[data-tab="profiles"]').click();
    await page.locator("#addUserBtn").click();
  }
  await page.waitForSelector("#fName");
  await page.fill("#fName", name);
  for (const a of allergens || []) await page.click(`#fAllergens [data-chip="al"][data-id="${a}"]`);
  for (const c of conditions || []) await page.click(`#fConditions [data-chip="cond"][data-id="${c}"]`);
  await page.click('[data-action="save-user"]');
  await page.waitForTimeout(400);
}

async function manualCheck(page, fields) {
  await page.locator('[data-tab="check"]').click();
  await page.waitForTimeout(150);
  await page.fill("#mName", fields.name);
  for (const a of fields.allergens || []) await page.click(`#mAllergens [data-chip="mal"][data-id="${a}"]`);
  if (fields.sugar != null) await page.fill("#mSugar", String(fields.sugar));
  if (fields.sodium != null) await page.fill("#mSodium", String(fields.sodium));
  await page.locator('#manualForm button[type="submit"]').click();
  await page.waitForSelector(".verdict-banner", { timeout: 5000 });
  const status = await page.evaluate(() => {
    const b = document.querySelector(".verdict-banner");
    return { cls: b.className, hasIcon: !!b.querySelector("svg.icon") };
  });
  return status;
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- 1. Onboarding ----
    console.log("Onboarding");
    let page = await freshApp(browser);
    await page.waitForTimeout(900);
    check("new-profile form auto-opens on first run",
      !(await page.locator("#modalBackdrop").isHidden()) && await page.locator("#fName").count() > 0);

    // ---- 2. SVG icon system ----
    console.log("Icon system");
    check("icon sprite injected", await page.locator("#ss-icon-sprite").count() === 1);
    const navHasSvg = await page.evaluate(() =>
      [...document.querySelectorAll(".nav-item")].every(n => n.querySelector("svg use")));
    check("bottom nav uses SVG icons (no emoji)", navHasSvg);
    const navHasEmoji = await page.evaluate(() =>
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(
        [...document.querySelectorAll(".nav-item")].map(n => n.textContent).join("")));
    check("bottom nav text has no emoji", !navHasEmoji);

    // ---- 3. Profile creation ----
    console.log("Profile creation");
    await createProfile(page, "Tester", ["milk"], ["diabetes"]);
    const pill = await page.locator("#contextPillText").textContent();
    check("context pill reflects active profile", /Tester/i.test(pill));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("safeshelf_v1")));
    check("profile persisted with milk allergen", stored.users[0].allergens.includes("milk"));
    check("profile persisted with diabetes condition", stored.users[0].conditions.includes("diabetes"));

    // ---- 4. Deterministic verdicts (manual entry) ----
    console.log("Verdicts");
    let v = await manualCheck(page, { name: "Sugar Bomb", sugar: 50 });
    check("high-sugar product flagged unsafe for diabetes", /unsafe/.test(v.cls));
    check("verdict banner renders an SVG status icon", v.hasIcon);
    await page.click('[data-action="close-modal"]');

    v = await manualCheck(page, { name: "Plain Water", sugar: 0, sodium: 0 });
    check("clean product is safe", /safe/.test(v.cls));
    await page.click('[data-action="close-modal"]');

    v = await manualCheck(page, { name: "Milk Bar", allergens: ["milk"] });
    check("declared milk allergen blocks the product", /unsafe/.test(v.cls));

    // ---- 5. Cart ----
    console.log("Cart");
    const addBtn = page.locator('[data-action="add-to-cart"]');
    if (await addBtn.count()) {
      await addBtn.first().click();
      await page.waitForTimeout(300);
      const badge = await page.locator("#cartBadge").textContent();
      check("cart badge increments after add", parseInt(badge || "0", 10) >= 1);
    } else {
      check("cart badge increments after add", false);
    }
    if (!(await page.locator("#modalBackdrop").isHidden())) await page.click('[data-action="close-modal"]').catch(()=>{});

    // ---- 6. Tab navigation ----
    console.log("Navigation");
    await page.locator('[data-tab="cart"]').click();
    check("cart tab panel shows", await page.locator("#panel-cart").isVisible());
    await page.locator('[data-tab="profiles"]').click();
    check("profiles tab panel shows", await page.locator("#panel-profiles").isVisible());
    await page.locator('[data-tab="groups"]').click();
    check("groups tab panel shows", await page.locator("#panel-groups").isVisible());

    await page.screenshot({ path: "/tmp/ss-e2e-final.png" });
  } catch (e) {
    fail++; fails.push("EXCEPTION: " + e.message);
    console.log("\n!! Exception: " + e.stack);
  } finally {
    await browser.close();
  }

  console.log("\n" + "=".repeat(40));
  console.log(`PASSED ${pass} / ${pass + fail}`);
  if (fail) { console.log("FAILED: " + fails.join("; ")); process.exit(1); }
  console.log("All e2e checks passed.");
})();
