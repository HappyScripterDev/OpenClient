package app.openclient;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import net.fabricmc.loader.api.FabricLoader;

public final class HudConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    public int version = 1;
    public boolean enabled = true;
    public boolean background = true;
    public double scale = 1.0;
    public String accent = "#ff4d4d";
    public boolean toggleSprint = true;
    public boolean zoom = true;
    public double zoomDivisor = 4.0;
    public Map<String, Element> elements = new LinkedHashMap<>();

    public static final class Element {
        public boolean enabled;
        public double x;
        public double y;

        public Element() {
        }

        public Element(boolean enabled, double x, double y) {
            this.enabled = enabled;
            this.x = x;
            this.y = y;
        }
    }

    public static HudConfig defaults() {
        HudConfig config = new HudConfig();
        config.elements.put("fps", new Element(true, 1.5, 1.5));
        config.elements.put("cps", new Element(true, 1.5, 7));
        config.elements.put("ping", new Element(true, 1.5, 12.5));
        config.elements.put("coordinates", new Element(true, 1.5, 18));
        config.elements.put("keystrokes", new Element(true, 1.5, 68));
        config.elements.put("armor", new Element(true, 84, 78));
        config.elements.put("clock", new Element(false, 84, 1.5));
        config.elements.put("memory", new Element(false, 84, 7));
        return config;
    }

    public static Path path() {
        return FabricLoader.getInstance().getConfigDir().resolve("openclient-hud.json");
    }

    public static HudConfig load() {
        HudConfig defaults = defaults();
        Path file = path();
        if (!Files.isRegularFile(file)) return defaults;
        try (Reader reader = Files.newBufferedReader(file)) {
            HudConfig parsed = GSON.fromJson(reader, HudConfig.class);
            if (parsed == null) return defaults;
            return merge(defaults, parsed);
        } catch (IOException | RuntimeException exception) {
            return defaults;
        }
    }

    private static HudConfig merge(HudConfig defaults, HudConfig parsed) {
        defaults.version = 1;
        defaults.enabled = parsed.enabled;
        defaults.background = parsed.background;
        defaults.scale = clamp(parsed.scale, 0.5, 2.5);
        if (parsed.accent != null && parsed.accent.matches("#[0-9a-fA-F]{6}")) {
            defaults.accent = parsed.accent;
        }
        defaults.toggleSprint = parsed.toggleSprint;
        defaults.zoom = parsed.zoom;
        defaults.zoomDivisor = clamp(parsed.zoomDivisor, 1.5, 10);
        if (parsed.elements != null) {
            for (Map.Entry<String, Element> entry : parsed.elements.entrySet()) {
                Element source = entry.getValue();
                if (source == null) continue;
                Element target = defaults.elements.get(entry.getKey());
                if (target == null) continue;
                target.enabled = source.enabled;
                target.x = clamp(source.x, 0, 100);
                target.y = clamp(source.y, 0, 100);
            }
        }
        return defaults;
    }

    private static double clamp(double value, double min, double max) {
        if (Double.isNaN(value)) return min;
        return Math.max(min, Math.min(max, value));
    }

    public void save() {
        try {
            Path file = path();
            Files.createDirectories(file.getParent());
            try (Writer writer = Files.newBufferedWriter(file)) {
                GSON.toJson(this, writer);
            }
        } catch (IOException ignored) {
        }
    }
}
