/**
 * Three.js scene for the 3D plane hover effect.
 * Loads plane.glb from public/models/ when present for a nicer look.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAX_INSTANCES = 1500;
const FLY_DURATION_MS = 1500;
/** Fly-in plane scale: kept small so they stay subtle from the start. */
const PLANE_SCALE = 0.005;
const TARGET_DISTANCE = 6;
const TARGET_PLANE_SIZE = 720;
/** Max delay (ms) before each plane starts – larger = more spread in time so less clustering. */
const STAGGER_MAX_MS = 500;

export interface PlaneSceneOptions {
  width?: number;
  height?: number;
}

export class PlaneScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  /** Idle plane: Mesh (default box) or Group (full GLB with all meshes). */
  private planeMesh: THREE.Object3D;
  /** Fly-in planes: one InstancedMesh per GLB mesh part so each part keeps its material (full plane look). */
  private instancedMeshes: THREE.InstancedMesh[] = [];
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
  /** Once the user has hovered a province, idle plane stops spinning and stays still. */
  private idleSpinStopped: boolean = false;
  private dummy: THREE.Object3D = new THREE.Object3D();
  /** Resolves when plane.glb has finished loading (success or error). Used so loading spinner stays until 3D model is ready. */
  private planeModelLoadedResolve: (() => void) | null = null;
  public readonly whenPlaneModelLoaded: Promise<void>;

  constructor(options: PlaneSceneOptions = {}) {
    this.width = options.width ?? 400;
    this.height = options.height ?? 300;
    this.whenPlaneModelLoaded = new Promise<void>((resolve) => {
      this.planeModelLoadedResolve = resolve;
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, 0, 400);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new THREE.BoxGeometry(1.2, 0.2, 0.4);
    const material = new THREE.MeshNormalMaterial();
    this.planeMesh = new THREE.Mesh(geometry, material);
    (this.planeMesh as THREE.Mesh).position.set(0, 0, 0);
    this.scene.add(this.planeMesh);

    const instancedGeometry = new THREE.BoxGeometry(1, 0.15, 0.3);
    const instancedMaterial = new THREE.MeshNormalMaterial();
    const boxInstanced = new THREE.InstancedMesh(instancedGeometry, instancedMaterial, MAX_INSTANCES);
    boxInstanced.count = 0;
    this.scene.add(boxInstanced);
    this.instancedMeshes = [boxInstanced];

    for (let i = 0; i < MAX_INSTANCES; i++) {
      this.startPositions.push(new THREE.Vector3());
      this.startDelays.push(0);
    }

    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
    dir.position.set(2, 2, 2);
    this.scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(0, 0, 5);
    this.scene.add(fill);

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
   * Load image/plane.glb; use ALL meshes so the full model (every layer) is shown.
   */
  private loadPlaneModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      'image/plane.glb',
      (gltf) => {
        const meshes: THREE.Mesh[] = [];
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            meshes.push(child);
          }
        });
        if (meshes.length === 0) {
          console.warn('[PlaneScene] plane.glb has no meshes');
          return;
        }

        const geometries: THREE.BufferGeometry[] = [];
        const group = new THREE.Group();
        group.position.set(0, 0, 0);

        for (const mesh of meshes) {
          const geo = mesh.geometry.clone();
          geo.applyMatrix4(mesh.matrixWorld);
          geometries.push(geo);
        }

        const merged = mergeGeometries(geometries);
        let bbox: THREE.Box3 | null = merged ? (merged.computeBoundingBox(), merged.boundingBox) : geometries[0].boundingBox;
        if (!bbox && geometries[0]) {
          geometries[0].computeBoundingBox();
          bbox = geometries[0].boundingBox;
        }
        const size = new THREE.Vector3();
        if (bbox) bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = TARGET_PLANE_SIZE / maxDim;

        for (const geo of geometries) {
          geo.scale(scale, scale, scale);
        }
        if (merged) merged.scale(scale, scale, scale);
        const combinedBbox = merged ? (merged.computeBoundingBox(), merged.boundingBox!) : (geometries[0].computeBoundingBox(), geometries[0].boundingBox!);
        const center = new THREE.Vector3();
        combinedBbox.getCenter(center);
        for (let i = 0; i < meshes.length; i++) {
          const geo = geometries[i];
          geo.translate(-center.x, -center.y, -center.z);
          geo.computeVertexNormals();
          const mat = meshes[i].material;
          const material = Array.isArray(mat) ? (mat[0] as THREE.Material).clone() : (mat as THREE.Material).clone();
          const part = new THREE.Mesh(geo, material);
          group.add(part);
        }

        this.scene.remove(this.planeMesh);
        if (this.planeMesh instanceof THREE.Mesh) {
          this.planeMesh.geometry.dispose();
          (this.planeMesh.material as THREE.Material).dispose();
        }
        this.planeMesh = group;
        this.scene.add(this.planeMesh);

        for (const inst of this.instancedMeshes) {
          this.scene.remove(inst);
          inst.geometry.dispose();
          (inst.material as THREE.Material).dispose();
        }
        this.instancedMeshes = [];
        for (let i = 0; i < meshes.length; i++) {
          const geo = geometries[i].clone();
          geo.computeVertexNormals();
          const mat = meshes[i].material;
          const material = Array.isArray(mat) ? (mat[0] as THREE.Material).clone() : (mat as THREE.Material).clone();
          const inst = new THREE.InstancedMesh(geo, material, MAX_INSTANCES);
          inst.count = 0;
          this.scene.add(inst);
          this.instancedMeshes.push(inst);
        }

        console.log('[PlaneScene] loaded plane.glb (all ' + meshes.length + ' meshes, fly-in uses full multi-layer look)');
        this.planeModelLoadedResolve?.();
        this.planeModelLoadedResolve = null;
      },
      undefined,
      () => {
        /* file missing or load error: keep box */
        this.planeModelLoadedResolve?.();
        this.planeModelLoadedResolve = null;
      }
    );
  }

  start(): void {
    const animate = (): void => {
      this.animationId = requestAnimationFrame(animate);
      const now = performance.now();

      if (this.effectCount > 0) {
        this.idleSpinStopped = true;
        const elapsed = now - this.effectStartTime;
        const effectDone = elapsed > STAGGER_MAX_MS + FLY_DURATION_MS;
        if (effectDone) {
          this.effectCount = 0;
          for (const inst of this.instancedMeshes) inst.count = 0;
        } else {
          this.planeMesh.visible = false;
          for (let i = 0; i < this.effectCount; i++) {
            const delayedElapsed = Math.max(0, elapsed - this.startDelays[i]);
            const t = Math.min(1, delayedElapsed / FLY_DURATION_MS);
            const eased = 1 - (1 - t) * (1 - t);
            const scale = t <= 0 ? 0 : PLANE_SCALE * (1 - eased);
            this.dummy.position.lerpVectors(this.startPositions[i], this.targetWorld, eased);
            this.dummy.lookAt(this.targetWorld);
            this.dummy.scale.setScalar(scale);
            this.dummy.updateMatrix();
            for (const inst of this.instancedMeshes) {
              inst.setMatrixAt(i, this.dummy.matrix);
            }
          }
          for (const inst of this.instancedMeshes) {
            inst.instanceMatrix.needsUpdate = true;
            inst.count = this.effectCount;
          }
        }
      } else {
        this.planeMesh.visible = !this.hideIdleBecauseZeroVisitor && !this.idleSpinStopped;
        if (!this.idleSpinStopped) {
          this.planeMesh.rotation.y += 0.008;
        }
        for (const inst of this.instancedMeshes) {
          inst.count = 0;
        }
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

  /**
   * Start fly-in effect: planes fly from a ring toward the province position (in screen space).
   */
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
    this.planeMesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) obj.geometry.dispose();
      if (obj instanceof THREE.Mesh && obj.material) {
        const m = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((mat) => mat.dispose());
        else m.dispose();
      }
    });
    for (const inst of this.instancedMeshes) {
      inst.geometry.dispose();
      (inst.material as THREE.Material).dispose();
    }
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
