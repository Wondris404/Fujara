export type BackupMark = "absent" | "verified";

export function backupMarkFromUpload(result: { fileId?: string } | null): BackupMark {
  if (result?.fileId) return "verified";
  return "absent";
}

export type DeletionKind = "remove-local" | "remove-library" | "delete-drive" | "forget-ref";

export type DeletionResult = {
  kind: DeletionKind;
  keepsLibrary: boolean;
  keepsAudio: boolean;
  keepsDriveFile: boolean;
  keepsBackupRef: boolean;
};

export function deletionOutcome(kind: DeletionKind): DeletionResult {
  if (kind === "remove-local") return { kind, keepsLibrary: true, keepsAudio: false, keepsDriveFile: true, keepsBackupRef: true };
  if (kind === "remove-library") return { kind, keepsLibrary: false, keepsAudio: false, keepsDriveFile: true, keepsBackupRef: true };
  if (kind === "delete-drive") return { kind, keepsLibrary: true, keepsAudio: true, keepsDriveFile: false, keepsBackupRef: false };
  return { kind: "forget-ref", keepsLibrary: true, keepsAudio: true, keepsDriveFile: true, keepsBackupRef: false };
}

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function googleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_FILE_SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** PKCE verifier is 64 unreserved characters. Challenge is SHA-256, base64url, method S256. */
export async function pkceS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function newPkceVerifier(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}
