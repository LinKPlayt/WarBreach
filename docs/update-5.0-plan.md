# WarBreach Update 5.0 "Legends": research and plan

## 1. Research summary

What the genre's leaders and recent releases are doing, and what players say about it.

| Finding | Source | What it means for WarBreach |
|---|---|---|
| Bloons TD 6 shipped **Rogue Legends** (v47, 2025): a roguelite campaign where you move across tiles (battles, mini-bosses, camps, merchants), collect **artifacts** with trade-offs, and end with a final boss. Some players called it "an RNG fest", so choice should beat luck. | [Blooncyclopedia: Rogue Legends](https://www.bloonswiki.com/Rogue_Legends), [Pocket Gamer](https://www.pocketgamer.com/bloons-td-6/new-dlc-rogue-legends), [Steam discussion](https://steamcommunity.com/app/960090/discussions/0/597392414383069787) | A **Gauntlet** run mode with node choices, artifacts and a boss. Always offer a choice of two paths and three artifacts, so skill outweighs luck. |
| BTD6 keeps adding **Paragons** (Spike Factory, Bomb Shooter, Ice Monkey in 2025): sacrifice several top-tier towers of one type to create one super tower. | [Version 51.0](https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_51.0), [Version 52.0](https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_52.0) | **Paragons** for late-game bases: merge three high-level defenses of a type. |
| BTD6's **Challenge Editor** lets players build challenges and share them with a short code; it is one of its main community features. | [Blooncyclopedia: Challenge Editor](https://www.bloonswiki.com/Challenge_Editor) | A **Challenge Editor** with share codes (offline, like our base codes). |
| Roguelite TD games lean on **meta progression**; players criticise trees that are "too short, fast to unlock and redundant". | [Repel the Rifts review analysis](https://vaporlens.app/app/3686580/repel_the_rifts.md), [Tower Tactics: Liberation analysis](https://vaporlens.app/app/1709900/tower_tactics_liberation.md), [Game-Ace on TD design](https://game-ace.com/blog/engineering-of-tower-defense-games/) | A **Commander Knowledge** tree whose points come slowly (Command Center levels, ranks, Gauntlet wins) and where every perk does something different. |
| Kingdom Rush 5 reviews: core play is great, but the **upgrade tree lacks depth** and players enjoyed hero combinations most. | [GamingTrend review](https://gamingtrend.com/reviews/kingdom-rush-5-alliance-td-review-lacking-depth-where-it-matters/), [TapSmart review](https://www.tapsmart.com/games/kingdom-rush-5-review/) | Give late game new decisions (Paragons, Knowledge) instead of only bigger numbers. |
| Clash of Clans (Town Hall 18, Nov 2025) added the **Revenge Tower**, which gets stronger as the base is damaged, and the **Totem** spell; the "Clash Anytime" update removed training waits. | [Clash Ninja: Town Hall 18](https://www.clash.ninja/blog/town-hall-18-is-here), [Sportskeeda: Clash Anytime](https://www.sportskeeda.com/mobile-games/clash-clans-clash-anytime-update-patch-notes-removal-training-time-new-pet-troop) | A **Vengeance Tower**, a **Decoy Beacon** ability, and **army presets** that refill your army in one tap. |
| Retention guides: escalating **streak** rewards, **collection albums**, recurring **live events** every 2-4 weeks and good **re-engagement** after absence. | [Beamable: daily login examples](https://beamable.com/blog/inspiring-examples-of-daily-login-rewards-for-your-mobile-game), [Meta Quest retention guide](https://developers.meta.com/horizon/blog/build-faster-earn-more-developers-guide-to-engagement-and-retention-meta-quest/), [GameRefinery onboarding](https://gamerefinery.com/keep-your-players-coming-back-introducing-onboarding-best-practices-part-2) | A **Field Album**, **win streaks**, a weekly **Weekend Blitz** and a **welcome-back report**. |

Online features (ranked play, leaderboards, clans) stay out of scope: WarBreach is a single-player game that saves on the device.

## 2. Goals

1. Give late-game players new decisions, not just bigger numbers.
2. Add a replayable mode that feels different every run.
3. Reward coming back: streaks, a weekend event, a clear summary after time away.
4. Keep every feature offline and covered by automated logic tests.

## 3. Features

| # | Feature | Design | Unlock |
|---|---|---|---|
| 1 | **Gauntlet** (roguelite mode) | 8 stages. Each stage offers two nodes: Skirmish, Elite assault (harder, better artifact), Field camp (repair the Command Center) or Black market (buy artifacts with run coins). Stage 8 is a boss. Command Center damage carries over between battles; losing ends the run. 16 artifacts, some with trade-offs. Rewards scale with stages cleared; best run is recorded. | Command Center 5 |
| 2 | **Paragons** | Merge three defenses of one type (level 10+) into a Paragon: 4x damage, +30% fire rate, +20% range, 3x health, golden crown. One per defense type. Costs medals and resources. | Command Center 10 |
| 3 | **Challenge Editor** | Pick enemies, waves, strength, rules (fast, armored, no airstrikes, no repair, no hero, glass walls, blackout), weather and time of day. Save up to 10, share and import codes. | Always |
| 4 | **Commander Knowledge** | 10 perks (production, battle gold, build time, training time, starting morale, supply drops, defense damage, building health, hero XP, an extra War Games slot). Points come from Command Center levels, commander rank and Gauntlet wins. Free respec. | Always |
| 5 | **Vengeance Tower** | Crimson beam cannon. +12% damage for every building the enemy destroys, up to triple damage. | Command Center 11 |
| 6 | **Decoy Beacon** | New ability: an inflatable decoy tank that pulls nearby enemies onto itself for 12 seconds. | Command Center 7 |
| 7 | **Army presets** | Save three army compositions; one tap queues whatever is missing. | Barracks |
| 8 | **Field Album** | Collection book: enemy dossiers (25 kills each), arsenal (defenses at level 5), commanders (heroes at level 5), battlefields (every weather and time of day) and bosses. Each finished page pays medals once. | Always |
| 9 | **Win streaks** | Each win (a mission victory or 8+ endless waves) adds +10% battle loot, up to +50%. A loss resets it. | Always |
| 10 | **Weekend Blitz** | Every Saturday and Sunday: +25% battle loot and double medals from cleared waves. | Always |
| 11 | **Welcome-back report** | After 20+ minutes away: what your mines produced, which builds, research and training finished. | Always |
| 12 | **"Air first" targeting** | New targeting priority for anti-air heavy setups. | Always |

## 4. Test plan

- A dedicated logic suite with at least one check per feature, including the edge cases: Gauntlet HQ damage carry-over, run end on defeat, merchant prices, artifact trade-offs; Paragon eligibility, cost, sacrifice and the one-per-type limit; challenge codes (round trip, junk rejected); Knowledge points and every perk's effect; Vengeance scaling and cap; decoys never saved into the base; presets never exceed army capacity; album claims paid once; streak gain and reset; weekend detection; welcome-back totals.
- The existing suites: battle soak at every Command Center level, UI fuzzing, save and migration cases, the two-week time warp, the 3.5 fix checks, the 4.0 suite and the update regression tests.

## 5. Risks

- Gauntlet battles must not be too long on phones: waves use 40% of endless sizes.
- Decoys are temporary buildings, so they are removed when a battle ends and filtered from saves.
- Paragon strength is tuned for Command Center 10-12 bases and capped at one per type.

## 6. Results

All 12 features shipped. The 5.0 logic suite has 79 checks and passes on repeated runs. The 4.0 suite (74 checks), the battle soak at every Command Center level, UI fuzzing (base and battle), save and migration cases, the two-week time warp, the 3.5 fix checks and the earlier update tests also pass.

Testing found and fixed these problems before release:

- **Decoys pulled almost nothing.** The line-of-sight check counted the decoy's own tile as an obstacle, so ground enemies were never drawn to it. The check now ignores the building being aimed at.
- **Enemies drifted off the decoy.** The regular 0.35-second retarget switched enemies to any other building in range. Enemies in range of a decoy now stay on it.
- **Decoys often had "no room" in crowded bases.** Placement now uses the closest open tile within 5 tiles instead of 3.
- **Paragons merged on a single tap and hid their price.** Merging removes two defenses for good, so it now takes two taps like selling, and the button shows the medal, gold, steel and oil cost. The panel marks Paragons with a gold badge.
- **The Vengeance beam started above the tower.** It now fires from the obelisk's glowing tip.
