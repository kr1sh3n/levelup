import { useEffect, useState } from "react";
import { CONSENT_TEXT, fetchProfile, recordConsent, supabase } from "./cloud";
import { THEMES, themeOf, savedTheme } from "./themes";

// The sign-in screen renders before any user state is loaded, so it reads the
// theme the browser remembered rather than the one in the save.
function authMascot() {
  return THEMES[themeOf(savedTheme())].logoImage || null;
}

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [consent, setConsent] = useState(false);
  const mascot = authMascot();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        });
        if (error) throw error;
        // With email confirmation on there is no session yet, so the consent is
        // written on the first sign-in instead (see AuthGate below).
        if (data.session?.user) await recordConsent(data.session.user.id);
        if (!data.session) setMsg({ ok: true, text: "Check your email to confirm your account, then sign in." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname,
        });
        if (error) throw error;
        setMsg({ ok: true, text: "Password reset link sent — check your email." });
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message || "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app auth-screen">
      {mascot && <img className="auth-mascot" src={mascot} alt="" />}
      <div className="auth-logo">PDASH</div>
      <div className="auth-tagline">Your goals. Your plans. Your game.</div>
      <form className="card" onSubmit={submit}>
        <div className="card-title">
          {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password"}
        </div>
        <input
          className="meal-input"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {mode !== "reset" && (
          <input
            className="meal-input"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Password (min 6 characters)"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
        {mode === "signup" && (
          <label className="consent-row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>
              {CONSENT_TEXT}{" "}
              <a href="./privacy.html" target="_blank" rel="noreferrer">What is stored</a>
            </span>
          </label>
        )}
        <button type="submit" className="claim-btn" disabled={busy || (mode === "signup" && !consent)}>
          {busy ? "PLEASE WAIT…" : mode === "signin" ? "SIGN IN" : mode === "signup" ? "SIGN UP" : "SEND RESET LINK"}
        </button>
        {msg && <div className={`form-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
        <div className="auth-links">
          {mode !== "signin" && (
            <button type="button" className="link-btn" onClick={() => { setMode("signin"); setMsg(null); }}>
              Have an account? Sign in
            </button>
          )}
          {mode !== "signup" && (
            <button type="button" className="link-btn" onClick={() => { setMode("signup"); setMsg(null); }}>
              New here? Create an account
            </button>
          )}
          {mode === "signin" && (
            <button type="button" className="link-btn" onClick={() => { setMode("reset"); setMsg(null); }}>
              Forgot password?
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function ConsentScreen({ user, onDone }) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      await recordConsent(user.id);
      onDone();
    } catch (e) {
      setErr(e.message || "Could not save that.");
      setBusy(false);
    }
  }

  return (
    <div className="app auth-screen">
      {authMascot() && <img className="auth-mascot" src={authMascot()} alt="" />}
      <div className="auth-logo">PDASH</div>
      <div className="auth-tagline">One thing before you start</div>
      <div className="card">
        <div className="card-title">How your data is handled</div>
        <label className="consent-row">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            {CONSENT_TEXT} <a href="./privacy.html" target="_blank" rel="noreferrer">What is stored</a>
          </span>
        </label>
        <button type="button" className="claim-btn" disabled={!agreed || busy} onClick={accept}>
          {busy ? "SAVING…" : "AGREE AND CONTINUE"}
        </button>
        {err && <div className="form-msg err">{err}</div>}
        <div className="auth-links">
          <button type="button" className="link-btn" onClick={() => supabase.auth.signOut()}>
            No thanks, sign me out
          </button>
        </div>
      </div>
    </div>
  );
}

// Renders children(user) once the auth state is known. Without Supabase
// configured, renders children(null) immediately (local-only mode).
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  // Tagged with the user it belongs to, so switching account invalidates it
  // without having to reset state from inside an effect.
  const [consent, setConsent] = useState({ userId: null, ok: undefined });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Has this account agreed yet? Checked once per sign-in.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!supabase || !uid) return undefined;
    let active = true;
    fetchProfile(uid)
      .then((p) => active && setConsent({ userId: uid, ok: !!p?.consented_at }))
      // If the profiles table is unreachable, do not lock people out of their
      // own app; the consent screen will ask again next time.
      .catch(() => active && setConsent({ userId: uid, ok: true }));
    return () => {
      active = false;
    };
  }, [session]);

  const consented = session?.user && consent.userId === session.user.id ? consent.ok : undefined;

  if (!supabase) return children(null);
  if (session === undefined) {
    return (
      <div className="app auth-screen">
        {authMascot() && <img className="auth-mascot" src={authMascot()} alt="" />}
        <div className="auth-logo">PDASH</div>
        <div className="auth-tagline">Loading…</div>
      </div>
    );
  }
  if (!session) return <AuthScreen />;
  if (consented === undefined) {
    return (
      <div className="app auth-screen">
        {authMascot() && <img className="auth-mascot" src={authMascot()} alt="" />}
        <div className="auth-logo">PDASH</div>
        <div className="auth-tagline">Loading…</div>
      </div>
    );
  }
  if (!consented) return <ConsentScreen user={session.user} onDone={() => setConsent({ userId: session.user.id, ok: true })} />;
  return children(session.user);
}
