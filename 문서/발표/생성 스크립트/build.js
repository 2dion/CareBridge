// 케어브릿지 최종 발표 PPT 생성기 (pptxgenjs)
// 사용: node build.js [out.pptx] [--qa]   (--qa: Pretendard 대신 Noto Sans KR로 렌더링 확인용)
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Md = require('react-icons/md');
const Si = require('react-icons/si');
const { applyTheme } = require(path.join(process.env.SKILL_DIR, 'scripts', 'apply_theme.js'));

const OUT = process.argv[2] || 'carebridge.pptx';
const QA = process.argv.includes('--qa');

// ---------- 색 ----------
const G1 = '1F614A', BG = 'F6F6F6', G2 = '37CB86', TEAL = '20BDAD', BLUE = '1187CF', GRAY = '595959', BLACK = '000000', WHITE = 'FFFFFF';
const G1_T = 'E3F0EA', G2_T = 'DDF5E8', TEAL_T = 'DDF4F2', BLUE_T = 'DCEDF8', GRAY_T = 'E8E8E8', LINE = 'D9D9D9', MUTE = '8C8C8C';

// ---------- 글꼴 ----------
function fnt(w) {
  if (QA) return { fontFace: w === 'M' ? 'Noto Sans KR Medium' : 'Noto Sans KR', bold: w === 'B' };
  return { fontFace: 'Pretendard ' + ({ R: 'Regular', M: 'Medium', B: 'Bold' })[w], bold: false };
}
const BODY_FONT = QA ? 'Noto Sans KR Medium' : 'Pretendard Medium';
const HEAD_FONT = QA ? 'Noto Sans KR' : 'Pretendard Bold';

// ---------- 아이콘 ----------
const iconCache = {};
async function iconPng(Icon, color, size = 256) {
  const key = Icon.name + color + size;
  if (iconCache[key]) return iconCache[key];
  const svg = renderToStaticMarkup(React.createElement(Icon, { color: '#' + color, size }));
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  iconCache[key] = 'image/png;base64,' + buf.toString('base64');
  return iconCache[key];
}
function imgData(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return `image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(file).toString('base64');
}

// 장식 삼각형 (템플릿 본문 장 왼쪽 아래)
async function trianglePng() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
    <polygon points="0,520 240,110 480,520" fill="#1f614a" fill-opacity="0.05"/>
    <polygon points="430,140 530,320 330,320" fill="#1f614a" fill-opacity="0.12"/>
    <polygon points="370,430 470,520 270,520" fill="#1f614a" fill-opacity="0.12"/>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}

(async () => {
  const pres = new pptxgen();
  pres.defineLayout({ name: 'CB', width: 20, height: 11.25 });
  pres.layout = 'CB';
  pres.author = '케어브릿지 팀';
  pres.title = '케어브릿지 최종 발표';
  pres.theme = { headFontFace: HEAD_FONT, bodyFontFace: BODY_FONT };
  const THEME = {
    name: 'CareBridge', headFontFace: HEAD_FONT, bodyFontFace: BODY_FONT,
    colors: { dk1: BLACK, lt1: WHITE, dk2: G1, lt2: BG, accent1: G2, accent2: TEAL, accent3: BLUE, accent4: GRAY, accent5: G1, accent6: '7FDBB0', hlink: BLUE, folHlink: TEAL },
  };

  const SH = pres.shapes;
  const whiteLogo = imgData('logo_white.png');
  const greenLogo = imgData('logo.png');
  const tri = await trianglePng();

  // ---------- 레이아웃 ----------
  pres.defineSlideMaster({
    title: 'CONTENT', background: { color: BG },
    objects: [
      { rect: { x: -0.02, y: -0.02, w: 3.05, h: 11.3, fill: { color: G1 } } },
      { image: { x: 0.625, y: 0.125, w: 1.736, h: 1.736, data: whiteLogo } },
      { image: { x: 2.2, y: 8.0, w: 5.0, h: 3.25, data: tri } },
    ],
    slideNumber: { x: 19.0, y: 10.45, w: 0.7, h: 0.33, fontSize: 16, color: GRAY, fontFace: QA ? 'Noto Sans KR' : 'Pretendard Regular', align: 'right' },
  });
  pres.defineSlideMaster({ title: 'COVER', background: { color: G1 }, objects: [] });

  // ---------- 공통 그리기 ----------
  function T(s, text, x, y, w, h, o = {}) {
    const wgt = o.weight || 'M'; delete o.weight;
    s.addText(text, Object.assign({ x, y, w, h, isTextBox: true, margin: 0, valign: 'top', align: 'left', color: BLACK, fontSize: 18 }, fnt(wgt), o));
  }
  // 여러 서식 묶음: [[text, {weight, ...}], ...]
  function R(arr) {
    return arr.map(([text, o = {}]) => { const w = o.weight || 'M'; const oo = Object.assign({}, o); delete oo.weight; return { text, options: Object.assign({}, fnt(w), oo) }; });
  }
  function rect(s, x, y, w, h, fill, o = {}) {
    s.addShape(o.round === false ? SH.RECTANGLE : SH.ROUNDED_RECTANGLE, Object.assign({ x, y, w, h, fill: { color: fill }, line: { color: o.line || fill, width: o.lw || 0.5, dashType: o.dash || 'solid' }, rectRadius: o.r ?? 0.12 }, o.shadow ? { shadow: { type: 'outer', color: '000000', blur: 8, offset: 2, angle: 90, opacity: 0.10 } } : {}));
  }
  function card(s, x, y, w, h, o = {}) { rect(s, x, y, w, h, o.fill || WHITE, Object.assign({ shadow: true, line: o.line || o.fill || WHITE }, o)); }
  function dashed(s, x, y, w, h, label, o = {}) {
    s.addShape(SH.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: o.fill || WHITE }, line: { color: 'A6A6A6', width: 1.5, dashType: 'dash' }, rectRadius: o.r ?? 0.12 });
    T(s, label, x + 0.2, y, w - 0.4, h, { align: 'center', valign: 'middle', color: MUTE, fontSize: o.fontSize || 16 });
  }
  function hline(s, x, y, w, color = LINE, width = 1) { s.addShape(SH.LINE, { x, y, w, h: 0, line: { color, width } }); }
  function vline(s, x, y, h, color = LINE, width = 1) { s.addShape(SH.LINE, { x, y, w: 0, h, line: { color, width } }); }
  async function icon(s, Icon, x, y, d, iconColor, circleFill) {
    if (circleFill) s.addShape(SH.OVAL, { x, y, w: d, h: d, fill: { color: circleFill }, line: { color: circleFill, width: 0.5 } });
    const pad = circleFill ? d * 0.22 : 0;
    s.addImage({ data: await iconPng(Icon, iconColor), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
  }
  function arrowR(s, x, y, w, h, color = 'BFBFBF') { s.addShape(SH.RIGHT_ARROW, { x, y, w, h, fill: { color }, line: { color, width: 0.5 } }); }
  function chip(s, text, x, y, w, h, fill, color = WHITE, o = {}) {
    rect(s, x, y, w, h, fill, { r: o.r ?? 0.25, line: o.line || fill });
    T(s, text, x, y, w, h, Object.assign({ align: 'center', valign: 'middle', color, fontSize: o.fontSize || 15, weight: o.weight || 'B' }, o.text || {}));
  }
  const NAV = ['팀 소개', '문제 정의', '서비스 및 기술 구현', '검증 및 향후 과제'];
  const NAV_Y = [2.764, 3.944, 5.028, 6.18];
  function frame(title, active, notes, o = {}) {
    const s = pres.addSlide({ masterName: 'CONTENT' });
    NAV.forEach((n, i) => {
      const on = i === active;
      T(s, n, 0.82, NAV_Y[i], 2.2, 0.375, { fontSize: 18, weight: 'R', valign: 'middle', color: on ? WHITE : 'DDF3DE', transparency: on ? 0 : 44 });
      s.addShape(SH.RECTANGLE, { x: 0.82, y: NAV_Y[i] + 0.5, w: 2.19, h: 0.035, fill: { color: on ? WHITE : 'DDF3DE', transparency: on ? 0 : 44 }, line: { color: on ? WHITE : 'DDF3DE', width: 0 } });
    });
    const big = title.length > 15 ? 48 : 60;
    T(s, title, 3.92, 0.39, 15.5, 1.19, { fontSize: o.titleSize || big, weight: 'B', color: G1, valign: 'middle' });
    if (notes) s.addNotes(notes);
    return s;
  }
  function sub(s, text, x, y, tag) {
    s.addShape(SH.RECTANGLE, { x: x - 0.14, y: y + 0.08, w: 0.1, h: 0.52, fill: { color: GRAY }, line: { color: GRAY, width: 0 } });
    T(s, text, x + 0.12, y, 9, 0.68, { fontSize: 34.8, weight: 'B', color: BLACK, valign: 'middle' });
    if (tag) T(s, tag, x + 0.12 + text.length * 0.43 + 0.2, y + 0.1, 2.5, 0.5, { fontSize: 16, weight: 'R', color: MUTE, valign: 'middle' });
  }
  function placeholderSlide(title, body, notes) {
    const s = frame(title, -1, notes);
    dashed(s, 3.92, 2.4, 15.48, 8.0, body, { fontSize: 24 });
    return s;
  }

  // =====================================================================
  // 1. 표지
  // =====================================================================
  {
    const s = pres.addSlide({ masterName: 'COVER' });
    s.addImage({ data: tri, x: 14.4, y: 7.6, w: 6.4, h: 4.2, transparency: 60 });
    s.addImage({ data: whiteLogo, x: 2.0, y: 2.55, w: 6.0, h: 6.0 });
    T(s, '코디세이 최종 발표', 9.0, 3.05, 9.5, 0.55, { fontSize: 24, weight: 'R', color: WHITE, transparency: 25 });
    s.addText(R([['케어브릿지 ', { weight: 'B', fontSize: 72, color: WHITE }], ['CareBridge', { weight: 'B', fontSize: 44, color: G2 }]]), { x: 9.0, y: 3.65, w: 10.5, h: 1.4, isTextBox: true, margin: 0, valign: 'middle' });
    T(s, '외국인 요양보호사를 위한 AI 돌봄 기록 지원 서비스', 9.0, 5.15, 10.5, 0.7, { fontSize: 30, weight: 'M', color: WHITE });
    hline(s, 9.0, 6.25, 3.0, G2, 2);
    T(s, '[팀 이름]  ·  2026.11.12', 9.0, 6.5, 9.5, 0.6, { fontSize: 24, weight: 'R', color: WHITE, transparency: 15 });
    // AI 로봇 캐릭터 자리 (이미지 미전달 → 아이콘으로 임시)
    await icon(s, Md.MdSmartToy, 16.4, 7.3, 1.9, G1, G2);
    T(s, 'AI 도우미', 15.9, 9.3, 2.9, 0.4, { fontSize: 16, weight: 'R', color: WHITE, align: 'center', transparency: 25 });
    s.addNotes('팀 이름과 서비스 이름만 말하고 목차로 넘어갑니다. (5초)');
  }

  // =====================================================================
  // 2. 목차
  // =====================================================================
  {
    const s = frame('목차', -1, '목차의 큰제목은 각 장의 큰제목과 글자가 같습니다. (10초)');
    const toc = [
      ['01', '팀 소개', [['팀 구성 및 추진 일정', 3]]],
      ['02', '문제 정의', [['추진 배경 및 문제 정의', 4], ['타깃 사용자 및' + String.fromCharCode(10) + '기존 서비스 한계', 5]]],
      ['03', '서비스 및 기술 구현', [['솔루션 개요', 6], ['핵심 기능', 7], ['서비스 시연', 8], ['AI 적용 방안', 9], ['시스템 구성', 10]]],
      ['04', '검증 및 향후 과제', [['검증 결과', 11], ['기대 효과 및 확장 계획', 12]]],
    ];
    const w = 3.6, gap = 0.36;
    toc.forEach(([num, name, items], i) => {
      const x = 3.92 + i * (w + gap), y = 2.2, h = 6.4;
      card(s, x, y, w, h);
      T(s, num, x + 0.35, y + 0.3, 2, 0.9, { fontSize: 48, weight: 'B', color: G2 });
      T(s, name, x + 0.35, y + 1.25, w - 0.6, 0.6, { fontSize: 24, weight: 'B', color: G1 });
      hline(s, x + 0.35, y + 1.95, w - 0.7, LINE);
      items.forEach(([t, p], j) => {
        T(s, t, x + 0.35, y + 2.2 + j * 0.62, w - 1.1, 0.5, { fontSize: 17, weight: 'M', color: BLACK, valign: 'middle', lineSpacingMultiple: 0.95 });
        T(s, String(p).padStart(2, '0'), x + w - 0.85, y + 2.2 + j * 0.62, 0.5, 0.5, { fontSize: 15, weight: 'R', color: MUTE, align: 'right', valign: 'middle' });
      });
    });
    card(s, 3.92, 9.0, 15.48, 1.2, { fill: G1_T, line: G1_T });
    s.addText(R([['부록  ', { weight: 'B', fontSize: 22, color: G1 }], ['14쪽부터  ·  서비스 설계 / 기술 구조 / 검증 / 운영 및 개발', { weight: 'M', fontSize: 18, color: BLACK }]]), { x: 4.3, y: 9.0, w: 14.8, h: 1.2, isTextBox: true, margin: 0, valign: 'middle' });
  }

  // =====================================================================
  // 3. 팀 구성 및 추진 일정
  // =====================================================================
  {
    const s = frame('01 팀 구성 및 추진 일정', 0,
      `첫 문장: "1주 개발·1주 검증 후 공모전 제출, 코디세이 과정에서 고도화" (55초)
역할 6개 → 일정 → 협업 기록·사례 순서로 말합니다.
"10월 2일 킥오프 뒤 17일 개발을 시작해 23일에 기능 추가를 마감하고, 한 주 동안 테스트·검증을 거쳐 10월 31일 공모전에 제출했습니다. 이후 코디세이 과정에서 고도화해 11월 8일 최종 제출했습니다."
"모든 작업을 이슈와 PR로 남겼습니다. 예를 들어 QA가 몽골어 기록에서 식사 항목이 계속 '확인 필요'로 나오는 것을 찾았고, 백엔드가 AI 실행 기록을 보고 모국어 낱말 검색이 늘 비어 있던 원인을 찾아 고쳤고, QA가 네 언어로 다시 확인했습니다."
PR 승인은 0명 규칙이라 '코드 리뷰'라고 말하지 않습니다. 자동 검사와 사람 검토(이슈 토론·담당 간 재확인)를 나눠 말합니다.
숫자 출처는 main-codyssey 11/06 조사입니다. 이슈 125개 중 120개가 닫혔습니다.
팀원별 기여와 사례 두 개는 부록 A8-1·A8-2에 있습니다.`);
    sub(s, '팀 구성', 3.92, 1.8);
    sub(s, '추진 일정', 11.9, 1.8);
    const roles = [
      ['PM', '일정·결정 관리, 이슈 운영·공통 기준', G1],
      ['Planning', '화면 설계·용어집, 시나리오·발표 자료', G1],
      ['Backend', 'DB·API, AI Agent·인쇄 서식', BLUE],
      ['Frontend', '작성자·관리자 화면, 다국어 화면 문구', BLUE],
      ['QA', '테스트 계획, AI 품질 측정', TEAL],
      ['Data', '용어·번역 데이터, 교재·합성 사례', TEAL],
    ];
    roles.forEach(([r, job, c], i) => {
      const y = 2.6 + i * 0.74;
      card(s, 3.92, y, 7.5, 0.62, { shadow: false, line: LINE });
      chip(s, r, 4.02, y + 0.09, 1.5, 0.44, c, WHITE, { fontSize: 15, r: 0.15 });
      T(s, '[이름]', 5.7, y, 1.3, 0.62, { fontSize: 16, weight: 'R', color: MUTE, valign: 'middle' });
      T(s, job, 7.0, y, 4.3, 0.62, { fontSize: 16, weight: 'M', color: BLACK, valign: 'middle' });
    });
    const sched = [['10.02', 'Kick-off'], ['10.17', '개발 착수'], ['10.23', '기능 추가 마감'], ['10.24~30', '테스트·검증'], ['10.31', '공모전 제출', 1], ['11.01~07', '고도화'], ['11.08', '최종 제출', 1], ['11.12', '최종 발표', 1]];
    const lx = 13.75;
    vline(s, lx, 2.75, 7 * 0.57, 'C9D6CF', 2);
    sched.forEach(([d, st, hi], i) => {
      const y = 2.6 + i * 0.57;
      T(s, d, 11.9, y, 1.6, 0.4, { fontSize: 16, weight: 'B', color: hi ? G1 : GRAY, align: 'right', valign: 'middle' });
      s.addShape(SH.OVAL, { x: lx - 0.11, y: y + 0.09, w: 0.22, h: 0.22, fill: { color: hi ? G2 : WHITE }, line: { color: hi ? G2 : G1, width: 2 } });
      T(s, st, 14.15, y, 5.2, 0.4, { fontSize: 16, weight: hi ? 'B' : 'M', color: BLACK, valign: 'middle' });
    });
    sub(s, '협업 기록', 3.92, 7.3);
    const stats = [['438', '커밋'], ['125', '이슈'], ['237', 'PR'], ['82', '결정 기록']];
    stats.forEach(([n, l], i) => {
      const x = 3.92 + i * 1.9;
      card(s, x, 8.05, 1.75, 1.75);
      T(s, n, x, 8.2, 1.75, 0.85, { fontSize: 36, weight: 'B', color: G1, align: 'center', valign: 'middle' });
      T(s, l, x, 9.05, 1.75, 0.5, { fontSize: 15, weight: 'R', color: GRAY, align: 'center' });
    });
    T(s, '2026.11.06 기준', 3.92, 9.9, 7.5, 0.4, { fontSize: 13, weight: 'R', color: MUTE });
    card(s, 11.9, 8.05, 7.5, 2.25, { fill: G1_T, line: G1_T, shadow: false });
    s.addText(R([['함께 해결한 사례  ', { weight: 'B', fontSize: 16, color: G1 }], ['#315 → #363', { weight: 'R', fontSize: 14, color: MUTE }]]), { x: 12.15, y: 8.15, w: 7.0, h: 0.45, isTextBox: true, margin: 0, valign: 'middle' });
    const steps = [['QA', "몽골어 식사\n'확인 필요' 발견", TEAL], ['BE', '실행 기록 분석\n용어 검색 수정', BLUE], ['QA·BE', '네 언어\n재확인', G1]];
    steps.forEach(([who, what, c], i) => {
      const x = 12.15 + i * 2.45;
      chip(s, who, x, 8.72, 1.0, 0.38, c, WHITE, { fontSize: 13, r: 0.12 });
      T(s, what, x, 9.18, 2.1, 0.95, { fontSize: 14, weight: 'M', color: BLACK, lineSpacingMultiple: 1.1 });
      if (i < 2) arrowR(s, x + 2.05, 8.78, 0.32, 0.26, 'A6B8AF');
    });
  }

  // =====================================================================
  // 4. 추진 배경 및 문제 정의
  // =====================================================================
  {
    const s = frame('02 추진 배경 및 문제 정의', 1,
      `첫 문장: "제도는 열렸으나, 현장의 벽은 한국어 소통과 기록" (55초)
추진 배경은 10초 안에 지나가고, 문제 정의에서 왼쪽 → 오른쪽으로 모읍니다.
"돌봄이 필요한 어르신은 2020년 86만 명에서 지난해 124만 명으로 늘었고, 정부는 외국인 요양보호사의 길을 열었습니다. 그런데 현장 요양보호사들이 외국인 확대에 반대한 이유 1위는 업무 및 소통 미숙에 대한 우려였습니다. 저희가 만난 교육기관 원장님도 가장 큰 벽으로 한국어와 요양 용어를 꼽았습니다. 돌봄 기록은 '적게 드심'이 아니라 '세 숟갈 드심'처럼 구체적인 한국어로 써야 하는데, 바로 여기서 막힙니다. 그래서 저희는 문제를 '한국어·요양 용어의 벽이 정확한 돌봄 기록을 막고, 현장의 소통 우려로 이어진다'로 정의했고, 이를 풀기 위해 케어브릿지를 만들었습니다."
54.1% 읽는 법: 대한요양보호사협회 조사(요양보호사 127명, 2025.11.17~26)에서 확대에 반대한 79.5%(101명)가 고른 이유 1위입니다. 2위는 내국인 처우 악화 33.3%, 3위는 내외국인 경쟁 심화 7.2%입니다. '반대'보다 '현장이 걱정하는 점'으로 말합니다. 같은 기사에서 요양기관 운영자 348명 중 58%는 확대에 찬성했습니다(질문이 오면 답함).
질문 대비: 28.7%는 외국인 자격 취득 26,596명 중 근무 7,623명입니다(건보공단 공공데이터 2025.12.31). 질문이 오면 '자격은 있어도 현장에는 10명 중 3명'으로 답합니다. E-7 요양보호사는 누적 41명입니다(데일리굿뉴스 2026.10.21).`);
    sub(s, '추진 배경', 3.92, 1.8);
    // 그래프 1
    card(s, 3.92, 2.5, 9.0, 4.0);
    T(s, '장기요양 인정자 수 추이', 4.2, 2.62, 5, 0.45, { fontSize: 19, weight: 'B', color: G1, valign: 'middle' });
    T(s, '(단위: 만 명)', 10.0, 2.65, 2.7, 0.4, { fontSize: 13, weight: 'R', color: MUTE, align: 'right', valign: 'middle' });
    s.addChart(pres.ChartType.bar, [{ name: '인정자 수', labels: ['2020', '2021', '2022', '2023', '2024', '2025', '2027 전망'], values: [85.8, 95.4, 101.9, 109.8, 116.5, 123.5, 145] }], {
      x: 4.05, y: 3.05, w: 6.1, h: 3.35, barDir: 'col', barGapWidthPct: 55, chartColors: [G1],
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 13, dataLabelColor: BLACK, dataLabelFontFace: '+mn-lt', dataLabelFormatCode: 'General',
      catAxisLabelFontSize: 13, catAxisLabelColor: GRAY, catAxisLabelFontFace: '+mn-lt', catAxisLineShow: false, catGridLine: { style: 'none' },
      valAxisHidden: true, valGridLine: { style: 'none' }, valAxisMinVal: 0, valAxisMaxVal: 170, showLegend: false, showTitle: false, plotArea: { fill: { color: WHITE } },
    });
    card(s, 10.35, 3.5, 2.35, 2.5, { fill: G2_T, line: G2_T, shadow: false });
    s.addText(R([['2020년 대비\n', { weight: 'M', fontSize: 14, color: GRAY }], ['1.4배\n', { weight: 'B', fontSize: 30, color: G1 }], ['2027년 ', { weight: 'M', fontSize: 14, color: GRAY }], ['145만 명', { weight: 'B', fontSize: 16, color: G1 }], [' 전망', { weight: 'M', fontSize: 14, color: GRAY }]]), { x: 10.45, y: 3.55, w: 2.15, h: 2.4, isTextBox: true, margin: 0, align: 'center', valign: 'middle' });
    // 그래프 2: 정책 변화
    card(s, 13.3, 2.5, 6.1, 4.0);
    T(s, '외국인 요양보호사 정책 변화', 13.58, 2.62, 5.5, 0.45, { fontSize: 19, weight: 'B', color: G1, valign: 'middle' });
    const pol = [['2024.7', 'E-7 요양보호사 비자 시범'], ['2025', '유학·구직 비자 외국인 교육 허용'], ['2025.8', '외국인 요양보호사 양성대학 24곳 선정']];
    vline(s, 14.95, 3.45, 2.1, 'C9D6CF', 2);
    pol.forEach(([d, t], i) => {
      const y = 3.25 + i * 1.05;
      T(s, d, 13.5, y, 1.3, 0.45, { fontSize: 15, weight: 'B', color: G1, align: 'right', valign: 'middle' });
      s.addShape(SH.OVAL, { x: 14.84, y: y + 0.12, w: 0.22, h: 0.22, fill: { color: i === 2 ? G2 : WHITE }, line: { color: i === 2 ? G2 : G1, width: 2 } });
      T(s, t, 15.3, y, 4.0, 0.45, { fontSize: 15, weight: 'M', color: BLACK, valign: 'middle' });
    });
    // 문제 정의
    sub(s, '문제 정의', 3.92, 6.75);
    const cw = 4.76, gap = 0.6, cy = 7.45, ch = 2.35;
    const probs = [
      { icon: Md.MdGroups, head: '현장 요양보호사가 꼽은 우려 1위', big: '54.1%', mid: '업무 및 소통 미숙', small: '외국인 확대 반대 응답자 101명 중(127명 조사)' },
      { icon: Md.MdRecordVoiceOver, head: '교육 현장의 목소리', quote: '"가장 큰 벽은\n한국어와 요양 용어"', small: '외국인 요양보호사 교육기관 원장 인터뷰(2026.10.15)' },
      { icon: Md.MdFlag, head: '문제 정의', body: '한국어·요양 용어의 벽이 정확한 돌봄 기록을 막고, 현장의 소통 우려로 이어짐', dark: true },
    ];
    for (let i = 0; i < 3; i++) {
      const p = probs[i], x = 3.92 + i * (cw + gap);
      card(s, x, cy, cw, ch, p.dark ? { fill: G1, line: G1 } : {});
      await icon(s, p.icon, x + 0.25, cy + 0.25, 0.7, p.dark ? G1 : WHITE, p.dark ? G2 : G1);
      T(s, p.head, x + 1.1, cy + 0.25, cw - 1.3, 0.7, { fontSize: 16, weight: 'B', color: p.dark ? WHITE : G1, valign: 'middle' });
      if (p.big) {
        s.addText(R([[p.big + '  ', { weight: 'B', fontSize: 34, color: G2 }], [p.mid, { weight: 'B', fontSize: 18, color: BLACK }]]), { x: x + 0.3, y: cy + 1.0, w: cw - 0.6, h: 0.75, isTextBox: true, margin: 0, valign: 'middle' });
        T(s, p.small, x + 0.3, cy + 1.8, cw - 0.6, 0.45, { fontSize: 12, weight: 'R', color: MUTE });
      } else if (p.quote) {
        T(s, p.quote, x + 0.3, cy + 0.95, cw - 0.6, 0.9, { fontSize: 19, weight: 'B', color: BLACK, valign: 'middle', lineSpacingMultiple: 1.05 });
        T(s, p.small, x + 0.3, cy + 1.85, cw - 0.6, 0.45, { fontSize: 12, weight: 'R', color: MUTE });
      } else {
        T(s, p.body, x + 0.3, cy + 1.0, cw - 0.6, 1.2, { fontSize: 18, weight: 'M', color: WHITE, valign: 'middle', lineSpacingMultiple: 1.15 });
      }
      if (i < 2) arrowR(s, x + cw + 0.1, cy + ch / 2 - 0.22, 0.4, 0.44, 'B5C7BE');
    }
    T(s, '출처: 국민건강보험공단 노인장기요양보험 통계연보(2020~2025) · 보건복지부 제3차 장기요양기본계획(2023.8) · 법무부 보도자료(2024.7.8) · 보건복지부 보도자료(2025.8.24) · 세계일보(2025.12.7, 대한요양보호사협회 조사)', 3.92, 10.0, 15.0, 0.6, { fontSize: 11, weight: 'R', color: MUTE, valign: 'top' });
  }

  // =====================================================================
  // 5. 타깃 사용자 및 기존 서비스 한계
  // =====================================================================
  {
    const s = frame('02 타깃 사용자 및 기존 서비스 한계', 1,
      `첫 문장: "작성자는 기록 작성, 관리자는 기록 검증에 부담" (30초)
페르소나 두 사람의 부담을 한 줄씩 짚고, 4쪽 인터뷰와 연결합니다.
표는 케어브릿지 열만 읽습니다. "기존 도구도 음성 기록이나 질의응답을 하지만, 한국어 법정 서식 9개 항목으로 나눠 쓰고 작성자 확인과 관리자 승인을 거치게 하는 것은 케어브릿지입니다."
공단 앱은 부족한 게 아니라 하는 일(방문 시간 전송·청구)이 다르다고 말합니다.
Buddy도 음성 기록·질의응답을 하므로 '전송·번역 중심'이라고 말하지 않습니다.
법정 기록지는 시설 별지 제16호, 재가 방문요양 별지 제12호입니다.`, { titleSize: 54 });
    sub(s, '타깃 사용자', 3.92, 1.8);
    const personas = [
      { img: 'writer_worry.png', who: '작성자', desc: '외국인 요양보호사·교육생', c: G1, pains: ['낯선 요양 전문 용어 이해의 어려움', '기록할 항목 및 관찰·추측 구분의 어려움', '한국어 문장 작성에 긴 시간 소요'] },
      { img: 'manager_worry.png', who: '관리자', desc: '사회복지사·교육 강사', c: BLUE, pains: ['누락 항목 확인 및 재질문 부담', '추측성 표현 선별 부담', '법정 서식에 맞춘 문장 재작성 부담'] },
    ];
    personas.forEach((p, i) => {
      const x = 3.92 + i * 7.9, y = 2.5, w = 7.58, h = 2.95;
      card(s, x, y, w, h);
      s.addImage({ data: imgData(p.img), x: x + 0.15, y: y + 0.15, w: 2.65, h: 2.65 });
      s.addText(R([[p.who + '  ', { weight: 'B', fontSize: 24, color: p.c }], [p.desc, { weight: 'M', fontSize: 15, color: GRAY }]]), { x: x + 3.0, y: y + 0.3, w: w - 3.2, h: 0.55, isTextBox: true, margin: 0, valign: 'middle' });
      s.addText(p.pains.map((t, j) => ({ text: t, options: Object.assign({ bullet: { code: '2022', indent: 14 }, breakLine: j < 2, paraSpaceAfter: 5, fontSize: 15, color: BLACK }, fnt('M')) })), { x: x + 3.0, y: y + 0.95, w: w - 3.25, h: 1.9, isTextBox: true, margin: 0, valign: 'top' });
    });
    sub(s, '유사 서비스 비교', 3.92, 5.7);
    const TY = 6.35, colW = [2.0, 4.4, 4.4, 4.68], hH = 1.1, rH = [0.72, 0.5, 0.78, 0.86];
    const hdr = (t, o = {}) => ({ text: t, options: Object.assign({ fill: { color: WHITE }, color: GRAY, fontSize: 14, align: 'center', valign: 'bottom', margin: [0.04, 0.08, 0.1, 0.08] }, fnt('B'), o) });
    const cell = (t, o = {}) => ({ text: t, options: Object.assign({ fontSize: 13.5, color: BLACK, valign: 'middle', margin: [0.05, 0.1, 0.05, 0.1] }, fnt('M'), o) });
    const lab = (t) => cell(t, Object.assign({ color: G1, fill: { color: G1_T }, align: 'center' }, fnt('B')));
    const cb = (t) => cell(t, Object.assign({ fill: { color: G2_T } }, fnt('B')));
    const rows = [
      [hdr('구분', { valign: 'middle' }), hdr('스마트장기요양(국민건강보험공단)'), hdr('Buddy(호주 Uniting)'), hdr('케어브릿지', { color: G1, fill: { color: G2_T }, fontSize: 15 })],
      [lab('핵심 기능'), cell('방문 시작·종료 시간 전송, 급여 청구 연계'), cell('음성 경과 기록, 영어 번역, 업무 지침 질의응답'), cb('모국어 음성으로 9개 항목 한국어 기록 초안 작성, 교재 기반 AI 도우미')],
      [lab('대상 급여'), cell('재가'), cell('재가·지역사회'), cb('시설·재가')],
      [lab('결과물 언어'), cell('한국어(한국어 작성 능력 전제)'), cell('영어'), cb('한국어, 모국어 뜻 함께 표시(베트남어 제공, 3개 언어 QA 중)')],
      [lab('확인·승인 방식'), cell('요양보호사·수급자 서명'), cell('작성자 확인'), cb("작성자 확인 후 관리자 승인, '확인 필요' 항목이 남으면 승인 차단")],
    ];
    s.addTable(rows, { x: 3.92, y: TY, w: 15.48, colW, rowH: [hH, ...rH], border: { type: 'solid', pt: 0.75, color: LINE }, fill: { color: WHITE }, autoPage: false });
    // 로고 (헤더 위)
    s.addImage({ data: imgData('nhis.jpg'), x: 3.92 + 2.0 + 1.9, y: TY + 0.1, w: 0.52, h: 0.6 });
    s.addImage({ data: imgData('buddy_trim.png'), x: 3.92 + 6.4 + 1.45, y: TY + 0.2, w: 1.5, h: 0.45 });
    s.addImage({ data: greenLogo, x: 3.92 + 10.8 + 2.05, y: TY + 0.06, w: 0.62, h: 0.62 });
    T(s, '출처: 스마트장기요양 앱 가이드(국민건강보험공단, 2025.6), Uniting Buddy 공개 자료', 3.92, 10.35, 15.0, 0.35, { fontSize: 11, weight: 'R', color: MUTE });
  }

  // =====================================================================
  // 6. 솔루션 개요
  // =====================================================================
  {
    const s = frame('03 솔루션 개요', 2,
      `첫 문장: "AI가 기록 초안과 용어 질문을 지원, 확인·승인은 사람이 담당" (40초)
"앞에서 본 작성자와 관리자의 부담, 그리고 기존 서비스가 못 하는 부분을 케어브릿지는 이렇게 풉니다."
핵심 가치는 말로 풉니다. 모국어나 한국어로 말하면 9항목 초안이 나옵니다. 모국어 뜻과 듣기로 한국어·요양 용어에 매일 노출됩니다. 말하지 않은 항목은 비우고, 모호하면 '확인 필요'로 남깁니다. 도우미는 교재에 없으면 관리자에게 묻도록 안내합니다.
흐름은 빠르게 지나갑니다. 자세한 화면은 다음 장에서 봅니다.
'AI가 기록을 써 준다'가 아니라 'AI는 초안, 확인·승인은 사람'이라고 말합니다.
도우미는 지금 글로만 질문합니다. 음성 질문은 추후 적용입니다.
언어 근거: 국내 유학생은 베트남 약 10만, 중국 약 4.5만 명입니다(법무부 2025.5). E-7 요양보호사 취득자 41명 중 베트남 27명, 몽골 8명입니다(2026.9). 2025년부터 유학(D-2)·구직(D-10) 외국인도 요양보호사 교육을 받을 수 있습니다.
질문 대비: "4개 언어 다 되나요?" → "지금은 베트남어를 제공하고, 나머지 세 언어는 QA 중입니다." / "중국 국적 근무자는 동포 아닌가?" → 지금 일하는 중국 국적자는 동포 비자로 들어온 분이 많을 것으로 봅니다. 케어브릿지는 2025년부터 새로 들어오는 유학생·E-7 인력을 기준으로 언어를 골랐습니다.`);
    sub(s, '핵심 가치', 3.92, 1.8);
    const vals = [[Md.MdMic, '말로 쓰는 기록', '말하면 법정 서식 9항목 한국어 초안', G1], [Md.MdHearing, '기록하며 접하는 한국어', '모국어 뜻·듣기로 매일 한국어 노출', TEAL], [Md.MdFactCheck, '믿을 수 있는 초안', "없는 말은 비우고, 모호하면 '확인 필요'", G2], [Md.MdQuestionAnswer, '바로 묻는 도우미', '용어·대처법을 교재 근거로 답변', BLUE]];
    for (let i = 0; i < 4; i++) {
      const [I, name, line, c] = vals[i], x = 3.92 + i * 3.96, y = 2.5, w = 3.6, h = 2.1;
      card(s, x, y, w, h);
      await icon(s, I, x + 0.3, y + 0.25, 0.7, WHITE, c);
      T(s, name, x + 0.3, y + 1.05, w - 0.6, 0.45, { fontSize: 18, weight: 'B', color: G1, valign: 'middle' });
      T(s, line, x + 0.3, y + 1.5, w - 0.6, 0.55, { fontSize: 14.5, weight: 'M', color: BLACK, valign: 'top', lineSpacingMultiple: 1.1 });
    }
    sub(s, '서비스 흐름', 3.92, 4.95);
    const flows = [
      ['기록', G1, [['작성자 · 모바일', '음성·텍스트로 말하기'], ['AI', '한국어 기록 초안 작성'], ['작성자', '확인 후 전송'], ['관리자', '확인·승인·법정 서식 출력']]],
      ['AI 도우미', BLUE, [['작성자 · 모바일', '글로 질문'], ['AI', '교재 검색'], ['작성자 · 모바일', '답변 및 교재 출처']]],
    ];
    flows.forEach(([name, c, nodes], r) => {
      const y = 5.65 + r * 1.1, nw = 3.0, aw = 0.5;
      chip(s, name, 3.92, y + 0.17, 1.5, 0.5, c, WHITE, { fontSize: 15, r: 0.12 });
      nodes.forEach(([actor, act], j) => {
        const x = 5.7 + j * (nw + aw);
        card(s, x, y, nw, 0.85, { shadow: false, line: LINE });
        T(s, actor, x + 0.15, y + 0.08, nw - 0.3, 0.3, { fontSize: 12, weight: 'R', color: MUTE, align: 'center' });
        T(s, act, x + 0.15, y + 0.38, nw - 0.3, 0.4, { fontSize: 15, weight: 'B', color: BLACK, align: 'center' });
        if (j < nodes.length - 1) arrowR(s, x + nw + 0.08, y + 0.28, 0.34, 0.3, 'B5C7BE');
      });
    });
    sub(s, '지원 언어', 3.92, 7.95);
    chip(s, '베트남어 · 제공', 3.92, 8.75, 2.6, 0.6, G2, WHITE, { fontSize: 16 });
    ['중국어(간체)', '몽골어', '영어'].forEach((l, i) => chip(s, l, 6.75 + i * 1.9, 8.75, 1.75, 0.6, WHITE, GRAY, { fontSize: 15, weight: 'M', line: 'A6A6A6' }));
    T(s, '구현·QA 진행 중', 6.75, 9.45, 5.6, 0.4, { fontSize: 13, weight: 'R', color: MUTE });
    s.addText([
      { text: '유학생·E-7 주요 국적과 공통 언어 기준', options: Object.assign({ bullet: { code: '2022', indent: 14 }, breakLine: true, paraSpaceAfter: 6, fontSize: 16, color: BLACK }, fnt('M')) },
      { text: '최종 기록은 한국어, 모국어는 이해를 돕는 보조 표기', options: Object.assign({ bullet: { code: '2022', indent: 14 }, fontSize: 16, color: BLACK }, fnt('M')) },
    ], { x: 12.6, y: 8.7, w: 6.8, h: 1.4, isTextBox: true, margin: 0, valign: 'top' });
  }

  // =====================================================================
  // 7. 핵심 기능
  // =====================================================================
  {
    const s = frame('03 핵심 기능', 2,
      `첫 문장: "작성자는 모바일에서 기록, 관리자는 PC에서 검토·승인" (30초)
6·8쪽과 겹치므로 번호를 다 읽지 않습니다. 작성자(모바일) → 전송 → 관리자(PC) 흐름만 짚습니다.
작성자가 전송하면 관리자가 검토하고, 고칠 것이 있으면 작성자에게 되돌립니다.
③ 내용 추가는 시연에서 빠지므로 여기서 소개합니다. "AI가 비워 둔 항목은 작성자가 말이나 글로 바로 보탤 수 있습니다."
교육용 기관: 교육생이 기록하고 강사가 관리자처럼 검토·승인합니다. 가상 어르신만 쓰고, 모든 화면·PDF에 '연습용'이 붙고, 승인 통계에서 빠집니다.`);
    sub(s, '작성자 기능', 3.92, 1.8, '모바일');
    sub(s, '관리자 기능', 13.3, 1.8, 'PC');
    // 모바일 캡처 자리 2장
    [['캡처 자리\n기록 초안 확인 화면', 4.6], ['캡처 자리\nAI 도우미 화면', 7.0]].forEach(([l, x]) => {
      s.addShape(SH.ROUNDED_RECTANGLE, { x, y: 2.5, w: 2.05, h: 3.6, fill: { color: WHITE }, line: { color: '3A3A3A', width: 2.5 }, rectRadius: 0.25 });
      T(s, l, x + 0.15, 2.5, 1.75, 3.6, { fontSize: 13, align: 'center', valign: 'middle', color: MUTE, weight: 'R' });
    });
    const wf = ['음성·텍스트 기록', '항목별 확인·수정', '누락된 항목 음성 및 텍스트로 추가', '한국어·모국어 병기', '교재 기반 AI 도우미', '답변 출처(교재 장·쪽) 표시'];
    wf.forEach((t, i) => {
      const y = 6.4 + i * 0.5;
      chip(s, String(i + 1), 3.92, y + 0.06, 0.38, 0.38, G1, WHITE, { fontSize: 13, r: 0.5 });
      T(s, t, 4.45, y, 6.8, 0.5, { fontSize: 16, weight: 'M', color: BLACK, valign: 'middle' });
    });
    // 전송 / 되돌리기
    s.addShape(SH.RIGHT_ARROW, { x: 11.45, y: 3.6, w: 1.6, h: 0.6, fill: { color: G2 }, line: { color: G2, width: 0.5 } });
    T(s, '전송', 11.45, 3.6, 1.35, 0.6, { fontSize: 14, weight: 'B', color: WHITE, align: 'center', valign: 'middle' });
    s.addShape(SH.LEFT_ARROW, { x: 11.45, y: 4.45, w: 1.6, h: 0.6, fill: { color: 'BFBFBF' }, line: { color: 'BFBFBF', width: 0.5 } });
    T(s, '되돌리기', 11.7, 4.45, 1.35, 0.6, { fontSize: 14, weight: 'B', color: BLACK, align: 'center', valign: 'middle' });
    // PC 캡처 자리
    s.addShape(SH.ROUNDED_RECTANGLE, { x: 13.3, y: 2.5, w: 6.1, h: 3.6, fill: { color: WHITE }, line: { color: '3A3A3A', width: 2.5 }, rectRadius: 0.12 });
    T(s, '캡처 자리\n관리자 검토 화면', 13.5, 2.5, 5.7, 3.6, { fontSize: 14, align: 'center', valign: 'middle', color: MUTE, weight: 'R' });
    const mf = ['근거 문장 하이라이트', '확인 필요 시 승인 잠금', '수정·되돌리기 이력 관리', '법정 기록지 인쇄·PDF'];
    mf.forEach((t, i) => {
      const y = 6.4 + i * 0.5;
      chip(s, String(i + 7), 13.3, y + 0.06, 0.38, 0.38, BLUE, WHITE, { fontSize: 13, r: 0.5 });
      T(s, t, 13.83, y, 5.5, 0.5, { fontSize: 16, weight: 'M', color: BLACK, valign: 'middle' });
    });
    // 연습용 띠
    card(s, 3.92, 9.6, 15.48, 0.85, { fill: G1_T, line: G1_T, shadow: false });
    await icon(s, Md.MdSchool, 4.1, 9.72, 0.6, G1);
    s.addText(R([['연습용  ', { weight: 'B', fontSize: 17, color: G1 }], ['교육용 기관에서는 가상 어르신으로 실무 기반의 기록·승인 실습', { weight: 'M', fontSize: 16, color: BLACK }]]), { x: 4.85, y: 9.6, w: 14.3, h: 0.85, isTextBox: true, margin: 0, valign: 'middle' });
  }

  // =====================================================================
  // 8. 서비스 시연
  // =====================================================================
  {
    const s = frame('03 서비스 시연', 2,
      `첫 문장: "시설 기록 1건: 음성 기록부터 법정 서식 출력까지" (2분 30초)
베트남어로 촬영합니다.
① 음성 기록 0:00~0:15 녹음 시작 → 받아쓰기
② AI 초안 0:15~0:50 9항목 초안, 모국어 병기, 식사·불편감 '확인 필요'
③ 항목 수정·전송 0:50~1:10 식사 항목 수정 "죽 반 안 되게 드셨어요.", 듣기, 전송
④ 관리자 검토·승인 1:10~1:55 근거 문장 강조, [승인] 잠김 → [확인함] → 승인
⑤ 법정 서식 출력 1:55~2:10 별지 제16호
⑥ AI 도우미 2:10~2:30 "어르신이 식사를 안 하시려고 하면 어떻게 해요?" → 교재 답 + 장·쪽 출처
처리 대기를 자르면 영상에 '처리 대기 구간 편집'을 표시합니다.`);
    s.addShape(SH.ROUNDED_RECTANGLE, { x: 4.9, y: 1.95, w: 13.5, h: 7.6, fill: { color: '2B2B2B' }, line: { color: '2B2B2B', width: 0.5 }, rectRadius: 0.12 });
    await icon(s, Md.MdPlayCircle, 10.75, 4.45, 1.8, WHITE);
    T(s, '시연 영상 2분 30초 자리', 4.9, 6.5, 13.5, 0.7, { fontSize: 24, weight: 'B', color: WHITE, align: 'center' });
    T(s, '※ 시연 데이터는 모두 합성 사례입니다', 4.9, 9.85, 13.5, 0.5, { fontSize: 16, weight: 'R', color: GRAY, align: 'center' });
  }

  // =====================================================================
  // 9. AI 적용 방안
  // =====================================================================
  {
    const s = frame('03 AI 적용 방안', 2,
      `첫 문장: "초안은 AI, 확인·승인은 사람, 규칙 검사는 시스템" (50초)
"작성자의 말은 자유롭고 모국어나 사투리가 섞입니다. 이걸 법정 서식 9개 항목으로 나누고, 본 것과 짐작한 것을 가르는 일은 정해진 규칙으로는 할 수 없어 AI가 맡습니다. 대신 승인 조건과 사람이 고친 값 보호는 서버와 DB가 맡습니다."
AI는 초안까지만 씁니다. 원문에 없으면 '언급 없음', 짐작했으면 '확인 필요'입니다.
①~④는 Agent 도구 4개입니다. ③은 AI가 검증 도구를 부르면 서버 코드가 규칙을 검사해 결과를 돌려주는 단계입니다. AI가 스스로 판단하는 것이 아닙니다.
기록 1건에 Claude 응답은 최대 4번입니다(질문이 오면 답함).
실명 걸러내기는 기록 본문에 실명이 들어갔는지 검사하는 것입니다. 명단의 어르신 이름은 처음부터 AI 입력에 넣지 않습니다.
문제별 근거: ① QA가 몽골어 기록의 식사 항목이 '확인 필요'로 나오는 것을 찾았습니다. 원인은 용어 검색이 한국어로만 찾던 것이었습니다. 고친 뒤 'зутан'이 교재 용어 '죽'으로 연결돼 관찰로 기록됐습니다. ② "약은 드신 것 같아요"는 한국어·베트남어 모두 '확인 필요'로 남고, 이유에 '짐작한 표현'이 적힙니다. ③ 시연 ④에서 본 [승인] 잠금입니다.`);
    sub(s, 'AI 적용 이유', 3.92, 1.8);
    card(s, 3.92, 2.5, 15.48, 0.85, { fill: G1_T, line: G1_T, shadow: false });
    await icon(s, Md.MdLightbulb, 4.1, 2.62, 0.6, G1);
    T(s, '모국어·사투리가 섞인 자유로운 말을 법정 서식 9개 항목으로 나누고 관찰과 짐작을 가르는 일은 정해진 규칙만으로는 불가능', 4.85, 2.5, 14.4, 0.85, { fontSize: 16, weight: 'M', color: BLACK, valign: 'middle' });
    sub(s, '역할 분담', 3.92, 3.55);
    const roles = [
      [Md.MdSmartToy, 'AI · 초안 작성', G2, ['순서: ① 서식 확인 → ② 용어 검색 → ③ 서버 규칙 검사 → ④ 초안 저장', '항목마다 근거 문장·번역 함께 생성', "불확실한 항목은 '확인 필요' 표시"]],
      [Md.MdPeopleAlt, '사람 · 확인과 승인', G1, ['작성자: 항목별 확인·수정 후 전송', '관리자: 근거 문장 검토 후 승인 또는 되돌리기']],
      [Md.MdRule, '시스템 · 규칙 검사', BLUE, ['근거 문장 원문 대조', '기록 본문 실명 걸러내기', "'확인 필요' 남으면 승인 차단", '사람이 고친 항목은 AI가 덮어쓰지 않음']],
    ];
    for (let i = 0; i < 3; i++) {
      const [I, name, c, items] = roles[i], x = 3.92 + i * 5.36, y = 4.25, w = 4.76, h = 2.75;
      card(s, x, y, w, h);
      await icon(s, I, x + 0.25, y + 0.22, 0.62, WHITE, c);
      T(s, name, x + 1.05, y + 0.22, w - 1.2, 0.62, { fontSize: 18, weight: 'B', color: G1, valign: 'middle' });
      s.addText(items.map((t, j) => ({ text: t, options: Object.assign({ bullet: { code: '2022', indent: 12 }, breakLine: j < items.length - 1, paraSpaceAfter: 4, fontSize: 13.5, color: BLACK }, fnt('M')) })), { x: x + 0.25, y: y + 1.0, w: w - 0.45, h: h - 1.15, isTextBox: true, margin: 0, valign: 'top' });
      if (i < 2) arrowR(s, x + w + 0.1, y + 1.15, 0.4, 0.44, 'B5C7BE');
    }
    sub(s, '문제별 설계와 근거', 3.92, 7.2);
    const H = (t) => ({ text: t, options: Object.assign({ fill: { color: G1 }, color: WHITE, fontSize: 14, align: 'center', valign: 'middle', margin: [0.04, 0.08, 0.04, 0.08] }, fnt('B')) });
    const C = (t, o = {}) => ({ text: t, options: Object.assign({ fontSize: 13.5, color: BLACK, valign: 'middle', margin: [0.04, 0.1, 0.04, 0.1] }, fnt('M'), o) });
    s.addTable([
      [H('문제'), H('설계'), H('근거')],
      [C('모국어 낱말이 섞인 기록', fnt('B')), C('모국어 낱말로도 용어 검색'), C("몽골어 'зутан' → '죽', 확인 필요 → 관찰 (#363)")],
      [C('짐작한 말', fnt('B')), C("진술로 바꾸지 않고 '확인 필요'"), C('"약은 드신 것 같아요" → 복약 \'확인 필요\' (#275)')],
      [C('AI 초안이 그대로 확정될 위험', fnt('B')), C("'확인 필요' 남으면 승인 잠금"), C('관리자가 처리하기 전까지 [승인] 잠김 (시연 ④)')],
    ], { x: 3.92, y: 7.9, w: 15.48, colW: [4.2, 4.6, 6.68], rowH: [0.5, 0.65, 0.65, 0.65], border: { type: 'solid', pt: 0.75, color: LINE }, fill: { color: WHITE }, autoPage: false });
  }

  // =====================================================================
  // 10. 시스템 구성
  // =====================================================================
  {
    const s = frame('03 시스템 구성', 2,
      `첫 문장: "AI·받아쓰기·DB 호출은 서버 한 곳에서, API 키는 브라우저에 두지 않음" (30초)
"폰과 PC는 서버만 부르고, 받아쓰기·Claude·DB는 서버가 부릅니다. 그래서 API 키가 브라우저에 나가지 않고, 승인 조건 검사와 녹음 삭제를 한곳에서 처리합니다."
녹음은 1회용 주소로 비공개 저장소에 올리고, 글자로 바꾸면 바로 지웁니다.
도우미는 Agent 없이 교재 검색 뒤 한 번 호출합니다.
처리 흐름과 실패 대응(응답 4번 상한, 전체 시간 제한, 재시도)은 부록 A3에 있습니다.`);
    sub(s, '구성도', 3.92, 1.8);
    const colY = 2.5, colH = 5.2;
    // 열 1: 사용자 기기
    card(s, 3.92, colY, 4.7, colH);
    T(s, '사용자 기기 · 브라우저', 3.92, colY + 0.15, 4.7, 0.5, { fontSize: 17, weight: 'B', color: G1, align: 'center', valign: 'middle' });
    hline(s, 4.2, colY + 0.72, 4.14, LINE);
    const users = [['writer_circle.png', '작성자 · 모바일 웹', 'W0~W6 · 녹음·확인·전송·도우미', Md.MdPhoneIphone], ['manager_circle.png', '관리자 · PC 웹', 'M0~M5 · 검토·승인·인쇄·PDF', Md.MdComputer]];
    for (let i = 0; i < 2; i++) {
      const [img, name, desc, I] = users[i];
      const y = colY + 0.95 + i * 2.15;
      s.addImage({ data: imgData(img), x: 4.15, y, w: 1.55, h: 1.55 });
      s.addShape(SH.OVAL, { x: 4.15 + 1.1, y: y + 1.05, w: 0.55, h: 0.55, fill: { color: G1 }, line: { color: WHITE, width: 2 } });
      s.addImage({ data: await iconPng(I, WHITE), x: 4.15 + 1.22, y: y + 1.17, w: 0.31, h: 0.31 });
      T(s, name, 5.9, y + 0.2, 2.65, 0.45, { fontSize: 15, weight: 'B', color: BLACK, valign: 'middle' });
      T(s, desc, 5.9, y + 0.65, 2.65, 0.9, { fontSize: 13, weight: 'M', color: GRAY, lineSpacingMultiple: 1.1 });
    }
    // 화살표
    s.addShape(SH.LEFT_RIGHT_ARROW, { x: 8.75, y: colY + 2.3, w: 0.75, h: 0.5, fill: { color: 'B5C7BE' }, line: { color: 'B5C7BE', width: 0.5 } });
    // 열 2: Vercel · Next.js 서버
    card(s, 9.62, colY, 4.6, colH);
    T(s, 'Vercel · Next.js 서버', 9.62, colY + 0.15, 4.6, 0.5, { fontSize: 17, weight: 'B', color: G1, align: 'center', valign: 'middle' });
    hline(s, 9.9, colY + 0.72, 4.04, LINE);
    s.addImage({ data: await iconPng(Si.SiVercel, BLACK), x: 10.75, y: colY + 0.95, w: 0.9, h: 0.9 });
    s.addImage({ data: await iconPng(Si.SiNextdotjs, BLACK), x: 12.2, y: colY + 0.95, w: 0.9, h: 0.9 });
    T(s, 'Vercel', 10.35, colY + 1.9, 1.7, 0.35, { fontSize: 12, weight: 'R', color: MUTE, align: 'center' });
    T(s, 'Next.js', 11.8, colY + 1.9, 1.7, 0.35, { fontSize: 12, weight: 'R', color: MUTE, align: 'center' });
    s.addText(['API · Agent 반복 · 도구 실행', '승인 조건·시간 합 재검사', 'AI·받아쓰기 키는 여기에만'].map((t, j) => ({ text: t, options: Object.assign({ bullet: { code: '2022', indent: 12 }, breakLine: j < 2, paraSpaceAfter: 8, fontSize: 14.5, color: BLACK }, fnt('M')) })), { x: 9.95, y: colY + 2.5, w: 4.0, h: 2.5, isTextBox: true, margin: 0 });
    s.addShape(SH.LEFT_RIGHT_ARROW, { x: 14.35, y: colY + 2.3, w: 0.75, h: 0.5, fill: { color: 'B5C7BE' }, line: { color: 'B5C7BE', width: 0.5 } });
    // 열 3: 외부 서비스
    card(s, 15.22, colY, 4.18, colH);
    T(s, '외부 서비스', 15.22, colY + 0.15, 4.18, 0.5, { fontSize: 17, weight: 'B', color: G1, align: 'center', valign: 'middle' });
    hline(s, 15.5, colY + 0.72, 3.62, LINE);
    const ext = [
      ['Groq', null, '받아쓰기 · Groq Whisper large-v3', '글자로 바꾼 뒤 녹음 파일 바로 삭제', 'F55036'],
      ['Claude', Si.SiClaude, 'AI · Claude API', '기록 초안(Agent, 응답 최대 4번) · 도우미(교재 검색 후 1번)', 'D97757'],
      ['Supabase', Si.SiSupabase, 'DB · Supabase', '로그인 · 기관별 데이터 분리(RLS) · 변경 이력 · 녹음 비공개 보관', '3ECF8E'],
    ];
    for (let i = 0; i < 3; i++) {
      const [nm, I, name, desc, c] = ext[i], y = colY + 0.9 + i * 1.45;
      if (I) s.addImage({ data: await iconPng(I, c), x: 15.45, y: y + 0.05, w: 0.6, h: 0.6 });
      else chip(s, 'groq', 15.4, y + 0.1, 0.7, 0.5, c, WHITE, { fontSize: 12, r: 0.1 });
      T(s, name, 16.25, y, 3.15, 0.4, { fontSize: 13, weight: 'B', color: BLACK, valign: 'middle' });
      T(s, desc, 16.25, y + 0.42, 3.05, 0.95, { fontSize: 12, weight: 'M', color: GRAY, lineSpacingMultiple: 1.1 });
    }
    sub(s, '설계 원칙', 3.92, 7.95);
    const prin = [[Md.MdLock, '키 보호', '폰·PC는 서버만 부르고, 외부 AI는 서버가 부름'], [Md.MdDomain, '기관별 분리', '다른 기관 기록은 DB가 읽기 자체를 막음'], [Md.MdEditNote, '수정 보호', '사람이 고친 항목은 AI 결과로 덮어쓰지 않음']];
    for (let i = 0; i < 3; i++) {
      const [I, name, line] = prin[i], x = 3.92 + i * 5.26, y = 8.65, w = 4.96, h = 1.55;
      card(s, x, y, w, h, { fill: G1_T, line: G1_T, shadow: false });
      await icon(s, I, x + 0.25, y + 0.35, 0.85, WHITE, G1);
      T(s, name, x + 1.3, y + 0.25, w - 1.45, 0.5, { fontSize: 17, weight: 'B', color: G1, valign: 'middle' });
      T(s, line, x + 1.3, y + 0.75, w - 1.45, 0.75, { fontSize: 14, weight: 'M', color: BLACK, lineSpacingMultiple: 1.1 });
    }
  }

  // =====================================================================
  // 11. 검증 결과
  // =====================================================================
  {
    const s = frame('04 검증 결과', 3,
      `첫 문장: "합성 사례 10건으로 초안 생성·항목 상태 검증, 발견 오류는 수정 후 재측정" (1분 15초)
위 품질 측정(품질이 맞나) → 아래 최적화(빠르고 싸게 도나) 순서입니다.
"코디세이 배포본에서 합성 사례 10건(시설 5·재가 5)을 실제 AI로 돌렸습니다. 10건 모두 초안이 나왔고, 9개 항목 상태가 기대와 같은 비율은 88.9%, 사례마다 정해 둔 오답은 한 번도 나오지 않았습니다. 측정 중 섭취량 값이 지워지는 오류를 찾아 고친 뒤 다시 쟀습니다."
출처는 이슈 #275입니다. 오류는 #293 → PR #294로 고쳤고, 고치기 전은 78/90이었습니다.
질문 대비: "88.9%로 쓸 수 있나요?" → 항목 상태를 잰 숫자이고, 케어브릿지는 사람이 꼭 검토하는 초안 도구입니다. 남은 불일치 10칸에 지어낸 내용은 없었습니다. 승인 절차가 정확도 한계를 모두 해결한다고는 말하지 않습니다. / "전에는 93%라던데?" → 10/30 공모전 배포본에서 시연 대본 3개를 5번씩 돌린 다른 측정입니다(부록 A6). 사례·방법이 달라 비교하지 않습니다.
최적화 숫자 풀이: 캐시: 토큰 26,819 중 캐시 읽기 13,717 → 차감 16,717, 약 38%. 도우미 교재 발췌: 한국어 질문, Haiku 기준. 처리 시간: 1건 측정값이라 보장 시간이 아닙니다. 78초는 Claude 응답 4번, 6.5초는 14초 녹음을 받아쓴 시간입니다.`);
    sub(s, '품질 측정', 3.92, 1.8);
    // 숫자 3개
    const tiles = [['10/10건', '초안 생성 성공', '중단·실패 없이 초안 반환'], null, ['0건', '금지 내용', '사례별로 정해 둔 오답과 대조']];
    const tw = 2.3, tg = 0.2;
    for (let i = 0; i < 3; i++) {
      const x = 3.92 + i * (tw + tg), y = 2.5, h = 3.2;
      card(s, x, y, tw, h);
      if (tiles[i]) {
        T(s, tiles[i][0], x, y + 0.2, tw, 1.8, { fontSize: i === 0 ? 34 : 44, weight: 'B', color: G1, align: 'center', valign: 'middle' });
        T(s, tiles[i][1], x, y + 2.05, tw, 0.45, { fontSize: 16, weight: 'B', color: BLACK, align: 'center' });
        T(s, tiles[i][2], x + 0.15, y + 2.5, tw - 0.3, 0.65, { fontSize: 12.5, weight: 'M', color: GRAY, align: 'center', lineSpacingMultiple: 1.1 });
      } else {
        s.addChart(pres.ChartType.doughnut, [{ name: '항목 상태 일치율', labels: ['일치', '불일치'], values: [80, 10] }], { x: x + 0.2, y: y + 0.15, w: 1.9, h: 1.9, holeSize: 74, chartColors: [G2, 'DDE5E0'], showLegend: false, showTitle: false, showValue: false, showPercent: false, showLabel: false, dataBorder: { pt: 0, color: WHITE } });
        T(s, '88.9%', x, y + 0.15, tw, 1.9, { fontSize: 22, weight: 'B', color: G1, align: 'center', valign: 'middle' });
        T(s, '항목 상태 일치율', x, y + 2.05, tw, 0.45, { fontSize: 16, weight: 'B', color: BLACK, align: 'center' });
        T(s, '기대 결과와 같은 항목 상태 (80/90)', x + 0.15, y + 2.5, tw - 0.3, 0.65, { fontSize: 12.5, weight: 'M', color: GRAY, align: 'center', lineSpacingMultiple: 1.1 });
      }
    }
    // 와플: 90칸 중 80칸
    T(s, '항목 상태 90칸 · 일치 80 · 불일치 10', 3.92, 5.95, 7.3, 0.35, { fontSize: 13, weight: 'B', color: G1 });
    for (let k = 0; k < 90; k++) {
      const col = k % 18, row = Math.floor(k / 18);
      s.addShape(SH.ROUNDED_RECTANGLE, { x: 3.92 + col * 0.405, y: 6.35 + row * 0.405, w: 0.34, h: 0.34, fill: { color: k < 80 ? G2 : 'CFD8D3' }, line: { color: WHITE, width: 0.5 }, rectRadius: 0.06 });
    }
    T(s, '측정 중 발견한 오류 1건(섭취량 값이 지워짐) 수정·배포 후 다시 측정 · 남은 불일치 10칸은 사람 검토 대상', 3.92, 8.5, 7.3, 0.9, { fontSize: 13.5, weight: 'M', color: BLACK, lineSpacingMultiple: 1.15 });
    // 최적화
    sub(s, '성능 및 비용 최적화', 11.9, 1.8);
    const ox = 11.9, ow = 7.5;
    const optRows = [
      { name: '캐시 적용', num: '차감 토큰 38% 감소', desc: '같은 지시문은 캐시에서 읽음', bars: [['적용 전', 1.0, '100%'], ['적용 후', 0.62, '62%']] },
      { name: '도우미 교재 발췌', num: '6,600 → 2,231', desc: '질문 1건 차감 토큰', bars: [['발췌 전', 1.0, '6,600'], ['발췌 후', 2231 / 6600, '2,231']] },
      { name: '같은 질문 답 재사용', num: '6.6초 → 0.5초', desc: '추가 AI 호출 0회', bars: [['처음', 1.0, '6.6초'], ['재사용', 0.5 / 6.6, '0.5초']] },
    ];
    optRows.forEach((r, i) => {
      const y = 2.5 + i * 1.72, h = 1.55;
      card(s, ox, y, ow, h);
      T(s, r.name, ox + 0.25, y + 0.15, 3.2, 0.4, { fontSize: 15, weight: 'B', color: BLACK, valign: 'middle' });
      T(s, r.num, ox + 0.25, y + 0.55, 3.3, 0.5, { fontSize: 19, weight: 'B', color: G2, valign: 'middle' });
      T(s, r.desc, ox + 0.25, y + 1.05, 3.3, 0.4, { fontSize: 12, weight: 'R', color: MUTE, valign: 'middle' });
      const bx = ox + 3.7, bw = 2.6;
      r.bars.forEach(([lab, ratio, val], j) => {
        const by = y + 0.3 + j * 0.6;
        T(s, lab, bx, by, 0.9, 0.4, { fontSize: 11.5, weight: 'R', color: GRAY, valign: 'middle' });
        rect(s, bx + 0.95, by + 0.06, bw, 0.28, 'E3E8E5', { r: 0.05 });
        rect(s, bx + 0.95, by + 0.06, Math.max(0.12, bw * ratio), 0.28, j === 0 ? 'A9B7B0' : G2, { r: 0.05 });
        T(s, val, bx + 0.95 + bw + 0.1, by, 0.9, 0.4, { fontSize: 11.5, weight: 'B', color: j === 0 ? GRAY : G1, valign: 'middle' });
      });
    });
    {
      const y = 2.5 + 3 * 1.72, h = 1.55;
      card(s, ox, y, ow, h, { fill: G1_T, line: G1_T, shadow: false });
      T(s, '처리 시간 · 1건 측정', ox + 0.25, y + 0.15, 3.5, 0.4, { fontSize: 15, weight: 'B', color: BLACK, valign: 'middle' });
      s.addText(R([['초안 생성 ', { weight: 'M', fontSize: 14, color: GRAY }], ['78초', { weight: 'B', fontSize: 22, color: G1 }], ['      14초 녹음 ', { weight: 'M', fontSize: 14, color: GRAY }], ['6.5초', { weight: 'B', fontSize: 22, color: G1 }], ['에 받아씀', { weight: 'M', fontSize: 14, color: GRAY }]]), { x: ox + 0.25, y: y + 0.55, w: ow - 0.5, h: 0.55, isTextBox: true, margin: 0, valign: 'middle' });
      T(s, '전·후 비교가 아닌 참고값', ox + 0.25, y + 1.1, 5, 0.35, { fontSize: 12, weight: 'R', color: MUTE, valign: 'middle' });
    }
    T(s, '※ 측정 결과: 2026.11.04 코디세이 배포본 · 합성 사례 시설 5건/재가 5건 · 글 입력 기준(받아쓰기 정확도·번역 품질과 별개)\n※ 최적화: 캐시·처리 시간 2026.10.28 합성 사례 1건 · 도우미 2026.11.02(발췌 전)·11.04(발췌 후)', 3.92, 9.75, 15.3, 0.75, { fontSize: 11, weight: 'R', color: MUTE, lineSpacingMultiple: 1.2 });
  }

  // =====================================================================
  // 12. 기대 효과 및 확장 계획
  // =====================================================================
  {
    const s = frame('04 기대 효과 및 확장 계획', 3,
      `첫 문장: "작성자·관리자 부담 감소 기대, 교육기관 실습부터 시설·재가 현장으로 도입" (40초)
기대 효과 → 기능 고도화("네 가지를 고도화합니다"로 넘김) → 도입 순서와 수익 모델 순서입니다.
기대 효과는 모두 예상입니다. 작성 시간 단축을 숫자로 말하지 않습니다.
"시설·재가 기록 초안과 검토·승인, 두 법정 서식 출력은 이미 만들었습니다. 남은 것은 기능이 아니라 현장 검증입니다. 교육기관 합성 사례 실습에서 시작해, 시설에서 실사용자 사용성과 원어민 번역 검수를 거치고, 재가 기관으로 넓힙니다."
재가 근거: 근무 중인 외국인 요양보호사 7,623명 중 5,425명이 방문형 기관에서 일합니다.
수익 모델은 한 문장으로만 말합니다. 건강정보라 데이터 외부 판매는 하지 않습니다.`);
    sub(s, '기대 효과', 3.92, 1.8, '(예상)');
    const eff = [[Md.MdRecordVoiceOver, '외국인 요양보호사', '5쪽 작성자 부담', ['모국어로 말해 기록 부담·언어 장벽 감소', '기록하며 한국어·요양 용어에 노출'], G1], [Md.MdFactCheck, '관리자', '5쪽 관리자 부담', ["'확인 필요' 항목만 원문과 함께 검토", '재질문·문장 재작성 부담 감소'], BLUE], [Md.MdPublic, '기관·사회', '4쪽 문제 정의', ['교육원 실습부터 현장 기록까지 한 도구', '외국인 요양보호사의 현장 정착 지원'], TEAL]];
    for (let i = 0; i < 3; i++) {
      const [I, who, link, lines, c] = eff[i], x = 3.92, y = 2.5 + i * 1.6, w = 7.5, h = 1.45;
      card(s, x, y, w, h);
      await icon(s, I, x + 0.25, y + 0.3, 0.85, WHITE, c);
      s.addText(R([[who + '  ', { weight: 'B', fontSize: 17, color: G1 }], [link, { weight: 'R', fontSize: 12, color: MUTE }]]), { x: x + 1.3, y: y + 0.15, w: w - 1.5, h: 0.4, isTextBox: true, margin: 0, valign: 'middle' });
      T(s, lines.join('  /  '), x + 1.3, y + 0.55, w - 1.5, 0.85, { fontSize: 13.5, weight: 'M', color: BLACK, lineSpacingMultiple: 1.15 });
    }
    sub(s, '기능 고도화', 11.9, 1.8);
    const adv = [[Md.MdTranslate, '언어 지원 확대', '태국어·러시아어 추가(교육생 국적 기준)'], [Md.MdMic, '섞인 언어 받아쓰기', '섞어 말해도 빠짐없이 받아쓰기(현재 1녹음 1언어)'], [Md.MdSpellcheck, '번역 품질', '원어민 번역 검수(현재 역번역·용어 목록으로 확인)'], [Md.MdHealthAndSafety, '현장 적용 준비', '교육기관 실사용자 테스트, 운영 전 건강정보 법률 검토']];
    for (let i = 0; i < 4; i++) {
      const [I, name, desc] = adv[i], x = 11.9, y = 2.5 + i * 1.2, w = 7.5, h = 1.05;
      card(s, x, y, w, h);
      await icon(s, I, x + 0.2, y + 0.18, 0.7, WHITE, G2);
      T(s, name, x + 1.1, y + 0.12, w - 1.3, 0.4, { fontSize: 16, weight: 'B', color: G1, valign: 'middle' });
      T(s, desc, x + 1.1, y + 0.52, w - 1.3, 0.45, { fontSize: 13, weight: 'M', color: BLACK, valign: 'middle' });
    }
    sub(s, '확장 로드맵 및 수익 모델', 3.92, 7.45, '(안)');
    const road = [['구현 완료', '시설(별지 제16호)·재가(별지 제12호) 기록 초안, 검토·승인, 서식 출력', G1], ['Phase 1 · 교육기관', '합성 사례 기록 실습 → 양성대학 24곳(2025.8 선정)', G2], ['Phase 2 · 요양시설 현장 검증', '실사용자 사용성·원어민 번역 검수', TEAL], ['Phase 3 · 재가', '재가 기관으로 확대, 현장 운영 검증', BLUE]];
    road.forEach(([name, desc, c], i) => {
      const x = 3.92 + i * 3.9, w = 3.75;
      s.addShape(i === 0 ? SH.PENTAGON : SH.CHEVRON, { x, y: 8.15, w: w + 0.1, h: 0.6, fill: { color: c }, line: { color: c, width: 0.5 } });
      T(s, name, x + 0.3, 8.15, w - 0.6, 0.6, { fontSize: 14, weight: 'B', color: WHITE, valign: 'middle', align: 'center' });
      T(s, desc, x + 0.1, 8.85, w - 0.2, 0.85, { fontSize: 12.5, weight: 'M', color: BLACK, lineSpacingMultiple: 1.12 });
    });
    card(s, 3.92, 9.75, 15.48, 0.75, { fill: G1_T, line: G1_T, shadow: false });
    await icon(s, Md.MdAttachMoney, 4.05, 9.83, 0.58, G1);
    s.addText(R([['수익 모델(안)  ', { weight: 'B', fontSize: 15, color: G1 }], ['교육기관의 기록·검토 실습 도구 구독 → 시설·재가 기관 기록 업무 지원으로 확대', { weight: 'M', fontSize: 14.5, color: BLACK }]]), { x: 4.75, y: 9.75, w: 14.5, h: 0.75, isTextBox: true, margin: 0, valign: 'middle' });
  }

  // =====================================================================
  // 13. 감사합니다
  // =====================================================================
  {
    const s = pres.addSlide({ masterName: 'COVER' });
    s.addImage({ data: tri, x: 14.4, y: 7.6, w: 6.4, h: 4.2, transparency: 60 });
    s.addImage({ data: whiteLogo, x: 2.0, y: 3.4, w: 4.4, h: 4.4 });
    T(s, '감사합니다', 7.6, 3.3, 11, 1.4, { fontSize: 72, weight: 'B', color: WHITE, valign: 'middle' });
    T(s, 'Q&A', 7.6, 4.75, 11, 0.9, { fontSize: 40, weight: 'B', color: G2, valign: 'middle' });
    hline(s, 7.6, 6.0, 3.0, G2, 2);
    await icon(s, Md.MdPublic, 7.6, 6.35, 0.5, WHITE);
    s.addText(R([['Service  |  ', { weight: 'R', fontSize: 22, color: 'BFE5D3' }], ['carebridge-codyssey.vercel.app', { weight: 'M', fontSize: 22, color: WHITE }]]), { x: 8.3, y: 6.3, w: 11, h: 0.6, isTextBox: true, margin: 0, valign: 'middle' });
    await icon(s, Md.MdCode, 7.6, 7.1, 0.5, WHITE);
    s.addText(R([['GitHub  |  ', { weight: 'R', fontSize: 22, color: 'BFE5D3' }], ['github.com/2dion/CareBridge', { weight: 'M', fontSize: 22, color: WHITE }]]), { x: 8.3, y: 7.05, w: 11, h: 0.6, isTextBox: true, margin: 0, valign: 'middle' });
    s.addNotes('질문을 받으면 해당 부록 장으로 넘어갑니다. 서비스 주소는 QR 코드로 바꿀 수 있습니다.');
  }

  // =====================================================================
  // 14. 부록 목록
  // =====================================================================
  {
    const s = frame('부록', -1, '지금 내용이 있는 장은 A8-1·A8-2입니다. 나머지 장은 따로 전달합니다.');
    const groups = [['서비스 설계', Md.MdDescription, ['A1  9개 기록 항목 및 법정 서식 칸 대응', 'A2  기록 상태 변화']], ['기술 구조', Md.MdHub, ['A3  시스템 구성, 기술 스택 및 예외 처리', 'A4  AI 처리 흐름 및 비용·속도 최적화', 'A5  데이터 구조(ERD)']], ['검증', Md.MdVerifiedUser, ['A6  품질 측정 및 테스트 결과']], ['운영 및 개발', Md.MdHandshake, ['A7  개인정보 보호 및 책임 범위', 'A8  협업 방식 및 역할별 기여', 'A9  참고 자료']]];
    for (let i = 0; i < 4; i++) {
      const [name, I, items] = groups[i], x = 3.92 + (i % 2) * 7.9, y = 2.4 + Math.floor(i / 2) * 3.95, w = 7.58, h = 3.6;
      card(s, x, y, w, h);
      await icon(s, I, x + 0.35, y + 0.35, 0.8, WHITE, G1);
      T(s, name, x + 1.35, y + 0.35, w - 1.6, 0.8, { fontSize: 24, weight: 'B', color: G1, valign: 'middle' });
      hline(s, x + 0.35, y + 1.4, w - 0.7, LINE);
      items.forEach((t, j) => T(s, t, x + 0.4, y + 1.6 + j * 0.6, w - 0.8, 0.55, { fontSize: 17, weight: 'M', color: BLACK, valign: 'middle' }));
    }
  }

  // ---- A1~A7 자리 ----
  const apx = [['A1 9개 기록 항목 및 법정 서식 칸 대응'], ['A2 기록 상태 변화'], ['A3 시스템 구성, 기술 스택 및 예외 처리'], ['A4 AI 처리 흐름 및 비용·속도 최적화'], ['A5 데이터 구조(ERD)'], ['A6 품질 측정 및 테스트 결과'], ['A7 개인정보 보호 및 책임 범위']];
  apx.forEach(([t]) => placeholderSlide(t, '내용 따로 전달 · 자리', '내용은 기획 담당이 따로 전달합니다.'));

  // =====================================================================
  // A8-1 팀원별 기여
  // =====================================================================
  {
    const s = frame('A8-1 팀원별 기여', -1,
      `첫 문장: "역할마다 대표 산출물과 확인 기록(이슈·PR)을 남김"
각 줄은 저장소 기록으로 만든 초안이라 본인 줄은 각자 확인합니다. 개인별 커밋 수는 넣지 않습니다.`);
    const H = (t) => ({ text: t, options: Object.assign({ fill: { color: G1 }, color: WHITE, fontSize: 15, align: 'center', valign: 'middle', margin: [0.04, 0.08, 0.04, 0.08] }, fnt('B')) });
    const C = (t, o = {}) => ({ text: t, options: Object.assign({ fontSize: 14, color: BLACK, valign: 'middle', margin: [0.05, 0.1, 0.05, 0.1] }, fnt('M'), o) });
    const L = (t) => C(t, Object.assign({ color: G1, fill: { color: G1_T }, align: 'center' }, fnt('B')));
    const data = [
      ['팀장', '일정·결정, 이슈 운영', '공모전·코디세이 환경 분리, 모국어 3개 언어 확장 단계 관리', '결정 11-02 · #308'],
      ['기획', '화면 설계·용어집', "용어 통일 결정('담당자' → '관리자', '늦게 전송' → '지연전송' 등 4건), 사투리 기준 결정", '#94 · 결정 10-29 · #230'],
      ['BE', 'DB·API·AI Agent', '모국어 낱말 용어 검색, 재가 시간 합 DB 검사, 법정 서식 인쇄', '#362 → PR #363 · #278 · #317'],
      ['FE', '작성자·관리자 화면', '언어별 화면 번역 파일, 관리자 기록 현황(M0), 기간 인쇄 화면', '#258 · #148 · #262'],
      ['QA', '테스트·AI 품질 측정', '합성 사례 10건 실제 AI 측정, 새 언어 받아쓰기·번역 확인', '#275 · #315'],
      ['데이터', '용어·번역·교재', '사투리 61개, 용어 번역(중국어·몽골어·영어), 시연 음성', 'PR #353 · #314 · #157'],
    ];
    s.addTable([[H('역할'), H('맡은 일'), H('대표 산출물'), H('확인 기록')], ...data.map(r => [L(r[0]), C(r[1]), C(r[2]), C(r[3], { color: GRAY })])], { x: 3.92, y: 2.1, w: 15.48, colW: [1.6, 3.0, 7.4, 3.48], rowH: [0.55, 0.85, 0.95, 0.85, 0.85, 0.85, 0.85], border: { type: 'solid', pt: 0.75, color: LINE }, fill: { color: WHITE }, autoPage: false });
    card(s, 3.92, 8.2, 15.48, 2.2, { fill: G1_T, line: G1_T, shadow: false });
    s.addText([
      { text: '협업 기록: 커밋 438 · 이슈 125(120 해결) · 병합 PR 237 · 결정 기록 82', options: Object.assign({ bullet: { code: '2022', indent: 14 }, breakLine: true, paraSpaceAfter: 6, fontSize: 16, color: BLACK }, fnt('B')) },
      { text: 'PR은 자동 검사 통과 후 병합 · 사람 검토는 이슈 토론·담당 간 재확인', options: Object.assign({ bullet: { code: '2022', indent: 14 }, breakLine: true, paraSpaceAfter: 6, fontSize: 16, color: BLACK }, fnt('M')) },
      { text: 'GitHub 저장소 main-codyssey 기준, 2026.11.06 조사', options: Object.assign({ bullet: { code: '2022', indent: 14 }, fontSize: 16, color: GRAY }, fnt('M')) },
    ], { x: 4.3, y: 8.4, w: 14.8, h: 1.9, isTextBox: true, margin: 0, valign: 'middle' });
  }

  // =====================================================================
  // A8-2 함께 해결한 사례
  // =====================================================================
  {
    const s = frame('A8-2 함께 해결한 사례', -1, `첫 문장: "한 담당이 찾은 문제를 다른 담당이 원인 분석·수정하고 다시 확인"`);
    const cases = [
      ['사례 1 · 몽골어 식사 용어', '#315 → #362 → PR #363', [['QA', '발견', "몽골어 기록의 식사 항목이 '확인 필요'로 나옴", TEAL], ['BE', '원인', 'AI 실행 기록 분석, 모국어 낱말 검색이 늘 빈 결과', BLUE], ['BE', '수정', '모국어 고정 번역으로도 용어 검색', BLUE], ['QA·BE', '재확인', "'зутан' → '죽', 확인 필요 → 관찰, 네 언어 확인", G1]]],
      ['사례 2 · 도우미 사투리', '#230 → PR #353', [['기획', '기준', "우리말샘 방언 뜻만, 기록에서는 '확인 필요'", G1], ['데이터', '추가', '사투리 61개 대조·추가 (용어 51 → 112개)', TEAL], ['팀장', '반영', '코디세이 DB에 용어·번역 반영', G1], ['데이터', '확인', '배포본 확인 중 출처 표시 문제 발견 → 새 이슈', TEAL]]],
    ];
    cases.forEach(([title, tag, steps], i) => {
      const x = 3.92 + i * 7.9, y = 2.2, w = 7.58, h = 7.3;
      card(s, x, y, w, h);
      T(s, title, x + 0.4, y + 0.3, w - 0.8, 0.55, { fontSize: 22, weight: 'B', color: G1, valign: 'middle' });
      T(s, tag, x + 0.4, y + 0.85, w - 0.8, 0.4, { fontSize: 14, weight: 'R', color: MUTE, valign: 'middle' });
      hline(s, x + 0.4, y + 1.4, w - 0.8, LINE);
      vline(s, x + 0.78, y + 1.95, 3 * 1.35 + 0.3, 'C9D6CF', 2);
      steps.forEach(([who, act, desc, c], j) => {
        const sy = y + 1.65 + j * 1.35;
        s.addShape(SH.OVAL, { x: x + 0.52, y: sy + 0.1, w: 0.52, h: 0.52, fill: { color: c }, line: { color: c, width: 0.5 } });
        T(s, String(j + 1), x + 0.52, sy + 0.1, 0.52, 0.52, { fontSize: 14, weight: 'B', color: WHITE, align: 'center', valign: 'middle' });
        s.addText(R([[who + ' · ', { weight: 'B', fontSize: 16, color: c }], [act, { weight: 'B', fontSize: 16, color: BLACK }]]), { x: x + 1.3, y: sy, w: w - 1.6, h: 0.5, isTextBox: true, margin: 0, valign: 'middle' });
        T(s, desc, x + 1.3, sy + 0.5, w - 1.6, 0.75, { fontSize: 14, weight: 'M', color: GRAY, lineSpacingMultiple: 1.12 });
      });
    });
    T(s, 'GitHub 이슈·PR 기록 기준(2026.11.04~11.06)', 3.92, 9.75, 15, 0.4, { fontSize: 13, weight: 'R', color: MUTE });
  }

  placeholderSlide('A9 참고 자료', '내용 따로 전달 · 자리', '내용은 기획 담당이 따로 전달합니다.');

  // ---------- 저장 ----------
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);

  // 막대그래프 강조색: 2025(최근 실측) 밝은 초록, 2027(전망) 옅은 초록 + 점선
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(fs.readFileSync(OUT));
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/charts\/chart\d+\.xml$/.test(name)) continue;
    let xml = await zip.file(name).async('string');
    if (!xml.includes('인정자')) continue;
    const dpt = (idx, fill, dash) => `<c:dPt><c:idx val="${idx}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>${dash ? `<a:ln w="19050"><a:solidFill><a:srgbClr val="${G2}"/></a:solidFill><a:prstDash val="dash"/></a:ln>` : ''}</c:spPr></c:dPt>`;
    xml = xml.replace('<c:dLbls>', dpt(5, G2) + dpt(6, 'C9EEDC', true) + '<c:dLbls>');
    zip.file(name, xml);
  }
  const clean = new JSZip();
  for (const name of Object.keys(zip.files)) if (!zip.files[name].dir) clean.file(name, await zip.file(name).async('nodebuffer'), { createFolders: false });
  fs.writeFileSync(OUT, await clean.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log('wrote', OUT, QA ? '(QA font)' : '');
})().catch(e => { console.error(e); process.exit(1); });
