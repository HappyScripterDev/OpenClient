package app.openclient;

import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

public final class HudEditorScreen extends Screen {
    private static final String[] KEYS = {"fps", "cps", "ping", "coordinates", "keystrokes", "armor", "clock", "memory"};
    private HudConfig config;
    private String dragging;
    private double dragOffsetX;
    private double dragOffsetY;

    public HudEditorScreen(Screen parent) {
        super(Text.literal("OpenClient HUD Editor"));
        this.config = OpenClientMod.config();
    }

    @Override
    protected void init() {
        addDrawableChild(ButtonWidget.builder(Text.literal("Save and close"), button -> {
            config.save();
            OpenClientMod.setConfig(config);
            close();
        }).dimensions(width / 2 - 165, height - 34, 160, 20).build());
        addDrawableChild(ButtonWidget.builder(Text.literal("Reset layout"), button -> {
            config = HudConfig.defaults();
        }).dimensions(width / 2 + 5, height - 34, 160, 20).build());
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        context.fill(0, 0, width, height, 0xCC07070A);
        for (int x = 0; x < width; x += 40) {
            context.fill(x, 0, x + 1, height, 0x14FFFFFF);
        }
        for (int y = 0; y < height; y += 40) {
            context.fill(0, y, width, y + 1, 0x14FFFFFF);
        }
        context.drawCenteredTextWithShadow(textRenderer, title, width / 2, 18, 0xFFF4F4F7);
        context.drawCenteredTextWithShadow(
                textRenderer,
                Text.literal("Drag an element to move it. Positions are saved as percentages."),
                width / 2,
                34,
                0xB8F4F4F7
        );
        for (String key : KEYS) {
            HudConfig.Element element = config.elements.get(key);
            if (element == null) continue;
            int x = (int) Math.round(width * element.x / 100.0);
            int y = (int) Math.round(height * element.y / 100.0);
            int rectWidth = sizeFor(key)[0];
            int rectHeight = sizeFor(key)[1];
            int color = element.enabled ? 0x33FF4D4D : 0x22FFFFFF;
            context.fill(x - 3, y - 2, x + rectWidth, y + rectHeight, color);
            context.drawText(
                    textRenderer,
                    Text.literal((element.enabled ? "" : "(off) ") + key),
                    x,
                    y,
                    element.enabled ? 0xFFFFD7D7 : 0x88FFFFFF,
                    true
            );
        }
        super.render(context, mouseX, mouseY, delta);
        context.drawCenteredTextWithShadow(
                textRenderer,
                Text.literal("Right Shift opens this editor in game"),
                width / 2,
                height - 50,
                0x88FFFFFF
        );
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (super.mouseClicked(mouseX, mouseY, button)) return true;
        if (button != 0) return false;
        for (int index = KEYS.length - 1; index >= 0; index--) {
            String key = KEYS[index];
            HudConfig.Element element = config.elements.get(key);
            if (element == null) continue;
            int x = (int) Math.round(width * element.x / 100.0);
            int y = (int) Math.round(height * element.y / 100.0);
            int[] size = sizeFor(key);
            if (mouseX >= x - 3 && mouseX <= x + size[0] && mouseY >= y - 2 && mouseY <= y + size[1]) {
                dragging = key;
                dragOffsetX = mouseX - x;
                dragOffsetY = mouseY - y;
                return true;
            }
        }
        return false;
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double deltaX, double deltaY) {
        if (dragging != null) {
            HudConfig.Element element = config.elements.get(dragging);
            if (element != null) {
                element.x = clamp((mouseX - dragOffsetX) / Math.max(1, width) * 100.0);
                element.y = clamp((mouseY - dragOffsetY) / Math.max(1, height) * 100.0);
            }
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, deltaX, deltaY);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        dragging = null;
        return super.mouseReleased(mouseX, mouseY, button);
    }

    @Override
    public void close() {
        config.save();
        OpenClientMod.setConfig(config);
        super.close();
    }

    private int[] sizeFor(String key) {
        if ("keystrokes".equals(key)) return new int[]{56, 64};
        if ("armor".equals(key)) return new int[]{118, 22};
        if ("coordinates".equals(key)) return new int[]{120, 14};
        return new int[]{88, 14};
    }

    private static double clamp(double value) {
        return Math.max(0, Math.min(100, value));
    }
}
