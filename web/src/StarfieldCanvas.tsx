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
uniform sampler2D uCoverTex;
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
  vec3 coverColor = texture2D(uCoverTex, clamp(aUv, vec2(0.0012), vec2(0.9988))).rgb;
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

function makeDotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,0.96)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.78)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

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

export function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const dotTexture = makeDotTexture();
    const coverTexture = makeCoverTexture();
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
      uDotTex: { value: dotTexture },
      uAlpha: { value: 0 },
      uParticleDim: { value: 1 }
    };
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

    // Original preset-5 camera transition and cinema drift values.
    const orbit = {
      theta: 0,
      phi: 0.08,
      radius: 6.6,
      userTheta: -0.52,
      userPhi: 0.34,
      userRadius: 9.4,
      cineTheta: 0,
      cinePhi: 0,
      cineRadius: 0
    };
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

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    animationFrame = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      geometry.dispose();
      material.dispose();
      dotTexture.dispose();
      coverTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas aria-hidden="true" className="landingParticleField" ref={canvasRef} />;
}
