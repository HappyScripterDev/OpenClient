package app.openclient.mixin;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(TitleScreen.class)
public abstract class TitleScreenMixin {
    private static final Identifier OPENCLIENT_LOGO =
            Identifier.of("openclient", "textures/gui/logo.png");

    @Inject(method = "render", at = @At("TAIL"))
    private void openclient$branding(DrawContext context, int mouseX, int mouseY, float delta, CallbackInfo info) {
        MinecraftClient client = MinecraftClient.getInstance();
        int width = client.getWindow().getScaledWidth();
        int height = client.getWindow().getScaledHeight();
        int x = width / 2 - 74;
        int y = height - 46;
        context.drawTexture(OPENCLIENT_LOGO, x, y, 0, 0, 24, 24, 24, 24);
        context.drawText(client.textRenderer, Text.literal("OpenClient"), x + 30, y + 8, 0xFFF4F4F7, true);
    }
}
