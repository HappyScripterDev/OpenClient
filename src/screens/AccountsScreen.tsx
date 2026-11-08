import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { DeviceCodeChallenge } from "../shared/types";
import { appStore, useAppState } from "../lib/store";
import { errorMessage, unwrap } from "../lib/format";
import { Avatar } from "../ui/Avatar";
import { Button, IconButton } from "../ui/Button";
import { Field, Input } from "../ui/Field";
import { Badge } from "../ui/Panel";
import { EmptyState, PageHeader } from "../ui/Feedback";
import { ConfirmDialog } from "../ui/ConfirmDialog";

export function AccountsScreen() {
  const { accounts, settings, authStatus, edition } = useAppState();
  const [challenge, setChallenge] = useState<DeviceCodeChallenge | null>(null);
  const [starting, setStarting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signOutTarget, setSignOutTarget] = useState<string | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [clientId, setClientId] = useState(settings.microsoftClientId);
  const [clientIdSaving, setClientIdSaving] = useState(false);

  useEffect(() => {
    setClientId(settings.microsoftClientId);
  }, [settings.microsoftClientId]);

  useEffect(() => {
    if (!authStatus) return;
    if (
      authStatus.state === "success" ||
      authStatus.state === "error" ||
      authStatus.state === "cancelled"
    ) {
      setChallenge(null);
    }
  }, [authStatus]);

  const start = async (): Promise<void> => {
    setStarting(true);
    try {
      const next = await unwrap(window.openclient.auth.startDeviceCode());
      setChallenge(next);
    } catch (error) {
      appStore.toast("Could not start sign-in", "error", errorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async (): Promise<void> => {
    try {
      await unwrap(window.openclient.auth.cancelDeviceCode());
      setChallenge(null);
    } catch {
      setChallenge(null);
    }
  };

  const copyCode = async (): Promise<void> => {
    if (!challenge) return;
    try {
      await navigator.clipboard.writeText(challenge.userCode);
      appStore.toast("Code copied", "info");
    } catch {
      appStore.toast("Copy failed", "warning", "Select the code and copy it manually.");
    }
  };

  const setActive = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      await unwrap(window.openclient.auth.setActive(id));
      await appStore.refreshAccounts();
      appStore.toast("Active account changed", "success");
    } catch (error) {
      appStore.toast("Could not switch account", "error", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const refresh = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      await unwrap(window.openclient.auth.refresh(id));
      await appStore.refreshAccounts();
      appStore.toast("Session refreshed", "success");
    } catch (error) {
      appStore.toast("Refresh failed", "error", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const signOut = async (): Promise<void> => {
    if (!signOutTarget) return;
    setSignOutBusy(true);
    try {
      await unwrap(window.openclient.auth.signOut(signOutTarget));
      await appStore.refreshAccounts();
      appStore.toast("Signed out", "info", "The encrypted tokens for this account were removed.");
      setSignOutTarget(null);
    } catch (error) {
      appStore.toast("Could not sign out", "error", errorMessage(error));
    } finally {
      setSignOutBusy(false);
    }
  };

  const saveClientId = async (): Promise<void> => {
    setClientIdSaving(true);
    try {
      await appStore.updateSettings({ microsoftClientId: clientId.trim() });
      appStore.toast("Client ID saved", "success", "The next sign-in uses the new application registration.");
    } finally {
      setClientIdSaving(false);
    }
  };

  return (
    <div className="screen narrow">
      <PageHeader
        eyebrow={edition === "java" ? "Java Edition" : "Bedrock Edition"}
        title="Accounts"
        subtitle="Microsoft sign-in for Minecraft Java Edition. Bedrock handles its own account inside the game."
        actions={
          accounts.length > 0 ? (
            <Button variant="primary" icon={<KeyRound size={15} />} loading={starting} onClick={() => void start()}>
              Add account
            </Button>
          ) : null
        }
      />

      <div className="notice is-info">
        <ShieldCheck size={17} />
        <div>
          <div className="notice-title">Secure by design</div>
          OpenClient never asks for or stores your Microsoft password. Sign-in happens in
          Microsoft's browser page using the OAuth device flow. Access and refresh tokens are
          encrypted with the operating system keychain through Electron safeStorage. Sessions are
          refreshed silently before launch.
        </div>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<UserRound size={26} />}
          title="Connect a Microsoft account"
          text="Java Edition requires a Microsoft account that owns Minecraft. OpenClient will show a code, you approve it at microsoft.com/link, and the account appears here."
          action={
            <Button variant="primary" size="lg" icon={<KeyRound size={16} />} loading={starting} onClick={() => void start()}>
              Sign in with Microsoft
            </Button>
          }
        />
      ) : (
        <div className="vstack" style={{ gap: 10, marginTop: 16 }}>
          {accounts.map((account) => (
            <div className={`account-card${account.active ? " is-active" : ""}`} key={account.id}>
              <Avatar uuid={account.uuid} name={account.username} size={46} />
              <div className="account-card-main">
                <div className="hstack">
                  <span className="account-card-name">{account.username}</span>
                  {account.active ? <Badge variant="accent">Active</Badge> : null}
                </div>
                <div className="account-card-uuid">{account.uuid}</div>
              </div>
              <div className="row-actions">
                {!account.active ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyId === account.id}
                    onClick={() => void setActive(account.id)}
                  >
                    Use
                  </Button>
                ) : null}
                <IconButton
                  label={`Refresh ${account.username}`}
                  size="sm"
                  disabled={busyId === account.id}
                  onClick={() => void refresh(account.id)}
                >
                  {busyId === account.id ? <span className="spinner" /> : <RefreshCw size={14} />}
                </IconButton>
                <IconButton
                  label={`Sign out ${account.username}`}
                  size="sm"
                  onClick={() => setSignOutTarget(account.id)}
                >
                  <LogOut size={14} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {challenge ? (
        <div className="mt-5">
          <div className="device-code">
            <div className="page-eyebrow">Waiting for Microsoft</div>
            <div className="code">{challenge.userCode}</div>
            <p className="device-code-link">
              Open <strong>{challenge.verificationUri.replace("https://", "")}</strong> and enter this code.
            </p>
            <div className="hstack">
              <Button variant="primary" icon={<ExternalLink size={15} />} onClick={() => void window.openclient.app.openExternal(challenge.verificationUri)}>
                Open browser
              </Button>
              <Button variant="secondary" icon={<Copy size={15} />} onClick={() => void copyCode()}>
                Copy code
              </Button>
              <Button variant="ghost" onClick={() => void cancel()}>
                Cancel
              </Button>
            </div>
            {authStatus?.state === "error" ? (
              <div className="field-error" style={{ textAlign: "center" }}>
                {authStatus.message}
              </div>
            ) : (
              <div className="field-hint" style={{ textAlign: "center" }}>
                The code expires in {Math.round(challenge.expiresIn / 60)} minutes. This window
                updates automatically when approval finishes.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {authStatus && authStatus.state !== "pending" && !challenge ? (
        <div
          className={`notice mt-4 ${authStatus.state === "error" ? "is-danger" : authStatus.state === "success" ? "is-info" : ""}`}
        >
          {authStatus.state === "success" ? <Check size={16} /> : <KeyRound size={16} />}
          <div>{authStatus.message}</div>
        </div>
      ) : null}

      <section className="section" aria-labelledby="client-id-heading">
        <div className="section-header">
          <div>
            <h2 className="section-heading" id="client-id-heading">
              Microsoft application ID
            </h2>
            <p className="section-desc">
              Public client ID used to request the Xbox Live scope. A client ID is not a secret.
              Change it if you run your own Microsoft Entra application.
            </p>
          </div>
        </div>
        <div className="settings-section">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-name">OAuth client ID</div>
              <div className="setting-hint">
                Defaults to a public open-source launcher client ID. Replace it with your own Microsoft Entra application for production use. Your account is never
                sent anywhere except Microsoft, Xbox Live and Mojang.
              </div>
            </div>
            <div className="setting-control is-wide">
              <Field className="grow">
                <Input
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  mono
                />
              </Field>
              <Button variant="secondary" loading={clientIdSaving} onClick={() => void saveClientId()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="notice is-warning">
          <KeyRound size={16} />
          <div>
            <div className="notice-title">Minecraft ownership is required</div>
            OpenClient verifies the account through Minecraft services. Accounts without Java
            Edition ownership are rejected with a clear message. No passwords are ever requested
            outside Microsoft's page.
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={signOutTarget !== null}
        title="Sign out of this account"
        description="Encrypted tokens for this account are deleted from this computer. The game installation and profiles are not affected."
        confirmLabel="Sign out"
        danger
        busy={signOutBusy}
        onConfirm={() => void signOut()}
        onClose={() => setSignOutTarget(null)}
      />
    </div>
  );
}
