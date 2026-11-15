// 별 이름 정하기: 한글 이름 → 영어 고유 이름 → 별자리 + 그리스 글자 → 카탈로그 번호 순.
// 확인하지 못한 한글 이름은 지어내지 않고 영어·기호로 둔다.

export interface StarNames {
  /** 별자리 약어 목록 (stars.bin의 별자리 번호 순서) */
  cons: string[];
  /** 별 번호 → 영어 고유 이름 */
  proper: Record<string, string>;
  /** 별 번호 → 바이어/플램스티드 기호 (예: "58Alp Ori") */
  bf: Record<string, string>;
}

export interface KoreanNames {
  constellations: Record<string, string>;
  stars: Record<string, string>;
}

const GREEK: Record<string, string> = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ',
  Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π',
  Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};

export interface Designation {
  /** 플램스티드 번호 (없으면 null) */
  flamsteed: number | null;
  /** 그리스 글자 (없으면 null). 예: 'α' */
  greek: string | null;
  /** 같은 글자가 여럿일 때 붙는 번호 (예: π3의 3) */
  greekIndex: number | null;
  /** 별자리 약어 */
  con: string;
}

/** HYG의 bf 값("58Alp Ori", "Pi 3Ori", "Alp1Cen", "21    And")을 풀어낸다. 못 풀면 null. */
export function parseDesignation(bf: string): Designation | null {
  const m = /^\s*(\d+)?\s*([A-Za-z]{2,3})?\s*(\d+)?\s*([A-Za-z]{3})\s*$/.exec(bf);
  if (!m) return null;
  const [, flam, letter, index, con] = m;
  const greek = letter ? (GREEK[letter[0].toUpperCase() + letter.slice(1).toLowerCase()] ?? null) : null;
  if (letter && !greek) return null;
  if (!flam && !greek) return null;
  return {
    flamsteed: flam ? Number(flam) : null,
    greek,
    greekIndex: greek && index ? Number(index) : null,
    con,
  };
}

export interface StarLabel {
  /** 카드 제목 */
  name: string;
  /** 한글 별자리 이름 (없으면 빈 문자열) */
  constellation: string;
}

export function starLabel(
  index: number,
  conIndex: number,
  hip: number,
  names: StarNames,
  ko: KoreanNames,
): StarLabel {
  const conAbbr = names.cons[conIndex] ?? '';
  const constellation = ko.constellations[conAbbr] ?? conAbbr;
  const proper = names.proper[String(index)];
  if (proper) return { name: ko.stars[proper] ?? proper, constellation };

  const bf = names.bf[String(index)];
  const d = bf ? parseDesignation(bf) : null;
  if (d) {
    const conName = ko.constellations[d.con] ?? d.con;
    if (d.greek) return { name: `${conName} ${d.greek}${d.greekIndex ?? ''}별`, constellation };
    if (d.flamsteed !== null) return { name: `${conName} ${d.flamsteed}번 별`, constellation };
  }
  if (hip > 0) return { name: `이름 없는 별 (HIP ${hip})`, constellation };
  return { name: '이름 없는 별', constellation };
}
