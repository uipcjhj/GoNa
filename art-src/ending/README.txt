엔딩 컷신 원본
- bg-land-original.png / bg-port-original.png: 엔딩 전용 배경 (인물 없음). 이미지 생성(gpt_image_2_6)으로 텍스트 설명만 사용해 만듦 — 참고 이미지 업로드 없음.
  프롬프트 요지: 아늑한 16비트 도트, 황금빛 노을(연보라→황금·주황 하늘, 지평선 근처 큰 해, 몽글몽글 구름),
  빨간 버섯 지붕 오두막·둥근 나무·먼 언덕, 가운데가 비어 있는 따뜻한 돌바닥 광장, 아래쪽 꽃, 두꺼운 갈색 외곽선, 인물·글자 없음.
  가로 16:9 / 세로 9:16 두 장.
- 게임용 변환: python3 tools/build_ending_bg.py → public/assets/ending/bg-land.png (480x268), bg-port.png (268x480) — 64색 정리
- 가족 캐릭터: python3 tools/build_family_cine.py (코드로 그린 도트) → public/assets/ending/family-{id}.png + family-{id}-arms.png
- 고나 웃는 얼굴: python3 tools/build_ending_gona.py (gona-trot 의 눈만 ^ ^ 로) → public/assets/ending/gona-laugh.png
