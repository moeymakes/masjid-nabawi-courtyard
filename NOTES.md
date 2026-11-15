# Nabawi Courtyard: build notes

Built with the `worldsmith` skill (`~/.shared/skills/worldsmith`), starting from the sibling world
`~/Dev/projects/madinah-horizon` (its source was copied, nothing in it was edited). Brief: `prompt.txt`.

## State (update after every step)

- Phase: 5 (critic loop). Iteration 03 capture running.
- iter-02: critic highest severity major (13 items: flight clipping in the arcade, floor mirror ghosts, black
  columns under the canopies, stair-stepped shadows, sun glint orbs, tiled city, plain roof...). All addressed in
  commit "Iteration 02: ...".
- Perf (iter-02, RTX 3070, 2560x1440, 60 s flight, GPU possibly shared): GPU avg 4.41, p99 10.60, max 13.67 ms
- Last good capture: verify/iter-02 (0 console errors)
- Next step: critic on iter-03, fix, iter-04. Stop at highest severity minor or after 6 critic iterations.
- Not done yet: screenshots, index.html captures at High and Low, final README numbers

## What changed from Madinah Horizon

- No density-field terrain, no surface nets, no collision bricks: the plaza is flat. The floor is one slab mesh
  and its marble pattern (slabs, bands, stars, diagonals) is computed per pixel with box-filtered line coverage.
- Collision is analytic: boxes and upright cylinders (`CB`, `CC` in world.js), pushed out along the shallowest
  axis; walking stays between the facade and the palm bed, flight within 360 m and under 150 m.
- The umbrellas are a dedicated pipeline (`W_UMB`): a 64 x 14 membrane grid per instance, folded and unfolded in
  the vertex shader from one clock uniform (`mis.w`). Each umbrella has a delay (distance from the main gate / 10 s
  plus jitter) and takes 20 s. The shadow map is redrawn every other frame while the clock moves.
- The floor mirrors the lit facade and the canopy undersides analytically (ray-plane hits), not by a second pass.
- The skylight/openness volume is replaced by an analytic `skyOcc` (canopy cover, column feet, facade, arcade).

## Geography (composed, not to scale)

Axes: +x east, -z north, y up, metres. Floor y = 0.

| Feature | Real | Here |
|---|---|---|
| Piazza umbrellas | 250 (182 + 68 in the east square), 25.5 x 25.5 m open, about 14-15 m open height to the canopy, about 21 m closed; by SL Rasch, 2010 | 105 on a 27 m grid on the east plaza (three left out in front of the main gate), 25.5 m canopies, hub 13.75 m, corners ~17.8 m open, bud ~21.5 m closed; open as a wave from the main gate |
| Minarets | 10, about 104-105 m | 8 Saudi-era ones at ~100 m (4 on the east side, 4 framing the roof), plus an older-style minaret of ~64 m beside the Green Dome |
| Roof domes | 27 sliding domes, silver-grey, on square bases | 27 silver domes on square bases over the hall |
| Green Dome | south-east corner of the old mosque, over the Prophet's chamber | rises above the roof 26 m inside the east facade near its south end; nothing below the roof is modelled |
| Facade | pale granite cladding, arches of alternating black and white stone, gates with brass doors | pale ashlar, blind pointed arcades with brass lattice screens, black-and-white voussoirs, three gate portals with closed brass doors |
| Floors | marble and granite in geometric patterns | white marble slabs, grey bands, sand pinstripes, an eight-pointed star round each column |

Sources checked 2026-11-15:
- Wikipedia, "Medina Haram Piazza" (umbrella count 182 + 68 = 250, completed 2010)
- Senatus, "The Giant Umbrellas That Protect Pilgrims at the Medina Haram Piazza" (25.5 x 25.5 m open)
- Arab News, "The Prophet's Mosque: great status and vast expansions in the Saudi era" (open heights 14.04 / 15.03 m,
  closed 21.07 m; sources disagree, 20 m is also quoted)
- Wikipedia, "Green Dome" (south-east corner of the mosque)
- Wikipedia, "Prophet's Mosque" and madainproject.com "Masjid al-Nabawi" (10 minarets about 104-105 m, 27 sliding domes)
- Saudipedia, "The Second Saudi Expansion of the Prophet's Mosque" (courtyards in marble and granite in geometric
  designs, gates); globalsecurity.org "Madinah and the Prophet's Mosque" (pink granite cladding, arches in black
  and white stone, white marble columns with brass capitals)

## Sacred-site rules (from the brief, all honoured)

No human figures. No interiors: the arch recesses end in closed brass lattice screens or closed brass doors; the
roof is solid; nothing under the Green Dome exists. No adhan, no recitation, no text in the world (the gates carry
geometric bands only). Finials: a pole, two stacked spheres and an upturned crescent (horns up), checked side-on.

## Six poses (keys 1-6)

1. The plaza, umbrellas opening (capture sets them half-way): looking WSW at the facade, Green Dome over the roof.
2. Forecourt of the main gate, looking up the minaret on its south side.
3. Under the canopies looking east into the low sun: glowing membranes, columns, palms beyond the arcade.
4. Inside the east arcade, looking along the pointed arches, sun striping through.
5. The main gate portal: closed brass doors, lanterns, the marble pattern in front.
6. Flight: 115 m up over the north-east, looking SW across the umbrella field to the mosque and the Green Dome.

Fly path (60 s): plaza → main gate → up the minaret → along the canopies → through an arch into the arcade →
north along it → out through an arch → rise to 6.

## Palette (linear)

Sun (3.1, 2.15, 1.3) HDR at 9 degrees, ESE · zenith (.11, .27, .62) · horizon toward the sun (1.40, .92, .54),
away (.80, .70, .70) with a rose band · marble (.80, .79, .755) · grey bands (.34, .34, .355) · sand (.62, .50, .37)
Accents: Green Dome (.06, .29, .16), brass (.60, .44, .20), lamp glow (2.6, 1.75, .95).

## Critic intent paragraph

The marble plaza beside the Prophet's Mosque (Masjid an-Nabawi) in Madinah just after sunrise, seen at human
scale. Calm, reverent, luminous. White marble floors with grey and sand-coloured geometric inlay, rows of great
white tensile umbrellas on tall white columns (some opening, most open), the mosque's pale stone facade with
pointed blind arches, black-and-white striped voussoirs and closed brass gates with lanterns, minarets about
100 m tall with balconies and gold crescent finials, silver roof domes and the Green Dome rising above the roof,
a free-standing arcade of pointed arches with date palms behind it. Low golden sun from the east, long shadows,
blue sky with a rose tint to the west. No people.

## Sun, movement, audio

- Sun static: elevation 9 degrees, azimuth about 100 degrees (ESE). One shadow map over the plaza and the mosque;
  far terrain gets a CPU-baked heightfield shadow.
- Walk: eye 1.7 m, gravity, box/cylinder collision. Fly (F): Q/E down/up. U closes and reopens the umbrellas.
  Dev: P scripted flight, B benchmark.
- Audio: wind bed, pigeon coos and wing claps, sparrow chirps, a soft rustle in the palms. Nothing recited.
