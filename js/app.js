/* Safe Shelf — app UI: profiles, product checking, group buying */
(function () {
  "use strict";

  var S = window.SafeShelf;
  var state = S.load();

  /* =================== helpers =================== */

  function $(sel) { return document.querySelector(sel); }

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function persist() { S.save(state); }

  function getUser(id) { return state.users.find(function (u) { return u.id === id; }); }
  function getGroup(id) { return state.groups.find(function (g) { return g.id === id; }); }
  function currentUser() { return getUser(state.currentUserId); }
  function activeGroup() { return getGroup(state.activeGroupId); }
  function canEdit(user) { return state.currentUserId === user.id; }

  function groupMembers(group) {
    return group.memberIds.map(getUser).filter(Boolean);
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
  function openModal(html) {
    var backdrop = $("#modalBackdrop");
    $("#modalBox").innerHTML = html;
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("#modalBackdrop").hidden = true;
    document.body.style.overflow = "";
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
        '<span class="pc">' + esc(p.category) + "</span></button>";
    }).join("");
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

  function openUserForm(user) {
    var isNew = !user;
    var u = user || { name: "", emoji: S.EMOJIS[state.users.length % S.EMOJIS.length], allergens: [], conditions: [], lifestyle: [], budget: "" };
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
        chipGroup(S.ALLERGENS, u.allergens || [], "al") + "</div></div>" +
      '<div class="field"><label>Illnesses / medical conditions</label><div class="chip-select" id="fConditions">' +
        chipGroup(S.CONDITIONS, u.conditions || [], "cond") + "</div></div>" +
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
      conditions: readChips($("#fConditions"), "cond"),
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

  function showResultModal() {
    var r = lastResult;
    var p = r.product;
    var n = p.nutrition || {};
    var nutriBits = Object.keys(S.NUTRIENT_LABELS).map(function (key) {
      if (n[key] == null) return '<span class="mini-chip">' + S.NUTRIENT_LABELS[key] + ": n/a</span>";
      var unit = key === "sodium" ? "mg" : "g";
      return '<span class="mini-chip">' + S.NUTRIENT_LABELS[key] + ": " + n[key] + unit + "/100g</span>";
    }).join("");

    var bannerText = r.isGroup
      ? (r.aggregate === "safe" ? "Safe for the whole group"
        : r.aggregate === "caution" ? "Preference conflicts — check below"
        : "Not suitable for everyone")
      : (r.aggregate === "safe" ? "Safe for you"
        : r.aggregate === "caution" ? "Possible preference conflict"
        : "Not suitable for you");

    var membersHtml = r.perMember.map(function (m) {
      return '<div class="member-result">' +
        '<div class="member-result-head">' + m.user.emoji + " " + esc(m.user.name) +
          '<span class="verdict ' + m.status + '">' + verdictText(m.status) + "</span></div>" +
        (m.reasons.length
          ? '<ul class="reason-list">' + m.reasons.map(function (rs) {
              return '<li class="' + rs.severity + '">' + esc(rs.text) + "</li>";
            }).join("") + "</ul>"
          : "") +
      "</div>";
    }).join("");

    var g = activeGroup();
    openModal(
      '<div class="result-head"><span class="result-emoji">' + p.emoji + "</span>" +
        "<div><strong>" + esc(p.name) + "</strong><small>" + esc(p.category || "") +
        (p.source ? " · via " + esc(p.source) : "") + "</small></div></div>" +
      '<div class="verdict-banner ' + r.aggregate + '">' + verdictText(r.aggregate).split(" ")[0] + " " + bannerText + "</div>" +
      '<div class="nutri-strip">' + nutriBits + "</div>" +
      membersHtml +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-action="close-modal" type="button">Done</button>' +
        (g ? '<button class="btn btn-primary" data-action="add-to-cart" type="button">＋ Add to group cart</button>' : "") +
      "</div>" +
      '<p class="disclaimer">Dietary goal alignment only — not medical advice. Always double-check the physical label for life-threatening allergies.</p>'
    );
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
        status.textContent = "❌ Product not found. Try manual entry below (FR-1.12).";
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
        var ag = activeGroup();
        if (!ag || !lastResult) break;
        ag.cart = ag.cart || [];
        ag.cart.push({
          name: lastResult.product.name,
          emoji: lastResult.product.emoji,
          status: lastResult.aggregate,
          addedBy: state.currentUserId,
          at: Date.now()
        });
        persist(); closeModal(); renderGroups();
        toast("Added to " + ag.name + "'s cart (" + verdictText(lastResult.aggregate) + ").");
        break;
      }
    }
  });

  $("#addUserBtn").addEventListener("click", function () { openUserForm(null); });
  $("#addGroupBtn").addEventListener("click", openGroupForm);
  $("#contextPill").addEventListener("click", openSwitcher);
  $("#barcodeForm").addEventListener("submit", function (e) {
    e.preventDefault();
    doBarcodeLookup($("#barcodeInput").value.trim());
  });
  $("#manualForm").addEventListener("submit", submitManual);

  /* =================== boot =================== */

  buildManualChips();
  renderAll();

  if (location.hash === "#groups") showTab("groups");

  // first-run onboarding (FR-10.1, quick path)
  if (!state.users.length) {
    setTimeout(function () { openUserForm(null); }, 450);
  }
})();
