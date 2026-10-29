// 화면에 보이는 역할 이름. 역할 값(worker·reviewer)과 권한은 그대로고 글자만 다르다(이슈 #125).
// 교육용 기관(organizations.is_training)에서만 교육생·강사를 쓴다(용어집 v1.0 '사람·기관', 결정 2026-10-25-강사흐름통일).
export type RoleNames = {
  /** 작성자 / 교육생 */
  worker: string;
  /** 관리자 / 강사 */
  reviewer: string;
  /** người quản lý / giảng viên (용어집: 작성자·교육생은 병기하지 않음) */
  reviewerVi: string;
  /** 교육용 기관이면 화면·인쇄에 '연습용' 표시 */
  training: boolean;
};

export function roleNames(training: boolean): RoleNames {
  return training
    ? { worker: "교육생", reviewer: "강사", reviewerVi: "giảng viên", training: true }
    : { worker: "작성자", reviewer: "관리자", reviewerVi: "người quản lý", training: false };
}

/** 모든 화면 상단 띠·인쇄 표시 글자(화면 v1.3 '교육용 기관에서 달라지는 점') */
export const TRAINING_BAND = "연습용 · 합성 사례";
