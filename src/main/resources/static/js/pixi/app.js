// Browser bundle: lib/index.mjs pulls bare "eventemitter3"/"earcut" (needs import map otherwise).
import * as PIXI from "https://cdn.jsdelivr.net/npm/pixi.js@8.5.2/dist/pixi.mjs";
import { SceneRouter } from "./SceneRouter.js";
import { MatchScene } from "./scenes/MatchScene.js";
import { OverlayScene } from "./scenes/OverlayScene.js";

function getBridge() {
    return window.__SIEGLINGS_PIXI_BRIDGE || null;
}

function createOverlayScenes(bridge) {
    return {
        welcome: new OverlayScene(PIXI, {
            title: () => "Sieglings TCG",
            body: () => "Welcome. Build links, wake sockets, and fight with momentum.",
            buttons: () => ([
                { label: "Play as Guest", onClick: () => bridge.actions.playAsGuest(), variant: "primary" }
            ])
        }),
        loadout: new OverlayScene(PIXI, {
            title: () => "Choose Your Loadout",
            body: (vm) => vm.loadoutSummary || "Pick a deck and SiegeKnight, then start the match.",
            buttons: () => ([
                { label: "Start Match", onClick: () => bridge.actions.startSelectedGame(), variant: "primary" }
            ])
        }),
        mulligan: new OverlayScene(PIXI, {
            title: () => "Opening Hand",
            body: (vm) => vm.mulliganCopy || "Keep your hand or redraw selected cards once.",
            buttons: () => ([
                { label: "Keep", onClick: () => bridge.actions.submitMulliganKeep(), variant: "secondary" },
                { label: "Redraw", onClick: () => bridge.actions.submitMulliganSelected(), variant: "primary" }
            ])
        }),
        gameover: new OverlayScene(PIXI, {
            title: (vm) => vm.gameOverTitle || "Game Over",
            body: (vm) => vm.gameOverMessage || "",
            buttons: () => ([
                { label: "Play Again", onClick: () => bridge.actions.openLoadoutSelector(), variant: "primary" }
            ])
        })
    };
}

async function boot() {
    const bridge = getBridge();
    if (!bridge) {
        return;
    }

    const mount = document.getElementById("pixiRoot");
    if (!mount) {
        return;
    }

    const app = new PIXI.Application();
    await app.init({
        resizeTo: window,
        background: "#131a2a",
        antialias: true,
        autoDensity: true,
        sharedTicker: true
    });
    mount.appendChild(app.canvas);

    const router = new SceneRouter(app.stage);
    router.register("match", new MatchScene(PIXI, bridge));
    const overlays = createOverlayScenes(bridge);
    router.register("welcome", overlays.welcome);
    router.register("loadout", overlays.loadout);
    router.register("mulligan", overlays.mulligan);
    router.register("gameover", overlays.gameover);

    const renderDriver = {
        render(viewModel) {
            router.render(viewModel);
        },
        resize(width, height) {
            router.resize(width, height);
        }
    };

    bridge.attachDriver(renderDriver);
    renderDriver.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", () => renderDriver.resize(window.innerWidth, window.innerHeight));

    Object.assign(app.canvas.style, {
        display: "block",
        width: "100%",
        height: "100%"
    });

    const updateSceneGraph = () => {
        if (!bridge.isPixiEnabled()) {
            return;
        }
        try {
            renderDriver.render(bridge.getViewModel());
        } catch (err) {
            console.error("Pixi render error:", err);
        }
    };

    if (app.ticker?.add) {
        app.ticker.add(updateSceneGraph, undefined, PIXI.UPDATE_PRIORITY.HIGH);
    } else {
        const ticker = PIXI.Ticker?.shared;
        if (ticker?.add) {
            ticker.add(() => {
                updateSceneGraph();
                app.render();
            });
        } else {
            const loop = () => {
                requestAnimationFrame(loop);
                updateSceneGraph();
                app.render();
            };
            requestAnimationFrame(loop);
        }
    }
}

boot().catch((error) => {
    console.error("Pixi renderer failed to initialize.", error);
});
