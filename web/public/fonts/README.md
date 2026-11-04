# PDF 한국어 글꼴

- 글꼴: Noto Sans KR Regular, Google Fonts 공식 배포본에서 굵기 400을 고정한 TrueType.
- 원문: https://github.com/google/fonts/tree/main/ofl/notosanskr
- 파일: `NotoSansKR[wght].ttf`를 FontTools 4.67.0 `varLib.instancer ... wght=400`으로 고정해 `noto-sans-kr.ttf`로 보관.
- 라이선스: 같은 폴더의 `ofl.txt`(SIL Open Font License 1.1).
- 기록 PDF에 고정 글꼴 전체를 포함하며 외부 폰트 서버를 호출하지 않습니다. CJK 글꼴 부분 포함(subset)에서 생기는 뷰어별 글자 누락을 피하기 위한 선택입니다.

- PDF에서는 `calt`(문맥 대체)를 끄고 기본 공백을 씁니다. 한글 사이 대체 공백은 전체 포함 PDF의 폭 표·문자 대응에 없어 측정 폭과 출력 폭이 달라집니다(이슈 #274). 글꼴 파일은 바꾸지 않습니다.
