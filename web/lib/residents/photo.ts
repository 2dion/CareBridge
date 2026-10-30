export const PHOTO_BUCKET = "resident-photos";
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function photoInputError(type: string, size: number): string | null {
  if (!PHOTO_MIME_TYPES.includes(type)) return "invalid_photo_type";
  if (size > PHOTO_MAX_BYTES) return "photo_too_large";
  if (size === 0) return "invalid_photo";
  return null;
}

export const PHOTO_ERRORS: Record<string, string> = {
  invalid_photo_type: "JPEG·PNG·WebP 사진을 골라 주세요.",
  photo_too_large: "사진은 3MB 이하로 골라 주세요.",
  invalid_photo: "읽을 수 없는 사진이에요. 다른 사진을 골라 주세요.",
  not_signed_in: "다시 로그인해 주세요.",
  reviewer_only: "관리자(강사)만 사진을 바꿀 수 있어요.",
  resident_not_found: "어르신을 찾을 수 없어요. 화면을 새로 고쳐 주세요.",
  stale_photo: "그사이 사진이 바뀌었어요. 화면을 새로 고친 뒤 다시 해 주세요.",
  photo_save_failed: "사진을 저장하지 못했어요. 다시 시도해 주세요.",
};
