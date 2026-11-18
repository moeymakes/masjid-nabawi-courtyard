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
  - SHIPPED stage 1: a7e3dd2 build, a71d2f5 README screenshots, pushed realism-s1:main (cc745f5). Live page
    byte-identical to the build (sha256 1495048a...), checked 2026-11-18 22:36 AEDT.
  - Stopped 22:40 AEDT at 83% of the 5-hour window (stage 2 would cross 85%); resumed 01:00 after the reset.
- Realism stage 2 (branch realism-s2 from realism-s1; baseline = shipped stage 1: hero crop flatwhite .42 mean /
  1.53 max, brightdetail 35.2). Helper scripts now live in verify/bin (the scratchpad was wiped by a restart).
  - 1 2f014fc bounded GI (Madinah 8246d13 + 133f332): brightdetail 34.4, within capture noise.
  - 2 b7a1cff umbrellas to SL Rasch's figures (see Geography): 24.5 m grid, chessboard heights 14.4 / 15.3 m,
    overlapping into one canopy, bud 21.7 m, tan seams, 130 umbrellas; flight lanes and pose 1 moved off the new
    column lines (flight clearance 3.8 m min, was 3.7). brightdetail 34.9.
  - 3 72e9ba8 minarets: square balcony with parapet, octagonal then cylindrical, 104 m. brightdetail 35.0.
  - 4 d0ba48e altocumulus (Madinah 02909b3) + palms (ac0180e). brightdetail 34.5.
  - 5 stage-1 minors: night fill a stop lower, Green Dome night light falls off with height, warmer golden shade.
  - Critic round 1 (stage 2): highest MAJOR - overhead clouds a blurry smudge. Strengths: the overlapping canopy
    with alternating heights and seam tapes, night facade + lamp pools, Green Dome glow.
  - 6 fix loop 1: clouds as crisp cells with a sunlit rim, field shifted off the pose-2 minaret, gentler dawn
    lift, faint at night. Hero crop (verify/s2-9): flatwhite .50 mean / 1.79 max, clip .35 max, brightdetail
    36.0 (stage 1 35.2, live-before-realism 15.4).
  - Critic round 2: highest MINOR (in-scope and overall). Remaining minors: the lone pose-2 cloud is puff-like,
    night floor still evenly lit far from lamps, golden aerial haze flattens the mid-ground, night aerial flat,
    canopy shadow stairstep. Out of scope: city box grid and flat terrain (stage 3).
  - Gates (verify/s2-g2-*): ALL PASS. clip max .35; flatwhite max 1.79; brightdetail 36.0 (holds vs stage 1 35.2);
    critic minor; GPU 4.99 avg / 9.37 p99 ms; 0 console errors at 3 times x 3 levels; menu ok; index.html 116.5 kB.
  - SHIPPED stage 2 (build + README screenshots), pushed realism-s2:main. Live byte-identical (sha256 2e0566c2...), checked
    2026-11-19 ~03:30 AEDT.
  - Correction: a repeat capture of one build (s3-3 vs s3-3b) differs by 0.1% on the mean brightdetail (0.6% mean
    absolute per shot), so the -2% after the GI port was a real small drop, not noise; stage 2 still ended above
    stage 1 (36.0 vs 35.2).
- Realism stage 3 (branch realism-s3 from realism-s2; baseline = live stage 2, hero crop brightdetail 36.0).
  - Data: reused the Madinah session's approved downloads (Copernicus GLO-30 N24_E039 tile and the Overpass extract
    within 1.5 km of the Haram, /home/moey/Dev/research/madinah-horizon-data/), same location; no new download.
  - OSM city tried (port of Madinah a692b24, Haram centre at MOSQ (-210, -5), features on the composed plaza left
    out): s3-1 bd 34.0 (-5.5%), fix loop 1 blocks moved to the kerb instead of dropped 34.7, fix loop 2 pale
    sidewalks 34.7. Isolation: DEM only holds (dawn pose 6 83.3 vs 82.4); streets without hotel towers cost 11% on
    dawn pose 6; with towers 22% at dawn (long low-sun shadows) but +12% at night. Dropped, as Madinah did:
    the real street ring and hotel towers make the area round the Haram plainer than the composed grid in every
    aerial shot. No OSM data ships, so no ODbL attribution is needed; Copernicus credit goes in the README.
  - 1 5c93773 DEM relief for Uhud and Jabal Ayr (Madinah 3551cdb), committed WITHOUT a capture of this exact tree
    (the s3-dem capture had the OSM code switched off, equivalent but not identical).
  - STOPPED 2026-11-19 ~04:40 AEDT at 86% of the 5-hour window; one-shot resume armed for 06:07 AEDT.
    Next: capture s3 (verify/bin/cap.sh s3-4 + met.sh), gates (verify/bin/gates.sh s3-g1), critic once, README
    data-source line for Copernicus, ship realism-s3:main; then the contact sheet
    (/home/moey/Dev/reports/masjid-nabawi-courtyard-realism-2026-11-19.jpg: live-before s0-base vs final), worldsmith
    learnings (references/realism.md + SKILL.md log, append only), final report.
  - Resumed 2026-11-19 06:05 AEDT (4% of the window). s3-4 (5c93773 as committed): bd 35.34 vs stage 2's 35.98
    re-measured (-1.8%), all from two shots: the hotel behind the pose-4 arches and the night skyline in pose 3.
    Cause: the DEM's real Uhud spurs reach z ~ -2500, inside the city loop, and the city mask gates `rnd()` calls,
    so every later block reshuffled. Stage 2's layout cannot come back without building on the mountain.
  - Fix loop 1, s3-5: a random stream per 360 m city block. bd 35.74 (-0.7%; a new draw of the same city).
  - Fix loop 2, s3-6: the Markazia ring on all four sides (was east and north only; the south side's Dar Al Hijra,
    Movenpick and Hilton are there too), 85% hotels within ~520 m. bd 38.55 (+7%) but dawn aerial 82.4 -> 69.6:
    tall towers with blank sunlit faces replaced many small shadowed roofs (the OSM trial's signature).
  - Fix loop 3, s3-7: far window grids box-filtered per axis instead of faded out (the fade blanked every tower
    beyond ~6 px per floor). bd 44.05 (+22%), dawn aerial 83.4. Gates s3-g1: GPU 5.54 / 10.48 ms, 0 errors,
    menu ok, 131.4 kB. Critic round 1 (s3-7): major; in scope: hotel ring not distinct (no height falloff), night
    windows uniform sticker grids. Out of scope: roof slab, canopy fabric, pose-2 cloud, night canopy.
  - Fix loop 4, s3-8/s3-9: 17- and 19-storey hotels (56.1 / 62.7 m; real Markazia hotels are 15-20 storeys) on
    the first 400 m, falling to 6-12 storeys by 750 m; rooms warm or cool white and dimmed behind curtains. s3-8
    had rooms up to 1.55x and night aerial clip .553 (gate .5), corrected within the loop to dim-only 0.4-1.0x.
  - Final tree e1c0797 + ded8738 (s3-9): bd 43.27 vs 35.98 (+20%), clip max .27, flatwhite max 1.78; three shots
    dip 1.6-2.5% (city layout behind arches). Gates s3-g2: PASS GPU 5.46 avg / 10.20 p99 ms, PASS 0 console
    errors at 3 times x 3 levels, PASS menu-preview, PASS 131.9 kB (DEM patches +15 kB).
  - Critic round 2 (s3-9): highest MAJOR. In stage 3 scope: #6 night-aerial windows read as dense near-uniform
    dots with no building-level variation, predicted to shimmer in motion (judged from stills; the per-window
    dimming of loop 4 is part of it). Out of scope (stages 1-2 subjects): dawn/golden mood too similar, umbrellas
    lose rib structure from the air, night canopy gloom and navy gaps, blocky artefacts in canopy gaps (t1 pose 3),
    pose-2 cloud, minaret ring glow, roof tone. City monotony dropped from major to minor.
  - Ship rule NOT met: the fix-loop cap (4) is spent and one remaining major is in scope. Not shipped; branch
    realism-s3 pushed with the build. Asked the starting session whether to ship anyway: HOLD (2026-11-19, the
    night-window major is stage 3's own work). realism-s3 stays unshipped at ccba6ca; live stays stage 2. Moey can
    override: `git push origin realism-s3:main`, poll live until byte-identical, README screenshots from
    verify/s3-9-t0.
  - SHIPPED stage 3 by Moey's decision (2026-11-19, relayed by the starting session: "Nabawi stage 3"), as built
    with the in-scope night-window major (#6) still open. README screenshots from verify/s3-9-t0, pushed
    realism-s3:main as a fast-forward. The next fix for #6 below is the first job of any further realism work.
  - Next fix for #6 (not started): in the city-window emission (shaders.js, mat 17), vary light per building and
    per floor instead of per window: take the dim level and the warm/cool choice from `hs(sd)` (building) and
    `hs(flr + sd)` (floor), keep per-window only the binary lit/unlit; keep the 1.0x ceiling (night aerial clip).
    Then re-capture all three Times, gates, one critic.
  - Contact sheet /home/moey/Dev/reports/masjid-nabawi-courtyard-realism-2026-11-19.jpg (rows: dawn, golden,
    night; each original live build s0-base above the stage 3 candidate s3-9). Worldsmith learnings appended.
  - Next: stage 2 on branch realism-s2 (from main). Sources found so far for the umbrellas: SL Rasch project page
    (sl-rasch.com/en/projects/u-26-piazza): two deployed heights 14.4 / 15.3 m so the membranes overlap into one
    continuous canopy (no sky gaps), folded 21.7 m, 600 m2 shade each, opening 180 s, PTFE, columns clad in GFRC
    panels with glass mosaic, seams and tapes in colour. Minarets (Saudipedia, madainproject): ~104 m, square
    first floor ending in a square balcony above the roof, then octagonal, then cylindrical, gilded bronze
    crescent ~6 m / 4.5 t. Paving: Thassos white marble (SPA via Al Riyadh Daily). Green Dome: Ottoman 1818,
    green since 1837; no published dimensions found, keep the composed size. Port from Madinah: GI 8246d13 +
    133f332, clouds 02909b3, palms ac0180e. Then stage-1 minors (night fill a stop lower, Green Dome emission
    shading, golden pose-5 facade warmth). Stage 3: Madinah 3551cdb (DEM) / a692b24 (OSM) / bcad486 (README).
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
| Piazza umbrellas | 250 (182 + 68 in the east square), 25.5 x 25.5 m open, two deployed heights 14.4 / 15.3 m so the membranes overlap into a continuous canopy, 21.7 m folded, 600 m2 shade each, opens in 180 s, tapes and seams in colour; by SL Rasch, 2010-11 | 130 on a 24.5 m grid (600 m2 each; three left out in front of the main gate), alternating heights in a chessboard (corners 14.4 / 15.3 m, hubs 12.2 / 13.1 m), 26.5 m canopies (1 m over the source so the overlap closes against the 0.9 m step), bud 21.7 m, tan seam tapes; open as a wave from the main gate, 20 s each (not 180 s: kept short for play) |
| Minarets | 10, about 104-105 m; square first floor ending in a square balcony above the roof, then octagonal, then cylindrical stages with balconies; gilded bronze crescent ~6 m | 8 Saudi-era ones, 104 m to the crescent tip (4 on the east side, 4 framing the roof): square shaft and square balcony with parapet, octagonal stage, cylindrical stages, ~6 m alem; plus an older-style minaret of ~64 m beside the Green Dome |
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
- SL Rasch, "Madinah Piazza Shading Project" (sl-rasch.com/en/projects/u-26-piazza, checked 2026-11-19): heights
  21.7 m folded, 14.4 or 15.3 m deployed, two heights so the membranes overlap, 600 m2 shade each, 180 s opening,
  PTFE, GFRC column cladding with glass mosaic, coloured tapes and seams
- Saudipedia, "The Minarets of the Prophet's Mosque"; madainproject.com "Minarets of Masjid al-Nabawi"; Zawya
  "Minarets of Prophet's Mosque" (checked 2026-11-19): ~104 m, square first floor ending in a square balcony,
  octagonal then cylindrical stages, gilded bronze crescent ~6 m and ~4.5 t
- Al Riyadh Daily (SPA), Thassos marble in the courtyards of the Prophet's Mosque (heat-reflecting white Greek
  marble, 117,000 m2); the floor stays the composed white marble with grey bands and sand pinstripes
- madainproject.com "Green Dome": Ottoman dome of 1818, painted green from 1837; no published dimensions found,
  so its composed size stays
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
