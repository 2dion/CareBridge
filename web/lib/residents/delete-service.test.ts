import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { deleteResident } from "./delete-service";

vi.mock("server-only", () => ({}));

const resident = { id: "resident", org_id: "org", photo_path: "org/resident/a.jpg" };
const request = () => new Request("http://localhost/api/residents/resident", { method: "DELETE" });

function clients(
  options: {
    signedIn?: boolean;
    role?: string;
    visible?: boolean;
    records?: number;
    deleteError?: { code?: string; message: string };
    photo?: string | null;
  } = {},
) {
  const remove = vi.fn(async (...args: unknown[]) => {
    void args;
    return { error: null };
  });
  const deleted = vi.fn();
  const row =
    options.visible === false
      ? null
      : {
          ...resident,
          photo_path: options.photo === undefined ? resident.photo_path : options.photo,
        };
  const chain = (data: unknown, count?: number) => {
    const c = {
      select: () => c,
      eq: () => (count === undefined ? c : Promise.resolve({ count, error: null })),
      maybeSingle: async () => ({ data, error: null }),
    };
    return c;
  };
  // residents는 읽기와 지우기에 같은 모양을 쓴다. 지우기 오류는 delete 뒤 maybeSingle에서 돌려준다
  const residents = () => {
    let mode: "read" | "delete" = "read";
    const c = {
      select: () => c,
      eq: () => c,
      delete: () => {
        deleted();
        mode = "delete";
        return c;
      },
      maybeSingle: async () =>
        mode === "delete"
          ? options.deleteError
            ? { data: null, error: options.deleteError }
            : { data: row ? { id: row.id } : null, error: null }
          : { data: row, error: null },
    };
    return c;
  };
  const user = {
    auth: {
      getUser: async () => ({
        data: { user: options.signedIn === false ? null : { id: "reviewer" } },
        error: null,
      }),
    },
    from: (table: string) =>
      table === "profiles"
        ? chain({ role: options.role ?? "reviewer" })
        : table === "records"
          ? chain(null, options.records ?? 0)
          : residents(),
  } as unknown as SupabaseClient;
  const admin = vi.fn(
    () => ({ storage: { from: () => ({ remove }) } }) as unknown as SupabaseClient,
  );
  return { user, admin, remove, deleted };
}

// 이슈 #103: 기록이 하나도 없는 어르신만 지우고, 사진 파일도 정리한다
describe("deleteResident", () => {
  it("기록이 없으면 지우고 사진 파일을 정리한다", async () => {
    const { user, admin, remove, deleted } = clients();
    const response = await deleteResident(user, admin, "resident", request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, cleanup_pending: false });
    expect(deleted).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith([resident.photo_path]);
  });

  it("사진이 없으면 파일 정리를 부르지 않는다", async () => {
    const { user, admin } = clients({ photo: null });
    const response = await deleteResident(user, admin, "resident", request());
    expect(response.status).toBe(200);
    expect(admin).not.toHaveBeenCalled();
  });

  it("기록이 하나라도 있으면 409 has_records이고 지우지 않는다", async () => {
    const { user, admin, deleted } = clients({ records: 1 });
    const response = await deleteResident(user, admin, "resident", request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("has_records");
    expect(deleted).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  });

  it("그 사이 기록이 생겨 외래 키가 막으면 409 has_records", async () => {
    const { user, admin } = clients({ deleteError: { code: "23503", message: "fk" } });
    const response = await deleteResident(user, admin, "resident", request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("has_records");
    expect(admin).not.toHaveBeenCalled();
  });

  it("작성자는 403 reviewer_only", async () => {
    const { user, admin, deleted } = clients({ role: "worker" });
    const response = await deleteResident(user, admin, "resident", request());
    expect(response.status).toBe(403);
    expect(deleted).not.toHaveBeenCalled();
  });

  it("로그인하지 않았으면 401", async () => {
    const { user, admin } = clients({ signedIn: false });
    expect((await deleteResident(user, admin, "resident", request())).status).toBe(401);
  });

  it("다른 기관이거나 없는 어르신은 404", async () => {
    const { user, admin } = clients({ visible: false });
    expect((await deleteResident(user, admin, "resident", request())).status).toBe(404);
  });

  it("다른 출처의 요청은 403", async () => {
    const { user, admin } = clients();
    const foreign = new Request("http://localhost/api/residents/resident", {
      method: "DELETE",
      headers: { origin: "https://evil.example" },
    });
    expect((await deleteResident(user, admin, "resident", foreign)).status).toBe(403);
  });
});
