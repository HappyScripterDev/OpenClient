import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { DeviceCodeChallenge } from "../shared/types";
import { appStore, useAppState } from "../lib/store";
import { errorMessage, unwrap } from "../lib/format";
import { Button } from "./Button";
import logo from "../../assets/OcTransparent.png";

export function LoginGate() {
  const { authStatus, settings } = useAppState();
  const [challenge, setChallenge] = useState<DeviceCodeChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!challenge || opened) return;
    setOpened(true);
    void window.openclient.app.openExternal(challenge.verificationUri);
  }, [challenge, opened]);

  useEffect(() => {
    if (authStatus?.state === "success" || authStatus?.state === "cancelled") {
      setChallenge(null);
    }
  }, [authStatus]);

  const start = async (): Promise<void> => {
    setBusy(true);
    setOpened(false);
    try {
      const next = await unwrap(window.openclient.auth.startDeviceCode());
      setChallenge(next);
    } catch (error) {
      appStore.toast("Sign-in could not start", "error", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    if (!challenge) return;
    try {
      await navigator.clipboard.writeText(challenge.userCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      appStore.toast("Copy failed", "warning", "Select the code and copy it manually.");
    }
  };

  return (
    <div className="login-gate">
      <div className="login-glow" />
      <div className="login-layout">
        <section className="login-hero">
          <div className="login-brand">
            <img src={logo} alt="" />
            <span>OpenClient</span>
          </div>
          <h1>
            Your Minecraft,
            <span> smoother.</span>
          </h1>
          <p>
            A glass-clean launcher for Java and Bedrock Edition. Performance profiles,
            verified downloads, mods and worlds in one calm place.
          </p>
          <ul className="login-features">
            <li>
              <Sparkles size={15} />
              Performance profiles with Sodium, Lithium and tuned JVM flags
            </li>
            <li>
              <ShieldCheck size={15} />
              Microsoft OAuth with encrypted token storage and silent refresh
            </li>
            <li>
              <Check size={15} />
              Fabric, Quilt, Forge and NeoForge in one click
            </li>
            <li>
              <Check size={15} />
              Bedrock content, worlds and graphics management
            </li>
          </ul>
          <div className="login-footnote">
            <Lock size={13} />
            No passwords are stored. No telemetry. OpenClient is a launcher, not a cheat client.
          </div>
        </section>

        <section className="login-card">
          <div className="login-card-head">
            <div className="login-card-icon">
              <KeyRound size={20} />
            </div>
            <div>
              <h2>Sign in to continue</h2>
              <p>Minecraft Java requires a Microsoft account that owns the game.</p>
            </div>
          </div>

          {!challenge ? (
            <>
              <Button
                variant="primary"
                size="lg"
                block
                loading={busy}
                icon={<ArrowRight size={17} />}
                onClick={() => void start()}
              >
                Continue with Microsoft
              </Button>
              <p className="login-small">
                A browser window opens on Microsoft's official sign-in page. If you normally use a
                Google account for Minecraft, choose it inside Microsoft's account picker. OpenClient
                never sees your password.
              </p>
              {authStatus?.state === "error" ? (
                <div className="notice is-danger" style={{ marginTop: 14 }}>
                  <KeyRound size={16} />
                  <div>{authStatus.message}</div>
                </div>
              ) : null}
              <div className="login-separator">
                <span>Secure device code flow</span>
              </div>
              <div className="login-note">
                <ShieldCheck size={15} />
                <div>
                  Tokens are encrypted with Windows DPAPI through Electron safeStorage. A refresh
                  happens silently before every launch.
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="login-code-block">
                <div className="page-eyebrow">Enter this code at microsoft.com/link</div>
                <div className="login-code">{challenge.userCode}</div>
                <div className="login-code-actions">
                  <Button
                    variant="primary"
                    icon={<ExternalLink size={15} />}
                    onClick={() =>
                      void window.openclient.app.openExternal(challenge.verificationUri)
                    }
                  >
                    Open browser
                  </Button>
                  <Button
                    variant="secondary"
                    icon={copied ? <Check size={15} /> : <Copy size={15} />}
                    onClick={() => void copy()}
                  >
                    {copied ? "Copied" : "Copy code"}
                  </Button>
                </div>
              </div>
              <div className="login-wait">
                <Loader2 size={15} className="spin-icon" />
                <span>
                  {authStatus?.state === "error"
                    ? authStatus.message
                    : "Waiting for Microsoft to confirm the sign-in. This page updates automatically."}
                </span>
              </div>
              <Button variant="ghost" block onClick={() => setChallenge(null)}>
                Start over
              </Button>
            </>
          )}

          <div className="login-client-id">
            Client ID: <span className="mono">{settings.microsoftClientId || "not configured"}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
