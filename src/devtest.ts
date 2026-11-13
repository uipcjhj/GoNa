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
  ['kiss-boss', '6. 뽀뽀괴물 보스전 (난이도 하향판)'],
  ['sniff-boss', '7. 킁카괴물 보스전 (난이도 하향판)'],
  ['kiss-talk', '8. 뽀뽀괴물 대사 UI 테스트'],
  ['sniff-talk', '9. 킁카괴물 대사 UI 테스트'],
  ['sniff-nose', '10. 킁카괴물 돼지코 필살기 (①②③)'],
  ['sniff-weakpoint', '11. 킁카괴물 코 약점 명중 테스트 (자동 조준)'],
  ['glasses-dash', '12. 화학과안경잽이 돌진'],
  ['farter-dash', '13. 방구할배 돌진'],
  ['hurt', '14. 고나 피격 애니메이션 (4단계)'],
  ['vibrate', '15. 햅틱(진동) 테스트 — 아이폰·안드로이드 (직접 느꼈는지 확인)'],
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
  ['sniff-aim', '26. 킁카괴물 코 조준 테스트 (안내 → 조준점 → 직접 발사 → 결과)'],
  ['sniff-inhale', '27. 킁카괴물 흡입 공격 테스트 (가운데 버티기! 버튼)'],
  ['resist-success', '28. 버티기 QTE 성공 테스트 (자동 연타)'],
  ['resist-fail', '29. 버티기 QTE 실패 테스트 (안 누름)'],
  ['sniff-dubai', '30. 킁카괴물 두바이 똥냄새 공격 (필살기 게이지 가득)'],
  ['witch-art', '31. 이유식 드래곤 셰프 마녀 — 그림 보기 (레퍼런스 스프라이트 10장 · 숟가락 · 성)'],
  ['finale', '32. 마지막 모험 구간 바로 시작 (킁카괴물 뒤 · 마녀 등장까지 약 28초)'],
  ['finale-castle', '33. 이유식 성 바로 진입 (성 앞 → 도착 → 등장 컷신)'],
  ['witch-intro', '34. 최종 보스 등장 컷신 + 대사'],
  ['witch-p1', '35. 최종 보스 1페이즈 (이유식의 유혹)'],
  ['witch-p2', '36. 최종 보스 2페이즈 (마녀의 분노)'],
  ['witch-p3', '37. 최종 보스 3페이즈 (최후의 한 숟가락)'],
  ['witch-attacks', '38. 최종 보스 공격 패턴별 테스트 (A~E · 신규 공격 버튼)'],
  ['witch-ending', '39. 최종 보스 처치 → 패배 컷신 → 가족 엔딩 연결'],
  ['witch-shield', '40. 방패 방어 공격: 숟가락 내려치기 (🛡방패!)'],
  ['witch-chair', '41. 이유식 의자 탈출 (직접 · 2페이즈 → 3페이즈 강화 · 그림 대기 — 흐름만)'],
  ['witch-chair-ok', '42. 울음 폭발 탈출 성공 (자동 연타 → 꾸욱 · 그림 대기)'],
  ['witch-chair-fail', '43. 울음 폭발 탈출 실패 (안 누름 → 작은 피해 · 자동 탈출 · 그림 대기)'],
  ['witch-jump', '44. 점프 회피 공격 모음 (낮은 숟가락 · 통통 · 삼연타 · 소나기 · 냄비)'],
  ['witch-stay', '45. 가만히 있기 공격 모음 (높은 숟가락 · 숟가락 왕복 귀환)'],
  ['witch-size', '46. 마녀 크기 변경 전후 비교 (1.6배 ↔ 1.2배 버튼)'],
  ['witch-chop', '47. 후드리챱챱! 난타 (처음부터 → 방해 → 피니시 → 엔딩 · 그림 대기 — 흐름만)'],
  ['witch-full', '48. 1~3페이즈 연속 플레이 (처음부터 끝까지 · 고나 무적 아님)'],
  ['witch-last', '49. 마지막 발악 → 처치 → 엔딩'],
  ['witch-run3', '50. 3페이즈 연속 플레이 (35%부터)'],
  ['witch-parry', '51. ① 이유식 받아치기 (퉤! 타이밍)'],
  ['witch-rhythm', '52. ② 으아앙! 울음 리듬 배틀 (2페이즈 → 3페이즈 빠른 판)'],
  ['witch-reflect', '53. ③ 이유식 폭탄 방패 반사'],
  ['witch-chop-cry', '54. 후드리챱챱 중 마녀 방해 (으아앙! 꾸욱 · 그림 대기)'],
  ['witch-chop-final', '55. 최종 후드리챱챱!!! 피니시 → 패배 → 가족 엔딩 (그림 대기)'],
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
  let placeTimer = 0;
  /** 세로 화면: 위쪽 HUD(점수·HP·성장·보스 HP·메뉴·일시정지) 바로 아래에 둠 — HP 바를 가리지 않게 (HUD 가 나중에 생겨도 따라 내려감) */
  const place = (): void => {
    if (!window.matchMedia('(orientation: portrait)').matches) {
      info.style.top = '';
      return;
    }
    let bottom = 0;
    for (const n of document.querySelectorAll<HTMLElement>('.battle-top, .hud-score, .boss-bar, .tm-back, .icon-btn')) {
      const r = n.getBoundingClientRect();
      if (r.height > 0 && r.top < window.innerHeight * 0.4 && getComputedStyle(n).visibility !== 'hidden') bottom = Math.max(bottom, r.bottom);
    }
    info.style.top = `${Math.round(bottom + 6)}px`;
  };
  const say = (t: string): void => {
    info.textContent = t;
    info.classList.remove('hidden');
    place();
    clearInterval(placeTimer);
    placeTimer = window.setInterval(place, 300);
    // 안내는 짧게 보여 주고 저절로 사라짐 (대사창·버튼·HP 를 오래 가리지 않게)
    clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => {
      info.classList.add('hidden');
      clearInterval(placeTimer);
    }, 3000);
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
    case 'resist-fail':
    case 'sniff-dubai': {
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
          window.setInterval(open, 11000);
          if (auto) {
            window.setInterval(() => {
              const d = g().battle?.aimDebug?.();
              if (d && d.phase === 'aim' && d.judge === 'perfect') bus.emit(EV.attack);
            }, 30);
          }
        });
        say(auto ? '조준점이 코에 오면 자동 발사 → 완벽 명중 ×2 (반복)' : "안내 뒤 조준점이 머리↔코를 오가요 — 코(노란 점선 고리)에 오면 '발사!' (공격 버튼)");
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
      } else if (id === 'sniff-dubai') {
        waitFight(() => {
          const go = (): void => {
            const b = g().battle;
            if (!b || b.mode !== 'fight') return;
            b.hp = Math.max(b.hp, Math.round(b.def.maxHp * 0.8));
            b.special = 1;
          };
          window.setTimeout(go, 600);
          window.setInterval(go, 9000);
        });
        say("필살기 게이지가 차면 초록 '두바이!' 버튼 — 9초마다 다시 채워져요");
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
    case 'finale':
    case 'finale-castle': {
      sc.debugSetStage(3);
      sc.boomerangAwake = true;
      sc.startFinale(id === 'finale' ? 0 : 14);
      say(id === 'finale' ? '마지막 모험: 버섯숲(0~8초) → 먼 성(8초~) → 가까운 성·번개(15초~) → 입구 도착(22초) → 등장 컷신(약 28초)' : '가까운 성 → 입구 도착 → 성 안 → 최종 보스 등장 컷신');
      break;
    }
    case 'witch-intro':
    case 'witch-p1':
    case 'witch-p2':
    case 'witch-p3':
    case 'witch-attacks':
    case 'witch-ending':
    case 'witch-chair':
    case 'witch-chair-ok':
    case 'witch-chair-fail':
    case 'witch-chop':
    case 'witch-chop-cry':
    case 'witch-chop-final':
    case 'witch-parry':
    case 'witch-rhythm':
    case 'witch-reflect':
    case 'witch-shield':
    case 'witch-jump':
    case 'witch-stay':
    case 'witch-size':
    case 'witch-full':
    case 'witch-triple':
    case 'witch-bounce':
    case 'witch-rain':
    case 'witch-boomer':
    case 'witch-run3':
    case 'witch-last': {
      sc.debugSetStage(3);
      sc.boomerangAwake = true;
      // 공격을 직접 피해 보는 테스트는 무적 아님 (맞으면 HP 가 깎임)
      if (!['witch-intro', 'witch-p1', 'witch-parry', 'witch-rhythm', 'witch-reflect', 'witch-shield', 'witch-jump', 'witch-stay', 'witch-full', 'witch-triple', 'witch-bounce', 'witch-rain', 'witch-boomer', 'witch-run3', 'witch-last'].includes(id)) sc.debugGod();
      sc.debugStartBoss('witch');
      const wb = (): Any => g().battle;
      const ready = (fn: () => void): void => {
        const t = window.setInterval(() => {
          if (wb()) {
            clearInterval(t);
            fn();
          }
        }, 100);
      };
      // 신규 공격 하나를 반복 (끝나면 2초 뒤 다시)
      // 공격 모음 반복 (끝나면 2초 뒤 다음)
      const sets: Record<string, [string, number][]> = {
        'witch-jump': [['spoon', 0], ['bounce', 0], ['triple', 1], ['rain', 2], ['pot', 2]],
        'witch-stay': [['high', 0], ['boomer', 2], ['high', 1]],
        'witch-shield': [['slam', 1], ['slam', 2]],
        'witch-parry': [['parry', 0], ['parry', 1], ['parry', 2]],
        'witch-rhythm': [['rhythm', 1], ['rhythm', 2]],
        'witch-reflect': [['reflect', 0], ['reflect', 1], ['reflect', 2]],
      };
      // 의자 탈출 · 후드리챱챱: 승인 그림이 아직 없어 '흐름만' 실행 (그림 자리는 비워 둠 · 임시 그림 없음)
      if (id.startsWith('witch-chair') || id.startsWith('witch-chop')) {
        const qte = (btn: string, down = true): void => {
          bus.emit(EV.qteInput, { btn, down });
        };
        ready(() => {
          const bt = wb();
          bt.debugForceArt = true;
          if (id.startsWith('witch-chair')) {
            bt.debugSkipIntro();
            let n = 0;
            const loop = (): void => {
              const b = wb();
              if (!b || b.mode === 'victory' || b.mode === 'done') return;
              if (b.mode === 'fight' && !b.busy && !b.chairS && b.stunT <= 0) b.debugChair(n++ % 2 === 0 ? 2 : 3);
              window.setTimeout(loop, 2000);
            };
            window.setTimeout(loop, 600);
            if (id === 'witch-chair-ok') {
              // 자동: 연타 → 숟가락이 오면 꾸욱
              window.setInterval(() => {
                const c = wb()?.chairS;
                if (!c) return;
                if (c.stage === 'mash') {
                  qte('mash', true);
                  qte('mash', false);
                } else if (c.holdAt < 0) qte('mash', true);
              }, 140);
            }
          } else {
            bt.debugChop(id === 'witch-chop' ? 'mash' : id === 'witch-chop-cry' ? 'cry' : 'final');
          }
        });
        say(id.startsWith('witch-chair') ? '의자·우는 고나 그림 대기 — 조작·판정 흐름만 (마녀·숟가락·음파는 기존 그림·효과)' : '고나 난타·이유식 덩어리 그림 대기 — 조작·판정 흐름만');
        break;
      }
      if (sets[id]) {
        let i = 0;
        ready(() => {
          wb().debugSkipIntro();
          const loop = (): void => {
            const bt = wb();
            if (!bt || bt.mode === 'victory' || bt.mode === 'done') return;
            if (bt.mode === 'fight' && !bt.busy && bt.stunT <= 0) {
              const [atk, rage] = sets[id][i++ % sets[id].length];
              bt.rage = rage;
              bt.applyTint();
              bt.debugAttack(atk);
            }
            window.setTimeout(loop, 2000);
          };
          window.setTimeout(loop, 600);
        });
        const tips: Record<string, string> = {
          'witch-jump': '빨간 ▲점프! 가 뜨면 점프',
          'witch-stay': '파란 ●가만히! — 점프하면 맞아요',
          'witch-shield': '파란 🛡방패! 가 뜨면 방패 버튼 (막으면 마녀가 휘청 → ★지금 공격!)',
          'witch-parry': '이유식이 입 앞 노란 고리에 올 때 「퉤!」 (빨라지는 판도 이어서)',
          'witch-rhythm': '음표가 노란 줄에 오면 「으앙!」 · 긴 음표는 꾸욱',
          'witch-reflect': '폭탄이 닿기 직전 방패 → 반사! (일찍 누르면 막기만)',
        };
        say(tips[id]);
        break;
      }
      if (id === 'witch-size') {
        ready(() => wb().debugSkipIntro());
        const btn = el('button', 'ap-open', '크기: 1.2배 (새) — 눌러서 1.6배(이전)와 비교') as HTMLButtonElement;
        btn.type = 'button';
        btn.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 150px);z-index:60;min-height:36px';
        let old = false;
        btn.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const bt = wb();
          if (!bt) return;
          old = !old;
          bt.boss.setScale(old ? 1.6 : 1.2);
          btn.textContent = old ? '크기: 1.6배 (이전) — 눌러서 1.2배(새)로' : '크기: 1.2배 (새) — 눌러서 1.6배(이전)와 비교';
        });
        parent.append(btn);
        say('마녀 크기 비교 (판정은 지금 크기 기준)');
        break;
      }
      if (id === 'witch-full') {
        ready(() => wb().debugSkipIntro());
        say('1페이즈부터 끝까지: 점프·가만히·방패를 안내대로!');
        break;
      }
      const single: Record<string, [string, number, string]> = {
        'witch-triple': ['triple', 1, '숟가락 삼연타: 고리를 보고 세 번 점프 (마지막은 조금 늦게)'],
        'witch-bounce': ['bounce', 0, '통통 폭탄: 가장 낮게 튈 때 고나 위를 지나가요 — 가까이 오면 점프'],
        'witch-rain': ['rain', 2, '이유식 소나기: 고나 자리에 고리가 있으면 떨어질 때 점프 (가운데 물결은 안전)'],
        'witch-boomer': ['boomer', 2, '숟가락 부메랑: 빨간 줄(낮게) = 점프 · 파란 줄(높게) = 가만히'],
      };
      if (single[id]) {
        const [atk, rage, tip] = single[id];
        ready(() => {
          const b = wb();
          b.debugSkipIntro();
          b.rage = rage;
          b.applyTint();
          const loop = (): void => {
            const bt = wb();
            if (!bt || bt.mode === 'victory' || bt.mode === 'done') return;
            if (bt.mode === 'fight' && !bt.busy && bt.stunT <= 0) bt.debugAttack(atk);
            window.setTimeout(loop, 2000);
          };
          window.setTimeout(loop, 600);
        });
        say(tip);
      } else if (id === 'witch-run3') {
        ready(() => wb().debugPhase(3));
        say('3페이즈부터 끝까지: 부메랑 · 소나기 · 강화 으깨기 · 냄비 … → 마지막 발악 → 엔딩');
      } else if (id === 'witch-last') {
        ready(() => wb().debugLast());
        say('마지막 발악: 휘두르기를 점프로 피하면 무방비 → 부메랑 한 방!');
      } else if (id === 'witch-intro') say('등장 컷신 → 대사(다음 ▶) → 전투 시작');
      else if (id === 'witch-p1') ready(() => wb().debugSkipIntro());
      else if (id === 'witch-p2') ready(() => wb().debugPhase(2));
      else if (id === 'witch-p3') ready(() => wb().debugPhase(3));
      else if (id === 'witch-ending') {
        ready(() => {
          wb().debugSkipIntro();
          window.setTimeout(() => wb().debugKill(), 600);
        });
        say('마녀 처치(마지막 발악 건너뜀) → 패배 대사 → 퇴장 → 가족 엔딩 · 마지막 발악은 49번');
      } else {
        ready(() => wb().debugSkipIntro());
        const panel = el('div', 'tm-vib');
        panel.style.top = 'auto';
        panel.style.bottom = 'calc(env(safe-area-inset-bottom) + 150px)';
        panel.style.flexDirection = 'row';
        panel.style.flexWrap = 'wrap';
        panel.style.padding = '6px';
        for (const [k, label] of [['spoon', '▲낮은 숟가락'], ['high', '●높은 숟가락'], ['slam', '🛡내려치기'], ['bounce', '▲통통'], ['triple', '▲삼연타'], ['swirl', '회오리'], ['boomer', '왕복'], ['rain', '▲소나기'], ['pot', '▲냄비'], ['bomb', 'B 폭탄'], ['combo', 'D 연속']] as const) {
          const b = el('button', 'ap-open', label) as HTMLButtonElement;
          b.type = 'button';
          b.style.minHeight = '36px';
          b.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            const bt = wb();
            if (!bt || bt.mode !== 'fight') return;
            if (k === 'pot' && bt.rage < 2) {
              bt.rage = 2;
              bt.applyTint();
            }
            bt.debugAttack(k);
          });
          panel.append(b);
        }
        parent.append(panel);
        say('버튼으로 공격 하나씩 (고나 무적) · 예고 자리 = 판정 자리');
      }
      break;
    }
    case 'witch-art': {
      // 최종 보스 그림 확인 (프레임 9장 + 공격 그림, 6배 확대)
      void import('./art/witchArt').then((W) => {
        const box = el('div', 'tm-art');
        box.style.cssText = 'position:absolute;inset:0;z-index:60;overflow:auto;background:#2b2140;padding:8px;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start';
        const show = (c: HTMLCanvasElement, k = 4): void => {
          c.style.cssText = `width:${c.width * k}px;height:${c.height * k}px;image-rendering:pixelated;background:#4a3a68`;
          box.append(c);
        };
        // 게임이 실제로 쓰는 시트 (확정 레퍼런스에서 추출한 PNG) — 4단계 고나와 나란히, 같은 배율
        const tm = (g() as Any).textures as Phaser.Textures.TextureManager;
        const img = tm.get('boss-src-witch').getSourceImage() as HTMLImageElement;
        const fw = Math.floor(img.width / W.WITCH_SHEET_FRAMES);
        const names = ['대기', '이동', '숟가락 들기', '분노', '아픔', '웃음', '팔 뻗기', '회오리', '패배', '뿌리기'];
        for (let i = 0; i < W.WITCH_SHEET_FRAMES; i++) {
          const c = document.createElement('canvas');
          c.width = fw;
          c.height = img.height;
          c.getContext('2d')!.drawImage(img, -i * fw, 0);
          c.title = names[i];
          show(c, 4);
        }
        const go = tm.get('dino-stage-bigbaby');
        if (go && go.key !== '__MISSING') {
          const f = go.get(0);
          const c = document.createElement('canvas');
          c.width = f.cutWidth;
          c.height = f.cutHeight;
          c.getContext('2d')!.drawImage(f.source.image as HTMLImageElement, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
          c.title = '비교: 자이언트 곤룡 고나';
          show(c, 4);
        }
        const spoonSrc = tm.get('witch-spoon').getSourceImage() as HTMLImageElement;
        const sc2 = document.createElement('canvas');
        sc2.width = spoonSrc.width;
        sc2.height = spoonSrc.height;
        sc2.getContext('2d')!.drawImage(spoonSrc, 0, 0);
        show(sc2, 4);
        for (const f of [W.witchGoo, W.witchPuddle, W.witchDrop, W.witchPot, W.witchSmoke, W.witchTarget, W.witchArm]) show(f(), 4);
        // 승인된 성 배경 그림 4장 (원본 그대로, 0.5배로 보기)
        for (const f of ['finale-bg-far', 'finale-bg-near', 'finale-bg-gate', 'castle-interior']) {
          const im = document.createElement('img');
          im.src = `assets/castle/${f}.png`;
          im.title = f;
          im.style.cssText = 'width:386px;height:230px;image-rendering:pixelated';
          box.append(im);
        }
        void import('./art/castleArt').then((Cs) => {
          for (const f of [Cs.castleBolt, Cs.clueSpoon, Cs.clueBush, Cs.cluePrint]) show(f(), 3);
        });
        parent.append(box);
      });
      break;
    }
    case 'vibrate': {
      // 햅틱 테스트: 지원 방식 표시 → 버튼을 눌러 직접 느껴 보고 '느껴졌어요/안 느껴졌어요' 로 확인 (환경별 저장)
      //   API 가 있다는 것만으로 성공이라 하지 않음 — 실제로 느꼈는지는 사람만 알 수 있음
      sc.debugGod();
      clearWorld();
      const panel = el('div', 'tm-vib');
      const methodText =
        haptics.method === 'vibrate'
          ? '📳 진동 API (안드로이드 등) — 패턴·길이까지 지원'
          : haptics.method === 'ios-switch'
            ? '🍎 iPhone 스위치 햅틱 (실험) — iOS 18 이상에서 짧은 \'톡\' 한 번 (세기·길이는 못 바꿈)'
            : '❌ 지원 불가 — 이 브라우저는 웹에서 진동을 낼 방법이 없어요 (게임은 그대로)';
      const info = el('div', 'hp-info');
      const res = el('p', 'hp-res');
      const showRes = (): void => {
        const r = haptics.results;
        const keys = Object.keys(r);
        res.textContent = keys.length ? '확인 기록: ' + keys.map((k) => `${k} → ${r[k] === 'felt' ? '✅ 느껴짐' : '❌ 안 느껴짐'}`).join(' / ') : '확인 기록: 아직 없음';
      };
      info.append(
        el('p', 'hp-title', '📳 햅틱 테스트'),
        el('p', '', `지금 환경: ${haptics.envName}`),
        el('p', '', `방식: ${methodText}`),
        el('p', '', `설정: 진동 ${haptics.enabled ? 'ON' : 'OFF'}`),
        el('p', 'hp-how', haptics.method === 'ios-switch' ? '아이폰: 설정 → 사운드 및 햅틱 → \'시스템 햅틱\'이 켜져 있어야 해요. Safari 탭과 홈 화면 앱(공유 → 홈 화면에 추가 → GONA dev)에서 각각 해 보세요.' : '버튼을 누르고 손에 진동이 느껴지는지 확인해 주세요.'),
      );
      panel.append(info);
      const row = (label: string, fn: () => void): HTMLButtonElement => {
        const b = el('button', 'ap-open', label) as HTMLButtonElement;
        b.type = 'button';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          fn();
        });
        panel.append(b);
        return b;
      };
      const onOff = row(`진동 ${haptics.enabled ? 'ON' : 'OFF'} (눌러서 바꾸기)`, () => {
        haptics.setEnabled(!haptics.enabled);
        onOff.textContent = `진동 ${haptics.enabled ? 'ON' : 'OFF'} (눌러서 바꾸기)`;
      });
      if (haptics.method === 'ios-switch') {
        const multi = row(`아이폰 여러 번 톡 실험: ${haptics.multi ? 'ON' : 'OFF'}`, () => {
          haptics.setMulti(!haptics.multi);
          multi.textContent = `아이폰 여러 번 톡 실험: ${haptics.multi ? 'ON' : 'OFF'}`;
        });
      }
      const kinds: [HapticKind, string][] = [
        ['jump', '점프 (아주 짧게)'],
        ['snack', '간식 획득 (가볍게 한 번)'],
        ['hurt', '피격 (강하게 한 번)'],
        ['monsterHit', '부메랑 명중 (짧게 두 번)'],
        ['special', '필살기 (강한 패턴)'],
        ['evolve', '성장·진화 (두근두근)'],
        ['bossDown', '보스 처치 (강하게 세 번)'],
      ];
      for (const [k, label] of kinds) row(label, () => haptics.play(k, true));
      // 아이폰 실험: 터치 안(바로) / 터치 밖(1초 뒤) — 게임 속 간식·피격처럼 터치와 상관없이 울릴 때도 되는지
      row('⏱ 1초 뒤에 울리기 (터치 밖에서도 되는지)', () => window.setTimeout(() => haptics.play('hurt', true), 1000));
      if (haptics.method !== 'none') {
        panel.append(el('p', 'hp-q', '진동이 손에 느껴졌나요?'));
        row('✅ 느껴졌어요', () => {
          haptics.saveResult(haptics.envName, true);
          showRes();
        });
        row('❌ 안 느껴졌어요', () => {
          haptics.saveResult(haptics.envName, false);
          showRes();
        });
      } else panel.append(el('p', 'hp-q', '이 환경은 지원 불가 — 버튼을 눌러도 진동이 나지 않아요'));
      showRes();
      panel.append(res);
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
      // 장면 번호로 바로 (엔딩은 장면마다 애니메이션·영상이 끝나면 저절로 넘어감)
      const jump = { 'ending-hug': 3, layout: 7, 'ending-image': 7, 'ending-credits': 8 }[id as 'layout'] ?? -1;
      if (jump >= 0) {
        const t = window.setInterval(() => {
          const e = g().ending;
          if (e && e.cur >= 0) {
            clearInterval(t);
            // 최종 그림 바로 보기: 마지막 가족사진 장면에서 멈춰 그림만 계속 보여 줌
            if (id === 'ending-image') e.stayAt = 7;
            e.jumpTo(jump);
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
