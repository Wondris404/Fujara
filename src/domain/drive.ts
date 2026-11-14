export type DriveConnection = "not_connected" | "configured_unverified";

export function driveConnection(input: { clientId?: string; clientSecret?: string }): DriveConnection {
  if (input.clientId && input.clientSecret) return "configured_unverified";
  return "not_connected";
}

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** Fail closed. Missing id, secret, or redirect URI means Drive OAuth stays off. */
export function readGoogleOAuthConfig(env: {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
}): GoogleOAuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export type DriveUploadResult = { fileId: string; name: string; md5Checksum?: string };

/**
 * Multipart upload to the user's own Drive. Caller must pass a user access token
 * obtained by the OAuth code flow. This does not read passwords.
 * Status may be marked verified only when Drive returns a file id.
 */
export async function uploadDriveFile(input: {
  accessToken: string;
  filename: string;
  mime: string;
  bytes: Uint8Array;
  parentId?: string;
  fetchImpl?: typeof fetch;
}): Promise<DriveUploadResult> {
  if (!input.accessToken) throw new Error("Drive is not authorized for this user.");
  const fetchImpl = input.fetchImpl ?? fetch;
  const boundary = "fujara-drive";
  const meta = JSON.stringify({
    name: input.filename,
    mimeType: input.mime,
    parents: input.parentId ? [input.parentId] : undefined,
  });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${input.mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([head, new Uint8Array(input.bytes), tail]);
  const response = await fetchImpl(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,md5Checksum",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!response.ok) {
    throw new Error(`Drive upload failed (${response.status}). Backup status was not marked verified.`);
  }
  const payload = (await response.json()) as { id?: string; name?: string; md5Checksum?: string };
  if (!payload.id) throw new Error("Drive did not return a file id. Backup status was not marked verified.");
  return { fileId: payload.id, name: payload.name ?? input.filename, md5Checksum: payload.md5Checksum };
}

export function safeDriveFilename(title: string, ext: string): string {
  const cleaned = title.replace(/[^\w.\- ()]+/g, "").trim().slice(0, 80) || "track";
  return `${cleaned}.${ext.replace(/^\./, "")}`;
}
