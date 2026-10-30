// 화면에 보이는 역할 이름. 역할 값(worker·reviewer)과 권한은 그대로고 글자만 다르다(이슈 #125, #146).
// 교육용 기관(organizations.is_training)에서만 교육생·강사를 쓴다(용어집 v1.0 '사람·기관', 결정 2026-10-25-강사흐름통일).
export type RoleNames = {
  /** 작성자 / 교육생 */
  worker: string;
  /**
   * 조사를 붙인 이름. '교육생'은 받침이 있어 '{worker}가'처럼 붙이면 틀린다(이슈 #178).
   * 작성자가 / 교육생이
   */
  workerSubject: string;
  /** 작성자를 / 교육생을 */
  workerObject: string;
  /** 작성자는 / 교육생은 */
  workerTopic: string;
  /** 작성자로 / 교육생으로 */
  workerAs: string;
  /** người ghi chép / học viên (용어집: 작성자의 베트남어는 따로 정하지 않았고, 교육생은 học viên) */
  workerVi: string;
  /** 관리자 / 강사 */
  reviewer: string;
  /** người quản lý / giảng viên */
  reviewerVi: string;
  /** 교육용 기관이면 화면·인쇄에 '연습용' 표시 */
  training: boolean;
};

export function roleNames(training: boolean): RoleNames {
  return training
    ? {
        worker: "교육생",
        workerSubject: "교육생이",
        workerObject: "교육생을",
        workerTopic: "교육생은",
        workerAs: "교육생으로",
        workerVi: "học viên",
        reviewer: "강사",
        reviewerVi: "giảng viên",
        training: true,
      }
    : {
        worker: "작성자",
        workerSubject: "작성자가",
        workerObject: "작성자를",
        workerTopic: "작성자는",
        workerAs: "작성자로",
        workerVi: "người ghi chép",
        reviewer: "관리자",
        reviewerVi: "người quản lý",
        training: false,
      };
}

/** 로그인 전(A1·A2)처럼 어느 기관인지 모를 때 둘을 함께 말하는 이름(용어집 v1.0: '작성자(교육생)', '관리자(강사)') */
export const ROLE_NAMES_BOTH = {
  worker: "작성자(교육생)",
  workerVi: "người ghi chép (học viên)",
  reviewer: "관리자(강사)",
  reviewerVi: "người quản lý (giảng viên)",
} as const;

/** 모든 화면 상단 띠·인쇄 표시 글자(화면 v1.3 '교육용 기관에서 달라지는 점') */
export const TRAINING_BAND = "연습용 · 합성 사례";
