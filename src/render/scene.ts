// Three.js 장면: 렌더러, 카메라, 하늘 공(하늘색·해·은하수), 땅.
// 월드 좌표: +X=동, +Y=천정, -Z=북. 카메라는 원점에서 밖을 본다.
import * as THREE from 'three';
import { cameraBasis, verticalFov, type View } from '../astro/projection';
import { transposeMat3, type Mat3, type Vec3 } from '../astro/coords';
import type { SkyPalette } from './sky-color';
import common from './shaders/common.glsl?raw';
import skyVert from './shaders/sky.vert?raw';
import skyFrag from './shaders/sky.frag?raw';
import groundFrag from './shaders/ground.frag?raw';

/** 그리는 순서 (작을수록 먼저 = 뒤쪽) */
export const ORDER = { sky: 0, aurora: 10, lines: 20, stars: 30, planets: 31, moon: 32, meteors: 40, ground: 50 };

export function setMat3(target: THREE.Matrix3, m: Mat3): void {
  target.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
}

export function withCommon(source: string): string {
  return `${common}\n${source}`;
}

export class SkyScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 20);
  /** CSS 픽셀 크기 */
  width = 1;
  height = 1;
  pixelRatio = 1;
  /** 시야각(긴 쪽 기준, 도) */
  fov = 70;

  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly groundMaterial: THREE.ShaderMaterial;
  private readonly blankTexture: THREE.DataTexture;
  private milkyEnabled = true;
  private milkyLevel = 0;
  private hasMilkyTexture = false;

  constructor(canvas: HTMLCanvasElement) {
    // WebGL을 못 쓰면 여기서 오류가 난다 → main.ts가 안내 화면을 띄운다
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x02030a, 1);
    this.renderer.sortObjects = true;

    this.blankTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blankTexture.needsUpdate = true;

    const dome = new THREE.SphereGeometry(1, 48, 32);
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: withCommon(skyFrag),
      uniforms: {
        uZenith: { value: new THREE.Vector3() },
        uHorizon: { value: new THREE.Vector3() },
        uGlow: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunDisc: { value: 0 },
        uInvRot: { value: new THREE.Matrix3() },
        uMilky: { value: this.blankTexture },
        uMilkyStrength: { value: 0 },
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(dome, this.skyMaterial);
    sky.renderOrder = ORDER.sky;
    sky.frustumCulled = false;
    this.scene.add(sky);

    this.groundMaterial = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: withCommon(groundFrag),
      uniforms: {
        uGround: { value: new THREE.Vector3() },
        uHorizon: { value: new THREE.Vector3() },
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const ground = new THREE.Mesh(dome, this.groundMaterial);
    ground.renderOrder = ORDER.ground;
    ground.frustumCulled = false;
    this.scene.add(ground);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.applyFov();
  }

  /** 그리기 버퍼 크기(기기 픽셀) */
  bufferSize(): [number, number] {
    return [Math.round(this.width * this.pixelRatio), Math.round(this.height * this.pixelRatio)];
  }

  setFov(fov: number): void {
    this.fov = fov;
    this.applyFov();
  }

  private applyFov(): void {
    this.camera.fov = verticalFov(this.fov, this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /** 드래그 모드: (방위각, 고도)를 보고 화면 위가 천정을 향하게. */
  setView(view: View): void {
    const { forward, right, up } = cameraBasis(view);
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...right),
      new THREE.Vector3(...up),
      new THREE.Vector3(-forward[0], -forward[1], -forward[2]),
    );
    this.camera.quaternion.setFromRotationMatrix(m);
    this.setFov(view.fov);
    this.camera.updateMatrixWorld(true);
  }

  /** 센서 모드: 폰 자세에서 계산한 회전값(쿼터니언 x,y,z,w)을 그대로 쓴다. */
  setQuaternion(q: [number, number, number, number], fov: number): void {
    this.camera.quaternion.set(q[0], q[1], q[2], q[3]);
    this.setFov(fov);
    this.camera.updateMatrixWorld(true);
  }

  /** 카메라가 보는 방향(월드 단위벡터). */
  forward(): Vec3 {
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return [v.x, v.y, v.z];
  }

  private readonly tmp = new THREE.Vector3();

  /** 월드 방향 → 화면 좌표(CSS 픽셀). 카메라 뒤쪽이면 null. */
  project(dir: Vec3): { x: number; y: number } | null {
    const v = this.tmp.set(dir[0], dir[1], dir[2]).applyMatrix4(this.camera.matrixWorldInverse);
    if (v.z > -1e-4) return null;
    v.applyMatrix4(this.camera.projectionMatrix);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (0.5 - v.y * 0.5) * this.height };
  }

  /** 화면 좌표(CSS 픽셀) → 월드 방향. */
  unproject(x: number, y: number): Vec3 {
    const v = this.tmp
      .set((x / this.width) * 2 - 1, 1 - (y / this.height) * 2, 0.5)
      .unproject(this.camera)
      .normalize();
    return [v.x, v.y, v.z];
  }

  /** 하늘색·해·은하수 갱신. */
  updateSky(palette: SkyPalette, sunDir: Vec3, eqToWorld: Mat3): void {
    const u = this.skyMaterial.uniforms;
    u.uZenith.value.set(...palette.zenith);
    u.uHorizon.value.set(...palette.horizon);
    u.uGlow.value.set(...palette.glow);
    u.uSunDir.value.set(...sunDir);
    u.uSunDisc.value = palette.sunDisc;
    setMat3(u.uInvRot.value, transposeMat3(eqToWorld));
    this.milkyLevel = palette.milky;
    this.applyMilky();

    const g = this.groundMaterial.uniforms;
    g.uGround.value.set(...palette.ground);
    g.uHorizon.value.set(...palette.horizon);
    this.renderer.setClearColor(new THREE.Color(...palette.zenith), 1);
  }

  setMilkyWayTexture(texture: THREE.Texture): void {
    this.skyMaterial.uniforms.uMilky.value = texture;
    this.hasMilkyTexture = true;
    this.applyMilky();
  }

  setMilkyWayEnabled(on: boolean): void {
    this.milkyEnabled = on;
    this.applyMilky();
  }

  private applyMilky(): void {
    // 텍스처 밝기를 화면 밝기로 바꾸는 배율. "시골 밤하늘처럼 은은하게"를 기준으로 맞춘 값.
    const strength = this.milkyEnabled && this.hasMilkyTexture ? this.milkyLevel * 0.42 : 0;
    this.skyMaterial.uniforms.uMilkyStrength.value = strength;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
