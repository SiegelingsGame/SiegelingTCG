export class OverlayScene {
    constructor(PIXI, options = {}) {
        this.PIXI = PIXI;
        this.options = options;
        this.container = new PIXI.Container();
        this.bg = new PIXI.Graphics();
        this.container.addChild(this.bg);
        this.card = new PIXI.Graphics();
        this.container.addChild(this.card);
        this.titleText = new PIXI.Text({
            text: "",
            style: { fill: 0xf5f7ff, fontSize: 38, fontWeight: "700", align: "center" }
        });
        this.titleText.anchor.set(0.5, 0);
        this.container.addChild(this.titleText);
        this.bodyText = new PIXI.Text({
            text: "",
            style: { fill: 0xb4c5e5, fontSize: 20, align: "center", wordWrap: true, wordWrapWidth: 820 }
        });
        this.bodyText.anchor.set(0.5, 0);
        this.container.addChild(this.bodyText);
        this.buttons = [];
        this._lastRenderSig = null;
    }

    show() {
        this.container.visible = true;
    }

    hide() {
        this.container.visible = false;
    }

    resize(width, height) {
        this.size = { width, height };
    }

    clearButtons() {
        for (const button of this.buttons) {
            this.container.removeChild(button.container);
            button.container.destroy({ children: true });
        }
        this.buttons = [];
    }

    createButton(label, x, y, onClick, variant = "primary") {
        const button = new this.PIXI.Container();
        const bg = new this.PIXI.Graphics();
        const color = variant === "primary" ? 0x3f71ff : 0x2a3755;
        bg.roundRect(-120, -24, 240, 48, 12).fill(color);
        bg.roundRect(-120, -24, 240, 48, 12).stroke({ color: 0x7d95d6, width: 2 });
        button.addChild(bg);

        const txt = new this.PIXI.Text({
            text: label,
            style: { fill: 0xf8fbff, fontSize: 20, fontWeight: "700" }
        });
        txt.anchor.set(0.5);
        button.addChild(txt);

        button.position.set(x, y);
        button.eventMode = "static";
        button.cursor = "pointer";
        button.on("pointertap", onClick);
        this.container.addChild(button);
        this.buttons.push({ container: button });
    }

    render(viewModel) {
        const width = this.size?.width || 1280;
        const height = this.size?.height || 720;
        const title = this.options.title(viewModel);
        const body = this.options.body(viewModel);
        const buttons = this.options.buttons(viewModel) || [];
        const btnSig = buttons.map((b) => `${b.label}\0${b.variant || "primary"}`).join("\x1f");
        const sig = `${width}\0${height}\0${title}\0${body}\0${btnSig}`;
        if (sig === this._lastRenderSig) {
            return;
        }
        this._lastRenderSig = sig;

        this.bg.clear();
        this.bg.rect(0, 0, width, height).fill(0x121828);
        this.card.clear();
        this.card.roundRect((width / 2) - 470, (height / 2) - 220, 940, 440, 18).fill(0x1a2540);
        this.card.roundRect((width / 2) - 470, (height / 2) - 220, 940, 440, 18).stroke({ color: 0x6078ab, width: 2 });

        this.titleText.text = title;
        this.titleText.position.set(width / 2, (height / 2) - 165);
        this.bodyText.text = body;
        this.bodyText.position.set(width / 2, (height / 2) - 90);

        this.clearButtons();
        const rowY = (height / 2) + 145;
        const rowStartX = (width / 2) - (((buttons.length - 1) * 280) / 2);
        buttons.forEach((button, idx) => {
            this.createButton(
                button.label,
                rowStartX + (idx * 280),
                rowY,
                button.onClick,
                button.variant || "primary"
            );
        });
    }
}
