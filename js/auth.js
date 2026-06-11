/* Safe Shelf — login page (email + password with email verification)
 *
 * Sign-up sends a Supabase confirmation email whose link points back at this
 * page (emailRedirectTo). supabase-js picks the tokens out of the URL hash on
 * load, the session appears, and we bounce to the app. Expired/invalid links
 * also land here as #error=… which we surface with a resend option.
 */
(function () {
  "use strict";

  var cloud = window.SafeShelfCloud;
  var mode = "signin";
  var pendingEmail = "";
  var resendCooldown = 0;
  // where the confirmation email should send the user back to (this page)
  var redirectTo = location.origin + location.pathname;
  var cameFromEmailLink = /access_token=/.test(location.hash);

  function $(s) { return document.querySelector(s); }

  var toastTimer = null;
  function toast(msg, warn) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("warn", !!warn);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3500);
  }

  function showError(msg) {
    var el = $("#authError");
    el.textContent = msg;
    el.hidden = !msg;
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll(".auth-tab").forEach(function (b) {
      var on = b.dataset.mode === m;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("#authTitle").textContent = m === "signin" ? "Welcome back" : "Create your account";
    $("#authSub").textContent = m === "signin"
      ? "Sign in to sync your profiles, groups and carts across devices."
      : "We'll email you a verification link — your account activates once you confirm.";
    $("#authSubmit").textContent = m === "signin" ? "Sign in" : "Create account";
    $("#authPass").setAttribute("autocomplete", m === "signin" ? "current-password" : "new-password");
    showError("");
  }

  function showVerify(email) {
    pendingEmail = email;
    $("#verifyEmail").textContent = email;
    $("#authCard").hidden = true;
    $("#verifyCard").hidden = false;
  }

  function showAuth() {
    $("#verifyCard").hidden = true;
    $("#authCard").hidden = false;
  }

  function startCooldown(btn) {
    resendCooldown = 30;
    btn.disabled = true;
    var base = "📧 Resend email";
    var tick = setInterval(function () {
      resendCooldown--;
      if (resendCooldown <= 0) {
        clearInterval(tick);
        btn.disabled = false;
        btn.textContent = base;
      } else {
        btn.textContent = base + " (" + resendCooldown + "s)";
      }
    }, 1000);
  }

  function resend(email, btn) {
    if (!email) { toast("Enter your email first.", true); return; }
    cloud.resend(email, redirectTo).then(function () {
      toast("📧 Verification email sent to " + email + ".");
      if (btn) startCooldown(btn);
    }).catch(function (e) { toast(e.message, true); });
  }

  // expired / invalid confirmation links arrive as hash params
  (function readHashError() {
    if (!/error=/.test(location.hash)) return;
    var h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (!h.get("error")) return;
    var msg = h.get("error_code") === "otp_expired"
      ? "That verification link has expired. Enter your email and resend a fresh one."
      : decodeURIComponent((h.get("error_description") || "The link didn't work.").replace(/\+/g, " "));
    showError(msg);
    history.replaceState(null, "", location.pathname + location.search);
  })();

  cloud.init({
    onStatus: function (info) {
      if (info.status === "signedin") {
        toast(cameFromEmailLink ? "✅ Email verified — you're signed in!" : "✅ Signed in.");
        setTimeout(function () { location.replace("app.html"); }, cameFromEmailLink ? 1100 : 400);
      } else if (info.status === "unavailable") {
        showError("Cloud sync is unreachable right now. You can still use the app without an account.");
        $("#authSubmit").disabled = true;
      }
    }
  });

  document.querySelectorAll(".auth-tab").forEach(function (b) {
    b.addEventListener("click", function () { setMode(b.dataset.mode); });
  });

  $("#authForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("#authEmail").value.trim();
    var pass = $("#authPass").value;
    if (!email || !/.+@.+\..+/.test(email)) { showError("Enter a valid email address."); return; }
    if (pass.length < 6) { showError("Password needs at least 6 characters."); return; }
    showError("");
    var btn = $("#authSubmit");
    btn.disabled = true;
    btn.textContent = mode === "signin" ? "Signing in…" : "Creating account…";

    var done = function () {
      btn.disabled = false;
      btn.textContent = mode === "signin" ? "Sign in" : "Create account";
    };

    if (mode === "signin") {
      cloud.signIn(email, pass).then(done).catch(function (err) {
        done();
        showError(err.message);
        if (/confirm/i.test(err.message)) showVerify(email);
      });
    } else {
      cloud.signUp(email, pass, redirectTo).then(function (outcome) {
        done();
        if (outcome === "confirm") showVerify(email);
        // outcome "signedin" (confirmation disabled) is handled by onStatus
      }).catch(function (err) { done(); showError(err.message); });
    }
  });

  $("#resendBtn").addEventListener("click", function () {
    resend(pendingEmail, $("#resendBtn"));
  });
  $("#resendInline").addEventListener("click", function () {
    resend($("#authEmail").value.trim(), null);
  });
  $("#backBtn").addEventListener("click", function () {
    setMode("signin");
    showAuth();
  });
})();
