"use client";

import { useEffect, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import type { Resident } from "@/lib/demo/store";
import { PHOTO_ERRORS, photoInputError } from "@/lib/residents/photo";

export function ResidentPhoto({ resident, size = 44 }: { resident: Resident; size?: number }) {
  const demo = useDemo();
  const src = resident.photoPath
    ? demo?.real
      ? `/api/residents/${resident.id}/photo?v=${encodeURIComponent(resident.photoPath.split("/").at(-1) ?? "")}`
      : resident.photoPath
    : null;
  return <PhotoImage key={src ?? "none"} src={src} name={resident.name} size={size} />;
}

function PhotoImage({ src, name, size }: { src: string | null; name: string; size: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#e8f0ec",
        color: "#345c49",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
      }}
    >
      {src && !failed ? (
        // Authenticated API, deliberately bypass Next image optimizer and shared image caches.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${name} 사진`}
          width={size}
          height={size}
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={`${name} 사진 없음`}>{[...name][0] || "?"}</span>
      )}
    </span>
  );
}

export type PhotoChange = File | "remove" | null;

export function PhotoPicker({
  resident,
  value,
  onChange,
  disabled = false,
}: {
  resident?: Resident;
  value: PhotoChange;
  onChange: (value: PhotoChange) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);
  return (
    <div style={{ margin: "16px 0" }}>
      <p className="flabel">어르신 사진 (선택)</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {value instanceof File && preview ? (
          <PhotoImage key={preview} src={preview} name="선택한" size={64} />
        ) : value !== "remove" && resident ? (
          <ResidentPhoto resident={resident} size={64} />
        ) : (
          <PhotoImage src={null} name="어르신" size={64} />
        )}
        <label>
          <span>사진 선택</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                const issue = photoInputError(file.type, file.size);
                setError(issue ? PHOTO_ERRORS[issue] : "");
                if (!issue) {
                  setPreview(URL.createObjectURL(file));
                  onChange(file);
                }
              }
              event.target.value = "";
            }}
          />
        </label>
        {(value instanceof File || (resident?.photoPath && value !== "remove")) && (
          <button
            type="button"
            className="dbtn sm"
            disabled={disabled}
            onClick={() => onChange(resident?.photoPath ? "remove" : null)}
          >
            사진 삭제
          </button>
        )}
        {value !== null && (
          <button
            type="button"
            className="text-link"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            사진 변경 취소
          </button>
        )}
      </div>
      <p className="fhint">
        JPEG·PNG·WebP, 3MB 이하. 대상 확인용이며 AI에는 보내지 않아요. 시연에는 합성 사진만 써
        주세요.
      </p>
      {error && (
        <p role="alert" className="warn-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** Actual uploads go through server validation; Mock is handled separately with synthetic previews. */
export async function saveResidentPhoto(
  residentId: string,
  change: PhotoChange,
): Promise<{ error?: string; cleanupPending?: boolean }> {
  if (!change) return {};
  try {
    const response = await fetch(
      `/api/residents/${residentId}/photo`,
      change === "remove"
        ? { method: "DELETE" }
        : { method: "POST", headers: { "Content-Type": change.type }, body: change },
    );
    const body = await response.json();
    if (!response.ok) return { error: PHOTO_ERRORS[body.error] ?? PHOTO_ERRORS.photo_save_failed };
    return { cleanupPending: body.cleanup_pending };
  } catch {
    return { error: "인터넷 연결을 확인하고 다시 시도해 주세요." };
  }
}
