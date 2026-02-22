/**
 * Three.js scene for the 3D plane hover effect.
 * Step 3: InstancedMesh of small planes; on province hover they fly in from off-screen to the province.
 * Loads plane.glb from public/models/ when present for a nicer look.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MAX_INSTANCES = 2000;
const FLY_DURATION_MS = 3000;
const PLANE_SCALE = 0.04;
const TARGET_DISTANCE = 6;
/** Max delay (ms) before each plane starts flying so they're staggered and less overlapping. */
const STAGGER_MAX_MS = 900;

export interface PlaneSceneOptions {
  width?: number;
  height?: number;
}

export class PlaneScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private planeMesh: THREE.Mesh;
  private instancedMesh: THREE.InstancedMesh;
  private animationId: number | null = null;
  private container: HTMLElement | null = null;
  private boundResize: () => void;
  private width: number;
  private height: number;

  private startPositions: THREE.Vector3[] = [];
  private startDelays: number[] = [];
  private targetWorld: THREE.Vector3 = new THREE.Vector3();
  private effectStartTime: number = 0;
  private effectCount: number = 0;
  /** When true, we are hovering a 0-visitor province: hide idle plane so there is no plane effect at all. */
  private hideIdleBecauseZeroVisitor: boolean = false;
  private dummy: THREE.Object3D = new THREE.Object3D();

  constructor(options: PlaneSceneOptions = {}) {
    this.width = options.width ?? 400;
    this.height = options.height ?? 300;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new THREE.BoxGeometry(1.2, 0.2, 0.4);
    const material = new THREE.MeshNormalMaterial();
    this.planeMesh = new THREE.Mesh(geometry, material);
    this.planeMesh.position.set(0, 0, 0);
    this.scene.add(this.planeMesh);

    const instancedGeometry = new THREE.BoxGeometry(1, 0.15, 0.3);
    /* Use MeshNormalMaterial so the many small planes match the colorful look of the idle plane, size unchanged. */
    const instancedMaterial = new THREE.MeshNormalMaterial();
    this.instancedMesh = new THREE.InstancedMesh(instancedGeometry, instancedMaterial, MAX_INSTANCES);
    this.instancedMesh.count = 0;
    this.scene.add(this.instancedMesh);

    for (let i = 0; i < MAX_INSTANCES; i++) {
      this.startPositions.push(new THREE.Vector3());
      this.startDelays.push(0);
    }

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(2, 2, 2);
    this.scene.add(dir);

    this.boundResize = (): void => this.handleResize();
  }

  private handleResize(): void {
    if (!this.container) return;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.width = container.clientWidth || this.width;
    this.height = container.clientHeight || this.height;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    container.appendChild(this.renderer.domElement);
    window.addEventListener('resize', this.boundResize);
    this.loadPlaneModel();
  }

  /**
   * Try to load public/models/plane.glb; if present, use its geometry for instanced planes (and the idle placeholder).
   */
  private loadPlaneModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      'image/plane.glb',
      (gltf) => {
        let geometry: THREE.BufferGeometry | null = null;
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry && !geometry) {
            geometry = child.geometry;
          }
        });
        if (!geometry) {
          console.warn('[PlaneScene] plane.glb has no mesh geometry');
          return;
        }
        const cloned = geometry.clone();
        this.instancedMesh.geometry.dispose();
        this.instancedMesh.geometry = cloned;
        this.planeMesh.geometry.dispose();
        this.planeMesh.geometry = geometry.clone();
        console.log('[PlaneScene] loaded plane.glb for instanced planes');
      },
      undefined,
      () => { /* file missing or load error: keep box placeholder */ }
    );
  }

  start(): void {
    const animate = (): void => {
      this.animationId = requestAnimationFrame(animate);
      const now = performance.now();

      if (this.effectCount > 0) {
        this.planeMesh.visible = false;
        const elapsed = now - this.effectStartTime;
        const t = Math.min(1, elapsed / FLY_DURATION_MS);
        const eased = 1 - (1 - t) * (1 - t);

        for (let i = 0; i < this.effectCount; i++) {
          const delayedElapsed = Math.max(0, elapsed - this.startDelays[i]);
          const t = Math.min(1, delayedElapsed / FLY_DURATION_MS);
          const eased = 1 - (1 - t) * (1 - t);
          const scale = t <= 0 ? 0 : PLANE_SCALE * (1 - eased);
          this.dummy.position.lerpVectors(this.startPositions[i], this.targetWorld, eased);
          this.dummy.lookAt(this.targetWorld);
          this.dummy.scale.setScalar(scale);
          this.dummy.updateMatrix();
          this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.count = this.effectCount;
      } else {
        this.planeMesh.visible = !this.hideIdleBecauseZeroVisitor;
        this.planeMesh.rotation.y += 0.008;
        this.instancedMesh.count = 0;
      }

      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  /**
   * Screen (client) to 3D world position at a given distance from the camera.
   */
  private screenToWorld(screenX: number, screenY: number, distance: number): THREE.Vector3 {
    if (!this.container) return this.targetWorld.set(0, 0, 0);
    const rect = this.container.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;
    const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = v.clone().sub(this.camera.position).normalize();
    return this.camera.position.clone().add(dir.multiplyScalar(distance));
  }

  /**
   * Random start position on a ring around the view (360°) so planes are spread out and less overlapping.
   */
  private randomRingStart(): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const r = 1.15 + Math.random() * 0.25;
    const ndcX = Math.cos(angle) * r;
    const ndcY = Math.sin(angle) * r;
    const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = v.clone().sub(this.camera.position).normalize();
    const startDist = 14 + Math.random() * 8;
    return this.camera.position.clone().add(dir.multiplyScalar(startDist));
  }

  startPlaneEffect(
    _provinceName: string,
    planeCount: number,
    targetScreenX: number,
    targetScreenY: number
  ): void {
    if (!this.container) return;
    const count = Math.min(planeCount, MAX_INSTANCES);
    this.hideIdleBecauseZeroVisitor = count === 0;
    this.targetWorld.copy(this.screenToWorld(targetScreenX, targetScreenY, TARGET_DISTANCE));

    for (let i = 0; i < count; i++) {
      this.startPositions[i].copy(this.randomRingStart());
      this.startDelays[i] = Math.random() * STAGGER_MAX_MS;
    }
    this.effectCount = count;
    this.effectStartTime = performance.now();
    console.log('[PlaneScene] startPlaneEffect planes=', count, 'target', this.targetWorld.toArray().map(x => x.toFixed(2)).join(', '));
  }

  /** Call when pointer leaves the map so the idle plane is shown again after a 0-visitor hover. */
  clearZeroVisitorState(): void {
    this.hideIdleBecauseZeroVisitor = false;
  }

  dispose(): void {
    if (this.animationId != null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    window.removeEventListener('resize', this.boundResize);
    this.planeMesh.geometry.dispose();
    (this.planeMesh.material as THREE.Material).dispose();
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    if (this.container && this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.container = null;
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}
