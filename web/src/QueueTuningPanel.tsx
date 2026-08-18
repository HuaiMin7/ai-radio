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
  arcEvenSpacing: boolean;
  bendRatio: number;
  cardRadius: number;
  centerScale: number;
  compensateSpacing: boolean;
  spacingRatio: number;
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
  | "bendRatio"
  | "cardRadius"
  | "centerScale"
  | "spacingRatio"
  | "tiltAmplitude"
  | "tiltHoverScale";

const fields: Array<{
  key: NumericKey;
  label: string;
  hint: string;
  max: number;
  min: number;
  step: number;
  unit: string;
}> = [
  {
    key: "bendRatio",
    label: "环形弧度",
    hint: "越大弧越弯，两侧卡片下沉与内倾越明显",
    max: 1.2,
    min: 0,
    step: 0.01,
    unit: ""
  },
  {
    key: "spacingRatio",
    label: "卡片间距",
    hint: "相邻卡片水平距离占容器宽度的比例",
    max: 0.4,
    min: 0.08,
    step: 0.002,
    unit: ""
  },
  {
    key: "cardRadius",
    label: "卡片圆角",
    hint: "卡片四角的圆角半径",
    max: 80,
    min: 0,
    step: 1,
    unit: "px"
  },
  {
    key: "centerScale",
    label: "中心卡放大",
    hint: "居中播放卡片相对两侧卡的放大倍数",
    max: 1.8,
    min: 1,
    step: 0.01,
    unit: "×"
  },
  {
    key: "tiltAmplitude",
    label: "倾斜幅度",
    hint: "Rotate Amplitude：悬停时卡片跟随鼠标倾斜的最大角度，0 为关闭",
    max: 30,
    min: 0,
    step: 1,
    unit: "°"
  },
  {
    key: "tiltHoverScale",
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
      spacingRatio: Number.isFinite(parsed.spacingRatio)
        ? Number(parsed.spacingRatio)
        : defaults.spacingRatio,
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
  const [copyHint, setCopyHint] = useState("");

  // 首屏与每次变更后，把值同步进帧循环读取的对象
  useEffect(() => {
    Object.assign(target, values);

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
      `const QUEUE_BEND_RATIO = ${values.bendRatio};`,
      `const QUEUE_CENTER_SCALE = ${values.centerScale};`,
      `const QUEUE_CARD_RADIUS = ${values.cardRadius};`,
      `const QUEUE_CARD_SPACING_RATIO = ${values.spacingRatio};`,
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
          {fields.map((field) => (
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
