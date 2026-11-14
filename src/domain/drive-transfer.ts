export type DriveFileRef = { fileId: string; name: string; md5Checksum?: string };

type FetchLike = typeof fetch;

async function readError(response: Response): Promise<string> {
  return `Drive request failed (${response.status}).`;
}

export async function ensureFujaraFolder(accessToken: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const query = encodeURIComponent("name = 'Fujara' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const listed = await fetchImpl(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listed.ok) throw new Error(await readError(listed));
  const body = (await listed.json()) as { files?: { id?: string }[] };
  if (body.files?.[0]?.id) return body.files[0].id;
  const created = await fetchImpl("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Fujara", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!created.ok) throw new Error(await readError(created));
  const folder = (await created.json()) as { id?: string };
  if (!folder.id) throw new Error("Drive did not return a folder id.");
  return folder.id;
}

/** Resumable upload. Bytes go to Google, not to the Fujara server. */
export async function uploadResumable(input: {
  accessToken: string;
  filename: string;
  mime: string;
  bytes: Uint8Array;
  parentId: string;
  fetchImpl?: FetchLike;
}): Promise<DriveFileRef> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const session = await fetchImpl("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,md5Checksum", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mime,
      "X-Upload-Content-Length": String(input.bytes.byteLength),
    },
    body: JSON.stringify({ name: input.filename, mimeType: input.mime, parents: [input.parentId] }),
  });
  if (!session.ok) throw new Error(await readError(session));
  const location = session.headers.get("location");
  if (!location) throw new Error("Drive did not return an upload session.");
  const last = Math.max(input.bytes.byteLength - 1, 0);
  const put = await fetchImpl(location, {
    method: "PUT",
    headers: {
      "Content-Length": String(input.bytes.byteLength),
      "Content-Range": `bytes 0-${last}/${input.bytes.byteLength}`,
    },
    body: new Blob([new Uint8Array(input.bytes)]),
  });
  if (!put.ok) throw new Error(await readError(put));
  const payload = (await put.json()) as { id?: string; name?: string; md5Checksum?: string };
  if (!payload.id) throw new Error("Drive did not return a file id. Backup status was not marked verified.");
  return { fileId: payload.id, name: payload.name ?? input.filename, md5Checksum: payload.md5Checksum };
}

export async function downloadDriveBytes(accessToken: string, fileId: string, fetchImpl: FetchLike = fetch): Promise<Uint8Array> {
  if (!/^[\w-]+$/.test(fileId)) throw new Error("Invalid Drive file id.");
  const response = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) throw new Error("Drive file is missing.");
  if (response.status === 401 || response.status === 403) throw new Error("Drive permission expired. Connect Drive again.");
  if (!response.ok) throw new Error(await readError(response));
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteDriveFile(accessToken: string, fileId: string, fetchImpl: FetchLike = fetch): Promise<void> {
  if (!/^[\w-]+$/.test(fileId)) throw new Error("Invalid Drive file id.");
  const response = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return;
  if (!response.ok && response.status !== 204) throw new Error(await readError(response));
}
