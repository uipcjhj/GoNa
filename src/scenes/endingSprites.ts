/** 자동 생성: tools/extract_ending_sprites.py — 엔딩 캐릭터 가로 띠(public/assets/ending/chars/<인물>.png)의 칸 크기와 동작별 프레임 번호 */
export const ENDING_SPRITES = {
  gona: { w: 44, h: 51, anims: { idle: [0, 1], walk: [2, 3, 4, 5], run: [6, 7, 8, 9], happy: [10, 11, 12], wow: [13, 14, 15], sit: [16, 17], held: [18, 19, 20] } },
  imo: { w: 52, h: 62, anims: { idle: [0, 1], walk: [2, 3, 4, 5], happy: [6, 7, 8], talk: [9, 10, 11], wave: [12, 13, 14], hug: [15, 16, 17] } },
  samchon: { w: 46, h: 65, anims: { idle: [0, 1], walk: [2, 3, 4, 5], happy: [6, 7, 8], talk: [9, 10, 11], wave: [12, 13, 14], sniff: [15, 16, 17] } },
  mom: { w: 52, h: 58, anims: { idle: [0, 1], walk: [2, 3, 4, 5], happy: [6, 7, 8], talk: [9, 10, 11], clap: [12, 13, 14], hug: [15, 16, 17] } },
  dad: { w: 52, h: 61, anims: { idle: [0, 1], walk: [2, 3, 4, 5], happy: [6, 7, 8], talk: [9, 10, 11], wave: [12, 13, 14], hug: [15, 16, 17] } },
  halmeoni: { w: 56, h: 58, anims: { idle: [0, 1], walk: [2, 3, 4, 5], happy: [6, 7, 8], talk: [9, 10, 11], kiss: [12, 13, 14], hug: [15, 16, 17] } },
  halabeoji: { w: 52, h: 65, anims: { idle: [0, 1], walk: [2, 3, 4, 5], happy: [6, 7, 8], talk: [9, 10, 11], wave: [12, 13, 14], hug: [15, 16, 17] } },
} as const;
export const ENDING_FX = ['joy', 'question', 'note', 'heart', 'hearts', 'sniff', 'puff', 'star', 'flower'] as const;
export type EndingCharId = keyof typeof ENDING_SPRITES;
