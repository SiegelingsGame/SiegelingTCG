# Sieglings TCG — Prototype

A playable single-match prototype of **Sieglings TCG**, a tactical elemental card game inspired by Queen's Blood and One Piece Card Game.

**1 Human Player (Fire Deck) vs 1 AI Opponent (Water Deck)**

## Prerequisites

- **Java 21+** must be installed. Download from:
  - [Adoptium (Temurin)](https://adoptium.net/) — recommended
  - [Oracle JDK](https://www.oracle.com/java/technologies/downloads/)
  - [Amazon Corretto](https://aws.amazon.com/corretto/)
- After installing, verify: `java -version`
- Maven is **not required** — the project includes Maven Wrapper (`mvnw`)

## How to Run

### Windows

```
cd sieglings-tcg
mvnw.cmd spring-boot:run
```

### Mac/Linux

```
cd sieglings-tcg
chmod +x mvnw
./mvnw spring-boot:run
```

Then open your browser to: **http://localhost:8080**

## How to Play

### Turn Flow

1. **DRAW** — Click "Draw" to draw a card
2. **SETUP** — Place Sieglings on the board and/or cast spells
3. **BATTLE** — Click "Battle!" to resolve combat (all Sieglings attack by Speed order)
4. **END** — Click "End Turn" to finish. The AI takes its turn automatically.

### Placing Sieglings

1. Click a Siegling card in your hand
2. Valid placement squares highlight in gold
3. Click a highlighted square to place the card
4. First card must go in the **Back Row**; subsequent cards must be adjacent to an existing card's **notch**

### Casting Spells

1. Click a Spell card in your hand
2. If it targets a specific enemy, click the target on the enemy board
3. If it targets all/row, it casts automatically

### Board Layout

```
     Enemy Side
  ┌─────┬─────┬─────┐
  │Back │Back │Back │  ← Enemy Back Row
  ├─────┼─────┼─────┤
  │ Mid │ Mid │ Mid │  ← Enemy Middle Row
  ├─────┼─────┼─────┤
  │Front│Front│Front│  ← Enemy Front Row
  ╞═════╪═════╪═════╡  ← Center Line
  │Front│Front│Front│  ← Your Front Row
  ├─────┼─────┼─────┤
  │ Mid │ Mid │ Mid │  ← Your Middle Row
  ├─────┼─────┼─────┤
  │Back │Back │Back │  ← Your Back Row
  └─────┴─────┴─────┘
     Your Side
```

### Notches & Energy

- Each card has colored dots showing its **notch directions**
- Notches generate **elemental energy** (Fire or Water)
- When a Fire notch connects to a Water notch, **Mist reaction** activates
- Some cards and spells require specific energy amounts or Mist

### Battle Rules

- All Sieglings attack in **Speed order** (highest first)
- Attackers target the enemy's **Front Row** first, then Middle, then Back
- Damage = Attacker's ATK - Target's DEF (minimum 0)
- Frozen Sieglings skip their turn

### Win Condition

A player loses when they have no Sieglings on the board and no Siegling cards in hand.

## Card Content

### Fire Sieglings (10)
Ember Fox, Blaze Wolf, Inferno Drake, Cinder Imp, Magma Golem, Flame Sprite, Scorch Viper, Pyro Beetle, Ash Phoenix, Molten Crab

### Water Sieglings (10)
Frost Owl, Tide Turtle, Ice Wombat, Coral Seahorse, Mist Fox, Aqua Newt, Glacial Bear, Ripple Frog, Deep Jellyfish, Storm Eel

### Spells (8)
Fire Bolt, Flame Wave, Eruption, Ice Bind, Tidal Pull, Healing Rain, Steam Burst (Mist), Mist Veil (Mist)

### Trainers (4)
Fire Marshal, Flame Tactician, Tide Caller, Frost Sage

## Project Structure

```
sieglings-tcg/
├── pom.xml
├── mvnw / mvnw.cmd              ← Maven Wrapper
├── src/main/java/com/sieglings/
│   ├── SieglingsTcgApplication.java
│   ├── model/
│   │   ├── enums/                ← Element, Row, Phase, CardType, etc.
│   │   ├── Card.java             ← Abstract base card
│   │   ├── SieglingCard.java     ← Creature card with stats & notches
│   │   ├── SpellCard.java        ← Spell with elemental cost
│   │   ├── TrainerCard.java      ← Trainer with passive/active effects
│   │   ├── CardInstance.java     ← Runtime card on board (mutable HP, statuses)
│   │   ├── Ability.java          ← Universal effect definition
│   │   ├── Notch.java            ← Notch direction + element
│   │   ├── Player.java           ← Player state (deck, hand, energy)
│   │   └── GameState.java        ← Complete game state
│   ├── service/
│   │   ├── CardDefinitionService ← All 32 card definitions
│   │   ├── GameService           ← Turn/phase orchestration
│   │   ├── EnergyService         ← Energy & Mist calculation
│   │   ├── PlacementService      ← Legal placement logic
│   │   ├── BattleService         ← Combat resolution
│   │   ├── EffectService         ← Universal effect resolver
│   │   └── AIService             ← Simple AI opponent
│   └── controller/
│       └── GameController        ← REST API + page serving
└── src/main/resources/
    ├── application.properties
    ├── templates/game.html        ← Main game page (Thymeleaf)
    └── static/
        ├── css/style.css          ← Game styling
        └── js/game.js             ← Frontend interaction logic
```

## Architecture Notes

- **No database** — all state is in-memory
- **Single-session** — one game at a time (prototype scope)
- **REST API** — all game actions are POST endpoints returning JSON game state
- **Modular services** — each game system (energy, placement, battle, effects, AI) is a separate Spring service
- **Universal ability system** — all effects (Siegling abilities, spells, trainer actives) use the same `Ability` class with target type + effect type

## Future Expansion

- [ ] Circle mechanic (energy loops for bonus effects)
- [ ] Trap cards
- [ ] Deck builder / card selection screen
- [ ] Multiplayer (WebSocket-based)
- [ ] Additional elements (Earth, Wind, etc.)
- [ ] More complex AI with strategy patterns
- [ ] Persistent game state / save-load
- [ ] Card art and animations
- [ ] Sound effects
- [ ] Mobile-responsive layout
