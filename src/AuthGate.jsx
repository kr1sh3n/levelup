import { useEffect, useState } from "react";
import { supabase } from "./cloud";
import kittyLogo from "./assets/kitty-logo.png";

function AuthScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

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
      <img className="auth-mascot" src={kittyLogo} alt="" />
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
        <button type="submit" className="claim-btn" disabled={busy}>
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

// Renders children(user) once the auth state is known. Without Supabase
// configured, renders children(null) immediately (local-only mode).
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);

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

  if (!supabase) return children(null);
  if (session === undefined) {
    return (
      <div className="app auth-screen">
        <img className="auth-mascot" src={kittyLogo} alt="" />
        <div className="auth-logo">PDASH</div>
        <div className="auth-tagline">Loading…</div>
      </div>
    );
  }
  if (!session) return <AuthScreen />;
  return children(session.user);
}
