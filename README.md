# Samok9

This is a script that automates wireframe rendering in Cavalry.

## Features

- **Per-Layer Color Palette:** Automatically assigns distinct colors across selected layers (or forces a single color via `CFG.singleColor`).
- **Clean Handles & Anchor Markers:** Places solid square/circle handles on corners and edge midpoints (`edgeHandles`), alongside pivot/anchor ring + crosshair markers.
- **Motion Path & Keyframes:** Draws movement paths with directional chevrons, frame dots, and rotated keyframe markers (also inspecting scale and rotation keyframes when enabled).
- **Compact Bottom-Left HUD:** Displays the layer name and `W x H` dimensions on a single line at the bottom-left of the bounds (`HUD_<LayerName>`).
- **One-Click Render Passes:** Automates `Samok9_Overlay`, `Samok9_Clean`, and `Samok9_Wireframe` passes (plus `Render All 3`) while restoring layer visibility safely.
- **Safe Execution & UI Fallback:** Wraps steps in `safe()` so partial issues log to the Console without halting the build, and builds the overlay directly if the Script UI window cannot open.

## How to Use

1. Select one or more target layers (shapes, groups, nulls, etc.) in your Cavalry composition.
2. Run `Samok9.js` and click **Build Samok9 Overlay (selected layers)**.
3. Click **Render Overlay**, **Render Clean**, **Render Wireframe**, or **Render All 3**.
