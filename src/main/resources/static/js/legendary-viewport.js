import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

(function () {
    'use strict';

    const loader = new FBXLoader();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const viewports = [];

    const MODEL_TUNING = {
        fire:  { scale: 2.18, offset: [-0.02, 0.76, 0], rotation: [Math.PI / 2, Math.PI, 0], ring: 0xff6a1a },
        ice:   { scale: 1.95, offset: [0, 1.08, 0], rotation: [Math.PI / 2, Math.PI, 0], ring: 0x5ee7ff },
        wind:  { scale: 1.95, offset: [0, 1.08, 0], rotation: [Math.PI / 2, Math.PI, 0], ring: 0x6ee7b7 },
        earth: { scale: 2.18, offset: [0, 0.74, 0], rotation: [Math.PI / 2, Math.PI, Math.PI], ring: 0xb9855d },
    };

    class LegendaryViewport {
        constructor(card) {
            this.card = card;
            this.element = card.dataset.element || 'fire';
            this.path = card.dataset.model || '';
            this.viewport = card.querySelector('[data-model-viewport]');
            this.canvas = this.viewport?.querySelector('canvas');
            this.loading = this.viewport?.querySelector('.legendary-loading');
            this.clock = new THREE.Clock();
            this.yaw = 0;
            this.targetYaw = 0;
            this.model = null;
            this.mixer = null;
            this.ready = false;
            this.tuning = MODEL_TUNING[this.element] || MODEL_TUNING.fire;
        }

        init() {
            if (!this.canvas || !this.viewport || !this.path) return false;

            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
            this.camera.position.set(0, 1.1, 5.2);

            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
            });
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.18;

            this.scene.add(new THREE.HemisphereLight(0xffe4c4, 0x1a2442, 2.2));

            const key = new THREE.DirectionalLight(0xfff0d8, 3.2);
            key.position.set(3, 4, 4);
            this.scene.add(key);

            const rim = new THREE.DirectionalLight(0x7ee7ff, 2.1);
            rim.position.set(-3, 2.2, -2.5);
            this.scene.add(rim);

            this.stage = new THREE.Group();
            this.scene.add(this.stage);

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(1.4, 0.018, 12, 120),
                new THREE.MeshBasicMaterial({ color: this.tuning.ring, transparent: true, opacity: 0.5 })
            );
            ring.name = 'element-ring';
            ring.rotation.x = Math.PI / 2;
            ring.position.y = -1.06;
            this.stage.add(ring);

            this.resize();
            this.load();
            this.animate();
            this.ready = true;
            return true;
        }

        resize() {
            if (!this.renderer || !this.viewport) return;
            const rect = this.viewport.getBoundingClientRect();
            const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(size, size, false);
            this.camera.aspect = 1;
            this.camera.updateProjectionMatrix();
        }

        setLoading(visible) {
            this.loading?.classList.toggle('visible', Boolean(visible));
        }

        load() {
            this.viewport.classList.remove('model-ready');
            this.setLoading(true);
            loader.load(
                this.path,
                (object) => {
                    this.frameModel(object);
                    this.stage.add(object);
                    this.model = object;
                    this.mixer = object.animations?.length ? new THREE.AnimationMixer(object) : null;
                    if (this.mixer) object.animations.forEach((clip) => this.mixer.clipAction(clip).play());
                    this.ready = true;
                    syncVisibleViewport();
                    this.setLoading(false);
                },
                undefined,
                () => {
                    this.viewport.classList.remove('model-ready');
                    this.setLoading(false);
                }
            );
        }

        frameModel(object) {
            object.updateMatrixWorld(true);
            const box = getMeshBounds(object);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxAxis = Math.max(size.x, size.y, size.z) || 1;
            const scale = this.tuning.scale / maxAxis;

            object.scale.setScalar(scale);
            object.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
            object.rotation.set(...this.tuning.rotation);
            object.updateMatrixWorld(true);

            const finalBox = getMeshBounds(object);
            const finalCenter = finalBox.getCenter(new THREE.Vector3());
            object.position.x += this.tuning.offset[0] - finalCenter.x;
            object.position.y += this.tuning.offset[1] - finalCenter.y;
            object.position.z += this.tuning.offset[2] - finalCenter.z;

            object.traverse((node) => {
                if (!node.isMesh) return;
                node.frustumCulled = false;
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.forEach((material) => {
                    material.side = THREE.DoubleSide;
                    material.needsUpdate = true;
                });
            });
        }

        animate() {
            requestAnimationFrame(() => this.animate());
            if (!this.renderer) return;
            const dt = Math.min(this.clock.getDelta(), 0.04);
            this.mixer?.update(dt);
            if (!reducedMotion) {
                this.targetYaw += dt * 0.28;
                const ring = this.stage.getObjectByName('element-ring');
                if (ring) ring.rotation.z += dt * 0.55;
                this.stage.position.y = Math.sin(this.clock.elapsedTime * 1.35) * 0.03;
            }
            this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 5);
            this.stage.rotation.y = this.yaw;
            this.renderer.render(this.scene, this.camera);
        }

        spin() {
            this.targetYaw += Math.PI * 2;
        }

        show(isVisible) {
            this.viewport?.classList.toggle('model-ready', Boolean(isVisible && this.ready));
        }
    }

    function getMeshBounds(root) {
        const bounds = new THREE.Box3();
        let hasMesh = false;
        root.traverse((node) => {
            if (!node.isMesh) return;
            node.updateWorldMatrix(true, false);
            bounds.union(new THREE.Box3().setFromObject(node));
            hasMesh = true;
        });
        return hasMesh ? bounds : new THREE.Box3().setFromObject(root);
    }

    function bindCards() {
        const cards = [...document.querySelectorAll('.creature-card')];
        if (!cards.length) return false;

        cards.forEach((card) => {
            if (card.dataset.legendaryBound === 'true') return;
            card.dataset.legendaryBound = 'true';
            card.addEventListener('click', () => {
                cards.forEach((item) => {
                    const selected = item === card;
                    item.classList.toggle('is-selected', selected);
                    item.setAttribute('aria-pressed', String(selected));
                });
                syncVisibleViewport(card);
                viewports.find((item) => item.card === card)?.spin();
            });
        });

        // The idle state is a clean elemental notch. A full model or portrait
        // is revealed only after the player explicitly selects a legendary.
        cards.forEach((item) => {
            item.classList.remove('is-selected');
            item.setAttribute('aria-pressed', 'false');
        });
        syncVisibleViewport(null);
        return true;
    }

    function syncVisibleViewport(selectedCard = document.querySelector('.creature-card.is-selected')) {
        viewports.forEach((viewport) => viewport.show(viewport.card === selectedCard));
    }

    function init() {
        const cards = [...document.querySelectorAll('.creature-card[data-model]:not([data-model=""])')];
        cards.forEach((card) => {
            if (card.dataset.viewportInit === 'true') return;
            card.dataset.viewportInit = 'true';
            const viewport = new LegendaryViewport(card);
            if (viewport.init()) viewports.push(viewport);
        });
        bindCards();
    }

    window.addEventListener('resize', () => viewports.forEach((viewport) => viewport.resize()));
    document.addEventListener('sieglings:legendary-grid-rendered', init);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.setTimeout(init, 0), { once: true });
    } else {
        window.setTimeout(init, 0);
    }
})();
