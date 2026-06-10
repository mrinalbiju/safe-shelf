/* Safe Shelf — data layer: reference data, evaluation engine, persistence */
(function (global) {
  "use strict";

  /* =================== Reference data =================== */

  // FDA Big 9 + EU 14 extras
  var ALLERGENS = [
    { id: "milk",      label: "Milk / Dairy",  emoji: "🥛" },
    { id: "eggs",      label: "Eggs",          emoji: "🥚" },
    { id: "peanuts",   label: "Peanuts",       emoji: "🥜" },
    { id: "treenuts",  label: "Tree nuts",     emoji: "🌰" },
    { id: "wheat",     label: "Wheat / Gluten",emoji: "🌾" },
    { id: "soy",       label: "Soybeans",      emoji: "🫘" },
    { id: "fish",      label: "Fish",          emoji: "🐟" },
    { id: "shellfish", label: "Shellfish",     emoji: "🍤" },
    { id: "sesame",    label: "Sesame",        emoji: "⚪" },
    { id: "celery",    label: "Celery",        emoji: "🥬" },
    { id: "mustard",   label: "Mustard",       emoji: "🟡" },
    { id: "sulphites", label: "Sulphites",     emoji: "🧪" },
    { id: "lupin",     label: "Lupin",         emoji: "🌸" },
    { id: "molluscs",  label: "Molluscs",      emoji: "🦪" }
  ];

  // Conditions with threshold rules (per 100 g/ml, simplified from ADA / AHA / NKF / WHO baselines)
  var CONDITIONS = [
    { id: "diabetes",     label: "Diabetes",            emoji: "🩸",
      rules: [{ nutrient: "sugar", op: "<=", value: 5, unit: "g", text: "added sugar ≤ 5g/100g (ADA)" }] },
    { id: "hypertension", label: "Hypertension",        emoji: "💓",
      rules: [{ nutrient: "sodium", op: "<=", value: 140, unit: "mg", text: "sodium ≤ 140mg/100g (AHA)" }] },
    { id: "kidney",       label: "Chronic kidney disease", emoji: "🫘",
      rules: [
        { nutrient: "sodium", op: "<=", value: 120, unit: "mg", text: "sodium ≤ 120mg/100g (NKF)" },
        { nutrient: "protein", op: "<=", value: 10, unit: "g", text: "protein ≤ 10g/100g (NKF)" }
      ] },
    { id: "cholesterol",  label: "High cholesterol",    emoji: "🫀",
      rules: [{ nutrient: "satFat", op: "<=", value: 1.5, unit: "g", text: "saturated fat ≤ 1.5g/100g (WHO)" }] },
    { id: "celiac",       label: "Celiac disease",      emoji: "🌾",
      presence: ["wheat"], priority0: true },
    { id: "lactose",      label: "Lactose intolerance", emoji: "🥛",
      presence: ["milk"] }
  ];

  var LIFESTYLES = [
    { id: "vegan",      label: "Vegan",       emoji: "🌱", avoid: ["milk", "eggs", "fish", "shellfish", "molluscs", "meat", "honey", "gelatin"] },
    { id: "vegetarian", label: "Vegetarian",  emoji: "🥦", avoid: ["fish", "shellfish", "molluscs", "meat", "gelatin"] },
    { id: "glutenfree", label: "Gluten-free", emoji: "🚫🌾", avoid: ["wheat"] },
    { id: "keto",       label: "Keto",        emoji: "🥓", rules: [{ nutrient: "sugar", op: "<=", value: 3, unit: "g", text: "sugar ≤ 3g/100g (keto)" }] },
    { id: "lowsodium",  label: "Low sodium",  emoji: "🧂", rules: [{ nutrient: "sodium", op: "<=", value: 120, unit: "mg", text: "sodium ≤ 120mg/100g" }] }
  ];

  // Ingredient Alias Dictionary (FR-1.9): hidden chemical names → trigger
  var ALIASES = {
    "sodium caseinate": "milk", "casein": "milk", "whey": "milk", "lactose": "milk", "ghee": "milk", "butterfat": "milk",
    "albumin": "eggs", "ovalbumin": "eggs", "lysozyme": "eggs", "globulin": "eggs",
    "arachis oil": "peanuts", "groundnut": "peanuts",
    "semolina": "wheat", "durum": "wheat", "spelt": "wheat", "malt": "wheat", "seitan": "wheat", "maida": "wheat",
    "lecithin (soy)": "soy", "soy lecithin": "soy", "edamame": "soy", "tofu": "soy", "textured vegetable protein": "soy",
    "tahini": "sesame", "gingelly": "sesame", "til": "sesame",
    "anchovy": "fish", "worcestershire": "fish", "surimi": "fish",
    "krill": "shellfish", "scampi": "shellfish",
    "marzipan": "treenuts", "praline": "treenuts", "gianduja": "treenuts", "frangipane": "treenuts",
    "e220": "sulphites", "sulphur dioxide": "sulphites", "potassium metabisulphite": "sulphites",
    "gelatin": "gelatin", "gelatine": "gelatin", "honey": "honey", "lard": "meat", "tallow": "meat", "rennet": "meat"
  };

  // Demo shelf (nutrition per 100 g/ml)
  var CATALOG = [
    { id: "p1", price: 199,  name: "Crunchy Peanut Butter", emoji: "🥜", category: "Spreads",
      allergens: ["peanuts"], ingredients: "roasted peanuts, groundnut oil, salt",
      nutrition: { sugar: 6.5, sodium: 420, satFat: 9.5, protein: 25 } },
    { id: "p2", price: 74,  name: "Full-Cream Milk", emoji: "🥛", category: "Dairy",
      allergens: ["milk"], ingredients: "whole milk",
      nutrition: { sugar: 4.8, sodium: 44, satFat: 2.4, protein: 3.3 } },
    { id: "p3", price: 45,  name: "White Sandwich Bread", emoji: "🍞", category: "Bakery",
      allergens: ["wheat", "soy"], ingredients: "maida, water, sugar, yeast, soy lecithin, salt",
      nutrition: { sugar: 5.2, sodium: 480, satFat: 0.8, protein: 8.5 } },
    { id: "p4", price: 14,  name: "Instant Masala Noodles", emoji: "🍜", category: "Snacks",
      allergens: ["wheat"], ingredients: "wheat flour, palm oil, salt, spice mix, malt extract",
      nutrition: { sugar: 2.1, sodium: 1150, satFat: 8.9, protein: 9.0 } },
    { id: "p5", price: 150,  name: "Dark Chocolate 70%", emoji: "🍫", category: "Confectionery",
      allergens: ["milk", "treenuts"], ingredients: "cocoa mass, sugar, cocoa butter, butterfat, may contain praline",
      nutrition: { sugar: 24, sodium: 20, satFat: 24, protein: 7.8 } },
    { id: "p6", price: 40,  name: "Honey Oat Granola Bar", emoji: "🍯", category: "Snacks",
      allergens: ["treenuts", "wheat"], ingredients: "oats, honey, almonds, wheat crisps, marzipan pieces",
      nutrition: { sugar: 28, sodium: 140, satFat: 3.2, protein: 8.0 } },
    { id: "p7", price: 95,  name: "Soy Sauce", emoji: "🍶", category: "Condiments",
      allergens: ["soy", "wheat"], ingredients: "water, soybeans, wheat, salt",
      nutrition: { sugar: 4.0, sodium: 5490, satFat: 0, protein: 8.1 } },
    { id: "p8", price: 85,  name: "Prawn Crackers", emoji: "🍤", category: "Snacks",
      allergens: ["shellfish"], ingredients: "tapioca starch, scampi extract, salt",
      nutrition: { sugar: 1.2, sodium: 980, satFat: 12, protein: 2.1 } },
    { id: "p9", price: 190,  name: "Plain Rolled Oats", emoji: "🥣", category: "Breakfast",
      allergens: [], ingredients: "100% wholegrain rolled oats",
      nutrition: { sugar: 0.9, sodium: 2, satFat: 1.2, protein: 13.5 } },
    { id: "p10", price: 149, name: "Hummus Classic", emoji: "🫓", category: "Spreads",
      allergens: ["sesame"], ingredients: "chickpeas, tahini, olive oil, garlic, salt",
      nutrition: { sugar: 0.5, sodium: 380, satFat: 2.4, protein: 7.4 } },
    { id: "p11", price: 60, name: "Greek Yogurt", emoji: "🍦", category: "Dairy",
      allergens: ["milk"], ingredients: "milk, live cultures",
      nutrition: { sugar: 3.6, sodium: 36, satFat: 3.1, protein: 9.0 } },
    { id: "p12", price: 20, name: "Salted Potato Chips", emoji: "🥔", category: "Snacks",
      allergens: [], ingredients: "potatoes, vegetable oil, salt",
      nutrition: { sugar: 0.6, sodium: 520, satFat: 4.8, protein: 6.5 } },
    { id: "p13", price: 120, name: "Tomato Ketchup", emoji: "🍅", category: "Condiments",
      allergens: ["celery"], ingredients: "tomato paste, sugar, vinegar, salt, celery extract",
      nutrition: { sugar: 22, sodium: 900, satFat: 0.1, protein: 1.2 } },
    { id: "p14", price: 299, name: "Almond Milk (Unsweetened)", emoji: "🌰", category: "Dairy alternatives",
      allergens: ["treenuts"], ingredients: "water, almonds (2.3%), calcium, sea salt",
      nutrition: { sugar: 0.1, sodium: 50, satFat: 0.1, protein: 0.5 } },
    { id: "p15", price: 220, name: "Dried Apricots", emoji: "🍑", category: "Dried fruit",
      allergens: ["sulphites"], ingredients: "apricots, preservative (sulphur dioxide / e220)",
      nutrition: { sugar: 38, sodium: 8, satFat: 0.1, protein: 3.4 } },
    { id: "p16", price: 40, name: "Diet Cola", emoji: "🥤", category: "Beverages",
      allergens: [], ingredients: "carbonated water, colour, sweeteners, caffeine",
      nutrition: { sugar: 0, sodium: 12, satFat: 0, protein: 0 } }
  ];

  var NUTRIENT_LABELS = { sugar: "Sugar", sodium: "Sodium", satFat: "Saturated fat", protein: "Protein" };
  var EMOJIS = ["😀", "😎", "🧕", "👧", "👦", "👨", "👩", "🧑", "👵", "👴", "🦸", "🐯", "🐼", "🦊", "🐨"];

  /* =================== Evaluation engine =================== */

  function findAllergen(id) { return ALLERGENS.find(function (a) { return a.id === id; }); }
  function allergenLabel(id) {
    var a = findAllergen(id);
    return a ? a.emoji + " " + a.label : id;
  }

  // Scan ingredient text against the alias dictionary → set of triggers (FR-1.10)
  function detectTriggers(product) {
    var found = {};
    (product.allergens || []).forEach(function (a) { found[a] = "declared allergen"; });
    var text = (product.ingredients || "").toLowerCase();
    Object.keys(ALIASES).forEach(function (alias) {
      if (text.indexOf(alias) !== -1) {
        var trigger = ALIASES[alias];
        if (!found[trigger]) found[trigger] = 'hidden in "' + alias + '"';
      }
    });
    return found; // { triggerId: sourceText }
  }

  /**
   * Evaluate one product against one user.
   * Returns { status: 'safe'|'caution'|'unsafe', reasons: [{kind, severity, text}] }
   * - allergen / priority-0 hits  → unsafe (immutable, FR-11.5)
   * - condition threshold breach  → unsafe (medical)
   * - lifestyle conflict          → caution (partial suitability, FR-2.7)
   * Most Restrictive Rule Precedence (FR-11.2): lowest threshold per nutrient wins.
   */
  function evaluate(product, user) {
    var reasons = [];
    var triggers = detectTriggers(product);
    var n = product.nutrition || {};
    var haystack = ((product.ingredients || "") + " " + (product.name || "")).toLowerCase();

    // 1. Presence-based: the user's own allergen list (Priority 0)
    (user.allergens || []).forEach(function (al) {
      if (triggers[al]) {
        reasons.push({ kind: "allergen", severity: "unsafe",
          text: allergenLabel(al) + " — " + triggers[al] });
      }
    });

    // 1b. Custom free-text allergens: substring match on ingredients + name
    (user.customAllergens || []).forEach(function (term) {
      var t = String(term).toLowerCase().trim();
      if (t && haystack.indexOf(t) !== -1) {
        reasons.push({ kind: "allergen", severity: "unsafe",
          text: "✳️ " + term + " (custom allergen) — found in this product" });
      }
    });

    // 2. Conditions: presence rules + collect numeric rules
    var numericRules = [];
    (user.conditions || []).forEach(function (cid) {
      var cond = CONDITIONS.find(function (c) { return c.id === cid; });
      if (!cond) return;
      (cond.presence || []).forEach(function (al) {
        if (triggers[al]) {
          reasons.push({ kind: "condition", severity: "unsafe",
            text: cond.emoji + " " + cond.label + " — contains " + allergenLabel(al).toLowerCase() });
        }
      });
      (cond.rules || []).forEach(function (r) {
        numericRules.push({ rule: r, source: cond.label });
      });
    });

    // 2b. Custom illnesses: presence-based against their own avoid-list
    (user.customConditions || []).forEach(function (cc) {
      (cc.avoid || []).forEach(function (term) {
        var t = String(term).toLowerCase().trim();
        if (t && haystack.indexOf(t) !== -1) {
          reasons.push({ kind: "condition", severity: "unsafe",
            text: "🩺 " + cc.name + " (custom) — contains " + term });
        }
      });
    });

    // lifestyle numeric rules join the pool; lifestyle presence is "caution"
    (user.lifestyle || []).forEach(function (lid) {
      var ls = LIFESTYLES.find(function (l) { return l.id === lid; });
      if (!ls) return;
      (ls.avoid || []).forEach(function (al) {
        if (triggers[al]) {
          var label = findAllergen(al) ? allergenLabel(al).toLowerCase() : al;
          reasons.push({ kind: "lifestyle", severity: "caution",
            text: ls.emoji + " " + ls.label + " — contains " + label });
        }
      });
      (ls.rules || []).forEach(function (r) {
        numericRules.push({ rule: r, source: ls.label, lifestyle: true });
      });
    });

    // 3. Most Restrictive Rule Precedence per nutrient (FR-11.2)
    var byNutrient = {};
    numericRules.forEach(function (entry) {
      var key = entry.rule.nutrient;
      if (!byNutrient[key] || entry.rule.value < byNutrient[key].rule.value) byNutrient[key] = entry;
    });
    Object.keys(byNutrient).forEach(function (nutrient) {
      var entry = byNutrient[nutrient];
      var value = n[nutrient];
      if (value == null) return; // partial data: skip silently (FR-1.13)
      if (value > entry.rule.value) {
        reasons.push({
          kind: entry.lifestyle ? "lifestyle" : "condition",
          severity: entry.lifestyle ? "caution" : "unsafe",
          text: NUTRIENT_LABELS[nutrient] + " " + value + entry.rule.unit + "/100g exceeds " +
            entry.rule.value + entry.rule.unit + " limit (" + entry.source + ")"
        });
      }
    });

    var status = "safe";
    if (reasons.some(function (r) { return r.severity === "unsafe"; })) status = "unsafe";
    else if (reasons.length) status = "caution";
    return { status: status, reasons: reasons };
  }

  // Group evaluation: each member independently, no cross-profile aggregation (FR-2.9)
  function evaluateGroup(product, users) {
    var perMember = users.map(function (u) {
      var res = evaluate(product, u);
      return { user: u, status: res.status, reasons: res.reasons };
    });
    var aggregate = "safe";
    if (perMember.some(function (m) { return m.status === "unsafe"; })) aggregate = "unsafe";
    else if (perMember.some(function (m) { return m.status === "caution"; })) aggregate = "caution";
    return { aggregate: aggregate, perMember: perMember };
  }

  /* =================== Open Food Facts lookup (FR-5.1) =================== */

  var OFF_TAG_MAP = {
    "en:milk": "milk", "en:eggs": "eggs", "en:peanuts": "peanuts", "en:nuts": "treenuts",
    "en:gluten": "wheat", "en:soybeans": "soy", "en:fish": "fish", "en:crustaceans": "shellfish",
    "en:sesame-seeds": "sesame", "en:celery": "celery", "en:mustard": "mustard",
    "en:sulphur-dioxide-and-sulphites": "sulphites", "en:lupin": "lupin", "en:molluscs": "molluscs"
  };

  function lookupBarcode(barcode) {
    var url = "https://world.openfoodfacts.org/api/v2/product/" +
      encodeURIComponent(barcode) +
      "?fields=product_name,brands,allergens_tags,ingredients_text,nutriments,image_small_url";
    return fetch(url).then(function (res) {
      if (res.status === 404) return null; // OFF answers 404 for unknown products — that's "not found", not a network error
      if (!res.ok) throw new Error("network");
      return res.json();
    }).then(function (data) {
      if (!data) return null;
      if (data.status !== 1 || !data.product) return null;
      var p = data.product;
      var nut = p.nutriments || {};
      var allergens = (p.allergens_tags || [])
        .map(function (t) { return OFF_TAG_MAP[t]; })
        .filter(Boolean);
      return {
        id: "off-" + barcode,
        code: String(barcode),
        name: (p.product_name || "Unknown product") + (p.brands ? " — " + p.brands : ""),
        emoji: "📦",
        category: "Scanned product",
        allergens: allergens,
        ingredients: p.ingredients_text || "",
        nutrition: {
          sugar: nut.sugars_100g != null ? Math.round(nut.sugars_100g * 10) / 10 : null,
          sodium: nut.sodium_100g != null ? Math.round(nut.sodium_100g * 1000) : null, // g → mg
          satFat: nut["saturated-fat_100g"] != null ? Math.round(nut["saturated-fat_100g"] * 10) / 10 : null,
          protein: nut.proteins_100g != null ? Math.round(nut.proteins_100g * 10) / 10 : null
        },
        image: p.image_small_url || null,
        source: "Open Food Facts"
      };
    });
  }

  /* =================== Market prices (Open Prices + FX) =================== */

  // Crowd-reported retail prices from Open Prices (prices.openfoodfacts.org).
  // Prefers INR entries; otherwise converts the latest foreign price via ECB rates.
  function fetchPrice(barcode) {
    var base = "https://prices.openfoodfacts.org/api/v1/prices?product_code=" +
      encodeURIComponent(barcode) + "&order_by=-date&size=1";

    function describe(item) {
      var city = "";
      if (item.location) {
        var name = item.location.osm_name || item.location.osm_display_name || "";
        city = String(name).split(",")[0].trim();
      }
      return [city, item.date].filter(Boolean).join(", ");
    }

    return fetchJsonWithTimeout(base + "&currency=INR", 10000).then(function (d) {
      var item = d && d.items && d.items[0];
      if (item && item.price != null) {
        return { amount: Math.round(item.price * 100) / 100,
          note: "market price" + (describe(item) ? " · " + describe(item) : "") };
      }
      // no INR report — take the latest in any currency and convert
      return fetchJsonWithTimeout(base, 10000).then(function (d2) {
        var it = d2 && d2.items && d2.items[0];
        if (!it || it.price == null) return null;
        if (it.currency === "INR") {
          return { amount: Math.round(it.price * 100) / 100,
            note: "market price" + (describe(it) ? " · " + describe(it) : "") };
        }
        return fetchJsonWithTimeout("https://api.frankfurter.app/latest?amount=" +
          encodeURIComponent(it.price) + "&from=" + encodeURIComponent(it.currency) + "&to=INR", 10000)
          .then(function (fx) {
            var inr = fx && fx.rates && fx.rates.INR;
            if (inr == null) return null;
            return { amount: Math.round(inr),
              note: "≈ from " + it.currency + " " + it.price + (describe(it) ? " · " + describe(it) : "") };
          }).catch(function () { return null; });
      });
    }).catch(function () { return null; });
  }

  function fetchJsonWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, ms || 12000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  // Free-text product search (used by photo identify).
  // Primary: Open Food Facts Search-a-licious; fallback: legacy CGI search.
  function searchProducts(query) {
    function normalise(items) {
      return (items || []).filter(function (p) { return p && p.code; }).map(function (p) {
        var name = p.product_name;
        if (name && typeof name === "object") name = name.en || Object.values(name)[0];
        var brands = p.brands;
        if (Array.isArray(brands)) brands = brands.join(", ");
        return {
          code: String(p.code),
          name: name || "Unknown product",
          brands: brands || "",
          image: p.image_front_small_url || p.image_small_url || p.image_front_url || p.image_url || null
        };
      });
    }
    var primary = "https://search.openfoodfacts.org/search?page_size=8&q=" + encodeURIComponent(query);
    var legacy = "https://world.openfoodfacts.org/cgi/search.pl?action=process&search_simple=1&json=1&page_size=8" +
      "&search_terms=" + encodeURIComponent(query) +
      "&fields=code,product_name,brands,image_small_url";
    return fetchJsonWithTimeout(primary, 12000).then(function (data) {
      return normalise(data.hits);
    }).catch(function () {
      return fetchJsonWithTimeout(legacy, 12000).then(function (data) {
        return normalise(data.products);
      });
    });
  }

  /* =================== Persistence (on-device, NFR-2.1) =================== */

  var KEY = "safeshelf_v1";

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* corrupted state falls through to fresh */ }
    return { users: [], groups: [], currentUserId: null, activeGroupId: null };
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  global.SafeShelf = {
    ALLERGENS: ALLERGENS,
    CONDITIONS: CONDITIONS,
    LIFESTYLES: LIFESTYLES,
    CATALOG: CATALOG,
    NUTRIENT_LABELS: NUTRIENT_LABELS,
    EMOJIS: EMOJIS,
    allergenLabel: allergenLabel,
    detectTriggers: detectTriggers,
    evaluate: evaluate,
    evaluateGroup: evaluateGroup,
    lookupBarcode: lookupBarcode,
    fetchPrice: fetchPrice,
    searchProducts: searchProducts,
    load: load,
    save: save,
    uid: uid
  };
})(window);
