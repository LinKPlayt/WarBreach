# WarBreach Update 7.0 "Counterstrike": plan and results

## 1. Goals

Three major features, each giving an existing part of the game a new job:

| Gap | Feature |
|---|---|
| The game is defense only. Troops and the hero help, but the guns do the work. | **Counteroffensive**: an attack mode where the guns barely count. |
| Defenses differ by type, level and specialization, but every shot does plain damage. The Ammo Bunker only speeds guns up. | **Special ammunition**: burning, armor-piercing and slowing rounds. |
| Trained troops sit in the Barracks between battles. | **Expeditions**: timed missions away from the base for loot. |

## 2. Design

### Counteroffensive (Command Center 4)
- The enemy digs in three **Siege Camps**, one at the end of each road, outside the base.
- Base defenses never target a camp and do a tenth of their damage to it (the Missile Silo is the exception). Troops, the hero and abilities do full damage.
- A camp shoots any troop or hero within 4.2 tiles (helicopters included) and sends a squad at the base every 22 seconds. Squads grow the longer the camps stand.
- Destroy all three camps and mop up to win. Losing the Command Center loses the battle.
- Endless **sectors**: sector N fights enemy level 1 + 2N. A first win pays 4 + 2N medals (up to 30) and 6% + 2% x N of storage in gold and steel (up to 30%); replays pay a quarter.

### Special ammunition
- Needs an Ammo Bunker; any gun from level 3 (not traps, the Command Center or the Drone Hangar). Costs 25% of the defense's current level cost; standard rounds are free.
- **Incendiary**: targets burn for another 25% of every hit over 2.5 seconds.
- **Armor-piercing**: ignores armor; +30% damage to vehicles and bosses, -15% to infantry.
- **Cryo**: -5% damage; targets move 30% slower for 2.5 seconds (bosses 15%).
- One tap loads a type into every defense of that type.

### Expeditions (Command Center 3)
- Three orders a day out of seven (30 minutes to 8 hours), each sent once. One party at a time, two from Command Center 6, three from 9.
- The cheapest troops go first, so heavy units stay home unless the job needs them. Troops away keep their Barracks space.
- Each troop has a 5 to 22% chance of not coming back; a Combat Medic in the party cuts it by a quarter.
- Rewards are shares of storage in gold, steel and oil, medals, and a 50% chance of hero gear on the longest job. A party can be recalled for no reward.

## 3. Test plan

- A logic check for every rule above (24 new checks; 94 in all).
- Counteroffensive simulated with a scripted player who deploys the whole army at the nearest camp and rallies to the next.
- Endless battles at Command Center 7 with every defense on each ammunition type.
- The earlier suites: battle soak, Gauntlet run, UI fuzzing on phone and tablet, phone layout screenshots, and an end-to-end run through the real interface.

## 4. Results

**Counteroffensive** (scripted player, full army for the Barracks level):

| Command Center | Sector | Result | Battle length | Troops lost |
|---|---|---|---|---|
| 4 | 1 / 2 / 3 | won | 84 s / 96 s / 122 s | 4 / 9 / 16 |
| 7 | 2 / 5 / 8 | won | 63 s / 72 s / 139 s | 2 / 4 / 17 |
| 10 | 6 / 12 / 16 | won | 66 s / 79 s / 264 s | 2 / 8 / 17 |

With the first camp values (half the health) a Command Center 4 army lost sector 4 and every win took about a minute; camps were made tougher so a battle lasts one to four minutes.

**Ammunition** (endless waves survived at Command Center 7, Fortress blueprint, five battles each):

| Loadout | Average |
|---|---|
| Standard rounds | 32.8 |
| Incendiary on everything | 33.2 |
| Cryo on everything | 30.6 |
| Matched: AP on Cannons, Missile Batteries and Sniper Towers, Cryo on Mortars and the Tesla Coil, Incendiary on the rest | 37.6 |

Found and fixed during testing:

- **The first ammunition values were a downgrade.** With a 15% hit penalty on Incendiary and Cryo, every special loadout survived fewer waves than standard rounds (30 to 34 against 37.7 in that test week). Incendiary lost its penalty and Cryo's dropped to 5%; the price went from 15% to 25% of the level cost.
- **An unknown ammunition value crashed the building panel.** The panel and the picker now fall back to standard rounds, and saves drop unknown values.
- **The AMMO chip pushed the health chip out of the panel** on a 390-point-tall phone. Chips use short labels (Std, Fire, AP, Cryo) and "Choose specialization" became "Specialize".
- **The ammunition picker needed scrolling on small phones.** It is now a two-by-two grid.

Results compare within one test week: the weekly enemy faction changes how long any layout survives.
