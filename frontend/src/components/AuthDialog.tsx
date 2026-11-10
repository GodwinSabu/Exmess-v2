import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { requestSignInLink } from "../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Sent = { email: string; isNewUser: boolean; devLink?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Passwordless sign-in. The server emails a magic link; opening it sets the
 * session cookie and lands back on /dashboard.
 */
export function AuthDialog({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setError(null);
      setSent(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const address = email.trim();

    if (!EMAIL_PATTERN.test(address)) {
      setError("Enter a valid email address.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const result = await requestSignInLink(address);
      setSent({ email: address, ...result });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the sign-in link.");
    } finally {
      setSending(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="auth-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="dialog-body">
        <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
          {"×"}
        </button>

        {sent ? (
          <>
            <h2 id="auth-title">Check your email</h2>
            <p>
              We sent a sign-in link to <strong>{sent.email}</strong>. It works for 5 minutes.
              {sent.isNewUser && " Opening it creates your account."}
            </p>

            {sent.devLink && (
              <div className="dev-note">
                <span>
                  <strong>Development mode.</strong> No email provider is configured, so nothing was actually
                  sent. Use the link directly (it is also printed in the server console).
                </span>
                <a className="btn btn-primary" href={sent.devLink}>
                  Open sign-in link
                </a>
              </div>
            )}

            <button type="button" className="btn btn-ghost" onClick={() => setSent(null)}>
              Use a different email
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={{ display: "grid", gap: 14 }}>
            <h2 id="auth-title">Sign in to trade</h2>
            <p>Enter your email and we'll send you a sign-in link. No password needed.</p>

            <div className="field">
              <label className="field-label" htmlFor="auth-email">
                Email
              </label>
              <div className="input-wrap">
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  aria-invalid={error !== null}
                  aria-describedby={error ? "auth-error" : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                  autoFocus
                />
              </div>
              {error && (
                <span id="auth-error" className="form-error" role="alert">
                  {error}
                </span>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
              {sending ? "Sending link…" : "Continue with email"}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
