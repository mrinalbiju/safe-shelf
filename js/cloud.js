/* Safe Shelf — cloud accounts & sync (Supabase)
 *
 * Local-first: localStorage stays the source of truth and the app works fully
 * signed-out/offline. When signed in, the whole state blob syncs to a single
 * row per user (last-write-wins by timestamp), so profiles/groups/carts follow
 * the account across devices. The anon key below is public by design; access
 * control lives in Postgres Row Level Security.
 */
(function (global) {
  "use strict";

  var SUPABASE_URL = "https://wahhrybzfttzvdogxqir.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhaGhyeWJ6ZnR0enZkb2d4cWlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTkzNTUsImV4cCI6MjA5NjY5NTM1NX0.vUj7p5Y_xQt6EsrWnPvIVgUl3pJFJP0hlSB7jk-qZVs";

  var client = null;
  var session = null;
  var status = "loading"; // loading | unavailable | signedout | signedin
  var lastSync = null;
  var syncTimer = null;
  var hooks = {};

  function emit() {
    if (hooks.onStatus) hooks.onStatus({ status: status, email: session && session.user ? session.user.email : "", lastSync: lastSync });
  }

  function init(h) {
    hooks = h || {};
    if (!global.supabase || !global.supabase.createClient) {
      status = "unavailable";
      emit();
      return;
    }
    client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    client.auth.onAuthStateChange(function (_event, s) {
      var wasSignedIn = !!session;
      session = s;
      status = s ? "signedin" : "signedout";
      emit();
      if (s && !wasSignedIn) pull();
    });
    client.auth.getSession().then(function (res) {
      session = res.data ? res.data.session : null;
      status = session ? "signedin" : "signedout";
      emit();
      if (session) pull();
    });
  }

  function friendly(err) {
    var m = (err && (err.message || err.error_description)) || "Something went wrong";
    if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
    if (/already registered/i.test(m)) return "That email already has an account — sign in instead.";
    if (/at least 6/i.test(m)) return "Password needs at least 6 characters.";
    if (/confirm/i.test(m)) return "Check your email and confirm the address first.";
    return m;
  }

  function signUp(email, password, redirectTo) {
    if (!client) return Promise.reject(new Error("Cloud unavailable"));
    var opts = { email: email, password: password };
    if (redirectTo) opts.options = { emailRedirectTo: redirectTo };
    return client.auth.signUp(opts).then(function (res) {
      if (res.error) throw new Error(friendly(res.error));
      // with email confirmation on there's no session yet — the user must
      // click the link we just emailed them
      return res.data.session ? "signedin" : "confirm";
    });
  }

  function resend(email, redirectTo) {
    if (!client) return Promise.reject(new Error("Cloud unavailable"));
    var opts = { type: "signup", email: email };
    if (redirectTo) opts.options = { emailRedirectTo: redirectTo };
    return client.auth.resend(opts).then(function (res) {
      if (res.error) throw new Error(friendly(res.error));
    });
  }

  function signIn(email, password) {
    if (!client) return Promise.reject(new Error("Cloud unavailable"));
    return client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) throw new Error(friendly(res.error));
      return "signedin";
    });
  }

  function signOut() {
    if (!client) return Promise.resolve();
    return client.auth.signOut();
  }

  // ---- sync ----

  function pull() {
    if (!client || !session) return Promise.resolve();
    return client.from("user_data").select("payload, updated_at")
      .eq("user_id", session.user.id).maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        var local = hooks.getLocal ? hooks.getLocal() : null;
        var localTs = (local && local.updatedAt) || 0;
        var row = res.data;
        var remoteTs = row ? new Date(row.updated_at).getTime() : 0;
        if (row && remoteTs > localTs) {
          lastSync = Date.now();
          if (hooks.onRemoteState) hooks.onRemoteState(row.payload);
          emit();
        } else if (local && (local.users.length || local.groups.length)) {
          return push(local);
        }
      }).catch(function () { /* offline pull is non-fatal; next change retries */ });
  }

  function push(state) {
    if (!client || !session) return Promise.resolve();
    return client.from("user_data").upsert({
      user_id: session.user.id,
      payload: state,
      updated_at: new Date(state.updatedAt || Date.now()).toISOString()
    }).then(function (res) {
      if (res.error) throw res.error;
      lastSync = Date.now();
      emit();
    });
  }

  // call on every local change; debounced so rapid edits batch into one write
  function queueSync(state) {
    if (!client || !session) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      push(state).catch(function () { /* retried on next change */ });
    }, 1500);
  }

  function syncNow(state) {
    if (!client || !session) return Promise.reject(new Error("Not signed in"));
    clearTimeout(syncTimer);
    return push(state).then(pull);
  }

  global.SafeShelfCloud = {
    init: init,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resend: resend,
    queueSync: queueSync,
    syncNow: syncNow,
    getStatus: function () { return { status: status, email: session && session.user ? session.user.email : "", lastSync: lastSync }; }
  };
})(window);
