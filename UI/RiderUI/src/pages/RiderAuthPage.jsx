import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import RiderLayout from "../components/rider/RiderLayout";
import { useRiderAuth } from "../lib/authContext";

export default function RiderAuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { rider, isConfigured, signIn, signUp } = useRiderAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const target = location.state?.from || "/rider/available-orders";

  if (rider) {
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signin") {
        await signIn({ email, password });
        navigate(target, { replace: true });
        return;
      }

      const data = await signUp({ email, password });
      if (data.accessToken) {
        navigate(target, { replace: true });
        return;
      }
      setMessage("Account created. Please check your email and verify your account before signing in.");
      setMode("signin");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RiderLayout
      title="Welcome Back"
      subtitle="Sign in to Rider UI to resume your assigned jobs."
    >
      <section className="card auth-card">
        {!isConfigured && (
          <div className="auth-message auth-error">
            Rider auth is not configured. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the root env file.
          </div>
        )}

        <div className="auth-toggle-row">
          <button
            className={mode === "signin" ? "primary-btn" : "secondary-btn"}
            onClick={() => setMode("signin")}
            type="button"
          >
            Sign In
          </button>
          <button
            className={mode === "signup" ? "primary-btn" : "secondary-btn"}
            onClick={() => setMode("signup")}
            type="button"
          >
            Create Account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="label" htmlFor="rider-email">Email</label>
          <input
            id="rider-email"
            className="auth-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />

          <label className="label" htmlFor="rider-password">Password</label>
          <input
            id="rider-password"
            className="auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={6}
          />

          {message ? <div className="auth-message auth-success">{message}</div> : null}
          {error ? <div className="auth-message auth-error">{error}</div> : null}

          <button className="primary-btn" type="submit" disabled={!isConfigured || submitting}>
            {submitting
              ? mode === "signin" ? "Signing In..." : "Creating Account..."
              : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </section>
    </RiderLayout>
  );
}
