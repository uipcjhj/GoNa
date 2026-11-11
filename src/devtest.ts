/**
 * 개발용 기능 테스트 메뉴 — 프롤로그부터 끝까지 하지 않고 고친 기능으로 바로 이동
 *   진입: 주소 끝 ?test=menu (또는 대표 타이틀 오른쪽 위 🧪 → '기능 테스트 메뉴')
 *   바로 이동: ?test=<id>  (예: ?test=kiss-boss · ?test=prologue-perf · ?test=ending-image)
 *   테스트 중에는 저장하지 않음(최고 점수·체크포인트 그대로) · 왼쪽 위 '🧪 메뉴' 로 언제든 메뉴로 (새로 불러와서 오브젝트·타이머가 남지 않음)
 *   ?test (값 없음) 는 예전처럼 자동 테스트용 훅만 켬
 */
import Phaser from 'phaser';
import { bus, EV } from './events';
import { storage } from './storage';
import { haptics, type HapticKind } from './haptics';
import { el } from './ui/dom';

export const TEST_ITEMS: [string, string][] = [
  ['prologue', '1. 프롤로그'],
  ['stage1', '2. 고나 1단계 지면 정렬'],
  ['stage2', '3. 고나 2단계 지면 정렬'],
  ['stage3', '4. 고나 3단계 지면 정렬'],
  ['stage4', '5. 고나 4단계 지면 정렬'],
  ['kiss-boss', '6. 뽀뽀괴물 보스전'],
  ['sniff-boss', '7. 킁카괴물 보스전'],
  ['kiss-talk', '8. 뽀뽀괴물 대사 UI 테스트'],
  ['sniff-talk', '9. 킁카괴물 대사 UI 테스트'],
  ['sniff-nose', '10. 킁카괴물 돼지코 필살기 (①②③)'],
  ['sniff-weakpoint', '11. 킁카괴물 코 약점 명중 테스트 (자동 조준)'],
  ['glasses-dash', '12. 화학과안경잽이 돌진'],
  ['farter-dash', '13. 방구할배 돌진'],
  ['hurt', '14. 고나 피격 애니메이션 (4단계)'],
  ['vibrate', '15. 진동 테스트'],
  ['family-ending', '16. 엔딩 전체 (8장면 영상 → 황금 왕궁 액자 피날레)'],
  ['ending-hug', '17. 엔딩 달려가 안기기·뽀뽀·킁카 영상부터'],
  ['layout', '18. 세로·가로 화면 확인 (엔딩 가족사진 장면)'],
  ['prologue-perf', '19. 프롤로그 성능 테스트 (FPS·끊김 기록 표시)'],
  ['prologue-loop', '20. 프롤로그 반복 재생 테스트'],
  ['boss-hitfx', '21. 보스 피격 효과 (흔들림·충격파·필살기 히트스톱)'],
  ['gona-hitfx', '22. 고나 피격 효과 (움찔·빨간 번쩍·흔들림)'],
  ['ending-image', '23. 엔딩 마지막 가족사진 영상 바로 보기'],
  ['ending-credits', '24. 엔딩 황금 왕궁 액자 피날레 바로 보기'],
  ['kiss-special', '25. 뽀뽀괴물 고나 필살기 컷인 테스트'],
  ['sniff-aim', '26. 킁카괴물 코 타이밍 바 테스트 (직접 발사)'],
  ['sniff-inhale', '27. 킁카괴물 흡입 공격 테스트 (직접 버티기)'],
  ['resist-success', '28. 버티기 QTE 성공 테스트 (자동 연타)'],
  ['resist-fail', '29. 버티기 QTE 실패 테스트 (안 누름)'],
];

/** 주소의 ?test=값 (없으면 null · '' = 자동 테스트 훅만) */
export function testParam(): string | null {
  const q = new URLSearchParams(window.location.search);
  return q.has('test') ? q.get('test') ?? '' : null;
}

/** 메뉴 화면 */
export function showTestMenu(parent: HTMLElement): void {
  const root = el('div', 'test-menu');
  root.append(el('h2', '', '🧪 기능 테스트 메뉴'), el('p', 'tm-note', '저장하지 않는 테스트 모드 · 왼쪽 위 🧪 메뉴로 돌아와요'));
  const list = el('div', 'tm-list');
  for (const [id, label] of TEST_ITEMS) {
    const a = el('a', 'tm-item', label) as HTMLAnchorElement;
    a.href = `?test=${id}`;
    list.append(a);
  }
  const home = el('a', 'tm-item tm-home', '↩ 일반 게임으로') as HTMLAnchorElement;
  home.href = './';
  root.append(list, home);
  parent.append(root);
}

type Game = Phaser.Game;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** 시나리오 실행 (게임이 시작된 뒤 GameScene 에서) */
export function runScenario(id: string, game: Game, parent: HTMLElement): void {
  storage.readOnly = true;
  const back = el('a', 'tm-back', '🧪 메뉴') as HTMLAnchorElement;
  back.href = '?test=menu';
  parent.append(back);
  const info = el('div', 'tm-info hidden');
  parent.append(info);
  let sayTimer = 0;
  const say = (t: string): void => {
    info.textContent = t;
    info.classList.remove('hidden');
    // 안내는 잠깐만 (대사창·버튼을 가리지 않게)
    clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => info.classList.add('hidden'), 4500);
  };
  const g = (): Any => game.scene.getScene('Game');
  const waitFight = (fn: () => void): void => {
    const t = window.setInterval(() => {
      if (g().debugBattle()?.mode === 'fight') {
        clearInterval(t);
        fn();
      }
    }, 200);
  };
  const clearWorld = (): void => {
    const sc = g();
    sc.entities.forEach((e: Any) => {
      e.done = true;
      e.sprite.destroy();
    });
    sc.entities = [];
    sc.distToNext = 1e9;
    sc.sinceMonster = -1e9;
  };
  const sc = g();
  switch (id) {
    case 'stage1':
    case 'stage2':
    case 'stage3':
    case 'stage4': {
      const st = Number(id.slice(-1)) - 1;
      sc.debugGod();
      sc.debugSetStage(st);
      clearWorld();
      sc.showGroundGuide?.(true);
      say(`${st + 1}단계 · 노란 선 = 땅 기준 · 화면 터치 = 점프`);
      break;
    }
    case 'kiss-boss':
    case 'sniff-boss':
    case 'kiss-talk':
    case 'sniff-talk':
    case 'sniff-nose':
    case 'sniff-weakpoint':
    case 'kiss-special':
    case 'sniff-aim':
    case 'sniff-inhale':
    case 'resist-success':
    case 'resist-fail': {
      const boss = id.startsWith('kiss') ? 'kiss' : 'sniff';
      sc.debugSetStage(boss === 'kiss' ? 1 : 3);
      sc.boomerangAwake = true;
      if (id !== 'kiss-boss' && id !== 'sniff-boss' && id !== 'resist-fail') sc.debugGod();
      sc.debugStartBoss(boss);
      if (id.endsWith('-talk')) {
        waitFight(() => {
          const b = g().battle;
          b.awakened = true;
          b.rage = 3;
          b.specialsDone = 3;
          b.hp = 1;
          b.damage(5);
        });
        say('보스를 바로 쓰러뜨려 마지막 대사를 봐요 (건너뛰기 버튼 확인)');
      } else if (id === 'sniff-nose') {
        waitFight(() => {
          const b = g().battle;
          b.rage = 3;
          b.specialsDone = 0;
          b.cooldown = 0.3;
          b.hp = Math.round(b.def.maxHp * 0.12);
        });
        say('돼지코 필살기 ①②③ 이 차례로 나와요 (고나 무적) · 빨간 화살표를 보면 점프');
      } else if (id === 'sniff-weakpoint' || id === 'sniff-aim') {
        // 지친 상태 + 움직이는 과녁을 반복 (자동 조준: 과녁이 코에 머무는 순간 '조준!')
        const auto = id === 'sniff-weakpoint';
        waitFight(() => {
          const open = (): void => {
            const b = g().battle;
            if (!b || b.mode !== 'fight') return;
            b.ai = [];
            b.busy = true;
            b.hp = Math.max(b.hp, Math.round(b.def.maxHp * 0.6));
            b.stun(6, 1, '킁카괴물이 어질어질!');
            b.startAim(5.6);
          };
          open();
          window.setInterval(open, 8000);
          if (auto) {
            window.setInterval(() => {
              const b = g().battle;
              const a = b?.aim;
              if (a && !a.locked && a.pause <= 0 && Math.abs(a.pos - 0.5) < 0.035) bus.emit(EV.attack);
            }, 50);
          }
        });
        say(auto ? '타이밍 바 커서가 가운데(코)에 오면 자동 발사 → PERFECT 코 명중 ×2 (반복)' : "타이밍 바 커서가 가운데 코(노란 칸)에 오면 '발사!' (공격 버튼) — PERFECT ×2 · GOOD 보통 · MISS 빗나감");
      } else if (id === 'kiss-special') {
        // 필살기 게이지를 채워 바로 '초특급 꼬불머리 팡팡!' (얼굴 컷인) — 9초마다 반복
        waitFight(() => {
          const go = (): void => {
            const b = g().battle;
            if (!b || b.mode !== 'fight') return;
            b.hp = Math.max(b.hp, Math.round(b.def.maxHp * 0.8));
            b.special = 1;
            bus.emit(EV.special);
          };
          window.setTimeout(go, 600);
          window.setInterval(go, 9000);
        });
        say('필살기 얼굴 컷인 (9초마다) — 얼굴·머리카락·후드가 잘리지 않는지 확인');
      } else if (id === 'sniff-inhale' || id === 'resist-success' || id === 'resist-fail') {
        // 강력한 흡입 + 버티기 QTE 반복 (성공 테스트 = 초당 약 5번 자동 연타, 실패 테스트 = 안 누름)
        waitFight(() => {
          const go = (): void => {
            const b = g().battle;
            if (!b || b.mode !== 'fight') return;
            const s2 = g();
            s2.hearts = 3;
            s2.hp = 100;
            b.ai = [];
            b.busy = true;
            b.hp = Math.max(b.hp, Math.round(b.def.maxHp * 0.6));
            b.inhale();
          };
          window.setTimeout(go, 400);
          window.setInterval(go, 9000);
          if (id === 'resist-success') window.setInterval(() => g().battle?.resistActive && bus.emit(EV.shield), 200);
        });
        say(id === 'sniff-inhale' ? "흡입이 오면 '버티기!' (방패 버튼) 연타 — 9초마다 반복" : id === 'resist-success' ? '자동으로 초당 5번 연타 → 버티기 성공' : '누르지 않음 → 끌려가서 피해 (실패)');
      } else say(boss === 'kiss' ? '뽀뽀괴물 보스전 (필살기 ①②③ · 마지막 대사)' : '킁카괴물 보스전 (돼지코 돌진 · 코 약점)');
      break;
    }
    case 'glasses-dash':
    case 'farter-dash': {
      const kind = id.startsWith('glasses') ? 'glasses' : 'farter';
      sc.debugGod();
      sc.debugSetStage(2);
      clearWorld();
      sc.debugForceDash = true;
      const spawn = (): void => {
        const s2 = g();
        if (s2.entities.some((e: Any) => e.type === 'monster' && !e.done)) return;
        s2.addMonster(kind, s2.W + 4);
        const m = s2.entities[s2.entities.length - 1];
        m.mon.attacks = 1;
      };
      spawn();
      window.setInterval(spawn, 1500);
      say(`${kind === 'glasses' ? '화학과안경잽이' : '방구할배'} 돌진 (예고 '!' 뒤 돌진 · 반복)`);
      break;
    }
    case 'boss-hitfx': {
      // 보스를 1.2초마다 맞혀 타격 효과를 보고, 필살기 게이지를 채워 두어 '필살기' 버튼으로 마지막 강타(히트스톱) 확인
      sc.debugSetStage(1);
      sc.boomerangAwake = true;
      sc.debugGod();
      sc.debugStartBoss('kiss');
      waitFight(() => {
        const b = g().battle;
        b.ai = [];
        b.busy = true;
        b.cooldown = 1e9;
        window.setInterval(() => {
          const bb = g().battle;
          if (!bb || bb.mode !== 'fight') return;
          bb.hp = bb.def.maxHp;
          bb.damage(1);
          if (bb.special < 1) bb.special = 1;
        }, 1200);
      });
      say('보스가 1.2초마다 맞아요 (흔들림·충격파) · 필살기 버튼 = 마지막 강타 히트스톱');
      break;
    }
    case 'gona-hitfx':
    case 'hurt': {
      sc.debugGod(false);
      let st = 0;
      const hit = (): void => {
        const s2 = g();
        s2.debugSetStage(st % 4);
        clearWorld();
        s2.hearts = 3;
        s2.hp = 100;
        s2.invincibleUntil = 0;
        s2.hurtHp(10, 'test');
        say(`${(st % 4) + 1}단계 피격 (2초마다)`);
        st++;
      };
      hit();
      window.setInterval(hit, 2000);
      break;
    }
    case 'vibrate': {
      sc.debugGod();
      clearWorld();
      const panel = el('div', 'tm-vib');
      panel.append(el('p', '', haptics.supported ? `이 브라우저는 진동을 지원해요 · 설정: ${haptics.enabled ? '켜짐' : '꺼짐'}` : '이 브라우저(예: iPhone Safari)는 웹 진동을 지원하지 않아요 — 눌러도 아무 일 없음(오류 없음)'));
      const kinds: [HapticKind, string][] = [
        ['monsterHit', '몬스터 타격 (짧고 약하게)'],
        ['hurt', '고나 피격 (중간)'],
        ['bossHit', '보스 타격 (짧고 강하게)'],
        ['specialFinal', '필살기 마지막 강타 (강조)'],
        ['bossDown', '보스 쓰러짐'],
      ];
      for (const [k, label] of kinds) {
        const b = el('button', 'ap-open', label);
        b.type = 'button';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          haptics.play(k);
        });
        panel.append(b);
      }
      parent.append(panel);
      break;
    }
    case 'family-ending':
    case 'ending-hug':
    case 'layout':
    case 'ending-image':
    case 'ending-credits': {
      sc.debugSetStage(3);
      sc.debugFinish();
      const jump = { 'ending-hug': 31.5, layout: 66.2, 'ending-image': 66.2, 'ending-credits': 73.0 }[id as 'layout'] ?? 0;
      if (jump) {
        const t = window.setInterval(() => {
          const e = g().ending;
          if (e) {
            clearInterval(t);
            e.t = jump;
            // 최종 그림 바로 보기: THE END 직전에서 멈춰 그림만 계속 보여 줌
            if (id === 'ending-image') e.holdAt = 74;
          }
        }, 100);
      }
      if (id === 'layout') say('세로·가로로 돌려 보세요 (엔딩 다시보기로 해당 방향 구도 확인)');
      if (id === 'ending-image') say('마지막 가족사진 영상 — 끝나면 마지막 프레임에 멈춤');
      break;
    }
    default:
      break;
  }
  bus.emit(EV.testScenario, id);
}
