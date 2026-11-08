import { EventEmitter } from "node:events";
import fs from "node:fs";
import { safeStorage } from "electron";
import {
  accountsFile,
  accountsSecretFile,
  ensureDir,
} from "./paths";
import { readJsonFile, writeJsonFile } from "./files";
import { settingsService } from "./settings";
import { logger } from "./logger";
import {
  MC_LOGIN_URL,
  MC_PROFILE_URL,
  MICROSOFT_DEVICE_CODE_URL,
  MICROSOFT_TOKEN_URL,
  XBOX_SCOPES,
  XBOX_USER_AUTH_URL,
  XBOX_XSTS_URL,
  USER_AGENT,
} from "../../src/shared/constants";
import type {
  AccountSummary,
  DeviceCodeChallenge,
  ApiResult,
  AppError,
} from "../../src/shared/types";
import type { AuthFlowStatus } from "../../src/shared/ipc";

interface AccountSecret {
  id: string;
  username: string;
  uuid: string;
  xuid: string;
  msAccessToken: string;
  msRefreshToken: string;
  msExpiresAt: number;
  mcAccessToken: string;
  mcExpiresAt: number;
  addedAt: number;
}

interface SecretDocument {
  accounts: AccountSecret[];
}

interface PublicDocument {
  activeId: string;
  accounts: AccountSummary[];
}

interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface XboxResponse {
  Token: string;
  DisplayClaims?: { xui?: { uhs: string }[] };
}

interface MinecraftLoginResponse {
  access_token: string;
  expires_in: number;
}

interface MinecraftProfileResponse {
  id: string;
  name: string;
}

export interface LaunchSession {
  username: string;
  uuid: string;
  accessToken: string;
  xuid: string;
  clientId: string;
}

function errorResult(message: string, code: AppError["code"] = "AUTH_REQUIRED"): ApiResult<never> {
  return { ok: false, error: { code, message } };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AccountService extends EventEmitter {
  private secrets: AccountSecret[] = [];
  private publicDoc: PublicDocument = { activeId: "", accounts: [] };
  private loaded = false;
  private generation = 0;
  private pendingDeviceCode = "";

  async load(): Promise<void> {
    if (this.loaded) return;
    this.publicDoc = await readJsonFile<PublicDocument>(accountsFile(), {
      activeId: "",
      accounts: [],
    });
    this.secrets = await this.readSecrets();
    this.syncPublic();
    this.loaded = true;
  }

  private readSecrets(): AccountSecret[] {
    try {
      if (!fs.existsSync(accountsSecretFile())) return [];
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn("auth", "Secure storage is unavailable, tokens cannot be read");
        return [];
      }
      const encrypted = fs.readFileSync(accountsSecretFile());
      const json = safeStorage.decryptString(encrypted);
      const parsed = JSON.parse(json) as SecretDocument;
      return Array.isArray(parsed.accounts) ? parsed.accounts : [];
    } catch {
      logger.warn("auth", "Saved tokens could not be decrypted");
      return [];
    }
  }

  private async writeSecrets(): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "Secure storage is not available, refusing to store tokens. Configure a system keyring and try again.",
      );
    }
    ensureDir(accountsFile().replace(/[^\\/]+$/, ""));
    const encrypted = safeStorage.encryptString(
      JSON.stringify({ accounts: this.secrets } satisfies SecretDocument),
    );
    await fs.promises.writeFile(accountsSecretFile(), encrypted);
  }

  private syncPublic(): void {
    this.publicDoc.accounts = this.secrets.map((secret) => ({
      id: secret.id,
      username: secret.username,
      uuid: secret.uuid,
      active: secret.id === this.publicDoc.activeId,
      addedAt: secret.addedAt,
    }));
    if (!this.publicDoc.accounts.some((account) => account.id === this.publicDoc.activeId)) {
      this.publicDoc.activeId = this.publicDoc.accounts[0]?.id ?? "";
      this.publicDoc.accounts = this.publicDoc.accounts.map((account) => ({
        ...account,
        active: account.id === this.publicDoc.activeId,
      }));
    }
  }

  private async persist(): Promise<void> {
    this.syncPublic();
    await writeJsonFile(accountsFile(), this.publicDoc);
    await this.writeSecrets();
    this.emit("changed", this.list());
  }

  list(): AccountSummary[] {
    return this.publicDoc.accounts;
  }

  async setActive(id: string): Promise<AccountSummary[]> {
    await this.load();
    if (!this.secrets.some((secret) => secret.id === id)) {
      throw new Error("Account not found");
    }
    this.publicDoc.activeId = id;
    await writeJsonFile(accountsFile(), this.publicDoc);
    this.syncPublic();
    this.emit("changed", this.list());
    return this.list();
  }

  async signOut(id: string): Promise<void> {
    await this.load();
    this.secrets = this.secrets.filter((secret) => secret.id !== id);
    if (this.publicDoc.activeId === id) {
      this.publicDoc.activeId = this.secrets[0]?.id ?? "";
    }
    await this.persist();
  }

  async startDeviceCode(clientIdOverride?: string): Promise<DeviceCodeChallenge> {
    await this.load();
    const settings = await settingsService.load();
    const clientId = (clientIdOverride || settings.microsoftClientId || "").trim();
    if (!clientId) {
      throw new Error(
        "No Microsoft client ID is configured. Add one in Settings, Accounts.",
      );
    }
    this.cancelDeviceCode();
    const generation = ++this.generation;
    const body = new URLSearchParams({
      client_id: clientId,
      scope: XBOX_SCOPES,
    });
    const response = await fetch(MICROSOFT_DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    const data = (await response.json()) as DeviceCodeResponse & TokenResponse;
    if (!response.ok || !data.device_code) {
      throw new Error(
        data.error_description ||
          "Microsoft rejected the sign-in request. Check the client ID in Settings.",
      );
    }
    this.pendingDeviceCode = data.device_code;
    this.emit("status", {
      state: "pending",
      message: "Waiting for Microsoft sign-in",
    } satisfies AuthFlowStatus);
    const challenge: DeviceCodeChallenge = {
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
      message: data.message,
    };
    void this.pollDeviceCode(generation, clientId, data);
    return challenge;
  }

  cancelDeviceCode(): void {
    this.generation += 1;
    if (this.pendingDeviceCode) {
      this.pendingDeviceCode = "";
      this.emit("status", {
        state: "cancelled",
        message: "Sign-in cancelled",
      } satisfies AuthFlowStatus);
    }
  }

  private async pollDeviceCode(
    generation: number,
    clientId: string,
    data: DeviceCodeResponse,
  ): Promise<void> {
    const deadline = Date.now() + data.expires_in * 1000;
    let interval = Math.max(3, data.interval || 5);
    while (generation === this.generation && Date.now() < deadline) {
      await delay(interval * 1000);
      if (generation !== this.generation) return;
      try {
        const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
          },
          body: new URLSearchParams({
            client_id: clientId,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: data.device_code,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const token = (await tokenResponse.json()) as TokenResponse;
        if (token.access_token && token.refresh_token) {
          this.pendingDeviceCode = "";
          const account = await this.completeSignIn(
            token.access_token,
            token.refresh_token,
            token.expires_in ?? 3600,
          );
          this.emit("status", {
            state: "success",
            message: `Signed in as ${account.username}`,
            account,
          } satisfies AuthFlowStatus);
          return;
        }
        if (token.error === "authorization_pending") continue;
        if (token.error === "slow_down") {
          interval += 5;
          continue;
        }
        throw new Error(this.describeMicrosoftError(token));
      } catch (error) {
        if (generation !== this.generation) return;
        const message = error instanceof Error ? error.message : String(error);
        logger.error("auth", message);
        this.emit("status", {
          state: "error",
          message,
        } satisfies AuthFlowStatus);
        this.pendingDeviceCode = "";
        this.generation += 1;
        return;
      }
    }
    if (generation === this.generation) {
      this.pendingDeviceCode = "";
      this.emit("status", {
        state: "error",
        message: "The sign-in code expired. Start again to get a new code.",
      } satisfies AuthFlowStatus);
    }
  }

  private describeMicrosoftError(token: TokenResponse): string {
    if (token.error === "expired_token") {
      return "The sign-in code expired. Start again to get a new code.";
    }
    if (token.error === "authorization_declined") {
      return "Sign-in was declined in the browser.";
    }
    if (token.error === "invalid_client") {
      return "Microsoft does not recognise this client ID. Check the client ID in Settings.";
    }
    return token.error_description || token.error || "Microsoft sign-in failed.";
  }

  private async authenticateXbox(msAccessToken: string): Promise<{ token: string; uhs: string }> {
    const userResponse = await fetch(XBOX_USER_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-xbl-contract-version": "1",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        Properties: {
          AuthMethod: "RPS",
          SiteName: "user.auth.xboxlive.com",
          RpsTicket: `d=${msAccessToken}`,
        },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!userResponse.ok) {
      throw new Error("Xbox Live authentication failed. Try signing in again.");
    }
    const user = (await userResponse.json()) as XboxResponse;
    const uhs = user.DisplayClaims?.xui?.[0]?.uhs;
    if (!user.Token || !uhs) throw new Error("Xbox Live returned an incomplete response.");

    const xstsResponse = await fetch(XBOX_XSTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-xbl-contract-version": "1",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        Properties: {
          SandboxId: "RETAIL",
          UserTokens: [user.Token],
        },
        RelyingParty: "rp://api.minecraftservices.com/",
        TokenType: "JWT",
      }),
      signal: AbortSignal.timeout(20000),
    });
    const xstsRaw = (await xstsResponse.json()) as XboxResponse & {
      XErr?: number;
    };
    if (!xstsResponse.ok || !xstsRaw.Token) {
      throw new Error(this.describeXstsError(xstsRaw.XErr));
    }
    return { token: xstsRaw.Token, uhs };
  }

  private describeXstsError(code?: number): string {
    switch (code) {
      case 2148916233:
        return "This Microsoft account does not have an Xbox profile. Create one at xbox.com, then try again.";
      case 2148916235:
        return "Xbox Live is not available in the region of this account.";
      case 2148916236:
      case 2148916237:
        return "This account needs adult verification on the Xbox website before it can be used.";
      case 2148916238:
        return "This is a child account. Add it to a Microsoft family group and allow multiplayer, then try again.";
      default:
        return "Xbox Live authorisation failed. Sign in again or check the account's Xbox privacy settings.";
    }
  }

  private async completeSignIn(
    msAccessToken: string,
    msRefreshToken: string,
    msExpiresIn: number,
  ): Promise<AccountSummary> {
    const xbox = await this.authenticateXbox(msAccessToken);
    const loginResponse = await fetch(MC_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        identityToken: `XBL3.0 x=${xbox.uhs};${xbox.token}`,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!loginResponse.ok) {
      if (loginResponse.status === 401 || loginResponse.status === 403) {
        throw new Error("Minecraft services rejected the Xbox session.");
      }
      throw new Error("Minecraft login failed. Try again in a moment.");
    }
    const login = (await loginResponse.json()) as MinecraftLoginResponse;
    const profileResponse = await fetch(MC_PROFILE_URL, {
      headers: {
        Authorization: `Bearer ${login.access_token}`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(20000),
    });
    if (profileResponse.status === 404) {
      throw new Error(
        "This account does not own Minecraft Java Edition, so it cannot be used here.",
      );
    }
    if (!profileResponse.ok) {
      throw new Error("Minecraft profile lookup failed.");
    }
    const profile = (await profileResponse.json()) as MinecraftProfileResponse;
    const uuid = profile.id;
    const account: AccountSecret = {
      id: uuid,
      username: profile.name,
      uuid,
      xuid: xbox.uhs,
      msAccessToken,
      msRefreshToken,
      msExpiresAt: Date.now() + msExpiresIn * 1000,
      mcAccessToken: login.access_token,
      mcExpiresAt: Date.now() + (login.expires_in ?? 86400) * 1000,
      addedAt: Date.now(),
    };
    const existingIndex = this.secrets.findIndex((secret) => secret.id === uuid);
    if (existingIndex === -1) this.secrets.push(account);
    else this.secrets[existingIndex] = { ...account, addedAt: this.secrets[existingIndex].addedAt };
    this.publicDoc.activeId = uuid;
    await this.persist();
    logger.info("auth", `Signed in as ${account.username}`);
    return {
      id: uuid,
      username: account.username,
      uuid,
      active: true,
      addedAt: account.addedAt,
    };
  }

  private async refreshSecret(secret: AccountSecret): Promise<AccountSecret> {
    const settings = await settingsService.load();
    const clientId = (settings.microsoftClientId || "").trim();
    if (!clientId) throw new Error("No Microsoft client ID configured.");
    const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: secret.msRefreshToken,
        scope: XBOX_SCOPES,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const token = (await tokenResponse.json()) as TokenResponse;
    if (!token.access_token) {
      throw new Error("The Microsoft session expired. Sign in again from Accounts.");
    }
    const xbox = await this.authenticateXbox(token.access_token);
    const loginResponse = await fetch(MC_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ identityToken: `XBL3.0 x=${xbox.uhs};${xbox.token}` }),
      signal: AbortSignal.timeout(20000),
    });
    if (!loginResponse.ok) {
      throw new Error("Minecraft token refresh failed. Sign in again from Accounts.");
    }
    const login = (await loginResponse.json()) as MinecraftLoginResponse;
    const updated: AccountSecret = {
      ...secret,
      msAccessToken: token.access_token,
      msRefreshToken: token.refresh_token || secret.msRefreshToken,
      msExpiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      mcAccessToken: login.access_token,
      mcExpiresAt: Date.now() + (login.expires_in ?? 86400) * 1000,
      xuid: xbox.uhs || secret.xuid,
    };
    const index = this.secrets.findIndex((entry) => entry.id === secret.id);
    if (index !== -1) this.secrets[index] = updated;
    await this.persist();
    return updated;
  }

  async getLaunchSession(id?: string): Promise<LaunchSession> {
    await this.load();
    const targetId = id || this.publicDoc.activeId;
    if (!targetId) {
      throw new Error("Sign in with a Microsoft account before launching.");
    }
    let secret = this.secrets.find((entry) => entry.id === targetId);
    if (!secret) {
      throw new Error("This account has no saved session. Sign in again from Accounts.");
    }
    if (secret.mcExpiresAt - Date.now() < 120000) {
      logger.info("auth", "Refreshing Minecraft session");
      secret = await this.refreshSecret(secret);
    }
    return {
      username: secret.username,
      uuid: secret.uuid,
      accessToken: secret.mcAccessToken,
      xuid: secret.xuid,
      clientId: (await settingsService.load()).microsoftClientId,
    };
  }

  async refresh(id: string): Promise<AccountSummary[]> {
    await this.load();
    const secret = this.secrets.find((entry) => entry.id === id);
    if (!secret) throw new Error("Account not found");
    await this.refreshSecret(secret);
    this.emit("changed", this.list());
    return this.list();
  }

  async validate(id: string): Promise<ApiResult<AccountSummary>> {
    await this.load();
    const secret = this.secrets.find((entry) => entry.id === id);
    if (!secret) return errorResult("Account not found", "NOT_FOUND");
    return {
      ok: true,
      data: {
        id: secret.id,
        username: secret.username,
        uuid: secret.uuid,
        active: secret.id === this.publicDoc.activeId,
        addedAt: secret.addedAt,
      },
    };
  }
}

export const accountService = new AccountService();
