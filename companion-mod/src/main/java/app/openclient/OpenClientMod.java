package app.openclient;

import java.util.ArrayDeque;
import java.util.Deque;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

public final class OpenClientMod implements ClientModInitializer {
    private static HudConfig config = HudConfig.defaults();
    private static KeyBinding editorKey;
    private static KeyBinding zoomKey;
    private static KeyBinding sprintKey;
    private static boolean sprintToggle;
    private static boolean lastAttack;
    private static boolean lastUse;
    private static final Deque<Long> LEFT_CLICKS = new ArrayDeque<>();
    private static final Deque<Long> RIGHT_CLICKS = new ArrayDeque<>();

    @Override
    public void onInitializeClient() {
        config = HudConfig.load();
        editorKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.openclient.editor",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_RIGHT_SHIFT,
                "category.openclient"
        ));
        zoomKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.openclient.zoom",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_C,
                "category.openclient"
        ));
        sprintKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
                "key.openclient.sprint",
                InputUtil.Type.KEYSYM,
                GLFW.GLFW_KEY_V,
                "category.openclient"
        ));

        HudRenderCallback.EVENT.register(new HudRenderer());

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (editorKey.wasPressed()) {
                client.setScreen(new HudEditorScreen(null));
            }
            while (sprintKey.wasPressed()) {
                sprintToggle = !sprintToggle;
                if (client.player != null) {
                    client.player.sendMessage(
                            Text.literal("Toggle sprint " + (sprintToggle ? "ON" : "OFF")),
                            true
                    );
                }
            }
            trackClicks(client);
            applyToggleSprint(client);
        });
    }

    private static void trackClicks(MinecraftClient client) {
        boolean attack = client.options.attackKey.isPressed();
        boolean use = client.options.useKey.isPressed();
        long now = System.currentTimeMillis();
        if (attack && !lastAttack) LEFT_CLICKS.addLast(now);
        if (use && !lastUse) RIGHT_CLICKS.addLast(now);
        lastAttack = attack;
        lastUse = use;
        trim(LEFT_CLICKS, now);
        trim(RIGHT_CLICKS, now);
    }

    private static void trim(Deque<Long> clicks, long now) {
        while (!clicks.isEmpty() && now - clicks.peekFirst() > 1000L) {
            clicks.removeFirst();
        }
    }

    private static void applyToggleSprint(MinecraftClient client) {
        if (!config.toggleSprint || !sprintToggle || client.player == null) return;
        boolean moving = client.options.forwardKey.isPressed();
        client.player.setSprinting(moving && !client.player.isSneaking() && !client.player.isUsingItem());
    }

    public static HudConfig config() {
        return config;
    }

    public static void setConfig(HudConfig next) {
        config = next;
    }

    public static boolean isZooming() {
        return config.zoom && zoomKey != null && zoomKey.isPressed();
    }

    public static int leftCps() {
        trim(LEFT_CLICKS, System.currentTimeMillis());
        return LEFT_CLICKS.size();
    }

    public static int rightCps() {
        trim(RIGHT_CLICKS, System.currentTimeMillis());
        return RIGHT_CLICKS.size();
    }

    public static KeyBinding editorKey() {
        return editorKey;
    }
}
