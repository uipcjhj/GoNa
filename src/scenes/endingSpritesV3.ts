/** 자동 생성: tools/extract_ending_npc.py — 최종 엔딩 캐릭터 시트(3차, 스타듀밸리풍 NPC)에서 원래 도트 크기로 복원 */
export const ENDING_V3 = {
  imo: { file: 'v3-imo', w: 21, h: 36, special: false, anims: { idle: [0] } },
  samchon: { file: 'v3-samchon', w: 22, h: 38, special: false, anims: { idle: [0] } },
  mom: { file: 'v3-mom', w: 22, h: 38, special: false, anims: { idle: [0], walk: [1, 2, 3, 4], happy: [5, 6, 7], wave: [8, 9, 10], open_arms: [11, 12, 13] } },
  dad: { file: 'v3-dad', w: 21, h: 39, special: false, anims: { idle: [0] } },
  halmeoni: { file: 'v3-halmeoni', w: 22, h: 35, special: false, anims: { idle: [0] } },
  halabeoji: { file: 'v3-halabeoji', w: 19, h: 38, special: false, anims: { idle: [0] } },
  gona: { file: 'v3-gona', w: 23, h: 33, special: false, anims: { s1: [0], s2: [1], s3: [2], idle: [3] } },
  mom_hug: { file: 'v3-mom_hug', w: 19, h: 25, special: true, anims: { mom_hug: [0, 1, 2, 3, 4] } },
  grandma_kiss: { file: 'v3-grandma_kiss', w: 21, h: 24, special: true, anims: { grandma_kiss: [0, 1, 2, 3, 4] } },
  uncle_sniff: { file: 'v3-uncle_sniff', w: 22, h: 26, special: true, anims: { uncle_sniff: [0, 1, 2, 3, 4] } },
} as const;
