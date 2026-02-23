/**
 * Renders the same plane.glb used in PlaneScene into a small canvas for the map legend.
 * Provides a small 3D plane thumbnail in place of a static image.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const THUMB_SIZE = 36;
const TARGET_PLANE_SIZE = 2.9;

/**
 * Mount a small 3D plane (plane.glb) into the given container. Returns a dispose function.
 */
export function mountPlaneLegendThumbnail(container: HTMLElement): Promise<() => void> {
  const width = THUMB_SIZE;
  const height = THUMB_SIZE;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10);
  camera.position.set(0, 3, 0);
  camera.lookAt(0, 0, 0);
  camera.up.set(0, 0, 1);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(0.5, 2, 0.5);
  scene.add(dir);

  const placeholder = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.05, 0.1),
    new THREE.MeshNormalMaterial()
  );
  scene.add(placeholder);

  function dispose(): void {
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (obj.material) {
          const m = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((mat) => mat.dispose());
          else m.dispose();
        }
      }
    });
  }

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
      if (meshes.length === 0) return;

      const geometries: THREE.BufferGeometry[] = [];
      for (const mesh of meshes) {
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        geometries.push(geo);
      }

      const merged = mergeGeometries(geometries);
      const bbox = merged
        ? (merged.computeBoundingBox(), merged.boundingBox!)
        : (geometries[0].computeBoundingBox(), geometries[0].boundingBox!);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = TARGET_PLANE_SIZE / maxDim;

      for (const geo of geometries) geo.scale(scale, scale, scale);
      if (merged) merged.scale(scale, scale, scale);
      const combinedBbox = merged
        ? (merged.computeBoundingBox(), merged.boundingBox!)
        : (geometries[0].boundingBox!);
      const center = new THREE.Vector3();
      combinedBbox.getCenter(center);
      if (merged) merged.dispose();

      scene.remove(placeholder);
      placeholder.geometry.dispose();
      (placeholder.material as THREE.Material).dispose();

      const group = new THREE.Group();
      for (let i = 0; i < meshes.length; i++) {
        const geo = geometries[i];
        geo.translate(-center.x, -center.y, -center.z);
        geo.computeVertexNormals();
        const mat = meshes[i].material;
        const material = Array.isArray(mat)
          ? (mat[0] as THREE.Material).clone()
          : (mat as THREE.Material).clone();
        group.add(new THREE.Mesh(geo, material));
      }
      group.rotation.y = -Math.PI / 4; /* -45° */

      scene.add(group);
      renderer.render(scene, camera);
    },
    undefined,
    () => { /* keep placeholder on error */ }
  );

  return Promise.resolve(dispose);
}
