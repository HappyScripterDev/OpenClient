package app.openclient;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.PlayerListEntry;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.item.ItemStack;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;

public final class HudRenderer implements HudRenderCallback {
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm");
    private static final int WHITE = 0xFFF4F4F7;
    private static final int MUTED = 0xB8F4F4F7;
    private static final int SHADOW = 0x80000000;

    @Override
    public void onHudRender(DrawContext context, RenderTickCounter tickCounter) {
        MinecraftClient client = MinecraftClient.getInstance();
        HudConfig config = OpenClientMod.config();
        if (!config.enabled || client.player == null || client.options.hudHidden) return;
        int width = client.getWindow().getScaledWidth();
        int height = client.getWindow().getScaledHeight();
        int accent = accentColor(config.accent);
        if (enabled(config, "fps")) {
            int fps = client.getCurrentFps();
            int color = fps >= 120 ? 0xFF57D38C : fps >= 60 ? 0xFFF2B96B : 0xFFFF5C6C;
            drawStat(context, config, "fps", width, height, String.valueOf(fps), " FPS", color);
        }
        if (enabled(config, "cps")) {
            drawStat(context, config, "cps", width, height,
                    OpenClientMod.leftCps() + " | " + OpenClientMod.rightCps(), " CPS", accent);
        }
        if (enabled(config, "ping")) {
            int ping = ping(client);
            drawStat(context, config, "ping", width, height, ping + " ms",
                    ping < 80 ? " low" : ping < 180 ? " ok" : " high", accent);
        }
        if (enabled(config, "coordinates")) {
            BlockPos pos = client.player.getBlockPos();
            Direction facing = client.player.getHorizontalFacing();
            drawStat(context, config, "coordinates", width, height,
                    pos.getX() + " " + pos.getY() + " " + pos.getZ(),
                    " " + dimension(client) + " " + facing.getName(), accent);
        }
        if (enabled(config, "clock")) {
            long time = client.world != null ? client.world.getTimeOfDay() % 24000L : 0L;
            int hours = (int) ((time / 1000L + 6L) % 24L);
            int minutes = (int) ((time % 1000L) * 60L / 1000L);
            drawStat(context, config, "clock", width, height,
                    LocalTime.now().format(CLOCK),
                    String.format(" Day %d %02d:%02d", client.world != null ? client.world.getTimeOfDay() / 24000L : 0, hours, minutes),
                    accent);
        }
        if (enabled(config, "memory")) {
            long total = Runtime.getRuntime().totalMemory();
            long free = Runtime.getRuntime().freeMemory();
            long usedMb = (total - free) / (1024L * 1024L);
            long totalMb = total / (1024L * 1024L);
            drawStat(context, config, "memory", width, height,
                    usedMb + " / " + totalMb + " MB", " heap", accent);
        }
        if (enabled(config, "keystrokes")) {
            drawKeystrokes(client, context, config, width, height, accent);
        }
        if (enabled(config, "armor")) {
            drawArmor(client, context, config, width, height);
        }
    }

    private boolean enabled(HudConfig config, String key) {
        HudConfig.Element element = config.elements.get(key);
        return element != null && element.enabled;
    }

    private void drawStat(
            DrawContext context,
            HudConfig config,
            String key,
            int width,
            int height,
            String value,
            String sub,
            int accent
    ) {
        HudConfig.Element element = config.elements.get(key);
        if (element == null) return;
        int x = (int) Math.round(width * element.x / 100.0);
        int y = (int) Math.round(height * element.y / 100.0);
        String text = value + sub;
        int textWidth = MinecraftClient.getInstance().textRenderer.getWidth(text);
        context.getMatrices().push();
        context.getMatrices().translate(x, y, 0);
        context.getMatrices().scale((float) config.scale, (float) config.scale, 1.0f);
        if (config.background) {
            context.fill(-3, -2, textWidth + 6, 12, 0x6608080B);
            context.fill(-3, -2, -2, 12, accent);
        }
        context.drawText(MinecraftClient.getInstance().textRenderer, value, 0, 0, WHITE, true);
        context.drawText(
                MinecraftClient.getInstance().textRenderer,
                sub,
                MinecraftClient.getInstance().textRenderer.getWidth(value),
                0,
                accent,
                true
        );
        context.getMatrices().pop();
    }

    private void drawKeystrokes(
            MinecraftClient client,
            DrawContext context,
            HudConfig config,
            int width,
            int height,
            int accent
    ) {
        HudConfig.Element element = config.elements.get("keystrokes");
        if (element == null) return;
        int x = (int) Math.round(width * element.x / 100.0);
        int y = (int) Math.round(height * element.y / 100.0);
        context.getMatrices().push();
        context.getMatrices().translate(x, y, 0);
        context.getMatrices().scale((float) config.scale, (float) config.scale, 1.0f);
        int size = 14;
        int gap = 2;
        if (config.background) {
            context.fill(-4, -4, 3 * size + 2 * gap + 8, 4 * size + 3 * gap + 8, 0x5508080B);
        }
        key(context, client, config, x0(1), 0, "W", client.options.forwardKey.isPressed(), accent);
        key(context, client, config, 0, size + gap, "A", client.options.leftKey.isPressed(), accent);
        key(context, client, config, size + gap, size + gap, "S", client.options.backKey.isPressed(), accent);
        key(context, client, config, 2 * (size + gap), size + gap, "D", client.options.rightKey.isPressed(), accent);
        wideKey(context, client, config, 0, 2 * (size + gap), 3 * size + 2 * gap, "SPACE", client.options.jumpKey.isPressed(), accent);
        wideKey(context, client, config, 0, 3 * (size + gap), size * 2, "SHIFT", client.options.sneakKey.isPressed(), accent);
        wideKey(context, client, config, size * 2 + gap, 3 * (size + gap), size, "SPR", client.player != null && client.player.isSprinting(), accent);
        context.getMatrices().pop();
    }

    private int x0(int index) {
        return index * 16;
    }

    private void key(DrawContext context, MinecraftClient client, HudConfig config, int x, int y, String label, boolean pressed, int accent) {
        context.fill(x, y, x + 14, y + 14, pressed ? withAlpha(accent, 0xAA) : 0x6608080B);
        context.drawText(client.textRenderer, label, x + 7 - client.textRenderer.getWidth(label) / 2, y + 3, pressed ? 0xFF08080B : WHITE, true);
    }

    private void wideKey(DrawContext context, MinecraftClient client, HudConfig config, int x, int y, int width, String label, boolean pressed, int accent) {
        context.fill(x, y, x + width, y + 14, pressed ? withAlpha(accent, 0xAA) : 0x6608080B);
        context.drawText(
                client.textRenderer,
                label,
                x + width / 2 - client.textRenderer.getWidth(label) / 2,
                y + 3,
                pressed ? 0xFF08080B : WHITE,
                true
        );
    }

    private void drawArmor(MinecraftClient client, DrawContext context, HudConfig config, int width, int height) {
        HudConfig.Element element = config.elements.get("armor");
        if (element == null) return;
        int x = (int) Math.round(width * element.x / 100.0);
        int y = (int) Math.round(height * element.y / 100.0);
        context.getMatrices().push();
        context.getMatrices().translate(x, y, 0);
        context.getMatrices().scale((float) config.scale, (float) config.scale, 1.0f);
        List<ItemStack> armor = client.player.getInventory().armor;
        int count = 0;
        if (config.background) {
            context.fill(-4, -4, 6 * 20 + 4, 24, 0x5508080B);
        }
        for (ItemStack stack : armor) {
            if (!stack.isEmpty()) drawSlot(context, stack, count * 20, 0);
            count++;
        }
        drawSlot(context, client.player.getOffHandStack(), 4 * 20, 0);
        drawSlot(context, client.player.getMainHandStack(), 5 * 20, 0);
        context.getMatrices().pop();
    }

    private void drawSlot(DrawContext context, ItemStack stack, int x, int y) {
        if (stack.isEmpty()) return;
        context.fill(x, y, x + 18, y + 18, 0x6608080B);
        context.drawItem(stack, x + 1, y + 1);
        if (stack.isDamageable()) {
            int max = stack.getMaxDamage();
            int damage = stack.getDamage();
            float ratio = max <= 0 ? 0f : (float) (max - damage) / (float) max;
            int barWidth = Math.round(16 * ratio);
            int color = ratio > 0.5f ? 0xFF57D38C : ratio > 0.2f ? 0xFFF2B96B : 0xFFFF5C6C;
            context.fill(x + 1, y + 16, x + 17, y + 17, 0xAA000000);
            context.fill(x + 1, y + 16, x + 1 + barWidth, y + 17, color);
        }
    }

    private int ping(MinecraftClient client) {
        if (client.getNetworkHandler() == null || client.player == null) return 0;
        PlayerListEntry entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
        return entry == null ? 0 : entry.getLatency();
    }

    private String dimension(MinecraftClient client) {
        if (client.world == null) return "unknown";
        return client.world.getRegistryKey().getValue().getPath();
    }

    private int accentColor(String hex) {
        try {
            return 0xFF000000 | Integer.parseInt(hex.substring(1), 16);
        } catch (RuntimeException exception) {
            return 0xFFFF4D4D;
        }
    }

    private int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | (alpha << 24);
    }
}
