/**
 * 画廊布局调参面板（仅体验版挂载）
 *
 * 用于现场调三个视觉参数：环形弧度、卡片间距、卡片圆角。
 * 面板直接写共享的 tuning 对象——布局帧循环每帧读它，所以拖动滑块即时看到效果，
 * 不触发 React 重渲染、不打断正在进行的缓动动画。
 *
 * 参数会存进 localStorage，刷新后保留，方便反复对照。
 */
import { useEffect, useState } from "react";

import "./QueueTuningPanel.css";

export type QueueTuningValues = {
  ambientBrightness: number;
  ambientOpacity: number;
  ambientSaturate: number;
  arcEvenSpacing: boolean;
  bendRatio: number;
  cardRadius: number;
  centerScale: number;
  compensateSpacing: boolean;
  floatAmplitude: number;
  floatDepth: number;
  sideOpacityFalloff: number;
  spacingRatio: number;
  starfieldBloom: number;
  starfieldDotCore: number;
  starfieldPhi: number;
  starfieldRadius: number;
  starfieldTheta: number;
  tiltAmplitude: number;
  tiltHoverScale: number;
  tooltipUpright: boolean;
};

type QueueTuningPanelProps = {
  defaults: QueueTuningValues;
  target: QueueTuningValues;
};

const storageKey = "redio.queueTuning";

type NumericKey =
  | "ambientBrightness"
  | "ambientOpacity"
  | "ambientSaturate"
  | "bendRatio"
  | "cardRadius"
  | "centerScale"
  | "floatAmplitude"
  | "floatDepth"
  | "sideOpacityFalloff"
  | "spacingRatio"
  | "starfieldBloom"
  | "starfieldDotCore"
  | "starfieldPhi"
  | "starfieldRadius"
  | "starfieldTheta"
  | "tiltAmplitude"
  | "tiltHoverScale";

/** 面板分组：画廊布局 / 背景视觉 */
type TuningGroup = "gallery" | "background";

const groupTabs: Array<{ id: TuningGroup; label: string }> = [
  { id: "gallery", label: "画廊" },
  { id: "background", label: "背景" }
];

const fields: Array<{
  key: NumericKey;
  group: TuningGroup;
  label: string;
  hint: string;
  max: number;
  min: number;
  step: number;
  unit: string;
}> = [
  {
    key: "ambientOpacity",
    group: "background",
    label: "氛围色浓度",
    hint: "背景吸取封面颜色的整体强度，0 为纯底色不吸色",
    max: 1,
    min: 0,
    step: 0.02,
    unit: ""
  },
  {
    key: "ambientBrightness",
    group: "background",
    label: "氛围色亮度",
    hint: "越高封面色越明显但越上浮，越低越沉入背景",
    max: 0.4,
    min: 0.04,
    step: 0.01,
    unit: ""
  },
  {
    key: "ambientSaturate",
    group: "background",
    label: "氛围色饱和",
    hint: "补偿压暗导致的发灰，越高色相越鲜明",
    max: 2.4,
    min: 0.6,
    step: 0.05,
    unit: "×"
  },
  {
    key: "starfieldDotCore",
    group: "background",
    label: "粒子锐度",
    hint: "圆点实心核心占比，越大越锐利有颗粒感，0.37 复现原本的雾感",
    max: 0.85,
    min: 0.15,
    step: 0.01,
    unit: ""
  },
  {
    key: "starfieldBloom",
    group: "background",
    label: "粒子泛光",
    hint: "亮点外扩的高光强度，0 为完全关闭泛光层",
    max: 1.4,
    min: 0,
    step: 0.02,
    unit: ""
  },
  {
    key: "starfieldTheta",
    group: "background",
    label: "星空水平角",
    hint: "初始机位左右环绕角度，0 为正视，负值偏左",
    max: 1.2,
    min: -1.2,
    step: 0.02,
    unit: ""
  },
  {
    key: "starfieldPhi",
    group: "background",
    label: "星空俯仰角",
    hint: "初始机位高低，正值从上往下看，0 为水平",
    max: 0.72,
    min: -0.72,
    step: 0.01,
    unit: ""
  },
  {
    key: "starfieldRadius",
    group: "background",
    label: "星空视距",
    hint: "初始相机距离，越小越近、包裹感越强",
    max: 14,
    min: 6,
    step: 0.1,
    unit: ""
  },
  {
    key: "bendRatio",
    group: "gallery",
    label: "环形弧度",
    hint: "越大弧越弯，两侧卡片下沉与内倾越明显",
    max: 1.2,
    min: 0,
    step: 0.01,
    unit: ""
  },
  {
    key: "spacingRatio",
    group: "gallery",
    label: "卡片间距",
    hint: "相邻卡片水平距离占容器宽度的比例",
    max: 0.4,
    min: 0.08,
    step: 0.002,
    unit: ""
  },
  {
    key: "cardRadius",
    group: "gallery",
    label: "卡片圆角",
    hint: "卡片四角的圆角半径",
    max: 80,
    min: 0,
    step: 1,
    unit: "px"
  },
  {
    key: "centerScale",
    group: "gallery",
    label: "中心卡放大",
    hint: "居中播放卡片相对两侧卡的放大倍数",
    max: 1.8,
    min: 1,
    step: 0.01,
    unit: "×"
  },
  {
    key: "floatAmplitude",
    group: "gallery",
    label: "悬浮呼吸",
    hint: "卡片自主起伏的总强度，1 为参考实现的比例，0 完全静止",
    max: 2,
    min: 0,
    step: 0.05,
    unit: "×"
  },
  {
    key: "floatDepth",
    group: "gallery",
    label: "呼吸景深",
    hint: "起伏是否带前后纵深，0 为纯上下浮动（不启用透视）",
    max: 2,
    min: 0,
    step: 0.05,
    unit: "×"
  },
  {
    key: "sideOpacityFalloff",
    group: "gallery",
    label: "两侧淡出",
    hint: "每远离中心一张卡降低的不透明度，0 为两侧同样清晰（下限 0.22）",
    max: 0.5,
    min: 0,
    step: 0.01,
    unit: ""
  },
  {
    key: "tiltAmplitude",
    group: "gallery",
    label: "倾斜幅度",
    hint: "Rotate Amplitude：悬停时卡片跟随鼠标倾斜的最大角度，0 为关闭",
    max: 30,
    min: 0,
    step: 1,
    unit: "°"
  },
  {
    key: "tiltHoverScale",
    group: "gallery",
    label: "悬停缩放",
    hint: "Scale on Hover：悬停时卡片放大倍数",
    max: 1.4,
    min: 1,
    step: 0.01,
    unit: "×"
  }
];

function readStoredValues(defaults: QueueTuningValues): QueueTuningValues {
  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return { ...defaults };
    }

    const parsed = JSON.parse(raw) as Partial<QueueTuningValues>;

    return {
      ambientBrightness: Number.isFinite(parsed.ambientBrightness)
        ? Number(parsed.ambientBrightness)
        : defaults.ambientBrightness,
      ambientOpacity: Number.isFinite(parsed.ambientOpacity)
        ? Number(parsed.ambientOpacity)
        : defaults.ambientOpacity,
      ambientSaturate: Number.isFinite(parsed.ambientSaturate)
        ? Number(parsed.ambientSaturate)
        : defaults.ambientSaturate,
      arcEvenSpacing:
        typeof parsed.arcEvenSpacing === "boolean"
          ? parsed.arcEvenSpacing
          : defaults.arcEvenSpacing,
      bendRatio: Number.isFinite(parsed.bendRatio) ? Number(parsed.bendRatio) : defaults.bendRatio,
      cardRadius: Number.isFinite(parsed.cardRadius)
        ? Number(parsed.cardRadius)
        : defaults.cardRadius,
      centerScale: Number.isFinite(parsed.centerScale)
        ? Number(parsed.centerScale)
        : defaults.centerScale,
      compensateSpacing:
        typeof parsed.compensateSpacing === "boolean"
          ? parsed.compensateSpacing
          : defaults.compensateSpacing,
      floatAmplitude: Number.isFinite(parsed.floatAmplitude)
        ? Number(parsed.floatAmplitude)
        : defaults.floatAmplitude,
      floatDepth: Number.isFinite(parsed.floatDepth)
        ? Number(parsed.floatDepth)
        : defaults.floatDepth,
      sideOpacityFalloff: Number.isFinite(parsed.sideOpacityFalloff)
        ? Number(parsed.sideOpacityFalloff)
        : defaults.sideOpacityFalloff,
      spacingRatio: Number.isFinite(parsed.spacingRatio)
        ? Number(parsed.spacingRatio)
        : defaults.spacingRatio,
      starfieldBloom: Number.isFinite(parsed.starfieldBloom)
        ? Number(parsed.starfieldBloom)
        : defaults.starfieldBloom,
      starfieldDotCore: Number.isFinite(parsed.starfieldDotCore)
        ? Number(parsed.starfieldDotCore)
        : defaults.starfieldDotCore,
      starfieldPhi: Number.isFinite(parsed.starfieldPhi)
        ? Number(parsed.starfieldPhi)
        : defaults.starfieldPhi,
      starfieldRadius: Number.isFinite(parsed.starfieldRadius)
        ? Number(parsed.starfieldRadius)
        : defaults.starfieldRadius,
      starfieldTheta: Number.isFinite(parsed.starfieldTheta)
        ? Number(parsed.starfieldTheta)
        : defaults.starfieldTheta,
      tiltAmplitude: Number.isFinite(parsed.tiltAmplitude)
        ? Number(parsed.tiltAmplitude)
        : defaults.tiltAmplitude,
      tiltHoverScale: Number.isFinite(parsed.tiltHoverScale)
        ? Number(parsed.tiltHoverScale)
        : defaults.tiltHoverScale,
      tooltipUpright:
        typeof parsed.tooltipUpright === "boolean"
          ? parsed.tooltipUpright
          : defaults.tooltipUpright
    };
  } catch {
    return { ...defaults };
  }
}

export function QueueTuningPanel({ defaults, target }: QueueTuningPanelProps) {
  const [values, setValues] = useState<QueueTuningValues>(() => readStoredValues(defaults));
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeGroup, setActiveGroup] = useState<TuningGroup>("gallery");
  const [copyHint, setCopyHint] = useState("");

  // 首屏与每次变更后，把值同步进帧循环读取的对象
  useEffect(() => {
    Object.assign(target, values);

    // 氛围色是纯 CSS 滤镜，直接写根元素变量即时生效，不经过 React 渲染
    const root = document.documentElement;
    root.style.setProperty("--ambient-brightness", String(values.ambientBrightness));
    root.style.setProperty("--ambient-saturate", String(values.ambientSaturate));
    root.style.setProperty("--ambient-opacity", String(values.ambientOpacity));

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      // 无痕模式等场景写不进去，不影响调参本身
    }
  }, [target, values]);

  function updateValue(key: NumericKey, next: number) {
    setValues((previous) => ({ ...previous, [key]: next }));
  }

  function resetValues() {
    setValues({ ...defaults });
    setCopyHint("");
  }

  async function copyValues() {
    const snippet = [
      `const AMBIENT_BRIGHTNESS = ${values.ambientBrightness};`,
      `const AMBIENT_SATURATE = ${values.ambientSaturate};`,
      `const AMBIENT_OPACITY = ${values.ambientOpacity};`,
      `const STARFIELD_INITIAL_THETA = ${values.starfieldTheta};`,
      `const STARFIELD_INITIAL_PHI = ${values.starfieldPhi};`,
      `const STARFIELD_INITIAL_RADIUS = ${values.starfieldRadius};`,
      `const STARFIELD_DOT_CORE = ${values.starfieldDotCore};`,
      `const STARFIELD_BLOOM_STRENGTH = ${values.starfieldBloom};`,
      `const QUEUE_BEND_RATIO = ${values.bendRatio};`,
      `const QUEUE_CENTER_SCALE = ${values.centerScale};`,
      `const QUEUE_CARD_RADIUS = ${values.cardRadius};`,
      `const QUEUE_CARD_SPACING_RATIO = ${values.spacingRatio};`,
      `const QUEUE_SIDE_OPACITY_FALLOFF = ${values.sideOpacityFalloff};`,
      `const QUEUE_FLOAT_AMPLITUDE = ${values.floatAmplitude};`,
      `const QUEUE_FLOAT_DEPTH = ${values.floatDepth};`,
      `const QUEUE_TILT_AMPLITUDE = ${values.tiltAmplitude};`,
      `const QUEUE_TILT_HOVER_SCALE = ${values.tiltHoverScale};`,
      `// 气泡保持水平：${values.tooltipUpright ? "开" : "关"}`,
      `// 沿弧长等距：${values.arcEvenSpacing ? "开" : "关"}`,
      `// 间距补偿放大量：${values.compensateSpacing ? "开" : "关"}`
    ].join("\n");

    try {
      await navigator.clipboard.writeText(snippet);
      setCopyHint("已复制参数");
    } catch {
      setCopyHint("复制失败，请手动记录");
    }

    window.setTimeout(() => setCopyHint(""), 2000);
  }

  return (
    <aside className={`tuningPanel ${isCollapsed ? "isCollapsed" : ""}`}>
      <header className="tuningPanelHeader">
        <span className="tuningPanelTitle">画廊调参</span>
        <button
          className="tuningPanelToggle"
          onClick={() => setIsCollapsed((previous) => !previous)}
          type="button"
        >
          {isCollapsed ? "展开" : "收起"}
        </button>
      </header>

      {isCollapsed ? null : (
        <div className="tuningPanelBody">
          <div className="tuningTabs" role="tablist">
            {groupTabs.map((tab) => (
              <button
                aria-selected={activeGroup === tab.id}
                className={`tuningTab ${activeGroup === tab.id ? "isActive" : ""}`}
                key={tab.id}
                onClick={() => setActiveGroup(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {fields
            .filter((field) => field.group === activeGroup)
            .map((field) => (
            <label className="tuningField" key={field.key}>
              <span className="tuningFieldTop">
                <span className="tuningFieldLabel">{field.label}</span>
                <span className="tuningFieldValue">
                  {field.key === "cardRadius"
                    ? values[field.key].toFixed(0)
                    : values[field.key].toFixed(field.step < 0.01 ? 3 : 2)}
                  {field.unit}
                </span>
              </span>
              <input
                max={field.max}
                min={field.min}
                onChange={(event) => updateValue(field.key, Number(event.target.value))}
                step={field.step}
                type="range"
                value={values[field.key]}
              />
              <span className="tuningFieldHint">{field.hint}</span>
            </label>
          ))}

          {activeGroup !== "gallery" ? null : (
          <>
          <label className="tuningSwitch">
            <input
              checked={values.tooltipUpright}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  tooltipUpright: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span>
              <span className="tuningFieldLabel">气泡保持水平</span>
              <span className="tuningFieldHint">
                抵消卡片在弧上的倾斜；关闭则跟卡片一起歪（原组件行为）
              </span>
            </span>
          </label>

          <label className="tuningSwitch">
            <input
              checked={values.arcEvenSpacing}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  arcEvenSpacing: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span>
              <span className="tuningFieldLabel">沿弧长等距</span>
              <span className="tuningFieldHint">
                按圆心角等分排布；关闭则沿水平轴等距，外侧会被弧线拉开
              </span>
            </span>
          </label>

          <label className="tuningSwitch">
            <input
              checked={values.compensateSpacing}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  compensateSpacing: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span>
              <span className="tuningFieldLabel">间距补偿放大量</span>
              <span className="tuningFieldHint">
                中心卡放大时把两侧卡片推开，保持卡间空隙均匀
              </span>
            </span>
          </label>
          </>
          )}

          <div className="tuningPanelActions">
            <button onClick={resetValues} type="button">
              恢复默认
            </button>
            <button onClick={copyValues} type="button">
              复制参数
            </button>
          </div>

          {copyHint ? <p className="tuningPanelHint">{copyHint}</p> : null}
        </div>
      )}
    </aside>
  );
}
