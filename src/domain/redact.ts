export function redactLog(value: string): string {
  return value
    .replace(/(access_token|refresh_token|client_secret|authorization)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]");
}
