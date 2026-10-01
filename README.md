# 밤 도시 비 배경 (RainScene)

비 내리는 밤 도시를 그리는 웹 배경입니다. 파일 하나(`rain-scene.js`)를 불러와 원하는 요소에 붙이면 되고, 다른 라이브러리는 필요 없습니다.

- `index.html`: 미리보기 페이지. 브라우저로 바로 열면 됩니다 (비 세기·바람·번개를 조절하는 패널 포함).
- `rain-scene.js`: 배경 엔진 (Canvas 2D).

## 무엇을 바꿨나

흔한 "비 효과"가 어색해 보이는 이유와, 이번 디자인에서 바꾼 점입니다.

| 흔한 문제 | 이번 디자인 |
| --- | --- |
| 똑같은 굵기·속도의 흰 선이 화면 전체에 균일하게 떨어짐 | 빗줄기 3겹: 먼 비는 가늘고 촘촘하게, 중간 비는 또렷하게, 렌즈 앞 비는 굵고 번지게. 원근에 따라 떨어지는 지점도 달라서 먼 비는 지평선 근처, 가까운 비는 화면 아래에 떨어집니다 |
| 어두운 하늘에서도 빗줄기가 똑같이 밝아 긁힌 자국처럼 보임 | 실제 비처럼 뒤에 불빛이 있을 때만 환하게 보입니다. 배경 밝기를 읽어 불빛 앞을 지나는 빗줄기만 따뜻한 색으로 밝힙니다 |
| 단색 그라데이션이나 정지 사진 배경 | 남색 밤하늘, 도시 불빛을 받아 아래가 밝은 구름, 초점이 나간 스카이라인, 거리 높이의 보케 불빛, 천천히 흐르는 안개 |
| 바닥이 없거나 평평함 | 위쪽 도시를 뒤집어 세로로 늘인 젖은 바닥 반사. 물웅덩이마다 반사 세기가 다르고, 빗물에 일렁입니다. 반사광 안에서 물튀김과 파문이 반짝입니다 |
| 화면 전체가 하얗게 번쩍이는 번개 | 구름 속에서 빛이 퍼지고 건물 실루엣이 드러나는 번개. 1초에 최대 세 번만 번쩍여 광과민성 기준(WCAG 2.3.1)을 지킵니다 |

그 밖에 바람에 실려 몰려다니는 비의 커튼, 바람 돌풍, 깜빡이는 고층 빌딩 항공 장애등, 지평선을 오가는 자동차 불빛, 필름 그레인, 마우스를 따라 살짝 움직이는 깊이감이 들어 있습니다.

## 기존 페이지에 붙이기

### HTML

```html
<div id="rain" aria-hidden="true"></div>
<main class="content">…기존 콘텐츠…</main>

<style>
  #rain { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 0; }
  .content { position: relative; z-index: 1; }
</style>

<script src="rain-scene.js"></script>
<script>
  const scene = RainScene.mount('#rain', { intensity: 0.55, wind: 0.2 });
</script>
```

배경 요소와 콘텐츠 모두에 `z-index`를 주는 것이 안전합니다. 배경에만 `z-index: -1`을 주면 페이지 배경색에 가려질 수 있습니다.

### React

`rain-scene.js`를 `public/` 폴더에 두고 `index.html`에서 `<script src="/rain-scene.js"></script>`로 불러온 뒤 쓰면 Vite·webpack·Next.js 어디서나 똑같이 동작합니다.

```jsx
import { useEffect, useRef } from 'react';

export default function RainBackground({ intensity = 0.55, wind = 0.2 }) {
  const ref = useRef(null);
  const scene = useRef(null);

  useEffect(() => {
    scene.current = window.RainScene.mount(ref.current, { intensity, wind });
    return () => scene.current.destroy();
  }, []);

  useEffect(() => {
    scene.current?.set({ intensity, wind });
  }, [intensity, wind]);

  return <div ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0 }} />;
}
```

## 옵션

`RainScene.mount(요소 또는 선택자, 옵션)`

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `intensity` | `0.55` | 비의 세기. `0` 이슬비 ~ `1` 폭우 |
| `wind` | `0.2` | 바람. `-1` 왼쪽으로 ~ `1` 오른쪽으로 들이침 |
| `lightning` | `true` | 먼 번개. 기본 세기에서 15~40초에 한 번이고, 비가 거셀수록 자주 칩니다 |
| `parallax` | `true` | 마우스를 따라 배경이 살짝 움직이는 깊이감 |
| `grain` | `true` | 필름 그레인. 어두운 그라데이션의 계단 현상도 가려 줍니다 |
| `autoplay` | `true` | `false`면 정지 화면으로 시작 |
| `respectReducedMotion` | `true` | OS의 '동작 줄이기'가 켜져 있으면 정지 화면으로 시작하고 번개도 치지 않음 |
| `quality` | `'auto'` | `'auto'`는 프레임이 40fps 아래로 떨어지면 품질을 한 단계씩 낮춤. `'high'`, `'low'`로 고정 가능 |
| `maxDpr` | `2` | 빗줄기 캔버스의 최대 픽셀 밀도 |
| `seed` | `7` | 건물·불빛 배치. 값을 바꾸면 다른 도시가 됩니다 |

## API

| 호출 | 하는 일 |
| --- | --- |
| `scene.set({ … })` | 옵션 변경. 비 세기와 바람은 2~3초에 걸쳐 부드럽게 바뀝니다 |
| `scene.play()` · `scene.pause()` · `scene.toggle()` | 재생 제어. `toggle()`은 바뀐 재생 상태를 돌려줍니다 |
| `scene.strike()` | 지금 번개 치기 |
| `scene.resize()` | 크기 다시 계산 (보통은 자동) |
| `scene.destroy()` | 애니메이션을 멈추고 만든 요소와 이벤트를 모두 정리 |
| `scene.playing` · `scene.reducedMotion` · `scene.quality` · `scene.options` | 현재 상태 읽기 |

## 색과 분위기 바꾸기

`rain-scene.js` 위쪽의 상수만 고치면 됩니다.

- `COLOR`: 하늘·바닥·구름·안개·빗줄기 색
- `LIGHTS`: 도시 불빛 색과 비중 (나트륨 가로등, LED, 네온 등)
- `LAYERS`: 빗줄기 3겹의 개수·속도·길이·굵기·투명도

## 성능과 접근성

- 흐릿한 배경(하늘·건물·불빛·반사)은 절반 해상도 캔버스에, 빗줄기는 화면 해상도 캔버스에 따로 그립니다.
- GPU 없이 소프트웨어로만 그리는 환경에서 측정했을 때 1440×900 화면에서 프레임당 약 8ms, 390×844 휴대폰 화면에서 약 2.6ms였습니다.
- 탭이 가려지거나 배경이 화면 밖에 있으면 멈추고, 느린 기기에서는 품질을 자동으로 낮춥니다.
- 배경은 `aria-hidden`이고 마우스·터치 이벤트를 가로채지 않습니다. 미리보기 페이지에는 움직임을 멈추는 버튼이 있습니다 (WCAG 2.2.2).
