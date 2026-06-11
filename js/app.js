/* Safe Shelf — app UI: profiles, product checking, group buying */
(function () {
  "use strict";

  var S = window.SafeShelf;
  var state = S.load();
  var OWNER_KEY = "safeshelf_owner";

  // accounts are exclusive: this empties the device copy (used when a new
  // account signs in, and on sign-out so the next person can't see your data)
  function resetLocalState(clearOwner) {
    state = { users: [], groups: [], currentUserId: null, activeGroupId: null };
    S.save(state);
    if (clearOwner) {
      try { localStorage.removeItem(OWNER_KEY); } catch (e) { /* private mode */ }
    }
  }

  /* =================== helpers =================== */

  function $(sel) { return document.querySelector(sel); }

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function persist() {
    state.updatedAt = Date.now();
    S.save(state);
    if (window.SafeShelfCloud) window.SafeShelfCloud.queueSync(state);
  }

  function getUser(id) { return state.users.find(function (u) { return u.id === id; }); }
  function getGroup(id) { return state.groups.find(function (g) { return g.id === id; }); }
  function currentUser() { return getUser(state.currentUserId); }
  function activeGroup() { return getGroup(state.activeGroupId); }
  function canEdit(user) { return state.currentUserId === user.id; }

  function groupMembers(group) {
    return group.memberIds.map(getUser).filter(Boolean);
  }

  /* ---- cart helpers ---- */
  // The active cart follows the shopping context: group cart during a group
  // session, otherwise the current user's personal cart.
  function activeCart() {
    var g = activeGroup();
    if (g) { g.cart = g.cart || []; return g.cart; }
    var u = currentUser();
    if (u) { u.cart = u.cart || []; return u.cart; }
    return null;
  }
  function cartContextLabel() {
    var g = activeGroup();
    if (g) return "🛒 " + g.name + " (group)";
    var u = currentUser();
    return u ? u.emoji + " " + u.name + " (personal)" : "";
  }
  // stable identity: barcode/catalog id when we have one, else the name
  function cartKeyFor(product) {
    if (product.id && product.id.indexOf("manual-") !== 0) return product.id;
    return "name:" + String(product.name || "").toLowerCase().trim();
  }
  function findInCart(cart, product) {
    var key = cartKeyFor(product);
    var name = String(product.name || "").toLowerCase().trim();
    return cart.findIndex(function (it) {
      if (it.key) return it.key === key;
      return String(it.name || "").toLowerCase().trim() === name; // pre-cart-feature group items
    });
  }
  function inr(n) {
    return "₹" + (Math.round(n * 100) / 100).toLocaleString("en-IN");
  }

  function timeAgo(ts) {
    if (!ts) return "";
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  var toastTimer;
  function toast(msg, warn) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("warn", !!warn);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  /* ---- modal ---- */
  var modalCleanup = null; // teardown hook (stops camera, frees blobs) run on every close/replace

  function openModal(html) {
    if (modalCleanup) { modalCleanup(); modalCleanup = null; }
    var backdrop = $("#modalBackdrop");
    $("#modalBox").innerHTML = html;
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    if (modalCleanup) { modalCleanup(); modalCleanup = null; }
    $("#modalBackdrop").hidden = true;
    document.body.style.overflow = "";
    onboardAutoOpened = false; // whatever opens next isn't the onboarding nag
  }
  $("#modalBackdrop").addEventListener("click", function (e) {
    if (e.target === this) closeModal();
  });

  /* ---- chip helpers for forms ---- */
  function chipGroup(items, selected, name) {
    return items.map(function (it) {
      var on = selected.indexOf(it.id) !== -1;
      return '<button type="button" class="chip' + (on ? " on" : "") + '" data-chip="' + name + '" data-id="' + it.id + '">' +
        it.emoji + " " + esc(it.label) + "</button>";
    }).join("");
  }
  function readChips(container, name) {
    return Array.prototype.slice.call(
      container.querySelectorAll('.chip.on[data-chip="' + name + '"]')
    ).map(function (c) { return c.dataset.id; });
  }

  function userChipsHtml(user) {
    var html = "";
    (user.allergens || []).forEach(function (a) {
      html += '<span class="mini-chip allergen">' + S.allergenLabel(a) + "</span>";
    });
    (user.customAllergens || []).forEach(function (t) {
      html += '<span class="mini-chip allergen">✳️ ' + esc(t) + "</span>";
    });
    (user.customConditions || []).forEach(function (cc) {
      html += '<span class="mini-chip condition">🩺 ' + esc(cc.name) + "</span>";
    });
    (user.conditions || []).forEach(function (c) {
      var cond = S.CONDITIONS.find(function (x) { return x.id === c; });
      if (cond) html += '<span class="mini-chip condition">' + cond.emoji + " " + esc(cond.label) + "</span>";
    });
    (user.lifestyle || []).forEach(function (l) {
      var ls = S.LIFESTYLES.find(function (x) { return x.id === l; });
      if (ls) html += '<span class="mini-chip lifestyle">' + ls.emoji + " " + esc(ls.label) + "</span>";
    });
    if (!html) html = '<span class="mini-chip">No restrictions yet</span>';
    return html;
  }

  /* =================== renders =================== */

  function renderAll() {
    renderContextPill();
    renderCheckContext();
    renderShelf();
    renderCart();
    renderUsers();
    renderGroups();
  }

  function renderContextPill() {
    var g = activeGroup();
    var u = currentUser();
    var text = "No profile yet";
    if (g) text = "🛒 " + g.name + " · " + g.memberIds.length + " people";
    else if (u) text = u.emoji + " " + u.name;
    $("#contextPillText").textContent = text;
  }

  function renderCheckContext() {
    var box = $("#checkContext");
    var g = activeGroup();
    var u = currentUser();
    if (g) {
      var members = groupMembers(g);
      box.className = "context-banner is-group";
      box.innerHTML =
        "<strong>🛒 Group buy: " + esc(g.name) + "</strong>" +
        members.map(function (m) {
          return '<span class="mini-chip">' + m.emoji + " " + esc(m.name) + "</span>";
        }).join("") +
        '<span class="spacer"></span>' +
        '<button class="btn btn-ghost btn-sm" data-action="end-session" type="button">End session</button>';
    } else if (u) {
      box.className = "context-banner";
      box.innerHTML =
        "<strong>Checking for " + u.emoji + " " + esc(u.name) + "</strong>" +
        userChipsHtml(u) +
        '<span class="spacer"></span>' +
        '<button class="btn btn-ghost btn-sm" data-action="open-switcher" type="button">Switch</button>';
    } else {
      box.className = "context-banner";
      box.innerHTML = "<strong>👋 Welcome!</strong> Create your first profile to start checking products." +
        '<span class="spacer"></span>' +
        '<button class="btn btn-primary btn-sm" data-action="new-user" type="button">Create profile</button>';
    }
  }

  function renderShelf() {
    $("#shelfGrid").innerHTML = S.CATALOG.map(function (p) {
      return '<button type="button" class="shelf-item" data-product="' + p.id + '">' +
        '<span class="pe">' + p.emoji + '</span>' +
        '<span class="pn">' + esc(p.name) + '</span>' +
        '<span class="pc">' + esc(p.category) + (p.price != null ? " · " + inr(p.price) : "") + "</span></button>";
    }).join("");
  }

  function renderCart() {
    var cart = activeCart();
    var badge = $("#cartBadge");
    badge.hidden = !cart || !cart.length;
    if (cart && cart.length) badge.textContent = cart.length;

    var ctxBox = $("#cartContext");
    var body = $("#cartBody");
    var g = activeGroup();
    ctxBox.className = "context-banner" + (g ? " is-group" : "");

    if (!cart) {
      ctxBox.innerHTML = "<strong>🧺 Cart</strong> Create a profile first.";
      body.innerHTML = "";
      return;
    }
    ctxBox.innerHTML = "<strong>🧺 Cart for " + esc(cartContextLabel()) + "</strong>" +
      '<span class="spacer"></span>' +
      (cart.length ? '<button class="btn btn-ghost btn-sm" data-action="cart-clear" type="button">Empty cart</button>' : "");

    if (!cart.length) {
      body.innerHTML = '<div class="empty"><span class="big">🧺</span>Nothing here yet.<br />Check a product, then tap "Add to cart" on the verdict.</div>';
      return;
    }

    var total = 0, priced = 0, safeCount = 0;
    var rows = cart.map(function (item, idx) {
      if (item.status === "safe") safeCount++;
      if (item.price != null) { total += item.price; priced++; }
      var priceHtml = item.price != null
        ? '<span class="price-amt">' + inr(item.price) + "</span>" +
          (item.priceNote ? ' <span class="price-note">' + esc(item.priceNote) + "</span>" : "")
        : '<button class="price-btn" data-action="cart-set-price" data-idx="' + idx + '" type="button">＋ set price</button>';
      return '<div class="cart-row">' +
        (item.image ? '<img src="' + esc(item.image) + '" alt="" loading="lazy" />'
          : '<span class="cart-ph">' + (item.emoji || "📦") + "</span>") +
        '<div class="cart-info"><div class="cart-name">' + esc(item.name) + "</div>" +
        '<div class="cart-price">' + priceHtml + "</div></div>" +
        '<div class="cart-side"><span class="verdict ' + (item.status || "caution") + '">' +
          (item.status || "?").toUpperCase() + "</span>" +
        '<button class="rm" data-action="cart-rm" data-idx="' + idx + '" type="button" aria-label="Remove">✕</button></div>' +
      "</div>";
    }).join("");

    body.innerHTML = '<div class="card"><div class="stack">' + rows + "</div>" +
      '<div class="cart-total"><span>' + safeCount + "/" + cart.length + " safe · " +
        (priced < cart.length ? priced + "/" + cart.length + " priced" : "all priced") + "</span>" +
      '<span class="amt">' + inr(total) + (priced < cart.length ? '<span class="price-note"> +' + (cart.length - priced) + " unpriced</span>" : "") + "</span></div></div>" +
      '<p class="hint center">Prices: demo-shelf items use typical Indian MRPs; scanned items use crowd-reported prices from Open Prices when available. Tap "set price" to use what your store actually charges.</p>';
  }

  function renderUsers() {
    var box = $("#usersList");
    var u = currentUser();
    $("#profilesContext").className = "context-banner";
    $("#profilesContext").innerHTML = u
      ? "<strong>You are acting as " + u.emoji + " " + esc(u.name) + "</strong>" +
        '<span class="spacer"></span>' +
        '<button class="btn btn-ghost btn-sm" data-action="open-switcher" type="button">Switch user</button>'
      : "<strong>No profiles yet.</strong> Add the first one below — it becomes you.";

    if (!state.users.length) {
      box.innerHTML = '<div class="empty"><span class="big">👤</span>No profiles on this device yet.<br />Each person gets their own allergens, illnesses &amp; preferences.</div>';
      return;
    }

    box.innerHTML = state.users.map(function (user) {
      var me = canEdit(user);
      var inGroups = state.groups.filter(function (g) { return g.memberIds.indexOf(user.id) !== -1; });
      var actions = "";
      if (me) {
        actions =
          '<button class="btn btn-ghost" data-action="edit-user" data-id="' + user.id + '" type="button">✏️ Edit my profile</button>' +
          '<button class="btn btn-danger" data-action="delete-user" data-id="' + user.id + '" type="button">Delete</button>';
      } else {
        actions =
          '<button class="btn btn-ghost" data-action="switch-user" data-id="' + user.id + '" type="button">Act as ' + esc(user.name) + '</button>' +
          '<button class="btn btn-ghost" data-action="locked-edit" data-name="' + esc(user.name) + '" type="button">🔒 Edit</button>';
      }
      return '<article class="user-card' + (me ? " is-me" : "") + '">' +
        '<div class="user-head">' +
          '<span class="user-avatar">' + user.emoji + "</span>" +
          "<div><div class=\"user-name\">" + esc(user.name) + "</div>" +
          '<div class="user-meta">' +
            (inGroups.length ? "In " + inGroups.map(function (g) { return esc(g.name); }).join(", ") + " · " : "") +
            (user.updatedAt ? "updated " + timeAgo(user.updatedAt) : "new") +
          "</div></div>" +
          (me ? '<span class="you-badge">YOU</span>' : '<span class="lock-badge">🔒</span>') +
        "</div>" +
        '<div class="user-chips">' + userChipsHtml(user) + "</div>" +
        (me ? "" : '<p class="locked-note">🔒 Only ' + esc(user.name) + " can change these allergens &amp; illnesses.</p>") +
        '<div class="user-actions">' + actions + "</div>" +
      "</article>";
    }).join("");
  }

  function renderGroups() {
    var box = $("#groupsList");
    var u = currentUser();
    $("#groupsContext").className = "context-banner is-group";
    $("#groupsContext").innerHTML = state.activeGroupId
      ? "<strong>🛒 A group session is live.</strong> Every product check now runs against all members."
      : "<strong>Group purchases:</strong> pool profiles, get one verdict for everyone.";

    if (!state.groups.length) {
      box.innerHTML = '<div class="empty"><span class="big">🛒</span>No group buys yet.<br />Create one to shop for several people at once.</div>';
      return;
    }

    box.innerHTML = state.groups.map(function (g) {
      var members = groupMembers(g);
      var isActive = state.activeGroupId === g.id;

      // union of constraints across members
      var unionAllergens = {}, unionConditions = {}, unionLifestyle = {};
      members.forEach(function (m) {
        (m.allergens || []).forEach(function (a) { unionAllergens[a] = 1; });
        (m.conditions || []).forEach(function (c) { unionConditions[c] = 1; });
        (m.lifestyle || []).forEach(function (l) { unionLifestyle[l] = 1; });
      });
      var unionBits = Object.keys(unionAllergens).map(S.allergenLabel)
        .concat(Object.keys(unionConditions).map(function (c) {
          var cond = S.CONDITIONS.find(function (x) { return x.id === c; });
          return cond ? cond.emoji + " " + cond.label : c;
        }))
        .concat(Object.keys(unionLifestyle).map(function (l) {
          var ls = S.LIFESTYLES.find(function (x) { return x.id === l; });
          return ls ? ls.emoji + " " + ls.label : l;
        }));

      var cart = g.cart || [];
      var safeCount = cart.filter(function (i) { return i.status === "safe"; }).length;

      return '<article class="group-card' + (isActive ? " active" : "") + '">' +
        '<div class="group-head"><span class="user-avatar">🛒</span>' +
          '<div><div class="group-name">' + esc(g.name) + '</div>' +
          '<div class="user-meta">' + members.length + " members · " + cart.length + " items in cart</div></div>" +
          (isActive ? '<span class="active-badge">ACTIVE</span>' : "") +
        "</div>" +
        '<div class="group-members">' +
          members.map(function (m) {
            var mine = u && m.id === u.id;
            return '<div class="member-row"><span class="who">' + m.emoji + " " + esc(m.name) + "</span>" +
              userChipsHtml(m) +
              '<span class="lock" title="' + (mine ? "You can edit this in Profiles" : "Read-only — only " + esc(m.name) + " can edit") + '">' +
              (mine ? "✏️" : "🔒") + "</span></div>";
          }).join("") +
        "</div>" +
        '<div class="union-strip"><b>Group constraints (union):</b> ' +
          (unionBits.length ? unionBits.join(" · ") : "none yet") + "</div>" +
        (cart.length
          ? '<div class="cart-list">' + cart.map(function (item, idx) {
              return '<div class="cart-item"><span>' + item.emoji + "</span><span>" + esc(item.name) + "</span>" +
                '<span class="verdict ' + item.status + '">' + item.status.toUpperCase() + "</span>" +
                '<button class="rm" data-action="remove-cart" data-group="' + g.id + '" data-idx="' + idx + '" type="button" aria-label="Remove">✕</button></div>';
            }).join("") + "</div>" +
            '<p class="cart-summary">Cart summary: ' + safeCount + "/" + cart.length + " items safe for the whole group.</p>"
          : "") +
        '<div class="user-actions">' +
          (isActive
            ? '<button class="btn btn-ghost" data-action="end-session" type="button">⏹ End session</button>'
            : '<button class="btn btn-primary" data-action="activate-group" data-id="' + g.id + '" type="button">▶ Start group session</button>') +
          '<button class="btn btn-danger" data-action="delete-group" data-id="' + g.id + '" type="button">Delete</button>' +
        "</div>" +
      "</article>";
    }).join("");
  }

  /* =================== AI settings =================== */

  var serverAiOn = false;

  var AI_THRESHOLD_DEFAULT = 40;
  function aiThreshold() {
    var t = state.settings && state.settings.aiThreshold;
    return typeof t === "number" ? t : AI_THRESHOLD_DEFAULT;
  }
  function setAiThreshold(t) {
    if (!state.settings) state.settings = {};
    state.settings.aiThreshold = t;
    persist();
  }

  function renderAiCard() {
    var status = $("#aiStatus"), btn = $("#aiKeyBtn");
    var askForm = $("#aiAskForm"), thrBox = $("#aiThresholdBox");
    if (!status || !btn) return;
    var on = serverAiOn || !!S.getAiKey();
    askForm.hidden = !on;
    thrBox.hidden = !on;
    if (on) {
      status.textContent = "On — every verdict gets an AI second opinion (Llama 3.3 via Groq). Ask about any food directly:";
      $("#aiThreshold").value = aiThreshold();
      $("#aiThresholdVal").textContent = aiThreshold();
      btn.hidden = serverAiOn && !S.getAiKey();
      btn.textContent = S.getAiKey() ? "Remove personal API key" : "";
    } else {
      status.textContent = "Off — paste a free Groq API key (console.groq.com) to enable AI-powered suitability checks and illness avoid-lists.";
      btn.hidden = false;
      btn.textContent = "🔑 Set Groq API key";
    }
  }

  /* =================== account & cloud sync =================== */

  function renderAccount() {
    var box = $("#accountCard");
    if (!box) return;
    var cloud = window.SafeShelfCloud;
    if (!cloud) { box.hidden = true; return; }
    var info = cloud.getStatus();
    var so = $("#signOutBtn");
    if (so) {
      so.hidden = info.status !== "signedin";
      so.title = info.email ? "Sign out of " + info.email : "Sign out";
    }
    box.hidden = false;
    if (info.status === "loading") {
      box.innerHTML = '<h2 class="card-title">🔐 Account</h2><p class="card-sub">Connecting…</p>';
    } else if (info.status === "unavailable") {
      box.innerHTML = '<h2 class="card-title">🔐 Account</h2>' +
        '<p class="card-sub">Cloud sync is unreachable right now — the app keeps working from this device\'s storage.</p>';
    } else if (info.status === "signedin") {
      box.innerHTML = '<h2 class="card-title">🔐 Account</h2>' +
        '<p class="card-sub">Signed in as <strong>' + esc(info.email) + "</strong>. Profiles, groups and carts sync automatically — changes from your other devices appear live" +
        (info.lastSync ? " · last synced " + timeAgo(info.lastSync) : "") + ".</p>" +
        '<div class="user-actions">' +
        '<button class="btn btn-ghost" data-action="acct-sync" type="button">🔄 Sync now</button>' +
        '<button class="btn btn-danger" data-action="acct-signout" type="button">Sign out</button></div>';
    } else {
      box.innerHTML = '<h2 class="card-title">🔐 Account</h2>' +
        '<p class="card-sub">Sign in to access your profiles, groups and carts. Each account\'s data is private to it — ' +
        'anything created while signed out stays temporary on this device and is cleared when an account signs in.</p>' +
        '<a class="btn btn-primary btn-block" href="login.html">Sign in / Create account</a>';
    }
  }

  /* =================== tabs =================== */

  function showTab(name) {
    document.querySelectorAll("[data-panel]").forEach(function (p) {
      p.hidden = p.id !== "panel-" + name;
    });
    document.querySelectorAll(".nav-item").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === name);
    });
    window.scrollTo({ top: 0 });
  }

  /* =================== user form =================== */

  // staging for free-text entries while the profile modal is open
  var formCustom = { allergens: [], conditions: [] };

  function customAllergenChips() {
    return formCustom.allergens.map(function (t, i) {
      return '<button type="button" class="chip on" data-action="rm-custom-al" data-idx="' + i + '">✳️ ' +
        esc(t) + '<span class="x">✕</span></button>';
    }).join("") || '<span class="hint">Nothing custom yet.</span>';
  }
  function customCondChips() {
    return formCustom.conditions.map(function (cc, i) {
      var avoids = (cc.avoid || []).length ? " · avoids: " + esc(cc.avoid.join(", ")) : "";
      var html = '<button type="button" class="chip on" data-action="rm-custom-cond" data-idx="' + i + '">🩺 ' +
        esc(cc.name) + avoids + '<span class="x">✕</span></button>';
      if (!(cc.avoid || []).length) {
        html += '<button type="button" class="chip" data-action="import-avoid" data-idx="' + i + '">💡 Fetch avoid-list</button>';
      }
      return html;
    }).join("") || '<span class="hint">Nothing custom yet.</span>';
  }
  function refreshCustomLists() {
    var a = $("#fCustomAlList"), c = $("#fCustomCondList");
    if (a) a.innerHTML = customAllergenChips();
    if (c) c.innerHTML = customCondChips();
  }

  function openUserForm(user) {
    var isNew = !user;
    var u = user || { name: "", emoji: S.EMOJIS[state.users.length % S.EMOJIS.length], allergens: [], conditions: [], lifestyle: [], budget: "" };
    formCustom.allergens = (u.customAllergens || []).slice();
    formCustom.conditions = (u.customConditions || []).map(function (cc) {
      return { name: cc.name, avoid: (cc.avoid || []).slice() };
    });
    openModal(
      "<h3>" + (isNew ? "New profile" : "Edit " + esc(u.name)) + "</h3>" +
      '<p class="sub">' + (isNew
        ? "Add a household member. They'll own this profile — only they can edit it later."
        : "You're editing your own profile. Changes sync into every group instantly.") + "</p>" +
      '<div class="field"><label>Name</label><input type="text" id="fName" maxlength="24" placeholder="e.g. Ananya" value="' + esc(u.name) + '" /></div>' +
      '<div class="field"><label>Avatar</label><div class="emoji-row" id="fEmoji">' +
        S.EMOJIS.map(function (e) {
          return '<button type="button" class="emoji-pick' + (e === u.emoji ? " on" : "") + '" data-emoji="' + e + '">' + e + "</button>";
        }).join("") + "</div></div>" +
      '<div class="field"><label>Allergens (Priority 0 — always blocking)</label><div class="chip-select" id="fAllergens">' +
        chipGroup(S.ALLERGENS, u.allergens || [], "al") + "</div>" +
        '<div class="custom-add"><input type="text" id="fCustomAl" maxlength="40" placeholder="Other allergen, e.g. kiwi, msg…" />' +
        '<button type="button" class="btn btn-ghost" data-action="add-custom-al">＋ Add</button></div>' +
        '<div class="chip-select" id="fCustomAlList">' + customAllergenChips() + "</div></div>" +
      '<div class="field"><label>Illnesses / medical conditions</label><div class="chip-select" id="fConditions">' +
        chipGroup(S.CONDITIONS, u.conditions || [], "cond") + "</div>" +
        '<div class="custom-add-stack">' +
        '<div class="custom-add"><input type="text" id="fCustomCondName" maxlength="60" placeholder="Other illness, e.g. gout" />' +
        '<button type="button" class="btn btn-ghost" data-action="find-cond">🔍 Find</button></div>' +
        '<div class="cand-list" id="fCondResults"></div>' +
        '<p class="hint" id="fCondNote">Tap Find — I\'ll recognise the illness via the NIH ICD-10 catalogue, then fetch foods-to-avoid from curated clinical guidance or the condition\'s Wikipedia article.</p>' +
        '<div class="custom-add"><input type="text" id="fCustomCondAvoid" maxlength="200" placeholder="Ingredients to avoid (comma-separated), e.g. anchovy, liver" />' +
        '<button type="button" class="btn btn-ghost" data-action="add-custom-cond">＋ Add</button></div></div>' +
        '<p class="hint">⚠️ The avoid-list is what gets checked — without it, products can\'t be auto-screened for this illness and will show "needs a closer look".</p>' +
        '<div class="chip-select" id="fCustomCondList">' + customCondChips() + "</div></div>" +
      '<div class="field"><label>Lifestyle preferences</label><div class="chip-select" id="fLifestyle">' +
        chipGroup(S.LIFESTYLES, u.lifestyle || [], "ls") + "</div></div>" +
      '<div class="field"><label>Monthly grocery budget (optional, ₹)</label>' +
        '<input type="number" id="fBudget" min="0" step="100" placeholder="e.g. 6000" value="' + esc(u.budget || "") + '" /></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-action="close-modal" type="button">Cancel</button>' +
        '<button class="btn btn-primary" data-action="save-user" data-id="' + (user ? user.id : "") + '" type="button">' +
          (isNew ? "Create profile" : "Save changes") + "</button>" +
      "</div>"
    );
  }

  function saveUserForm(existingId) {
    var name = $("#fName").value.trim();
    if (!name) { toast("Please give the profile a name.", true); return; }
    var emojiBtn = document.querySelector("#fEmoji .emoji-pick.on");
    var data = {
      name: name,
      emoji: emojiBtn ? emojiBtn.dataset.emoji : "😀",
      allergens: readChips($("#fAllergens"), "al"),
      customAllergens: formCustom.allergens.slice(),
      conditions: readChips($("#fConditions"), "cond"),
      customConditions: formCustom.conditions.map(function (cc) {
        return { name: cc.name, avoid: cc.avoid.slice() };
      }),
      lifestyle: readChips($("#fLifestyle"), "ls"),
      budget: $("#fBudget").value || "",
      updatedAt: Date.now()
    };
    if (existingId) {
      var user = getUser(existingId);
      if (!user || !canEdit(user)) { toast("🔒 Only " + (user ? user.name : "the owner") + " can edit this profile.", true); return; }
      Object.assign(user, data);
      toast("✅ " + user.name + "'s profile updated — groups refreshed.");
    } else {
      data.id = S.uid();
      data.createdAt = Date.now();
      state.users.push(data);
      if (!state.currentUserId) state.currentUserId = data.id;
      toast("👋 Profile created for " + data.name + ".");
    }
    persist();
    closeModal();
    renderAll();
  }

  /* =================== switcher =================== */

  function openSwitcher() {
    if (!state.users.length) { openUserForm(null); return; }
    openModal(
      "<h3>Who's shopping?</h3>" +
      '<p class="sub">Pick the profile to act as, or run a group session for a shared purchase.</p>' +
      '<div class="stack">' +
        state.users.map(function (u) {
          var me = u.id === state.currentUserId && !state.activeGroupId;
          return '<button class="btn btn-ghost btn-block" style="justify-content:flex-start' + (me ? ";border-color:var(--green)" : "") + '" data-action="switch-user" data-id="' + u.id + '" type="button">' +
            u.emoji + " " + esc(u.name) + (me ? " · current" : "") + "</button>";
        }).join("") +
        state.groups.map(function (g) {
          var on = g.id === state.activeGroupId;
          return '<button class="btn btn-ghost btn-block" style="justify-content:flex-start' + (on ? ";border-color:var(--amber)" : "") + '" data-action="activate-group" data-id="' + g.id + '" type="button">' +
            "🛒 " + esc(g.name) + " (group)" + (on ? " · active" : "") + "</button>";
        }).join("") +
      "</div>" +
      '<div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal" type="button">Close</button></div>'
    );
  }

  /* =================== group form =================== */

  function openGroupForm() {
    if (state.users.length < 2) {
      toast("You need at least 2 profiles for a group buy. Add another profile first.", true);
      showTab("profiles");
      return;
    }
    openModal(
      "<h3>New group buy</h3>" +
      '<p class="sub">Select 2 or more members. Their allergens &amp; illnesses are pulled in <strong>read-only</strong> — only each member can change their own.</p>' +
      '<div class="field"><label>Group name</label><input type="text" id="gName" maxlength="28" placeholder="e.g. Family groceries" /></div>' +
      '<div class="field"><label>Members</label><div class="chip-select" id="gMembers">' +
        state.users.map(function (u) {
          return '<button type="button" class="chip" data-chip="member" data-id="' + u.id + '">' + u.emoji + " " + esc(u.name) + "</button>";
        }).join("") + "</div></div>" +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-action="close-modal" type="button">Cancel</button>' +
        '<button class="btn btn-primary" data-action="save-group" type="button">Create group</button>' +
      "</div>"
    );
  }

  function saveGroupForm() {
    var name = $("#gName").value.trim() || "Group buy";
    var memberIds = readChips($("#gMembers"), "member");
    if (memberIds.length < 2) { toast("Pick at least 2 members.", true); return; }
    var g = { id: S.uid(), name: name, memberIds: memberIds, cart: [], createdAt: Date.now() };
    state.groups.push(g);
    state.activeGroupId = g.id;
    persist();
    closeModal();
    renderAll();
    toast("🛒 " + name + " created and session started.");
  }

  /* =================== evaluation =================== */

  var lastResult = null; // { product, perMember, aggregate }

  function checkProduct(product) {
    var g = activeGroup();
    var users = g ? groupMembers(g) : (currentUser() ? [currentUser()] : []);
    if (!users.length) {
      toast("Create a profile first so I know who to check for.", true);
      openUserForm(null);
      return;
    }
    var res = S.evaluateGroup(product, users);
    lastResult = { product: product, perMember: res.perMember, aggregate: res.aggregate, isGroup: !!g };
    showResultModal();
  }

  function verdictText(status) {
    return status === "safe" ? "✅ Safe" : status === "caution" ? "⚠️ Check first" : "⛔ Not suitable";
  }

  // market-price lookups, cached per barcode for the session
  var priceCache = {};
  function resolvePrice(product) {
    if (product.price != null) return Promise.resolve({ amount: product.price, note: "est. MRP" });
    var code = product.code;
    if (!code) return Promise.resolve(null);
    if (priceCache[code] !== undefined) return Promise.resolve(priceCache[code]);
    return S.fetchPrice(code).then(function (res) {
      priceCache[code] = res;
      return res;
    });
  }

  var SEVERITY_RANK = { safe: 0, caution: 1, unsafe: 2 };

  // AI second opinion: merge per-member AI verdicts into the rule-based result
  // (AI can only make a verdict stricter, never upgrade unsafe to safe).
  function runAiAssessment(r) {
    r.aiState = "pending";
    S.aiSuitability(r.product, r.perMember.map(function (m) { return m.user; })).then(function (results) {
      if (lastResult !== r) return; // a different product was opened meanwhile
      r.perMember.forEach(function (m, i) {
        var ai = results.find(function (x) {
          return x.name.toLowerCase() === m.user.name.toLowerCase();
        }) || results[i];
        if (!ai) return;
        // concerns below the user's risk threshold are shown as notes only
        // and never escalate the verdict
        var belowThreshold = ai.status !== "safe" && ai.risk < aiThreshold();
        var sev = ai.status === "safe" || belowThreshold ? "info" : ai.status;
        if (ai.reasons.length) {
          ai.reasons.forEach(function (txt) {
            m.reasons.push({ kind: "ai", severity: sev,
              text: "🤖 " + txt + (belowThreshold ? " (low risk " + ai.risk + "/100 — below your threshold)" : "") });
          });
        } else {
          m.reasons.push({ kind: "ai", severity: "info", text: "🤖 AI check: no concerns found" });
        }
        if (!belowThreshold && SEVERITY_RANK[ai.status] > SEVERITY_RANK[m.status]) m.status = ai.status;
      });
      r.aggregate = r.perMember.reduce(function (acc, m) {
        return SEVERITY_RANK[m.status] > SEVERITY_RANK[acc] ? m.status : acc;
      }, "safe");
      r.aiState = "done";
      if (!$("#modalBackdrop").hidden && lastResult === r) showResultModal();
    }).catch(function (err) {
      if (lastResult !== r) return;
      r.aiState = (err && err.message === "badkey") ? "badkey" : "failed";
      if (!$("#modalBackdrop").hidden && lastResult === r) showResultModal();
    });
  }

  function aiStatusLine(r) {
    if (!S.aiAvailable()) return "";
    var msg = {
      pending: "🤖 AI second opinion running…",
      done: "🤖 Verdict includes the AI assessment (Llama 3.3 via Groq).",
      failed: "🤖 AI check failed (network or rate limit) — rule-based verdict only.",
      badkey: "🤖 Groq key rejected — update it in the AI card on the Check tab."
    }[r.aiState] || "";
    return msg ? '<p class="hint" style="margin-bottom:0.7rem">' + msg + "</p>" : "";
  }

  function showResultModal() {
    var r = lastResult;
    var p = r.product;
    var n = p.nutrition || {};
    if (S.aiAvailable() && !r.aiState) runAiAssessment(r);
    var nutriBits = Object.keys(S.NUTRIENT_LABELS).map(function (key) {
      if (n[key] == null) return '<span class="mini-chip">' + S.NUTRIENT_LABELS[key] + ": n/a</span>";
      var unit = key === "sodium" ? "mg" : "g";
      return '<span class="mini-chip">' + S.NUTRIENT_LABELS[key] + ": " + n[key] + unit + "/100g</span>";
    }).join("");

    var bannerText = r.isGroup
      ? (r.aggregate === "safe" ? "Safe for the whole group"
        : r.aggregate === "caution" ? "Needs a closer look — see below"
        : "Not suitable for everyone")
      : (r.aggregate === "safe" ? "Safe for you"
        : r.aggregate === "caution" ? "Needs a closer look — see below"
        : "Not suitable for you");

    var membersHtml = r.perMember.map(function (m) {
      var needsFix = m.user.id === state.currentUserId &&
        m.reasons.some(function (rs) { return rs.text.indexOf("NOT auto-checked") !== -1; });
      return '<div class="member-result">' +
        '<div class="member-result-head">' + m.user.emoji + " " + esc(m.user.name) +
          '<span class="verdict ' + m.status + '">' + verdictText(m.status) + "</span></div>" +
        (m.reasons.length
          ? '<ul class="reason-list">' + m.reasons.map(function (rs) {
              return '<li class="' + rs.severity + '">' + esc(rs.text) + "</li>";
            }).join("") + "</ul>"
          : "") +
        (needsFix
          ? '<button class="btn btn-ghost btn-sm" data-action="fix-profile" type="button" style="margin-top:0.55rem">⚙️ Fix my profile — add the avoid-list</button>'
          : "") +
      "</div>";
    }).join("");

    var cart = activeCart();
    var alreadyIn = cart ? findInCart(cart, p) !== -1 : false;
    var cartBtn = !cart ? "" : alreadyIn
      ? '<button class="btn btn-ghost" data-action="goto-cart" type="button">🧺 Already in cart — view</button>'
      : '<button class="btn btn-primary" data-action="add-to-cart" type="button">＋ Add to ' + (activeGroup() ? "group " : "") + "cart</button>";

    openModal(
      '<div class="result-head">' +
        (p.image ? '<img class="result-img" src="' + esc(p.image) + '" alt="" />'
          : '<span class="result-emoji">' + p.emoji + "</span>") +
        "<div><strong>" + esc(p.name) + "</strong><small>" + esc(p.category || "") +
        (p.source ? " · via " + esc(p.source) : "") + "</small></div></div>" +
      '<div class="verdict-banner ' + r.aggregate + '">' + verdictText(r.aggregate).split(" ")[0] + " " + bannerText + "</div>" +
      '<p class="result-price" id="priceLine">' +
        (p.price != null
          ? '<span class="price-amt">' + inr(p.price) + '</span> <span class="price-note">est. MRP</span>'
          : (p.code ? "Checking market price…" : '<span class="price-note">No price data — you can set one in the cart.</span>')) +
      "</p>" +
      (alreadyIn ? '<p class="in-cart-note">🧺 This is already in your cart.</p>' : "") +
      '<div class="nutri-strip">' + nutriBits + "</div>" +
      aiStatusLine(r) +
      membersHtml +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-action="close-modal" type="button">Done</button>' +
        cartBtn +
      "</div>" +
      '<p class="disclaimer">Dietary goal alignment only — not medical advice. Always double-check the physical label for life-threatening allergies.</p>'
    );

    if (p.price == null && p.code) {
      resolvePrice(p).then(function (res) {
        var el = $("#priceLine");
        if (!el || !el.isConnected) return;
        el.innerHTML = res
          ? '<span class="price-amt">' + inr(res.amount) + '</span> <span class="price-note">' + esc(res.note) + "</span>"
          : '<span class="price-note">No market price reported yet — you can set one in the cart.</span>';
      });
    }
  }

  /* =================== barcode lookup =================== */

  function doBarcodeLookup(code) {
    var status = $("#barcodeStatus");
    var btn = $("#barcodeBtn");
    if (!code) { toast("Enter a barcode first.", true); return; }
    status.textContent = "Looking up " + code + " on Open Food Facts…";
    btn.disabled = true;
    S.lookupBarcode(code).then(function (product) {
      btn.disabled = false;
      if (!product) {
        status.textContent = "❌ " + code + " isn't in Open Food Facts yet (Indian product coverage is patchy). Try 🖼️ Photo identify or ✍️ manual entry below.";
        return;
      }
      status.textContent = "✅ Found: " + product.name;
      checkProduct(product);
    }).catch(function () {
      btn.disabled = false;
      status.textContent = "📡 Network unavailable — try the demo shelf or manual entry (offline mode).";
    });
  }

  /* =================== manual entry =================== */

  function buildManualChips() {
    $("#mAllergens").innerHTML = chipGroup(S.ALLERGENS, [], "mal");
  }

  function submitManual(e) {
    e.preventDefault();
    var name = $("#mName").value.trim();
    if (!name) { toast("Give the product a name.", true); return; }
    function num(id) {
      var v = document.getElementById(id).value;
      return v === "" ? null : parseFloat(v);
    }
    var product = {
      id: "manual-" + S.uid(),
      name: name,
      emoji: "📝",
      category: "Manual entry",
      allergens: readChips($("#mAllergens"), "mal"),
      ingredients: "",
      nutrition: { sugar: num("mSugar"), sodium: num("mSodium"), satFat: num("mSatFat"), protein: num("mProtein") }
    };
    checkProduct(product);
  }

  /* =================== camera barcode / QR scanner =================== */

  function loadScript(src, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      var to = setTimeout(function () { s.remove(); reject(new Error("timeout")); }, timeoutMs || 20000);
      s.src = src;
      s.onload = function () { clearTimeout(to); resolve(); };
      s.onerror = function () { clearTimeout(to); s.remove(); reject(new Error("load failed")); };
      document.head.appendChild(s);
    });
  }

  var LENS_KEY = "safeshelf_lens";

  // Rank rear lenses: main camera first, tele/zoom/macro/depth last
  function lensScore(device) {
    var l = (device.label || "").toLowerCase();
    var s = 0;
    if (/tele|zoom|macro|depth|bokeh/.test(l)) s -= 10;
    if (/ultra|wide-?angle/.test(l)) s -= 3;
    if (/camera2? 0|camera 0|back camera$|main|\bdual\b/.test(l)) s += 5;
    return s;
  }

  function openScanner() {
    openModal(
      "<h3>📷 Scan a code</h3>" +
      '<p class="sub">Point your camera at the product barcode or QR code.</p>' +
      '<div class="scan-stage"><video class="scan-video" id="scanVideo" autoplay playsinline muted></video>' +
      '<div class="scan-reticle"></div></div>' +
      '<p class="scan-status" id="scanStatus">Starting camera…</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" data-action="close-modal" type="button">Cancel</button>' +
      '<button class="btn btn-ghost" id="lensBtn" type="button" hidden>🔄 Switch lens</button>' +
      "</div>"
    );
    var video = $("#scanVideo");
    var statusEl = $("#scanStatus");
    var lensBtn = $("#lensBtn");
    var stream = null, stopped = false, zxingReader = null;
    var backCams = [], lensIdx = -1, detectorRunning = false;

    modalCleanup = function () {
      stopped = true;
      stopStream();
    };

    function stopStream() {
      if (zxingReader) { try { zxingReader.reset(); } catch (e) { /* already stopped */ } zxingReader = null; }
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    }

    function finish(raw) {
      if (stopped) return;
      raw = String(raw || "").trim();
      // QR codes often wrap the GTIN in a URL (GS1 digital link) — pull out the digits
      var digits = (raw.match(/\d{8,14}/) || [])[0] || "";
      if (digits.length === 14 && digits.charAt(0) === "0") digits = digits.slice(1); // GTIN-14 → EAN-13
      closeModal();
      if (digits) {
        $("#barcodeInput").value = digits;
        toast("📷 Scanned " + digits);
        doBarcodeLookup(digits);
      } else if (raw) {
        toast("Scanned: \"" + raw.slice(0, 60) + "\" — no product barcode found in it.", true);
      }
    }

    function startStream(deviceId) {
      stopStream();
      var v = { width: { ideal: 1280 }, height: { ideal: 720 } };
      if (deviceId) v.deviceId = { exact: deviceId };
      else v.facingMode = "environment";
      return navigator.mediaDevices.getUserMedia({ video: v, audio: false }).then(function (s) {
        if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); return null; }
        stream = s;
        // some phones hand over the rear camera digitally zoomed — reset to minimum
        var track = s.getVideoTracks()[0];
        if (track && track.getCapabilities) {
          var caps = track.getCapabilities();
          if (caps.zoom && typeof caps.zoom.min === "number") {
            track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] }).catch(function () {});
          }
        }
        video.srcObject = s;
        return video.play().catch(function () { /* autoplay quirks; video still renders */ });
      });
    }

    function currentDeviceId() {
      var track = stream && stream.getVideoTracks()[0];
      return track && track.getSettings ? track.getSettings().deviceId : null;
    }

    function updateLensBtn() {
      if (backCams.length < 2) return;
      lensBtn.hidden = false;
      var label = (backCams[lensIdx] && backCams[lensIdx].label || "").replace(/camera2?\s*/i, "").trim();
      lensBtn.textContent = "🔄 Lens " + (lensIdx + 1) + "/" + backCams.length + (label ? " · " + label.slice(0, 18) : "");
    }

    function switchLens() {
      if (!backCams.length) return;
      lensIdx = (lensIdx + 1) % backCams.length;
      statusEl.textContent = "Switching lens…";
      startStream(backCams[lensIdx].deviceId).then(function () {
        if (stopped) return;
        try { localStorage.setItem(LENS_KEY, backCams[lensIdx].deviceId); } catch (e) { /* private mode */ }
        statusEl.textContent = "Scanning…";
        updateLensBtn();
        startDetection(); // ZXing is stream-bound and needs re-attaching
      }).catch(function () {
        if (!stopped) statusEl.textContent = "That lens refused to start — try another.";
      });
    }
    lensBtn.addEventListener("click", switchLens);

    function startDetection() {
      if (stopped || !stream) return;
      if ("BarcodeDetector" in window) {
        if (detectorRunning) return; // element-based loop survives lens switches
        detectorRunning = true;
        statusEl.textContent = "Scanning…";
        var detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"]
        });
        (function loop() {
          if (stopped) return;
          detector.detect(video).then(function (codes) {
            if (stopped) return;
            if (codes && codes.length) finish(codes[0].rawValue);
            else setTimeout(loop, 160);
          }).catch(function () { if (!stopped) setTimeout(loop, 400); });
        })();
      } else {
        // older browsers: fall back to the ZXing decoder
        statusEl.textContent = "Loading scanner engine…";
        loadScript("https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js").then(function () {
          if (stopped || !stream) return;
          statusEl.textContent = "Scanning…";
          zxingReader = new window.ZXing.BrowserMultiFormatReader();
          zxingReader.decodeFromStream(stream, video, function (result) {
            if (result) finish(result.getText());
          });
        }).catch(function () {
          if (!stopped) statusEl.textContent = "Scanner engine failed to load — check your connection or type the barcode manually.";
        });
      }
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = "📵 This browser can't access the camera. Type the barcode manually instead.";
      return;
    }

    var savedLens = null;
    try { savedLens = localStorage.getItem(LENS_KEY); } catch (e) { /* private mode */ }

    // First start grants permission (so device labels become readable), then we
    // enumerate the rear lenses and jump to the best one if Chrome picked badly.
    startStream(savedLens)
      .catch(function () { return savedLens ? startStream(null) : Promise.reject(new Error("denied")); })
      .then(function () {
        if (stopped || !stream) return;
        startDetection();
        return navigator.mediaDevices.enumerateDevices().then(function (devices) {
          if (stopped) return;
          var cams = devices.filter(function (d) { return d.kind === "videoinput"; });
          backCams = cams.filter(function (d) { return /back|rear|environment/i.test(d.label || ""); });
          if (!backCams.length) backCams = cams;
          backCams.sort(function (a, b) { return lensScore(b) - lensScore(a); });
          var curId = currentDeviceId();
          lensIdx = Math.max(0, backCams.findIndex(function (d) { return d.deviceId === curId; }));
          // auto-correct to the highest-scored lens unless the user saved a choice
          if (!savedLens && backCams.length > 1 && backCams[0].deviceId !== curId) {
            lensIdx = 0;
            startStream(backCams[0].deviceId).then(function () {
              if (!stopped) { statusEl.textContent = "Scanning…"; updateLensBtn(); startDetection(); }
            }).catch(function () { /* stay on the original lens */ });
          }
          updateLensBtn();
        });
      })
      .catch(function () {
        if (!stopped) statusEl.textContent = "📵 Camera unavailable or permission denied — type the barcode manually instead.";
      });
  }

  /* =================== photo identify (OCR → product search) =================== */

  function ensureTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js", 30000);
  }

  var OCR_STOPWORDS = { with: 1, from: 1, this: 1, that: 1, contains: 1, ingredients: 1, nutrition: 1,
    best: 1, before: 1, net: 1, weight: 1, made: 1, pack: 1, free: 1, energy: 1, serving: 1,
    quality: 1, taste: 1, premium: 1, original: 1, since: 1, india: 1, product: 1, litre: 1, gram: 1 };

  // Distil OCR text into a short search query: prominent-ish words, no noise
  function buildQuery(text) {
    var words = String(text || "").split(/[^A-Za-z]+/).filter(function (w) { return w.length >= 4; });
    var seen = {}, picked = [];
    for (var i = 0; i < words.length && picked.length < 5; i++) {
      var w = words[i].toLowerCase();
      if (OCR_STOPWORDS[w] || seen[w]) continue;
      seen[w] = 1;
      picked.push(w);
    }
    return picked.join(" ");
  }

  // Better: rank recognised words by physical size × confidence — the brand
  // name is the biggest text on a pack, fine print loses automatically.
  function buildQueryFromWords(words, fallbackText) {
    var cand = (words || []).filter(function (w) {
      return w && w.confidence >= 55 && /^[A-Za-z]{3,}$/.test(w.text) &&
        !OCR_STOPWORDS[w.text.toLowerCase()];
    });
    cand.sort(function (a, b) {
      var ha = a.bbox ? (a.bbox.y1 - a.bbox.y0) : 0;
      var hb = b.bbox ? (b.bbox.y1 - b.bbox.y0) : 0;
      return hb * b.confidence - ha * a.confidence;
    });
    var seen = {}, picked = [];
    for (var i = 0; i < cand.length && picked.length < 4; i++) {
      var t = cand[i].text.toLowerCase();
      if (seen[t]) continue;
      seen[t] = 1;
      picked.push(t);
    }
    return picked.length ? picked.join(" ") : buildQuery(fallbackText);
  }

  // Downscale + grayscale + boost contrast before OCR: phone photos are far
  // too large and too noisy for Tesseract as-is.
  function preprocessPhoto(file) {
    var opts = { imageOrientation: "from-image" };
    var bitmapPromise = typeof createImageBitmap === "function"
      ? createImageBitmap(file, opts).catch(function () { return createImageBitmap(file); })
      : Promise.reject(new Error("unsupported"));
    return bitmapPromise.then(function (bmp) {
      var MAX = 1280;
      var scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      var ctx = canvas.getContext("2d");
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close && bmp.close();
      var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var d = img.data;
      for (var i = 0; i < d.length; i += 4) {
        var g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        g = (g - 128) * 1.35 + 128; // contrast stretch
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    });
  }

  // downscaled JPEG data-URL for the vision model (keeps uploads small)
  function photoToDataUrl(file, maxDim) {
    var opts = { imageOrientation: "from-image" };
    var bitmapPromise = typeof createImageBitmap === "function"
      ? createImageBitmap(file, opts).catch(function () { return createImageBitmap(file); })
      : Promise.reject(new Error("unsupported"));
    return bitmapPromise.then(function (bmp) {
      var scale = Math.min(1, (maxDim || 1024) / Math.max(bmp.width, bmp.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close && bmp.close();
      return canvas.toDataURL("image/jpeg", 0.85);
    });
  }

  var photoIdentified = null; // last AI identification, for the direct-check button

  function handlePhoto(file) {
    if (!file) return;
    photoIdentified = null;
    var blobUrl = URL.createObjectURL(file);
    var useAi = S.aiAvailable();
    openModal(
      '<h3>🖼️ Photo identify</h3>' +
      '<p class="sub">' + (useAi ? "AI looks at the photo and names the product — like a lens, but for food." : "I'll read the label text and search for matching products.") + '</p>' +
      '<img class="photo-preview" alt="Your product photo" src="' + blobUrl + '" />' +
      '<p class="scan-status" id="idStatus">' + (useAi ? "🤖 Asking AI what this is…" : "Loading text-recognition engine…") + '</p>' +
      '<div id="idResults"></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal" type="button">Close</button></div>'
    );
    modalCleanup = function () { URL.revokeObjectURL(blobUrl); };

    function setStatus(msg) { var el = $("#idStatus"); if (el) el.textContent = msg; }

    function showQueryUI(query) {
      var box = $("#idResults");
      if (!box) return;
      box.innerHTML =
        (photoIdentified && photoIdentified.found
          ? '<button class="btn btn-primary btn-block" data-action="photo-direct-check" type="button">✅ Check "' +
            esc(photoIdentified.name) + '" now' + (photoIdentified.ingredients ? " (label ingredients read)" : "") + '</button>' +
            '<p class="hint center" style="margin:0.5rem 0">…or pick an exact match for full nutrition data:</p>'
          : "") +
        '<div class="query-row"><input type="text" id="idQuery" placeholder="Product name…" value="' + esc(query) + '" />' +
        '<button class="btn btn-primary btn-sm" data-action="photo-search" type="button">Search</button></div>' +
        '<div class="cand-list" id="candList"></div>';
    }

    function ocrIdentify() {
      ensureTesseract().then(function () {
        setStatus("Preparing your photo…");
        return preprocessPhoto(file).catch(function () { return file; }); // OCR the raw file if preprocessing fails
      }).then(function (input) {
        setStatus("Reading the label… this takes a few seconds.");
        return window.Tesseract.recognize(input, "eng");
      }).then(function (res) {
        var data = (res && res.data) || {};
        var query = buildQueryFromWords(data.words, data.text);
        if (!query) {
          setStatus("Couldn't read any text — try a sharper, closer photo, or type the product name:");
          showQueryUI("");
          return;
        }
        setStatus('I read: "' + query + '" — searching… (edit it if I misread)');
        showQueryUI(query);
        runPhotoSearch(query);
      }).catch(function () {
        setStatus(navigator.onLine
          ? "Text recognition couldn't load. Type the product name instead:"
          : "📡 You're offline — photo identify needs a connection. Type the product name instead:");
        showQueryUI("");
      });
    }

    if (!useAi) { ocrIdentify(); return; }

    photoToDataUrl(file, 1024).then(function (dataUrl) {
      return S.aiIdentifyPhoto(dataUrl);
    }).then(function (id) {
      if (!$("#idStatus")) return; // modal was closed meanwhile
      if (!id.found) {
        setStatus("🤖 The AI couldn't spot a food product — trying label text instead…");
        ocrIdentify();
        return;
      }
      photoIdentified = id;
      setStatus('🤖 Looks like "' + id.name + '"' +
        (id.confidence ? " (" + id.confidence + "% sure)" : "") + " — searching for matches…");
      showQueryUI(id.query);
      runPhotoSearch(id.query);
    }).catch(function () {
      if (!$("#idStatus")) return;
      setStatus("🤖 AI identify failed — reading the label text instead…");
      ocrIdentify();
    });
  }

  function runPhotoSearch(query) {
    var list = $("#candList");
    var statusEl = $("#idStatus");
    if (!list) return;
    list.innerHTML = '<span class="hint">Searching Open Food Facts…</span>';
    S.searchProducts(query).then(function (products) {
      if (!list.isConnected) return;
      if (!products.length) {
        list.innerHTML = '<span class="hint">No matches for "' + esc(query) + '". Try fewer or different words.</span>';
        return;
      }
      if (statusEl) statusEl.textContent = "Tap the product that matches your photo:";
      list.innerHTML = products.map(function (p) {
        return '<button type="button" class="cand" data-action="pick-candidate" data-code="' + esc(p.code) + '">' +
          (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy" />' : '<span class="cand-ph">📦</span>') +
          "<span><strong>" + esc(p.name) + "</strong>" +
          (p.brands ? "<small>" + esc(p.brands) + "</small>" : "") + "</span></button>";
      }).join("");
    }).catch(function () {
      if (list.isConnected) list.innerHTML = '<span class="hint">📡 Search failed — check your connection and try again.</span>';
    });
  }

  // Fill the avoid-list input with dietary guidance for an illness: curated
  // table first, then auto-extraction from the condition's Wikipedia article.
  function applyCondGuidance(name, noteEl, failMsg) {
    if (noteEl) noteEl.textContent = "🔎 Looking up dietary guidance for \"" + name + "\"…";
    S.fetchAvoidGuidance(name).then(function (g) {
      if (!noteEl || !noteEl.isConnected) return;
      if (g.avoid.length) {
        var input = $("#fCustomCondAvoid");
        if (input) input.value = g.avoid.join(", ");
        noteEl.textContent = "💡 Suggested avoid-list (" + g.source + "). Edit it, then tap ＋ Add.";
      } else {
        noteEl.textContent = "ℹ️ " + g.source + " — add your own avoid terms below.";
      }
    }).catch(function () {
      if (noteEl && noteEl.isConnected) noteEl.textContent = failMsg || "📡 Couldn't fetch guidance — add avoid terms manually.";
    });
  }

  /* =================== actions (event delegation) =================== */

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action], [data-tab], [data-product], [data-chip], [data-emoji], [data-barcode]");
    if (!btn) return;

    if (btn.dataset.tab) { showTab(btn.dataset.tab); return; }

    if (btn.dataset.product) {
      var p = S.CATALOG.find(function (x) { return x.id === btn.dataset.product; });
      if (p) checkProduct(p);
      return;
    }

    if (btn.dataset.barcode) {
      $("#barcodeInput").value = btn.dataset.barcode;
      doBarcodeLookup(btn.dataset.barcode);
      return;
    }

    if (btn.dataset.chip) { btn.classList.toggle("on"); return; }

    if (btn.dataset.emoji) {
      btn.parentElement.querySelectorAll(".emoji-pick").forEach(function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
      return;
    }

    switch (btn.dataset.action) {
      case "close-modal": closeModal(); break;
      case "new-user": openUserForm(null); break;

      case "add-custom-al": {
        var alInput = $("#fCustomAl");
        var term = alInput.value.trim();
        if (!term) break;
        if (formCustom.allergens.some(function (t) { return t.toLowerCase() === term.toLowerCase(); })) {
          toast("Already added.", true); break;
        }
        formCustom.allergens.push(term);
        alInput.value = "";
        refreshCustomLists();
        break;
      }

      case "rm-custom-al":
        formCustom.allergens.splice(parseInt(btn.dataset.idx, 10), 1);
        refreshCustomLists();
        break;

      case "find-cond": {
        var term = $("#fCustomCondName").value.trim();
        var resBox = $("#fCondResults");
        var noteEl = $("#fCondNote");
        if (!term) { toast("Type an illness name first.", true); break; }
        resBox.innerHTML = '<span class="hint">Searching the NIH ICD-10 catalogue…</span>';
        S.searchConditions(term).then(function (matches) {
          if (!resBox.isConnected) return;
          if (!matches.length) {
            resBox.innerHTML = "";
            applyCondGuidance(term, noteEl,
              "Not in the ICD-10 catalogue and no guidance found — check the spelling or add avoid terms manually.");
            return;
          }
          resBox.innerHTML = matches.map(function (m) {
            return '<button type="button" class="cand" data-action="pick-cond" data-name="' + esc(m.name) + '">' +
              '<span class="cand-ph">🩺</span><span><strong>' + esc(m.name) + "</strong>" +
              "<small>ICD-10-CM " + esc(m.code) + " · NIH/NLM</small></span></button>";
          }).join("");
          noteEl.textContent = "Tap the matching condition:";
        }).catch(function () {
          if (!resBox.isConnected) return;
          resBox.innerHTML = "";
          applyCondGuidance(term, noteEl,
            "📡 Couldn't reach the online catalogues — add avoid terms manually.");
        });
        break;
      }

      case "pick-cond": {
        var picked = btn.dataset.name;
        $("#fCustomCondName").value = picked;
        $("#fCondResults").innerHTML = "";
        applyCondGuidance(picked, $("#fCondNote"),
          "📡 Recognised via NIH ICD-10, but couldn't fetch dietary guidance — add your own terms.");
        break;
      }

      case "add-custom-cond": {
        var nameInput = $("#fCustomCondName");
        var avoidInput = $("#fCustomCondAvoid");
        var cname = nameInput.value.trim();
        if (!cname) { toast("Give the illness a name first.", true); break; }
        var avoid = avoidInput.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        formCustom.conditions.push({ name: cname, avoid: avoid });
        nameInput.value = ""; avoidInput.value = "";
        refreshCustomLists();
        if (!avoid.length) toast("Added. Tip: list ingredients to avoid so I can auto-check products for it.", true);
        break;
      }

      case "import-avoid": {
        var cidx = parseInt(btn.dataset.idx, 10);
        var cond = formCustom.conditions[cidx];
        if (!cond) break;
        btn.textContent = "🔎 Fetching…";
        btn.disabled = true;
        S.fetchAvoidGuidance(cond.name).then(function (gg) {
          if (gg.avoid.length) {
            cond.avoid = gg.avoid.slice();
            refreshCustomLists();
            toast("💡 Imported avoid-list — " + gg.source + ". Review it, then Save.");
          } else {
            refreshCustomLists();
            toast("ℹ️ " + gg.source + ". Add avoid terms manually.", true);
          }
        }).catch(function () {
          refreshCustomLists();
          toast("📡 Couldn't fetch guidance — check your connection or add terms manually.", true);
        });
        break;
      }

      case "acct-signout":
        window.SafeShelfCloud.signOut().then(function () {
          resetLocalState(true);
          renderAll();
          toast("Signed out — your data was removed from this device. It's safe in your account.");
        });
        break;

      case "acct-sync":
        window.SafeShelfCloud.syncNow(state).then(function () {
          toast("🔄 Synced.");
          renderAccount();
        }).catch(function (e) {
          toast("Sync failed: " + e.message, true);
        });
        break;

      case "fix-profile": {
        var me = currentUser();
        if (!me) break;
        closeModal();
        openUserForm(me);
        break;
      }

      case "rm-custom-cond":
        formCustom.conditions.splice(parseInt(btn.dataset.idx, 10), 1);
        refreshCustomLists();
        break;

      case "photo-search": {
        var q = $("#idQuery").value.trim();
        if (q) runPhotoSearch(q);
        break;
      }

      case "pick-candidate": {
        var stEl = $("#idStatus");
        if (stEl) stEl.textContent = "Loading product details…";
        S.lookupBarcode(btn.dataset.code).then(function (product) {
          if (product) checkProduct(product);
          else toast("Couldn't load that product's details.", true);
        }).catch(function () {
          toast("📡 Network error loading the product.", true);
        });
        break;
      }

      case "photo-direct-check": {
        if (!photoIdentified || !photoIdentified.found) break;
        checkProduct({
          id: "photo-" + S.uid(),
          name: photoIdentified.name,
          emoji: "🖼️",
          category: "Photo identify (AI)",
          allergens: [],
          ingredients: photoIdentified.ingredients || "",
          nutrition: {}
        });
        break;
      }

      case "save-user": saveUserForm(btn.dataset.id || null); break;

      case "edit-user": {
        var user = getUser(btn.dataset.id);
        if (!user) break;
        if (!canEdit(user)) {
          toast("🔒 Only " + user.name + " can edit their allergens & illnesses.", true);
          break;
        }
        openUserForm(user);
        break;
      }

      case "locked-edit":
        toast("🔒 Locked. Only " + btn.dataset.name + " can change their own allergens & illnesses — ask them to switch to their profile.", true);
        break;

      case "delete-user": {
        var du = getUser(btn.dataset.id);
        if (!du || !canEdit(du)) { toast("🔒 You can only delete your own profile.", true); break; }
        if (!confirm("Delete " + du.name + "'s profile? This also removes them from groups.")) break;
        state.users = state.users.filter(function (x) { return x.id !== du.id; });
        state.groups.forEach(function (g) {
          g.memberIds = g.memberIds.filter(function (id) { return id !== du.id; });
        });
        state.groups = state.groups.filter(function (g) {
          if (g.memberIds.length >= 2) return true;
          if (state.activeGroupId === g.id) state.activeGroupId = null;
          return false;
        });
        state.currentUserId = state.users.length ? state.users[0].id : null;
        persist(); renderAll();
        toast("Profile deleted.");
        break;
      }

      case "switch-user":
        state.currentUserId = btn.dataset.id;
        state.activeGroupId = null;
        persist(); closeModal(); renderAll();
        toast("Now acting as " + (currentUser() ? currentUser().emoji + " " + currentUser().name : ""));
        break;

      case "open-switcher": openSwitcher(); break;

      case "new-group": case undefined: break;

      case "save-group": saveGroupForm(); break;

      case "activate-group":
        state.activeGroupId = btn.dataset.id;
        persist(); closeModal(); renderAll(); showTab("check");
        toast("🛒 Group session started — every check now covers all members.");
        break;

      case "end-session":
        state.activeGroupId = null;
        persist(); renderAll();
        toast("Group session ended. Back to personal mode.");
        break;

      case "delete-group": {
        var dg = getGroup(btn.dataset.id);
        if (!dg) break;
        if (!confirm("Delete group \"" + dg.name + "\"? Member profiles are kept.")) break;
        state.groups = state.groups.filter(function (x) { return x.id !== dg.id; });
        if (state.activeGroupId === dg.id) state.activeGroupId = null;
        persist(); renderAll();
        toast("Group deleted.");
        break;
      }

      case "remove-cart": {
        var cg = getGroup(btn.dataset.group);
        if (cg && cg.cart) {
          cg.cart.splice(parseInt(btn.dataset.idx, 10), 1);
          persist(); renderGroups();
        }
        break;
      }

      case "add-to-cart": {
        var cart0 = activeCart();
        if (!cart0 || !lastResult) break;
        var prod = lastResult.product;
        if (findInCart(cart0, prod) !== -1) {
          toast("🧺 Already in your cart — no duplicate added.", true);
          break;
        }
        var item = {
          key: cartKeyFor(prod),
          code: prod.code || null,
          name: prod.name,
          emoji: prod.emoji,
          image: prod.image || null,
          status: lastResult.aggregate,
          price: prod.price != null ? prod.price : null,
          priceNote: prod.price != null ? "est. MRP" : null,
          addedBy: state.currentUserId,
          at: Date.now()
        };
        cart0.push(item);
        persist(); closeModal(); renderAll();
        toast("Added to " + cartContextLabel() + " cart.");
        // market price may still be loading — attach it when it lands
        if (item.price == null && item.code) {
          resolvePrice(prod).then(function (res) {
            if (!res) return;
            var liveCart = activeCart();
            var idx = liveCart ? liveCart.findIndex(function (it) { return it.key === item.key; }) : -1;
            if (idx === -1) return;
            liveCart[idx].price = res.amount;
            liveCart[idx].priceNote = res.note;
            persist(); renderCart();
          });
        }
        break;
      }

      case "goto-cart":
        closeModal();
        showTab("cart");
        break;

      case "cart-rm": {
        var cartA = activeCart();
        if (cartA) { cartA.splice(parseInt(btn.dataset.idx, 10), 1); persist(); renderAll(); }
        break;
      }

      case "cart-set-price": {
        var cartB = activeCart();
        var it = cartB && cartB[parseInt(btn.dataset.idx, 10)];
        if (!it) break;
        var entered = prompt("Price for " + it.name + " (₹):", "");
        if (entered === null) break;
        var val = parseFloat(entered);
        if (isNaN(val) || val < 0) { toast("That's not a valid price.", true); break; }
        it.price = val;
        it.priceNote = "set by you";
        persist(); renderCart();
        break;
      }

      case "cart-clear": {
        var cartC = activeCart();
        if (!cartC || !cartC.length) break;
        if (!confirm("Empty this cart (" + cartC.length + " items)?")) break;
        cartC.length = 0;
        persist(); renderAll();
        toast("Cart emptied.");
        break;
      }
    }
  });

  // Enter inside the custom-entry boxes acts as "Add" instead of doing nothing
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var id = e.target && e.target.id;
    var proxy = { fCustomAl: "add-custom-al", fCustomCondName: "find-cond", fCustomCondAvoid: "add-custom-cond", idQuery: "photo-search" }[id];
    if (proxy) {
      e.preventDefault();
      var b = document.querySelector('[data-action="' + proxy + '"]');
      if (b) b.click();
    }
  });

  $("#aiKeyBtn").addEventListener("click", function () {
    if (S.getAiKey()) {
      if (confirm("Remove the Groq API key from this device? AI checks will turn off.")) {
        S.setAiKey("");
        renderAiCard();
        toast("AI checks disabled.");
      }
      return;
    }
    var key = prompt("Paste your Groq API key (starts with gsk_). It is stored only on this device:");
    if (key === null) return;
    key = key.trim().replace(/^["']|["']$/g, "");
    if (!/^gsk_/.test(key)) { toast("That doesn't look like a Groq key (should start with gsk_).", true); return; }
    S.setAiKey(key);
    renderAiCard();
    toast("🤖 AI checks enabled — verdicts now get a second opinion.");
  });

  $("#aiAskForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = $("#aiAskInput").value.trim();
    if (!q) { toast("Type a food or product to ask about.", true); return; }
    $("#aiAskInput").value = "";
    checkProduct({
      id: "ask-" + S.uid(),
      name: q,
      emoji: "🤖",
      category: "AI lookup",
      allergens: [],
      ingredients: "",
      nutrition: {}
    });
  });

  $("#aiThreshold").addEventListener("input", function () {
    $("#aiThresholdVal").textContent = this.value;
  });
  $("#aiThreshold").addEventListener("change", function () {
    setAiThreshold(parseInt(this.value, 10));
    toast("AI caution threshold set to " + this.value + ".");
  });

  $("#signOutBtn").addEventListener("click", function () {
    if (!window.SafeShelfCloud) return;
    window.SafeShelfCloud.signOut().then(function () {
      resetLocalState(true);
      renderAll();
      toast("Signed out — your data was removed from this device. It's safe in your account.");
    });
  });

  $("#addUserBtn").addEventListener("click", function () { openUserForm(null); });
  $("#addGroupBtn").addEventListener("click", openGroupForm);
  $("#contextPill").addEventListener("click", openSwitcher);
  $("#scanBtn").addEventListener("click", openScanner);
  $("#photoBtn").addEventListener("click", function () { $("#photoInput").click(); });
  $("#photoInput").addEventListener("change", function () {
    handlePhoto(this.files && this.files[0]);
    this.value = ""; // allow re-selecting the same photo
  });
  $("#barcodeForm").addEventListener("submit", function (e) {
    e.preventDefault();
    doBarcodeLookup($("#barcodeInput").value.trim());
  });
  $("#manualForm").addEventListener("submit", submitManual);

  /* =================== boot =================== */

  // deferred first-run onboarding: opens the add-profile form only if there
  // are still no profiles when the timer fires (and nothing else is open)
  var onboardTimer = null, onboardAutoOpened = false;
  function scheduleOnboard(delay) {
    clearTimeout(onboardTimer);
    onboardTimer = setTimeout(function () {
      if (!state.users.length && $("#modalBackdrop").hidden) {
        onboardAutoOpened = true;
        openUserForm(null);
      }
    }, delay);
  }
  function cancelOnboard() {
    clearTimeout(onboardTimer);
    if (onboardAutoOpened && !$("#modalBackdrop").hidden && state.users.length) {
      closeModal(); // profiles just arrived from the account — drop the nag
    }
    onboardAutoOpened = false;
  }

  buildManualChips();
  renderAiCard();
  S.checkServerAi().then(function (hasServer) {
    serverAiOn = hasServer;
    renderAiCard();
  });
  var bootStatusSeen = false;
  if (window.SafeShelfCloud) {
    window.SafeShelfCloud.init({
      getLocal: function () { return state; },
      getOwner: function () {
        try { return localStorage.getItem(OWNER_KEY) || null; } catch (e) { return null; }
      },
      setOwner: function (id) {
        try { localStorage.setItem(OWNER_KEY, id); } catch (e) { /* private mode */ }
      },
      onRemoteState: function (remote) {
        if (!remote || !Array.isArray(remote.users)) return;
        state = remote;
        S.save(state); // keep remote's timestamp — no persist(), or we'd echo it straight back up
        renderAll();
        cancelOnboard();
        toast("☁️ Loaded your account data.");
      },
      onResetState: function () {
        // sign-ins never absorb whatever was on the device; the owner marker
        // (just set by pull) stays so this account's future edits sync up
        resetLocalState(false);
        renderAll();
        toast("☁️ Signed in — starting fresh for this account.");
      },
      onStatus: function (info) {
        renderAccount();
        if (!bootStatusSeen && info.status !== "loading") {
          bootStatusSeen = true;
          if (!state.users.length) {
            // signed-in: give the cloud copy time to land before nagging;
            // signed-out/unavailable: behave like a plain first run
            scheduleOnboard(info.status === "signedin" ? 4000 : 450);
          }
        }
      }
    });
  }
  renderAccount();
  renderAll();

  if (location.hash === "#groups") showTab("groups");

  // first-run onboarding (FR-10.1, quick path) — when cloud sync is available
  // the scheduling instead happens once the auth status is known, so signing
  // in never pops the form while the account's profiles are still loading
  if (!window.SafeShelfCloud && !state.users.length) scheduleOnboard(450);
})();
