"""Shared authoring values for the Blender cinematic lighting preview rigs.

Runtime values are mirrored in apps/web/src/game/lighting/LightingProfiles.ts.
Keep the profile IDs and high-level intent aligned; Blender and Three.js use
different physical units and light implementations.
"""
LIGHTING_PROFILES = {
    "dawn": {
        "world_color": (0.32, 0.24, 0.28),
        "world_strength": 0.38,
        "sun_color": (1.0, 0.66, 0.42),
        "sun_energy": 2.1,
        "sun_position": (-80.0, 32.0, 55.0),
        "fill_energy": 420.0,
        "rim_energy": 260.0,
        "exposure": 0.0,
    },
    "day": {
        "world_color": (0.42, 0.55, 0.68),
        "world_strength": 0.55,
        "sun_color": (1.0, 0.91, 0.78),
        "sun_energy": 3.0,
        "sun_position": (75.0, 105.0, 45.0),
        "fill_energy": 520.0,
        "rim_energy": 320.0,
        "exposure": 0.0,
    },
    "sunset": {
        "world_color": (0.30, 0.18, 0.20),
        "world_strength": 0.32,
        "sun_color": (1.0, 0.42, 0.22),
        "sun_energy": 2.35,
        "sun_position": (95.0, 24.0, -65.0),
        "fill_energy": 300.0,
        "rim_energy": 460.0,
        "exposure": 0.15,
    },
    "night": {
        "world_color": (0.025, 0.045, 0.09),
        "world_strength": 0.12,
        "sun_color": (0.28, 0.42, 0.72),
        "sun_energy": 0.12,
        "sun_position": (-35.0, 70.0, -20.0),
        "fill_energy": 90.0,
        "rim_energy": 130.0,
        "exposure": -0.25,
    },
}
