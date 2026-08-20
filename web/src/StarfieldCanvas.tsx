import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Directly embedded from Mineradio's `Preset 5: WALLPAPER PULSE` implementation.
 * Source: https://github.com/XxHuberrr/Mineradio/blob/main/public/index.html
 * Original project: Copyright (c) 2025-2026 Hu Bo, GPL-3.0.
 *
 * Only the React mount/unmount lifecycle is Redio-specific. Particle layout,
 * shader constants, material settings, camera baseline and cinema drift retain
 * Mineradio's original implementation.
 */

const mineradioVertexShader = `
precision highp float;
uniform float uTime, uBass, uMid, uTreble, uBeat, uEnergy, uBurstAmt;
uniform float uPointScale, uSpeed, uColorBoost, uPixel;
uniform float uHasCover, uCoverTint, uColorMixT;
uniform sampler2D uCoverTex, uPrevCoverTex;
attribute vec2 aUv;
attribute float aRand;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

#define PI 3.14159265359

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289v(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 perm(vec4 x){return mod289v(((x*34.0)+1.0)*x);}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=perm(perm(perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=inversesqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}

void main(){
  float t = uTime * uSpeed;
  vec3 pos;

  // 封面取色：新旧封面交叉淡入，切歌时颜色平滑过渡而非硬切
  vec2 coverUv = clamp(aUv, vec2(0.0012), vec2(0.9988));
  vec3 newCoverColor = texture2D(uCoverTex, coverUv).rgb;
  vec3 prevCoverColor = texture2D(uPrevCoverTex, coverUv).rgb;
  vec3 sampledCover = mix(prevCoverColor, newCoverColor, clamp(uColorMixT, 0.0, 1.0));

  // 没有封面时回落到原本的中性底色，避免粒子发黑
  vec3 idleColor = vec3(0.11, 0.11, 0.16);
  vec3 coverColor = mix(idleColor, sampledCover, uHasCover * clamp(uCoverTint, 0.0, 1.0));
  float maxRippleAmp = 0.0;

  // Preset 5: WALLPAPER PULSE
  // Layered music-particle wallpaper: aurora ribbons, depth sparks,
  // and cover-colored audio flow.
  float bassGlow = smoothstep(0.07, 0.78, uBass) * 0.34 + uBeat * 0.014;
  float midGlow = smoothstep(0.07, 0.62, uMid) * 0.42;
  float highGlow = smoothstep(0.04, 0.46, uTreble) * 0.46;
  float lane = aUv.y;
  float transition = clamp(uBurstAmt, 0.0, 1.0);

  if (lane < 0.80) {
    float laneWarp = snoise(vec3(aUv.x * 0.42, lane * 1.7, t * 0.026)) * 0.11 + (hash11(aRand * 73.1) - 0.5) * 0.045;
    float warpedLane = clamp(lane + laneWarp, 0.0, 0.80);
    float bandCoord = warpedLane / 0.80 * 5.65 + snoise(vec3(aUv.x * 0.82, lane * 2.25, t * 0.032)) * 0.62;
    float band = floor(bandCoord);
    float local = fract(bandCoord + hash11(band * 9.13 + aRand * 2.4) * 0.18);
    float bandN = clamp((band + 0.5) / 5.65, 0.0, 1.0);
    float seed = hash11(band * 19.17 + aRand * 31.0);
    float flow = fract(aUv.x + t * (0.0034 + bandN * 0.0038 + seed * 0.0022) + seed * 0.53);
    float arc = (flow - 0.5) * PI * (1.35 + bandN * 0.72 + seed * 0.24);
    float armCurve = sin(arc + bandN * 2.2 + seed * 5.3);
    float spiralRadius = 9.2 + bandN * 11.8 + seed * 6.0 + local * 2.9;
    float x = cos(arc * 0.72 + bandN * 0.92 + seed * 1.3) * spiralRadius + (flow - 0.5) * (13.5 + bandN * 9.5);
    float ribbonPhase = flow * PI * 2.0 * (0.55 + bandN * 0.24 + seed * 0.10) + t * (0.010 + bandN * 0.007) + seed * 5.7;
    float broadWave = sin(ribbonPhase) * 0.92;
    float fineWave = sin(ribbonPhase * (1.36 + seed * 0.62) - t * 0.044 + seed * 5.0) * 0.045;
    float yBase = (bandN - 0.5) * 13.2 + armCurve * (2.3 + bandN * 1.6) + (seed - 0.5) * 1.85 + snoise(vec3(bandN * 2.0, flow * 0.62, seed)) * 0.92;
    float ridgeCenter = 0.43 + (seed - 0.5) * 0.18;
    float ridge = exp(-pow((local - ridgeCenter) / (0.25 + seed * 0.04), 2.0));
    float softMask = smoothstep(0.010, 0.12, lane) * (1.0 - smoothstep(0.72, 0.81, lane));
    float ribbonNoise = snoise(vec3(flow * 1.18 + seed, bandN * 2.0, t * 0.018)) * 0.74;
    float zLayer = mix(-23.5, 15.5, bandN) + (seed - 0.5) * 6.0;

    pos.x = x + ribbonNoise * 1.40 + sin(t * 0.012 + seed * 8.0) * 0.22;
    pos.y = yBase + broadWave + fineWave + (local - 0.5) * (0.58 + ridge * 0.14);
    pos.z = zLayer + broadWave * 1.35 + ribbonNoise * 1.85;

    float pulseLine = 0.5 + 0.5 * sin(ribbonPhase * (1.7 + seed * 0.9) - t * 0.32 + seed * 6.0);
    vec3 aurora = mix(vec3(0.52, 0.86, 1.0), vec3(0.70, 0.58, 1.0), bandN);
    aurora = mix(aurora, vec3(0.96, 0.98, 0.92), bassGlow * 0.05);
    vAlpha = (0.18 + ridge * 0.78 + pulseLine * highGlow * 0.035 + bassGlow * 0.025) * softMask * (0.96 + transition * 0.02);
    // 极光占比保持原版固定 0.62 + ridge*0.22：亮蓝白是画面锐利感的来源，
    // 压低它让位给中低亮度的封面色会牺牲对比、反而显糊。
    // 屏幕整体的封面氛围色由 AmbientTintLayer 承担，分工不重叠。
    vColor = mix(coverColor, aurora, 0.62 + ridge * 0.22) * (0.76 + ridge * 0.86 + pulseLine * highGlow * 0.05 + bassGlow * 0.04);
    maxRippleAmp = max(maxRippleAmp, ridge * (0.12 + midGlow * 0.05) + pulseLine * highGlow * 0.045 + bassGlow * 0.030);
  } else {
    float q = (lane - 0.80) / 0.20;
    float seed = hash11(aRand * 917.0 + floor(q * 130.0));
    float depth = mix(-32.0, 18.0, seed);
    float drift = fract(aUv.x + t * (0.0014 + seed * 0.0048) + seed * 0.63);
    float cluster = snoise(vec3(seed * 2.0, q * 3.2, t * 0.007));
    float x = (drift - 0.5) * (45.0 + seed * 22.0) + cluster * 3.4;
    float y = (hash11(aRand * 331.0 + seed * 5.0) - 0.5) * 22.0 + sin(t * (0.018 + seed * 0.028) + seed * 7.0) * 0.86;
    float z = depth + sin(t * (0.020 + seed * 0.032) + aRand * 8.0) * 1.05;
    float twinkle = pow(0.5 + 0.5 * sin(t * (0.24 + seed * 0.42) + aRand * 17.0), 5.0);
    float dust = smoothstep(0.22, 0.98, hash11(aRand * 661.0 + floor(q * 160.0)));

    pos = vec3(x, y, z);
    vAlpha = dust * (0.16 + twinkle * 0.46 + highGlow * 0.025 + bassGlow * 0.018) * (1.0 - q * 0.06);
    // 同上，星白占比保持原版固定值
    vColor = mix(coverColor, vec3(0.92, 0.97, 1.0), 0.62 + twinkle * 0.14) * (0.72 + twinkle * 0.62 + bassGlow * 0.025);
    maxRippleAmp = max(maxRippleAmp, twinkle * highGlow * 0.055 + dust * bassGlow * 0.030);
  }

  if (transition > 0.001) {
    float bloom = smoothstep(0.0, 1.0, transition);
    vec2 burstVec = pos.xy + vec2(hash11(aRand * 31.0) - 0.5, hash11(aRand * 47.0) - 0.5) * 0.75;
    vec2 burstDir = burstVec / max(length(burstVec), 0.001);
    pos.xy += burstDir * bloom * 0.026;
    pos.xy += vec2(snoise(vec3(aRand, t * 0.014, 1.0)), snoise(vec3(aRand, t * 0.014, 5.0))) * bloom * 0.06;
    pos.xy *= 1.0 + bloom * 0.014;
    pos.z += (hash11(aRand * 123.0) - 0.5) * bloom * 0.18;
    vAlpha *= 0.86 + bloom * 0.22;
    maxRippleAmp = max(maxRippleAmp, bloom * 0.10);
  }

  vSourceLum = dot(max(vColor, vec3(0.0)), vec3(0.299, 0.587, 0.114));
  vEdgeBoost = 0.0;
  vColor = pow(max(vColor, vec3(0.0)), vec3(1.0 / max(0.35, uColorBoost)));
  vBright = 0.94 + maxRippleAmp * 0.34 + uBass * 0.020 + uEnergy * 0.026 + uBurstAmt * 0.025;
  vRipple = clamp(maxRippleAmp * 1.5, 0.0, 1.0);

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  float depthSize = 36.0 / max(0.5, -mvPos.z);
  float flowDrive = uBass * 0.070 + uMid * 0.046 + uTreble * 0.060 + uBurstAmt * 0.090 + uBeat * 0.055;
  float sz = clamp(depthSize * (1.05 + flowDrive), 1.00, 5.45);
  gl_PointSize = sz * uPixel * uPointScale;
  gl_Position = projectionMatrix * mvPos;
}
`;

const mineradioFragmentShader = `
precision highp float;
uniform sampler2D uDotTex;
uniform float uAlpha, uParticleDim;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.02) discard;
  vec3 col = vColor * vBright;
  col = mix(col, col * 1.3 + vec3(0.05), vEdgeBoost * 0.35);
  col = mix(col, col * 1.2, vRipple * 0.4);
  float keepBlack = 1.0 - smoothstep(0.025, 0.115, vSourceLum);
  float nonBlack = 1.0 - keepBlack;
  float dotDist = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float readableRim = smoothstep(0.44, 0.94, dotDist) * (1.0 - smoothstep(0.94, 1.08, dotDist)) * tex.a;
  float outLum = dot(col, vec3(0.299, 0.587, 0.114));
  float lightParticle = smoothstep(0.50, 0.82, outLum) * nonBlack;
  float darkParticle = (1.0 - smoothstep(0.20, 0.50, outLum)) * nonBlack;
  col = mix(col, vec3(0.0), readableRim * lightParticle * 0.38);
  col = mix(col, vec3(1.0), readableRim * darkParticle * 0.20);
  col = clamp(col, vec3(0.0), vec3(1.6));
  gl_FragColor = vec4(col, tex.a * uAlpha * uParticleDim * vAlpha);
}
`;

/**
 * 粒子圆点贴图。
 *
 * 原始曲线（Mineradio）实心核心只占半径 37%、面积 14%，
 * 而点渲染出来往往不足 4 个设备像素，等于整个点几乎全是羽化边 —— 这是"糊"的主因。
 *
 * 这里把核心比例参数化：core 之内保持接近不透明，之后才快速衰减，
 * 让每个点有一个真正的硬核。core=0.37 可复现原始观感。
 */
const DOT_TEXTURE_SIZE = 128;

function makeDotTexture(core = STARFIELD_DOT_CORE) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = DOT_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();

  const half = DOT_TEXTURE_SIZE / 2;
  const radius = half - 1;
  const gradient = context.createRadialGradient(half, half, 0, half, half, radius);

  if (Math.abs(core - STARFIELD_DOT_CORE) < 0.005) {
    // 默认档：逐字复刻 Mineradio 的原始四段曲线，保证与线上表现一致
    gradient.addColorStop(0, "rgba(255,255,255,0.96)");
    gradient.addColorStop(0.42, "rgba(255,255,255,0.78)");
    gradient.addColorStop(0.72, "rgba(255,255,255,0.22)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    // 调高锐度时才启用硬核曲线：core 之内近不透明，之后快速衰减
    const solid = Math.max(0.08, Math.min(0.88, core));
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(solid * 0.72, "rgba(255,255,255,0.99)");
    gradient.addColorStop(solid, "rgba(255,255,255,0.94)");
    // 留一段过渡带兜住关闭的 antialias，全硬边会有锯齿
    gradient.addColorStop(solid + (1 - solid) * 0.34, "rgba(255,255,255,0.46)");
    gradient.addColorStop(solid + (1 - solid) * 0.68, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, DOT_TEXTURE_SIZE, DOT_TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * 泛光层顶点着色器：与主层逐字一致，只在最后把点尺寸乘上 uBloomSize。
 * 用字符串替换派生而不是复制一份，避免两边的粒子布局哪天改出分歧。
 */
const bloomVertexShader = mineradioVertexShader
  .replace(
    "uniform float uPointScale, uSpeed, uColorBoost, uPixel;",
    "uniform float uPointScale, uSpeed, uColorBoost, uPixel, uBloomSize;"
  )
  .replace(
    "gl_PointSize = sz * uPixel * uPointScale;",
    "gl_PointSize = sz * uPixel * uPointScale * uBloomSize;"
  );

/**
 * 泛光层片元着色器。
 *
 * 与主粒子共用同一份几何和 uniform，只把点放大后用加法混合叠上去，
 * 给亮点补一层更亮的核心 —— 主层负责锐利、这层负责高光，
 * 两者对比才不显平。比后处理 UnrealBloomPass 便宜得多。
 */
const bloomFragmentShader = `
precision highp float;
uniform sampler2D uDotTex;
uniform float uAlpha, uParticleDim, uBloomStrength;
varying vec3 vColor;
varying float vBright, vRipple, vEdgeBoost, vAlpha, vSourceLum;

void main(){
  vec4 tex = texture2D(uDotTex, gl_PointCoord);
  if (tex.a < 0.01) discard;
  // 平方让能量集中在中心，边缘不会糊成一大团
  float soft = tex.a * tex.a;
  vec3 col = vColor * (0.55 + vBright * 0.62);
  col = clamp(col, vec3(0.0), vec3(1.8));
  float pulse = 1.0 + vRipple * 0.65;
  // 极暗粒子不参与泛光，否则黑色区域会被提亮成灰雾
  float keepBlack = 1.0 - smoothstep(0.025, 0.115, vSourceLum);
  float bloomKeep = 1.0 - keepBlack * 0.92;
  gl_FragColor = vec4(
    col,
    soft * uAlpha * uParticleDim * uBloomStrength * pulse * 0.55 * vAlpha * bloomKeep
  );
}
`;

function makeCoverTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 4;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();
  context.fillStyle = "#1c1c28";
  context.fillRect(0, 0, 4, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * 把封面图裁成正方形画进 canvas。
 *
 * 刻意不设置 `img.crossOrigin`：粒子只在着色器里用 texture2D 采样，
 * 不做 getImageData 读像素，因此不受 canvas 污染限制，
 * QQ 音乐等不带 CORS 头的图源也能直接贴图，无需服务端代理。
 */
const coverTextureSize = 256;

function drawCoverToCanvas(image: HTMLImageElement): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = coverTextureSize;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width < 1 || height < 1) return null;
  const side = Math.min(width, height);
  context.drawImage(
    image,
    (width - side) / 2,
    (height - side) / 2,
    side,
    side,
    0,
    0,
    coverTextureSize,
    coverTextureSize
  );
  return canvas;
}

/**
 * 视角交互参数。
 *
 * 拖拽转的是相机（球坐标 theta/phi），不是粒子对象自身——我们的画廊卡片是
 * DOM 元素、不在 WebGL 场景内，转粒子会让两者脱开；转相机则整个视角在动，
 * 画廊作为前景保持稳定。
 */
/**
 * 初始视角默认值 —— 沿用 Mineradio preset 5 的原始机位。
 * theta 约 -30°（偏左侧视），phi 约 +19°（略微俯视）。
 * 这三个值可由 props 覆盖，体验版调参面板上有对应滑块。
 */
export const STARFIELD_INITIAL_THETA = -0.52;
export const STARFIELD_INITIAL_PHI = 0.34;
export const STARFIELD_INITIAL_RADIUS = 9.4;

/**
 * 锐度相关默认值 —— 与 mineradio.art 线上表现对齐。
 *
 * dotCore=0.37 复现原版贴图曲线；泛光默认关闭（原版 fx.bloom 也是 false，
 * bloomStrength 0.62 只是打开后的预备值）。两者调高会让画面更糊，
 * 已实测确认，保留为可调参数但不作为默认。
 */
export const STARFIELD_DOT_CORE = 0.37;
export const STARFIELD_BLOOM_STRENGTH = 0;
const BLOOM_SIZE = 2.65;

// 实测标定：横向拖过屏宽约 1/4（320px）转约 50°，俯仰拖满全程不会瞬间撞到夹角
const DRAG_SPEED_THETA = 0.0028; // 横向拖：每 px 转多少弧度
const DRAG_SPEED_PHI = 0.0016; // 竖向拖：每 px 俯仰多少弧度
const SPIN_DAMPING = 0.9; // 松手后惯性衰减，与 Mineradio 一致
const SPIN_MAX = 3.2; // 角速度上限，防止甩出去
const SPIN_RELEASE = 0.4; // 松手时保留多少平均速度作为惯性
const VELOCITY_SMOOTHING = 0.35; // 速度滑动平均系数：越小越平滑、越不受最后一帧影响
// 俯仰夹角 ±0.72rad(≈41°)：preset 5 的粒子铺成横向宽带，
// 俯仰过大会看到带子边缘、画面变薄，所以夹住而不放到 ±90°
const PHI_LIMIT = 0.72;
const RADIUS_MIN = 6;
const RADIUS_MAX = 14;
const WHEEL_SPEED = 0.0045; // 滚轮每单位 deltaY 改变多少半径

/** 落点在这些元素上时不接管事件，交还给画廊/按钮/面板 */
const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, label, [role='button'], [role='menu']," +
  " .queueOrbitItem, .tuningPanel, .landingChatWindow, .landingAccountMenuAnchor," +
  " .landingSettingsPage, .queueProgressRow, .landingStatusNotice";

function isPointerOverInteractive(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

function clampRange(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildCoverParticleGeometry() {
  // Mineradio default: round(118 * 1.55) => 183, kept odd by the original helper.
  const grid = 183;
  const count = grid * grid;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const randomValues = new Float32Array(count);
  const texelStep = 1 / grid;
  for (let index = 0; index < count; index += 1) {
    const gridX = index % grid;
    const gridY = Math.floor(index / grid);
    const u = (gridX + 0.5) * texelStep;
    const v = (gridY + 0.5) * texelStep;
    const x = gridX / (grid - 1);
    const y = gridY / (grid - 1);
    positions[index * 3] = (x - 0.5) * 4.8;
    positions[index * 3 + 1] = (y - 0.5) * 4.8;
    positions[index * 3 + 2] = 0;
    uvs[index * 2] = u;
    uvs[index * 2 + 1] = v;
    randomValues[index] = Math.random();
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aUv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("aRand", new THREE.BufferAttribute(randomValues, 1));
  return geometry;
}

export function StarfieldCanvas({
  bloomStrength = STARFIELD_BLOOM_STRENGTH,
  coverTint = 1,
  coverUrl,
  dotCore = STARFIELD_DOT_CORE,
  enableViewControl = true,
  initialPhi = STARFIELD_INITIAL_PHI,
  initialRadius = STARFIELD_INITIAL_RADIUS,
  initialTheta = STARFIELD_INITIAL_THETA,
  transitionMs = 1100
}: {
  /** 泛光强度，0 为关闭泛光层 */
  bloomStrength?: number;
  /** 圆点实心核心占半径的比例，越大越锐利、越小越雾 */
  dotCore?: number;
  /** 封面吸色强度 0~1，0 保留原始极光配色 */
  coverTint?: number;
  /** 当前播放歌曲的封面地址，切歌时颜色自动过渡 */
  coverUrl?: string | null;
  /** 是否开放鼠标拖拽/滚轮控制视角 */
  enableViewControl?: boolean;
  /** 初始俯仰角（弧度，正=从上往下看） */
  initialPhi?: number;
  /** 初始相机距离，越小越近越有包裹感 */
  initialRadius?: number;
  /** 初始水平角（弧度，0=正视，负=偏左） */
  initialTheta?: number;
  /** 切歌换色的过渡时长 */
  transitionMs?: number;
} = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 把 uniform 抬到 effect 外，换封面时不必重建整个场景
  const uniformsRef = useRef<Record<string, { value: unknown }> | null>(null);
  const colorMixRef = useRef<number>(0);
  // 相机姿态放在 ref 里：调参改初始视角时不重建 WebGL 场景
  const orbitRef = useRef({
    theta: initialTheta,
    phi: initialPhi,
    radius: initialRadius,
    userTheta: initialTheta,
    userPhi: initialPhi,
    userRadius: initialRadius,
    baseTheta: initialTheta,
    basePhi: initialPhi,
    baseRadius: initialRadius,
    cineTheta: 0,
    cinePhi: 0,
    cineRadius: 0,
    spinTheta: 0,
    spinPhi: 0,
    recentering: false
  });
  const viewControlRef = useRef(enableViewControl);
  // 贴图曲线变了要重建纹理（不重建场景），所以初值走 ref 避免闭包捕获旧值
  const dotCoreRef = useRef(dotCore);
  const bloomParticlesRef = useRef<THREE.Points | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        canvas,
        powerPreference: "high-performance"
      });
    } catch {
      canvas.style.display = "none";
      return;
    }

    renderer.setClearColor(0x000000, 0);

    const dotTexture = makeDotTexture(dotCoreRef.current);
    const coverTexture = makeCoverTexture();
    const prevCoverTexture = makeCoverTexture();
    const uniforms = {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: 0 },
      uBurstAmt: { value: 0 },
      uPointScale: { value: 1 },
      uSpeed: { value: 1 },
      uColorBoost: { value: 1.1 },
      uPixel: { value: 1 },
      uCoverTex: { value: coverTexture },
      uPrevCoverTex: { value: prevCoverTexture },
      uColorMixT: { value: 1 },
      uHasCover: { value: 0 },
      uCoverTint: { value: 1 },
      uDotTex: { value: dotTexture },
      uAlpha: { value: 0 },
      uParticleDim: { value: 1 },
      uBloomStrength: { value: bloomStrength },
      uBloomSize: { value: BLOOM_SIZE }
    };
    uniformsRef.current = uniforms as unknown as Record<string, { value: unknown }>;
    const geometry = buildCoverParticleGeometry();
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: mineradioVertexShader,
      fragmentShader: mineradioFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const particles = new THREE.Points(geometry, material);
    particles.frustumCulled = false;
    particles.renderOrder = 1;
    scene.add(particles);

    // 泛光层：同一份几何与 uniform，放大 + 加法混合，先画在主层之下
    const bloomMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: bloomVertexShader,
      fragmentShader: bloomFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    const bloomParticles = new THREE.Points(geometry, bloomMaterial);
    bloomParticles.frustumCulled = false;
    bloomParticles.renderOrder = 0;
    // 关闭时直接不可见：3.3 万点白画一遍不值得
    bloomParticles.visible = bloomStrength > 0.01;
    scene.add(bloomParticles);
    bloomParticlesRef.current = bloomParticles;

    // 相机姿态来自 ref，初始机位由 props 决定
    const orbit = orbitRef.current;
    let cinemaTime = 0;
    let previousTime = performance.now();
    const alphaStartedAt = previousTime;
    let animationFrame = 0;
    let visible = !document.hidden;

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const cssPixels = width * height;
      const budgetCap = Math.sqrt(5_200_000 / cssPixels);
      const pixelRatio = Math.max(0.72, Math.min(window.devicePixelRatio || 1, 1.35, budgetCap));
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      uniforms.uPixel.value = renderer.getPixelRatio();
    };

    const renderFrame = (now: number) => {
      const delta = Math.max(0, Math.min(0.05, (now - previousTime) / 1000));
      previousTime = now;
      cinemaTime += delta;
      uniforms.uTime.value += delta;
      let alphaTime = Math.min(1, (now - alphaStartedAt) / 920);
      alphaTime = alphaTime * alphaTime * (3 - 2 * alphaTime);
      uniforms.uAlpha.value = 0.96 * alphaTime;

      // 切歌换色：0→1 推进，smoothstep 缓动让颜色平滑爬过去
      if (uniforms.uColorMixT.value < 1) {
        const mixStep = delta * 1000 / Math.max(1, colorMixRef.current || 1);
        const raw = Math.min(1, uniforms.uColorMixT.value + mixStep);
        uniforms.uColorMixT.value = raw;
      }

      // 松手后的惯性：角速度继续推进姿态，再按指数衰减
      if (orbit.spinTheta !== 0 || orbit.spinPhi !== 0) {
        orbit.userTheta += orbit.spinTheta * delta;
        orbit.userPhi = clampRange(orbit.userPhi + orbit.spinPhi * delta, -PHI_LIMIT, PHI_LIMIT);
        const decay = Math.pow(SPIN_DAMPING, delta * 60);
        orbit.spinTheta *= decay;
        orbit.spinPhi *= decay;
        if (Math.abs(orbit.spinTheta) < 0.002) orbit.spinTheta = 0;
        if (Math.abs(orbit.spinPhi) < 0.002) orbit.spinPhi = 0;
      }

      // 双击回正：往初始机位缓慢收敛，足够近了就吸附并结束
      if (orbit.recentering) {
        orbit.userTheta += (orbit.baseTheta - orbit.userTheta) * 0.06;
        orbit.userPhi += (orbit.basePhi - orbit.userPhi) * 0.06;
        orbit.userRadius += (orbit.baseRadius - orbit.userRadius) * 0.06;
        if (
          Math.abs(orbit.userTheta - orbit.baseTheta) < 0.004 &&
          Math.abs(orbit.userPhi - orbit.basePhi) < 0.004 &&
          Math.abs(orbit.userRadius - orbit.baseRadius) < 0.04
        ) {
          orbit.userTheta = orbit.baseTheta;
          orbit.userPhi = orbit.basePhi;
          orbit.userRadius = orbit.baseRadius;
          orbit.recentering = false;
        }
      }

      orbit.cineTheta = Math.sin(cinemaTime * 0.08) * 0.012 * 0.5;
      orbit.cinePhi = Math.sin(cinemaTime * 0.06 + 1) * 0.01 * 0.5;
      orbit.cineRadius = Math.sin(cinemaTime * 0.04 + 2) * 0.08 * 0.5;
      const targetTheta = orbit.userTheta + orbit.cineTheta;
      const targetPhi = orbit.userPhi + orbit.cinePhi;
      const targetRadius = orbit.userRadius + orbit.cineRadius;
      orbit.theta += (targetTheta - orbit.theta) * 0.1;
      orbit.phi += (targetPhi - orbit.phi) * 0.1;
      orbit.radius += (targetRadius - orbit.radius) * 0.07;

      const cosPhi = Math.cos(orbit.phi);
      camera.position.set(
        orbit.radius * cosPhi * Math.sin(orbit.theta),
        orbit.radius * Math.sin(orbit.phi),
        orbit.radius * cosPhi * Math.cos(orbit.theta)
      );
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      if (visible) animationFrame = requestAnimationFrame(renderFrame);
    };

    const handleVisibilityChange = () => {
      visible = !document.hidden;
      cancelAnimationFrame(animationFrame);
      if (visible) {
        previousTime = performance.now();
        animationFrame = requestAnimationFrame(renderFrame);
      }
    };

    // ---- 视角交互 ----
    // 画布是 pointer-events:none，所以监听挂在 window 上，
    // 靠落点判断避开画廊卡片与各类控件。
    const drag = {
      active: false,
      x: 0,
      y: 0,
      time: 0,
      moved: false,
      hasVelocity: false,
      lastMoveAt: 0
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!viewControlRef.current) return;
      if (event.button !== 0) return;
      if (event.pointerType !== "mouse") return; // 不做移动端
      if (isPointerOverInteractive(event.target)) return;
      drag.active = true;
      drag.moved = false;
      drag.hasVelocity = false;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.time = performance.now();
      drag.lastMoveAt = drag.time;
      orbit.spinTheta = 0;
      orbit.spinPhi = 0;
      orbit.recentering = false;
      document.body.classList.add("isStarfieldDragging");
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drag.active) return;
      const now = performance.now();
      // dt 夹在合理区间，避免掉帧时算出爆炸的角速度
      const dt = Math.max(1 / 120, Math.min(0.08, (now - drag.time) / 1000 || 1 / 60));
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;

      // 横向拖 → 水平环绕；竖向拖 → 俯仰（取负号让"往下拖=视角抬起"符合直觉）
      const deltaTheta = -dx * DRAG_SPEED_THETA;
      const deltaPhi = dy * DRAG_SPEED_PHI;
      orbit.userTheta += deltaTheta;
      orbit.userPhi = clampRange(orbit.userPhi + deltaPhi, -PHI_LIMIT, PHI_LIMIT);

      // 惯性初值取最近几帧速度的滑动平均，而不是最后一帧的瞬时值。
      // 松手前人手几乎总会先减速或停顿，只看最后一帧会算出 0 而导致急停。
      const sampleTheta = deltaTheta / dt;
      const samplePhi = deltaPhi / dt;
      if (drag.hasVelocity) {
        orbit.spinTheta += (sampleTheta - orbit.spinTheta) * VELOCITY_SMOOTHING;
        orbit.spinPhi += (samplePhi - orbit.spinPhi) * VELOCITY_SMOOTHING;
      } else {
        orbit.spinTheta = sampleTheta;
        orbit.spinPhi = samplePhi;
        drag.hasVelocity = true;
      }

      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.time = now;
      drag.lastMoveAt = now;
    };

    const handlePointerUp = () => {
      if (!drag.active) return;
      drag.active = false;
      document.body.classList.remove("isStarfieldDragging");

      // 松手前静止越久，惯性越少：停住不动再松手应该原地停下，
      // 快甩着松手才滑行。用最后一次移动到松手的间隔做衰减。
      const idle = performance.now() - drag.lastMoveAt;
      const idleFade = idle <= 24 ? 1 : Math.max(0, 1 - (idle - 24) / 90);
      const release = SPIN_RELEASE * idleFade;
      orbit.spinTheta = clampRange(orbit.spinTheta * release, -SPIN_MAX, SPIN_MAX);
      orbit.spinPhi = clampRange(orbit.spinPhi * release, -SPIN_MAX, SPIN_MAX);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!viewControlRef.current) return;
      if (isPointerOverInteractive(event.target)) return;
      // 落地页不滚动，这里可以安全接管滚轮
      event.preventDefault();
      orbit.userRadius = clampRange(
        orbit.userRadius + event.deltaY * WHEEL_SPEED,
        RADIUS_MIN,
        RADIUS_MAX
      );
      orbit.recentering = false;
    };

    // 双击空白处回到初始机位
    const handleDoubleClick = (event: MouseEvent) => {
      if (!viewControlRef.current) return;
      if (isPointerOverInteractive(event.target)) return;
      orbit.recentering = true;
      orbit.spinTheta = 0;
      orbit.spinPhi = 0;
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("dblclick", handleDoubleClick);
    animationFrame = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("dblclick", handleDoubleClick);
      document.body.classList.remove("isStarfieldDragging");
      geometry.dispose();
      material.dispose();
      bloomMaterial.dispose();
      // 贴图可能已被 dotCore 变更替换过，释放当前那张而不是初始捕获的
      const activeDotTexture = uniforms.uDotTex.value as THREE.Texture | null;
      if (activeDotTexture) activeDotTexture.dispose();
      else dotTexture.dispose();
      coverTexture.dispose();
      prevCoverTexture.dispose();
      renderer.dispose();
      uniformsRef.current = null;
      bloomParticlesRef.current = null;
    };
  }, []);

  // 吸色强度实时生效，不重建场景
  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;
    uniforms.uCoverTint.value = Math.max(0, Math.min(1, coverTint));
  }, [coverTint]);

  useEffect(() => {
    viewControlRef.current = enableViewControl;
  }, [enableViewControl]);

  // 泛光强度：改 uniform 并同步整层可见性
  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;
    const strength = Math.max(0, bloomStrength);
    uniforms.uBloomStrength.value = strength;
    if (bloomParticlesRef.current) {
      bloomParticlesRef.current.visible = strength > 0.01;
    }
  }, [bloomStrength]);

  // 硬核比例：需要重画贴图并换掉纹理，旧纹理即时释放
  useEffect(() => {
    dotCoreRef.current = dotCore;
    const uniforms = uniformsRef.current;
    if (!uniforms) return;
    const previous = uniforms.uDotTex.value as THREE.Texture | null;
    const next = makeDotTexture(dotCore);
    uniforms.uDotTex.value = next;
    if (previous) previous.dispose();
  }, [dotCore]);

  // 初始视角改动（调参滑块）：更新回正基准，并让当前机位缓动到新姿态
  useEffect(() => {
    const orbit = orbitRef.current;
    orbit.baseTheta = initialTheta;
    orbit.basePhi = clampRange(initialPhi, -PHI_LIMIT, PHI_LIMIT);
    orbit.baseRadius = clampRange(initialRadius, RADIUS_MIN, RADIUS_MAX);
    orbit.spinTheta = 0;
    orbit.spinPhi = 0;
    orbit.recentering = true;
  }, [initialPhi, initialRadius, initialTheta]);

  // 换封面：加载成功后把旧纹理挪到 prev，再从 0 起跑颜色过渡
  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;

    if (!coverUrl) {
      uniforms.uHasCover.value = 0;
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      const canvas = drawCoverToCanvas(image);
      if (!canvas) return;

      const coverTexture = uniforms.uCoverTex.value as THREE.Texture;
      const prevCoverTexture = uniforms.uPrevCoverTex.value as THREE.Texture;

      // 首次上色不做过渡，直接亮起；后续切歌才走 mix
      const isFirstCover = uniforms.uHasCover.value === 0;
      if (!isFirstCover && coverTexture.image) {
        prevCoverTexture.image = coverTexture.image;
        prevCoverTexture.needsUpdate = true;
      }

      coverTexture.image = canvas;
      coverTexture.needsUpdate = true;
      uniforms.uHasCover.value = 1;
      colorMixRef.current = Math.max(1, transitionMs);
      uniforms.uColorMixT.value = isFirstCover ? 1 : 0;
    };
    image.onerror = () => {
      // 封面拉不到就保持当前配色，不要闪回灰色
    };
    image.src = coverUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [coverUrl, transitionMs]);

  return <canvas aria-hidden="true" className="landingParticleField" ref={canvasRef} />;
}
