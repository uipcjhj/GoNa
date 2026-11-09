/**
 * 오디오 디버그 패널 (?debugAudio=1 일 때만) — 아이폰에서도 배경음악 상태를 눈으로 확인
 * 장면 · 원하는 곡 · 실제로 소리 나는 배경음악 수 · <audio> 상태 · Web Audio 노드 수 · 합성 음악 · 최근 시작/정지 · 배포 버전
 */
import { sound } from '../audio';
import { el } from './dom';

export function mountAudioDebug(parent: HTMLElement, scene: () => string): void {
  const box = el('pre', 'audio-debug');
  parent.append(box);
  let version = '?';
  fetch('version.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      if (v?.short) version = `${v.short} (${String(v.built ?? '').slice(5, 16)})`;
    })
    .catch(() => {
      version = 'local';
    });
  let maxActive = 0;
  const draw = (): void => {
    const d = sound.bgmDebug();
    maxActive = Math.max(maxActive, d.active);
    box.classList.toggle('bad', d.active > 1);
    box.textContent = [
      `장면 ${scene()} · 버전 ${version}`,
      `원하는 BGM: ${d.want} · 세대 ${d.gen}`,
      `활성 BGM: ${d.active} (최대 ${maxActive})`,
      `HTML: ${d.html.join(' / ') || '없음'}`,
      `WebAudio 노드: ${d.webAudio} · 합성: ${d.synth ? '켜짐' : '꺼짐'} · 엔딩: ${d.ending}`,
      ...d.log.map((l) => `· ${l}`),
    ].join('\n');
  };
  draw();
  window.setInterval(draw, 300);
}
