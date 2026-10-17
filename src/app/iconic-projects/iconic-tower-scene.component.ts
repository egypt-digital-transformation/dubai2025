import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowBackOutline,
  arrowForwardOutline,
  refreshOutline,
  removeOutline,
} from 'ionicons/icons';
import * as THREE from 'three';
import { IconicProject } from './models/project.model';

@Component({
  selector: 'app-iconic-tower-scene',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon],
  templateUrl: './iconic-tower-scene.component.html',
  styleUrls: ['./iconic-tower-scene.component.scss'],
})
export class IconicTowerSceneComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) project!: IconicProject;
  @Output() openDetails = new EventEmitter<IconicProject>();
  @ViewChild('sceneCanvas', { static: true })
  private canvasRef!: ElementRef<HTMLCanvasElement>;

  renderError = false;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private modelGroup?: THREE.Group;
  private resizeObserver?: ResizeObserver;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor() {
    addIcons({
      addOutline,
      arrowBackOutline,
      arrowForwardOutline,
      refreshOutline,
      removeOutline,
    });
  }

  ngAfterViewInit(): void {
    this.initializeScene();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.scene?.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) {
        return;
      }

      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }

  onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.canvasRef.nativeElement.setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging || !this.modelGroup) {
      return;
    }

    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.modelGroup.rotation.y += deltaX * 0.008;
    this.modelGroup.rotation.x = THREE.MathUtils.clamp(
      this.modelGroup.rotation.x + deltaY * 0.004,
      -0.18,
      0.18
    );
    this.render();
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  rotate(direction: number): void {
    if (!this.modelGroup) {
      return;
    }

    this.modelGroup.rotation.y += direction * 0.35;
    this.render();
  }

  zoom(direction: number): void {
    if (!this.camera) {
      return;
    }

    this.camera.position.z = THREE.MathUtils.clamp(
      this.camera.position.z - direction * 1.5,
      9,
      20
    );
    this.render();
  }

  resetView(): void {
    if (!this.modelGroup || !this.camera) {
      return;
    }

    this.modelGroup.rotation.set(0, -0.35, 0);
    this.camera.position.set(0, 4.3, 14);
    this.camera.lookAt(0, 4.4, 0);
    this.render();
  }

  private initializeScene(): void {
    const canvas = this.canvasRef.nativeElement;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
      });
    } catch (error) {
      console.error('[IconicTowerScene] WebGL initialization failed:', error);
      this.renderError = true;
      return;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 4.3, 14);
    this.camera.lookAt(0, 4.4, 0);

    this.scene.add(new THREE.HemisphereLight(0xc8e8ff, 0x263b50, 2.1));

    const keyLight = new THREE.DirectionalLight(0xffe0b2, 3.2);
    keyLight.position.set(-5, 10, 7);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x50c8ff, 2.2);
    rimLight.position.set(6, 5, -5);
    this.scene.add(rimLight);

    this.modelGroup = new THREE.Group();
    this.modelGroup.rotation.y = -0.35;
    this.scene.add(this.modelGroup);

    this.addTower();
    this.addPodium();
    this.addContextBuildings();
    this.addGround();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.render();
  }

  private addTower(): void {
    if (!this.modelGroup) {
      return;
    }

    const towerHeight = 9.1;
    const lowerRadius = 1.24;
    const upperRadius = 0.45;
    const centerY = towerHeight / 2;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(upperRadius, lowerRadius, towerHeight, 48, 32, true),
      new THREE.MeshStandardMaterial({
        color: 0x8fcbe2,
        metalness: 0.76,
        roughness: 0.23,
        side: THREE.DoubleSide,
      })
    );
    body.position.y = centerY;
    this.modelGroup.add(body);

    const facadeMaterial = new THREE.LineBasicMaterial({
      color: 0xd3f4ff,
      transparent: true,
      opacity: 0.62,
    });
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: 0xc8efff,
      transparent: true,
      opacity: 0.55,
    });

    for (let index = 0; index < 36; index += 1) {
      const angle = (index / 36) * Math.PI * 2;
      const points: THREE.Vector3[] = [];
      for (let step = 0; step <= 24; step += 1) {
        const progress = step / 24;
        const radius = THREE.MathUtils.lerp(
          lowerRadius,
          upperRadius,
          progress
        );
        points.push(
          new THREE.Vector3(
            Math.cos(angle) * radius,
            progress * towerHeight,
            Math.sin(angle) * radius
          )
        );
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        facadeMaterial
      );
      this.modelGroup.add(line);
    }

    for (let floor = 1; floor < 30; floor += 1) {
      const progress = floor / 30;
      const radius = THREE.MathUtils.lerp(
        lowerRadius,
        upperRadius,
        progress
      );
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.012, 4, 48),
        floorMaterial
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = progress * towerHeight;
      this.modelGroup.add(ring);
    }

    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, upperRadius, 0.62, 32),
      new THREE.MeshStandardMaterial({
        color: 0x8fcbe2,
        metalness: 0.74,
        roughness: 0.25,
      })
    );
    crown.position.y = towerHeight + 0.28;
    this.modelGroup.add(crown);

    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.08, 0.8, 12),
      new THREE.MeshStandardMaterial({
        color: 0xd7eaf2,
        metalness: 0.8,
        roughness: 0.2,
      })
    );
    spire.position.y = towerHeight + 0.95;
    this.modelGroup.add(spire);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.28, 1.45, 0.3, 48),
      new THREE.MeshStandardMaterial({
        color: 0x738995,
        metalness: 0.32,
        roughness: 0.56,
      })
    );
    base.position.y = 0.16;
    this.modelGroup.add(base);
  }

  private addPodium(): void {
    if (!this.modelGroup) {
      return;
    }

    const podiumMaterial = new THREE.MeshStandardMaterial({
      color: 0x687d89,
      metalness: 0.28,
      roughness: 0.62,
    });

    const podiums = [
      { width: 3.3, height: 0.65, depth: 2.7, y: 0.48 },
      { width: 2.8, height: 0.5, depth: 2.3, y: 1.03 },
    ];
    podiums.forEach((podium) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(podium.width, podium.height, podium.depth),
        podiumMaterial
      );
      mesh.position.y = podium.y;
      this.modelGroup?.add(mesh);
    });
  }

  private addContextBuildings(): void {
    if (!this.modelGroup) {
      return;
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x40596b,
      metalness: 0.22,
      roughness: 0.75,
    });
    const buildings = [
      [-3.4, 0.55, -0.9, 1.1, 1.1, 1.4],
      [3.35, 0.8, -1.2, 1.25, 1.6, 1.15],
      [-2.9, 0.42, 1.4, 0.9, 0.84, 1.15],
      [2.9, 0.5, 1.35, 0.95, 1, 1.2],
      [-4.25, 0.72, 0.1, 0.75, 1.44, 1],
      [4.2, 0.62, 0.2, 0.8, 1.24, 0.9],
    ];

    buildings.forEach(([x, y, z, width, height, depth]) => {
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material
      );
      building.position.set(x, y, z);
      this.modelGroup?.add(building);
    });
  }

  private addGround(): void {
    if (!this.scene) {
      return;
    }

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({
        color: 0x142d42,
        metalness: 0.15,
        roughness: 0.92,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);
  }

  private resize(): void {
    const renderer = this.renderer;
    const camera = this.camera;
    const canvas = this.canvasRef.nativeElement;
    if (!renderer || !camera) {
      return;
    }

    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    this.render();
  }

  private render(): void {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
