import { Gothic_A1, Gowun_Batang, Gowun_Dodum, IBM_Plex_Mono, IBM_Plex_Sans_KR, Nunito } from "next/font/google";

/*
 * 테마별 글꼴 (globals.css 의 [data-palette] 가 골라 쓴다).
 * 한글 글꼴은 파일이 커서 미리 받지 않는다(preload: false) — 브라우저는 화면에 실제로 쓰인 글꼴만 받는다.
 * next/font 는 옵션을 리터럴로만 받는다(펼침·변수 불가).
 */
const gothicA1 = Gothic_A1({
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  preload: false,
  variable: "--ff-gothic-a1",
});
const plexKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  variable: "--ff-plex-kr",
});
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  variable: "--ff-plex-mono",
});
const gowunBatang = Gowun_Batang({ weight: ["400", "700"], display: "swap", preload: false, variable: "--ff-gowun-batang" });
const gowunDodum = Gowun_Dodum({ weight: "400", display: "swap", preload: false, variable: "--ff-gowun-dodum" });
const nunito = Nunito({ display: "swap", preload: false, variable: "--ff-nunito" });

export const fontVariables = [gothicA1, plexKr, plexMono, gowunBatang, gowunDodum, nunito].map((f) => f.variable).join(" ");
