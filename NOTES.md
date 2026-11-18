# Nabawi Courtyard: build notes

Built with the `worldsmith` skill (`~/.shared/skills/worldsmith`), starting from the sibling world
`~/Dev/projects/madinah-horizon` (its source was copied, nothing in it was edited). Brief: `prompt.txt`.

## State (update after every step)

- Realism stages 1-3 (2026-11-18, from 16:15 AEDT; brief: side-session notes `realism-stages-brief.md`). Branch
  `realism-s1`. Captures verify/s1-<step>-t<0|1|2>/ (1920x1080); helper scripts cap.sh / met.sh / sheet.py /
  gates.sh in the session scratchpad. Hero crop = `--crop 0,.3,1,1` on all six poses x three times (no city here:
  the plaza, canopies, facade and minaret are the subject).
  - Baseline (main 7c62ca2, verify/s0-base-*): clip .13 (max .78), flatwhite 13.53 (max 50.4, night canopies),
    brightdetail 15.43 (gate >= 17.7).
  - 1 8cf724c GTAO + TAA (port of Madinah af664e0), renders, 0 errors.
  - 2 aeee346 Hillaire sky + aerial perspective (port of 83eccb1 + 8977469), dawn rose band and night city glow
    kept over the LUT: flatwhite 11.04, brightdetail 18.59.
  - 3 cb67aef albedo/weathering/night pass: flatwhite 2.45 (dawn 5.4, golden 1.9, night .07), brightdetail 20.86
    (+35%), clip .08 (max .38). Remaining flat white = dawn pose 2 (sunlit minaret shaft, 11.8) and pose 5
    (sunlit east facade, 11.4): stone squarely facing the sunrise; hero modelling in stage 2 is the lever.
  - Deferred from stage 1, by design: interior-mapped windows, district tint and a static city shadow map. The
    city here is only distant background (pose 6); it gets real OSM layout in stage 3, so it is done there once.
  - Gates on cb67aef (verify/s1-g1-*): PASS perf GPU 4.64 avg / 8.62 p99 ms (2560x1440 High, 60 s flight; base 5.21 /
    9.27). PASS 0 console errors, index.html at 3 times x High/Medium/Low. PASS menu-preview phone/tablet/desktop.
    PASS size 112.4 kB. PASS clip (max .38) and brightdetail (+35%). FAIL flatwhite < 2 per pose: dawn poses 2 and 5
    (sunlit stone facing the sunrise); mean over the 18 shots is 2.45 vs 13.53 live.
  - Critic round 1 (Sonnet, on cb67aef; highest major). In-scope majors: dawn sky navy and blotchy (pose 2), pose-3
    floor glare smear toward the sun, night reads as overcast day (no lamp pools, no floodlight gradient). Out of
    stage-1 scope: aerial city boxes / roof slab / identical domes (stage 2-3), umbrella field edge.
    Strengths to keep: arcade perspective (pose 4), facade voussoirs + brass (pose 5), canopy rhythm, golden aerial.
  - 4 a030a57 fix loop 1: visible sky dome x1.6 dawn / x1.3 golden (LUT still drives ambient + aerial), night
    expo 1.8 -> 1.4. Hero crop: flatwhite 2.50, brightdetail 25.68 (+66% vs live), clip .09 (max .37). Gate sweep
    on it (verify/s1-g2-*): GPU 4.60 / 9.46 ms, 0 errors at 3 times x 3 levels, menu ok, 112.5 kB.
  - Paused 2026-11-18 ~17:00 AEDT at 82% of the 5-hour window, resumed ~20:00 after the reset.
  - 5 0f07ff1 fix loop 2: night point lights (the plaza lamp posts as warm pools, ground floodlights every 12 m
    scalloping the facade), the night floor mirror no longer reflects a daylit canopy/facade, PTFE transmission
    .55 -> .3 (real membrane passes ~10-15%), canopy bounce .5 -> .4, dawn sun x.74 and golden x.85 (sunlit
    stone no longer clips to flat white). Hero crop (verify/s1-6): flatwhite max 1.51 (dawn .69, golden .25,
    night .30 mean), clip max .35, brightdetail 32.6 vs live 15.4 (+111%). Gates (verify/s1-g3-*): GPU 4.42 avg /
    8.15 p99 ms, 0 errors at 3 times x 3 levels, menu ok, 113.6 kB.
  - Critic round 2 (on 0f07ff1; highest major): glare smear FIXED; night PARTLY (facade floodlights and lamp
    pools now read, canopy still day-grey); dawn zenith PARTLY (clean but deep navy). Strengths: night facade
    uplighting (best frame), lamp pools, low-sun grazing light on the inlay and arcade.
  - 6 8776fa8 fix loop 3: night canopy bounce x.12 and under-canopy fill .06 (pools read against a darker
    plaza), dawn visible sky x2.6. Hero crop (verify/s1-7b-t0 + s1-7-t1/t2): flatwhite max 1.53, clip max .46,
    brightdetail 35.2 (+128%).
  - Critic round 3 (on 8776fa8): highest severity MINOR (in-scope and overall). Dawn sky FIXED; night PARTLY
    (now minor: floor/arcade whites carry a stop too much fill). Remaining minors for stage 2: night aerial flat,
    Green Dome emission too uniform, golden pose-5 facade dull in shade, canopy flat at dawn/golden (seam bands
    without cloth shading), floor radial streaks near the sun, aliasing on thin arch rows.
  - Gates on 8776fa8 (verify/s1-g4-*): ALL PASS. clip max .46 < .5; flatwhite max 1.53 < 2; brightdetail 35.2 vs
    15.4 (+128%, gate +15%); critic minor; GPU 4.41 avg / 8.17 p99 ms (gate 11 / 16); 0 console errors at
    3 times x 3 levels; menu-preview ok; index.html 113.6 kB.
  - SHIPPED stage 1: a7e3dd2 build, a71d2f5 README screenshots, pushed realism-s1:main.
  - Critic: one per stage, not one per feature (5-hour usage window was at 71% with six sessions sharing it).

- Phase: 7 (delivered). Critic loop stopped by the brief's rule: 6 critic iterations (iter-02 .. iter-07), highest
  severity still "major" in every one. Gate 1 is NOT passed; gate 2 (perf) passes.
- Final capture: verify/iter-07 (dev.html, 2560x1440, 0 console errors). index.html captured at High
  (verify/final-index-high) and Low (verify/final-index-low, --storage nabawi=2): 0 console errors on both.
- Perf (iter-07 benchmark, dev.html, RTX 3070, 2560x1440, scripted 60 s flight with the umbrellas opening and the
  shadow map redrawn while they move): GPU avg 5.21 ms, p99 9.27 ms, max 9.36 ms; frame 16.67 ms (vsync-locked
  headless). Two other worlds were rendering on the same GPU during some runs, so timings are noisy (iter-02..07
  GPU avg ranged 4.4-5.3 ms).
- index.html: 93.2 kB, 38.1 kB gzipped. Load to menu ~0.9-1.4 s headless.
- Not done: critic majors that recurred (see below); a real-window frame-pacing and heap check; audio was changed
  (pigeons, wing claps) but not listened to; touch controls untested.
- Next step if resumed: decide with Moey whether to ship as is or keep iterating; best leads are in "Open critic
  items".

## Critic history

| Iter | Highest | Main changes after it |
|---|---|---|
| 02 | major | flight path out of the arcade piers, soft floor mirror, wider PCF, warmer ambient, merlons, roof detail, city variety, bigger Green Dome |
| 03 | major | exposure down, golden key, bluer sky, flatter canopies, warmer marble, lit screens, larger lanterns, recomposed poses |
| 04 | major | leaf merlons, round balconies, canopy hub ring, neutral bounce, richer inlay, no painted arches behind the facade, brass lamps, silver domes |
| 05 | major | tighter canopy gaps, per-umbrella sag, pleated buds, seams fade with distance, sand-filled stars, lighter arcade ceiling |
| 06 | major | canopies glow onto the plaza, brighter fabric, rotated PCF taps (dithered penumbrae), bolder inlay, rooftop tanks, sparser far city |
| 07 | major | (stopped: 6 critic iterations) |

Treated as noise (checked on contrast-stretched crops, not present): "concentric sky banding" in pose-2, raised in
iter-03..07. A faint bloom halo round the sunlit minaret was real and was reduced in iter-06.

## Open critic items (iter-07, most recurring first)

- Floor reads flat lilac-grey rather than warm polished white marble (every iteration). Lighting it more warmly
  helped each time but never closed it; the next step is a real (blurred) reflection of the canopy undersides, or
  a warmer, brighter floor albedo with a stronger sheen.
- Aerial city reads as repeated boxes; the canopy field from above reads as a quilt.
- Pose-1 composition: under open canopies the Green Dome is hidden (true to the place: from inside the umbrella
  field the roof and dome are not visible). The index.html pose-1 shot, taken before the umbrellas open, shows it.
- Minaret parts seen through the 0.4 m gaps between canopies read to the critic as clipping.
- Closed umbrella buds read as tall white blades.

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
| Piazza umbrellas | 250 (182 + 68 in the east square), 25.5 x 25.5 m open, about 14-15 m open height to the canopy, about 21 m closed; by SL Rasch, 2010 | 105 on a 27 m grid on the east plaza (three left out in front of the main gate), 26.6 m canopies (0.4 m gaps), hub 13.75 m, corners ~16 m open, bud ~21.5 m closed; open as a wave from the main gate, 20 s each |
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
