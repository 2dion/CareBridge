import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { PHOTO_BUCKET, PHOTO_MAX_BYTES, photoInputError } from "./photo";

type ResidentPhoto = { id: string; org_id: string; photo_path: string | null };
const fail = (status: number, error: string) => Response.json({ error }, { status });

async function access(client: SupabaseClient, id: string, write: boolean) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return fail(401, "not_signed_in");
  if (write) {
    const { data: me } = await client
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (me?.role !== "reviewer") return fail(403, "reviewer_only");
  }
  const { data, error } = await client
    .from("residents")
    .select("id, org_id, photo_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(500, "photo_save_failed");
  if (!data) return fail(404, "resident_not_found");
  return data as ResidentPhoto;
}

/** Limit actual bytes even if Content-Length is missing or forged. */
async function readImage(request: Request): Promise<Uint8Array | Response> {
  const error = photoInputError(
    request.headers.get("content-type") ?? "",
    Number(request.headers.get("content-length") ?? 1),
  );
  if (error)
    return fail(
      error === "photo_too_large" ? 413 : error === "invalid_photo_type" ? 415 : 400,
      error,
    );
  if (!request.body) return fail(400, "invalid_photo");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > PHOTO_MAX_BYTES) {
        await reader.cancel();
        return fail(413, "photo_too_large");
      }
      chunks.push(value);
    }
  } catch {
    return fail(400, "invalid_photo");
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function normalizePhoto(input: Uint8Array): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: 12_000_000, failOn: "warning" });
  const meta = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1)
    throw new Error("invalid_photo");
  // Re-encode (no keepMetadata): strip EXIF/GPS and original filenames.
  return image
    .rotate()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function getPhoto(client: SupabaseClient, id: string) {
  const resident = await access(client, id, false);
  if (resident instanceof Response) return resident;
  if (!resident.photo_path) return fail(404, "photo_not_found");
  const { data, error } = await client.storage.from(PHOTO_BUCKET).download(resident.photo_path);
  if (error || !data) return fail(404, "photo_not_found");
  return new Response(data, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function changePhoto(
  client: SupabaseClient,
  admin: () => SupabaseClient,
  id: string,
  request: Request,
  remove = false,
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail(403, "reviewer_only");
  const resident = await access(client, id, true);
  if (resident instanceof Response) return resident;
  let bytes: Buffer | null = null;
  if (!remove) {
    const input = await readImage(request);
    if (input instanceof Response) return input;
    try {
      bytes = await normalizePhoto(input);
    } catch {
      return fail(400, "invalid_photo");
    }
  }
  const server = admin(); // Only after user-client authorization and byte validation.
  const bucket = server.storage.from(PHOTO_BUCKET);
  const path = bytes ? `${resident.org_id}/${resident.id}/${randomUUID()}.jpg` : null;
  if (path && bytes) {
    const { error } = await bucket.upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) return fail(500, "photo_save_failed");
  }
  let query = server
    .from("residents")
    .update({ photo_path: path })
    .eq("id", resident.id)
    .eq("org_id", resident.org_id);
  query = resident.photo_path
    ? query.eq("photo_path", resident.photo_path)
    : query.is("photo_path", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) {
    if (path) await bucket.remove([path]);
    return fail(error ? 500 : 409, error ? "photo_save_failed" : "stale_photo");
  }
  const cleanup = resident.photo_path ? await bucket.remove([resident.photo_path]) : null;
  return Response.json({ ok: true, cleanup_pending: Boolean(cleanup?.error) });
}
