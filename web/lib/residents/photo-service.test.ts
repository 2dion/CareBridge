import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { PHOTO_MAX_BYTES } from "./photo";
import { changePhoto, getPhoto, normalizePhoto } from "./photo-service";

vi.mock("server-only", () => ({}));

const resident = { id: "resident", org_id: "org", photo_path: "org/resident/old.jpg" };
const picture = () =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: "#426b55" } })
    .png()
    .toBuffer();

function clients(
  options: {
    signedIn?: boolean;
    role?: string;
    visible?: boolean;
    stale?: boolean;
    cleanupError?: boolean;
    updateError?: boolean;
  } = {},
) {
  const userBucket = {
    download: vi.fn(async () => ({
      data: new Blob([new Uint8Array(await picture())]),
      error: null,
    })),
  };
  const bucket = {
    upload: vi.fn(async (...args: unknown[]) => {
      void args;
      return { error: null };
    }),
    remove: vi.fn(async (...args: unknown[]) => {
      void args;
      return { error: options.cleanupError ? { message: "failed" } : null };
    }),
  };
  const query = (data: unknown, error: unknown = null) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: async () => ({ data, error }),
    };
    return chain;
  };
  const user = {
    auth: {
      getUser: async () => ({
        data: { user: options.signedIn === false ? null : { id: "reviewer" } },
        error: null,
      }),
    },
    from: (table: string) =>
      query(
        table === "profiles"
          ? { role: options.role ?? "reviewer" }
          : options.visible === false
            ? null
            : resident,
      ),
    storage: { from: () => userBucket },
  } as unknown as SupabaseClient;
  const update = vi.fn(() =>
    query(
      options.stale ? null : { id: resident.id },
      options.updateError ? { message: "db failed" } : null,
    ),
  );
  const admin = vi.fn(
    () =>
      ({ from: () => ({ update }), storage: { from: () => bucket } }) as unknown as SupabaseClient,
  );
  return { user, admin, bucket, userBucket, update };
}

function request(bytes: Uint8Array = new Uint8Array([0]), type = "image/png") {
  return new Request("https://carebridge.test/api/residents/resident/photo", {
    method: "POST",
    headers: { "Content-Type": type },
    body: bytes as BodyInit,
  });
}

describe("사진 서버 경계", () => {
  it("로그인·관리자·기관 권한을 먼저 검사하고 서버 키를 사용하지 않는다", async () => {
    for (const [options, status] of [
      [{ signedIn: false }, 401],
      [{ role: "worker" }, 403],
      [{ visible: false }, 404],
    ] as const) {
      const c = clients(options);
      expect((await changePhoto(c.user, c.admin, resident.id, request())).status).toBe(status);
      expect(c.admin).not.toHaveBeenCalled();
    }
  });

  it("다른 출처 요청은 거절한다", async () => {
    const c = clients();
    const req = request();
    req.headers.set("origin", "https://other.test");
    expect((await changePhoto(c.user, c.admin, resident.id, req)).status).toBe(403);
    expect(c.admin).not.toHaveBeenCalled();
  });

  it("허위 MIME·해독 불가 파일과 크기 제한 없는 스트림을 차단한다", async () => {
    const c = clients();
    expect(
      (await changePhoto(c.user, c.admin, resident.id, request(undefined, "text/html"))).status,
    ).toBe(415);
    expect((await changePhoto(c.user, c.admin, resident.id, request())).status).toBe(400);
    expect(
      (
        await changePhoto(
          c.user,
          c.admin,
          resident.id,
          request(new Uint8Array(PHOTO_MAX_BYTES + 1)),
        )
      ).status,
    ).toBe(413);
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );
    expect((await changePhoto(c.user, c.admin, resident.id, request(svg))).status).toBe(400);
    expect(c.admin).not.toHaveBeenCalled();
  });

  it("사진을 JPEG로 다시 쓰고 EXIF·GPS를 제거하며 최대 512px로 줄인다", async () => {
    const source = await sharp({
      create: { width: 1024, height: 800, channels: 3, background: "red" },
    })
      .withExif({ IFD0: { Artist: "Synthetic fixture" } })
      .jpeg()
      .toBuffer();
    const result = await normalizePhoto(source);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(512);
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("새 사진 저장 뒤 DB 현재 경로를 바꾸고 옛 파일을 지운다", async () => {
    const c = clients();
    const response = await changePhoto(c.user, c.admin, resident.id, request(await picture()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, cleanup_pending: false });
    expect(c.bucket.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^org\/resident\/.+\.jpg$/),
      expect.any(Buffer),
      { contentType: "image/jpeg", upsert: false },
    );
    expect(c.bucket.remove).toHaveBeenCalledWith([resident.photo_path]);
  });

  it("동시 변경·DB 저장 실패면 새 파일을 회수하고 기존 사진을 지우지 않는다", async () => {
    for (const [options, status] of [
      [{ stale: true }, 409],
      [{ updateError: true }, 500],
    ] as const) {
      const c = clients(options);
      expect(
        (await changePhoto(c.user, c.admin, resident.id, request(await picture()))).status,
      ).toBe(status);
      const newPath = c.bucket.upload.mock.calls[0]?.[0];
      expect(c.bucket.remove).toHaveBeenCalledWith([newPath]);
      expect(c.bucket.remove).not.toHaveBeenCalledWith([resident.photo_path]);
    }
  });

  it("삭제 정리 실패를 숨기지 않으며 현재 경로를 비운다", async () => {
    const c = clients({ cleanupError: true });
    const response = await changePhoto(c.user, c.admin, resident.id, request(), true);
    expect(await response.json()).toEqual({ ok: true, cleanup_pending: true });
    expect(c.update).toHaveBeenCalledWith({ photo_path: null });
    expect(c.bucket.upload).not.toHaveBeenCalled();
  });

  it("읽기는 사용자 권한을 사용하고 응답 캐시·공개 URL을 만들지 않는다", async () => {
    const c = clients();
    const response = await getPhoto(c.user, resident.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(c.userBucket.download).toHaveBeenCalledWith(resident.photo_path);
    expect(c.admin).not.toHaveBeenCalled();
    const other = clients({ visible: false });
    expect((await getPhoto(other.user, resident.id)).status).toBe(404);
    expect(other.userBucket.download).not.toHaveBeenCalled();
  });
});
