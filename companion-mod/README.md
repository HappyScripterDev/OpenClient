# OpenClient Mod

Optional client-side companion mod for OpenClient. It renders the HUD described in the launcher
settings and adds toggle sprint and zoom. It is a normal Fabric mod with no gameplay advantages.

## Features

- FPS, CPS, ping, coordinates, keystrokes, armor and held items, real clock, in-game time and
  Java heap indicators
- Drag-to-place HUD editor (Right Shift by default)
- Toggle sprint (V) and hold-to-zoom (C)
- Shared configuration with the launcher: `config/openclient-hud.json`
- OpenClient branding on the main menu using the transparent logo

No x-ray, kill aura, combat automation, movement exploits or server-rule violations.

## Requirements

- Minecraft 1.21.1
- Fabric Loader 0.16 or newer
- Fabric API
- Java 21
- Gradle 8.10+

## Build

```bash
gradle build
```

The jar is written to `build/libs/openclient-1.0.0.jar`. Copy it into the profile's `mods` folder,
together with Fabric API for the same Minecraft version. The OpenClient launcher can open the mods
folder from **Client HUD, Mods folder**.

For another Minecraft version, change `minecraft_version`, `yarn_mappings`, `loader_version` and
`fabric_version` in `gradle.properties`. The HUD code uses stable Fabric API entrypoints; mixin
signatures may need small adjustments between major Minecraft versions.

## Configuration

The launcher writes `config/openclient-hud.json` inside the selected profile's game directory.
Fabric's config directory is the same folder, so the mod loads the file automatically. You can also
edit the layout in game; saving the editor writes the same file.

Schema:

```json
{
  "version": 1,
  "enabled": true,
  "background": true,
  "scale": 1.0,
  "accent": "#ff4d4d",
  "toggleSprint": true,
  "zoom": true,
  "zoomDivisor": 4.0,
  "elements": {
    "fps": { "enabled": true, "x": 1.5, "y": 1.5 },
    "cps": { "enabled": true, "x": 1.5, "y": 7 },
    "ping": { "enabled": true, "x": 1.5, "y": 12.5 },
    "coordinates": { "enabled": true, "x": 1.5, "y": 18 },
    "keystrokes": { "enabled": true, "x": 1.5, "y": 68 },
    "armor": { "enabled": true, "x": 84, "y": 78 },
    "clock": { "enabled": false, "x": 84, "y": 1.5 },
    "memory": { "enabled": false, "x": 84, "y": 7 }
  }
}
```

Positions are percentages of the scaled game window, so the layout follows resolution changes.

## Key bindings

| Key | Action |
| --- | --- |
| Right Shift | Open/close the HUD editor |
| V | Toggle sprint |
| C | Hold to zoom |

All keys can be changed in Minecraft's controls screen under the OpenClient category.

## License

MIT. Minecraft is a trademark of Mojang Synergies AB.
