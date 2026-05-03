export class SceneRouter {
    constructor(stage) {
        this.stage = stage;
        this.scenes = new Map();
        this.activeSceneId = null;
    }

    register(id, scene) {
        this.scenes.set(id, scene);
    }

    setActive(id) {
        if (id === this.activeSceneId) {
            return;
        }

        const nextScene = this.scenes.get(id);
        if (!nextScene) {
            return;
        }

        if (this.activeSceneId && this.scenes.has(this.activeSceneId)) {
            const oldScene = this.scenes.get(this.activeSceneId);
            oldScene.hide();
            this.stage.removeChild(oldScene.container);
        }

        this.activeSceneId = id;
        this.stage.addChild(nextScene.container);
        nextScene.show();
    }

    render(viewModel) {
        let targetScene = viewModel?.scene || "match";
        if (!this.scenes.has(targetScene)) {
            targetScene = this.scenes.has("welcome") ? "welcome" : "match";
        }
        this.setActive(targetScene);
        const scene = this.scenes.get(targetScene);
        if (scene) {
            scene.render(viewModel);
        }
    }

    resize(width, height) {
        for (const scene of this.scenes.values()) {
            scene.resize(width, height);
        }
    }
}
