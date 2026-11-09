/** 자동 생성: tools/extract_ending_assets_v2.py — 최종 확정 시트(2차)에서 떼어 낸 고나·엄마·특수 동작 (원본 1배) */
export const ENDING_SPRITES_V2 = {
  gona: { file: 'v2-gona', w: 40, h: 47, special: false, anims: { idle: [0, 1], walk: [2, 3, 4, 5], run: [6, 7, 8, 9, 10], happy: [11, 12, 13], open_arms: [14, 15, 16], receive_kiss: [17, 18, 19], tickle: [20, 21, 22] } },
  mom: { file: 'v2-mom', w: 44, h: 57, special: false, anims: { idle: [0, 1], walk: [2, 3, 4], happy: [5, 6], wave: [7], open_arms: [8, 9], hug: [10, 11, 12, 13], smile: [14, 15] } },
  mom_hug: { file: 'sp-mom_hug', w: 76, h: 64, special: true, anims: { mom_hug: [0, 1, 2, 3, 4] } },
  grandma_kiss: { file: 'sp-grandma_kiss', w: 72, h: 66, special: true, anims: { grandma_kiss: [0, 1, 2, 3, 4] } },
  uncle_sniff: { file: 'sp-uncle_sniff', w: 72, h: 68, special: true, anims: { uncle_sniff: [0, 1, 2, 3, 4] } },
} as const;
/** 고나 기본 프레임: 칸 가운데에서 몸 왼쪽·오른쪽 끝 (px) */
export const GONA_V2_EDGE = [-17, 17] as const;
