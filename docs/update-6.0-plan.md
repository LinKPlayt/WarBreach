# WarBreach Update 6.0 "Overhaul": plan and results

## 1. Where it comes from

Update 6.0 follows the balance and bug-fix pass (5.6), which simulated endless waves at every Command Center level, all 18 campaign missions and full Gauntlet runs. That work found problems a player cannot see from inside one battle:

| Finding | What it means for 6.0 |
|---|---|
| Waves stalled when enemies parked next to buildings no defense could reach. | Players need a way to see those blind spots: the **Base Inspector**. |
| Simulated layouts at Command Center 7 survived 16 to 37 waves depending only on where the same buildings stood. The best (support and every gun around the Command Center, economy outside, double walls, Gates facing the roads, traps on the roads) averaged about 29 waves; the starting layout 16 to 19. | Give every player that planning in one tap: **Blueprints**. |
| Late systems reward big upgrades, but nothing says which upgrade is worth the most. | An **Upgrade Advisor** ranked by firepower per resource. |
| Daily orders are short; nothing spans a week. | **Weekly contracts** built on the same events. |
| Upgrading a set of buildings means tapping each one. | **Upgrade all** for any building type, using free builders and the queue. |

## 2. Existing systems, improved

| System | Change |
|---|---|
| Research Lab | Anti-Air Rounds (+8% damage to aircraft per level, 8 levels), Fortification (+10% wall and gate health, 8 levels), Rapid Training (8% faster training, 5 levels). |
| Targeting | "Vehicles first" priority; one tap copies a defense's priority to every defense of its type. |
| Build queue | 3 slots, plus one every four Command Center levels (6 at level 12). |
| Threat levels | Apocalypse after wave 25: enemies x3 health, 30% elites, loot x3.8. |
| Missions | 8 late-game missions (wave 30 and 50, Command Center 10, Gauntlet, Field Album, raid boss, Chapter 2, Paragon); 29 in all. |
| Achievements | Gauntlet Runner, Contractor, End of Days. |
| Gauntlet | 8 new artifacts (24 in all): Salvage Crews, Armor Plating, Rapid Response, Concrete Pour, Combat Engineers, Marksman School, Blood Money, Last Stand. |
| Quartermaster | Oil Drums; Research Grant (one hour off the research in progress). |
| Field upgrades | Capacitor Banks, Turret Overhaul, War Bonds, Mud and Wire (17 cards in all). |

## 3. New features

| Feature | Design |
|---|---|
| **Blueprints** | Plans a layout for the buildings the player owns (not the limits), around a Command Center moved to the middle of the map: Fortress, Bastion or Balanced. Respects obstacles. Preview map, layout score before and after, apply, and one undo. |
| **Base Inspector** | A layout score out of 100 and a ranked list: buildings no defense protects, buildings open to artillery, gaps in air cover, Ammo Bunkers and Radar Stations helping fewer than two defenses, traps away from the roads, roads with an open path to the Command Center. Tap a building to find it on the map. |
| **Upgrade Advisor** | Defense upgrades ranked by damage per second gained per resource (oil counts triple), with Upgrade and Queue buttons; points to the Command Center when everything is capped. |
| **Weekly contracts** | Three objectives per ISO week from 8 types, three tiers, paying 15 to 30 medals, 12 to 25% of storage in gold and steel, and War Chest stars. |
| **Upgrade all** | For any building type: starts as many upgrades as there are free builders and resources and queues the rest. |

## 4. Test plan

- A logic check for every item above, including edge cases: Research Grant refused with no research running and finishing short research; contracts paying once and resetting with the week; blueprints placing every building at Command Center 3, 7 and 12 with obstacles in the way, no overlaps, inside the build area, a closed ring, and an exact undo.
- Simulated endless battles on each blueprint at Command Center 7.
- The earlier suites: battle soak (including Apocalypse), Gauntlet run, UI fuzzing on phone and tablet, phone layout screenshots.

## 5. Results

All items shipped. `tests/logic.test.js` has 70 checks and passes.

Simulated endless battles at Command Center 7 (average waves survived, three battles each):

| Layout | Waves |
|---|---|
| Fortress blueprint | 27.7 |
| Balanced blueprint | 22.7 |
| Bastion blueprint | 19.7 |
| Starting layout | 17.7 |

Found and fixed during testing:

- **The Inspector scored every blueprint the same.** Each issue cost a fixed amount whether it affected one building or thirty. Penalties now grow with the share of buildings affected, and artillery reach counts for less, so the score no longer favors a layout that does worse in battle.
- **The "use for every defense" chip pushed the specialization and health chips out of the building panel** on a 390-point-tall phone. It is now a compact ALL chip.
