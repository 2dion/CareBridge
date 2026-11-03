// 코드 이유의 베트남어 고정문. 한국어 원문(ko.ts의 REASONS 값)이 키다.
// 언어를 더하면 같은 모양의 <lang>.ts를 만들고 index.ts의 REASONS_NATIVE에 넣는다(이슈 #259).
// ⚠️ Claude 초안(검수 전). 성별을 정하지 않는 중립 표현을 쓴다.

import { REASONS } from "./ko";

export const REASONS_VI: Record<string, string> = {
  [REASONS.evidenceNotFound]: "Không tìm thấy căn cứ trong lời ghi chú",
  [REASONS.evidenceTooShort]: "Câu làm căn cứ quá ngắn",
  [REASONS.observedWithoutEvidence]: "Không có câu làm căn cứ",
  [REASONS.supportMinutesExceed]: "Tổng thời gian hỗ trợ dài hơn thời gian thăm",
  [REASONS.visitMinutesMissing]: "Không có thời gian thăm để kiểm tra tổng thời gian hỗ trợ",
  [REASONS.realName]: "Có tên thật trong nội dung",
  [REASONS.invalidMinutes]: "Định dạng thời gian hỗ trợ không hợp lệ",
  [REASONS.noReason]: "AI không cung cấp lý do",
  [REASONS.observedWithoutValue]: "Không có nội dung",
  [REASONS.intakeUnknown]: "Chưa xác định được lượng ăn",
  [REASONS.questionInValue]: "Câu yêu cầu xác nhận trong nội dung đã được chuyển sang lý do",
  [REASONS.trendWithoutComparison]:
    "Không có lời so sánh nên không xác định được thay đổi chức năng nhận thức (cải thiện/giữ nguyên/xấu đi)",
  [REASONS.visibleSign]:
    "Thay đổi nhìn thấy trên da/cơ thể (đỏ, vết thương, bầm, sưng...) nên người quản lý cần xác nhận",
  [REASONS.medicationGuess]: "Người ghi chưa trực tiếp xác nhận việc uống thuốc (phỏng đoán)",
  [REASONS.invalidShape]: "Định dạng không hợp lệ",
  [REASONS.autoStop]: "Đã dừng tự động sắp xếp nội dung",
};
