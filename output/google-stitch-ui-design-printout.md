# Sieglings UI Design Printout for Google Stitch

## Goal
Design a polished, responsive UI for **Sieglings**, a browser-based tactical elemental card game. The redesign should preserve the current gameplay structure, information hierarchy, and core interaction flow, but elevate the visual language into something that feels premium, modern, readable, and intentionally game-first.

This is a **UI/UX design brief**, not a rules redesign.

## Product Summary
Sieglings is a **board-first tactical card battler**. Players place creature cards called **Sieglings** onto a mirrored battlefield, connect directional notches to grow an elemental network, generate energy from those links and edge sockets, spend that energy during setup, and then transition into battle where units act in speed order.

The game currently supports:
- Solo vs AI
- Online room-based matches
- Preset decks
- Deck builder
- Saved decks tied to account login
- A selectable commander-style unit called a **SiegeKnight**
- Spells
- Traps
- Battle abilities
- Mulligan flow

## Core Game Loop
1. Welcome and onboarding
2. Choose match mode and loadout
3. Pick preset deck or build custom deck
4. Pick a SiegeKnight
5. Start match
6. Mulligan opening hand
7. Play on a mirrored 3x3 vs 3x3 tactical board
8. Move through phases like `DRAW`, `SETUP`, `BATTLE`, and `END TURN`
9. Use bottom hand tray and action bar to play cards, inspect cards, use trainer abilities, and open drawers

## What Must Be Designed

### 1. Welcome / Onboarding Screen
The first screen should feel like entering a competitive elemental arena.

Include:
- Strong hero statement
- Short explanation of the game
- Tutorial carousel or card-based walkthrough
- Sign-in / guest entry area
- Space for player history or account summary
- Clear primary CTA to start playing immediately as guest

Tone:
- Confident
- Tactical
- Arcane-tech fantasy
- Not childish
- Not generic mobile-casino

### 2. Loadout Screen
This is the main pre-match hub.

Include:
- Player display-name field
- `Solo Vs AI` and `Online Match` mode tabs
- For online mode: host room / join room state
- Deck selection area with strong deck tiles
- Deck builder tab
- SiegeKnight selection area
- Saved decks area for signed-in users
- Clear summary of current selection
- Large primary `Start Match` CTA

Important:
- This screen should feel like a command room or war table
- Decks should read as collectible, factional, and elemental
- The deck builder should feel more like a polished strategy tool than a spreadsheet

### 3. Mulligan Overlay
Include:
- Opening hand preview
- Clear explanation that each player gets one redraw opportunity
- `Keep Hand` and `Redraw Selected` actions

### 4. Main Match Screen
This is the most important screen and should feel dramatically better than the current prototype.

Required structure:
- A slim top status bar
- Central battlefield as the focal point
- Enemy board on top half
- Player board on bottom half
- Mirrored **3x3 grid** for each side
- Perimeter socket markers around the board
- Row labels such as `Front`, `Middle`, `Back`
- Action bar between battlefield and hand
- Bottom hand tray with fanned cards
- Support for drawers / panels / overlays

Top bar content:
- Enemy name
- Enemy HP
- Enemy hand size and deck size
- Enemy compact energy display
- Current phase badge
- Turn number
- Player compact energy display
- Player deck count
- Player HP
- Player name

Action bar content:
- `Draw`
- `Battle` or `Act Now`
- `SiegeKnight`
- `End Turn`
- Small circular icon buttons for selected card, battle queue, game log, element key, new game

Bottom hand tray:
- Fanned overlapping cards
- Cards should be legible at a glance without opening them
- Hover, tap, and selected states should feel satisfying and premium

Overlays and drawers:
- Selected card view
- Battle queue panel
- Game log panel
- Element key panel
- Full card inspector
- SiegeKnight ability modal
- Game over overlay

### 5. Online Match and Room States
Design for:
- Hosting a room
- Joining by room code
- Waiting state before match begins
- Invite / room badge styling

## Gameplay Concepts the UI Must Support
- Board placement matters
- Notch connections matter
- Elemental energy generation matters
- Edge sockets matter
- Spells, traps, and unit abilities all need distinct visual treatment
- Battle order is driven by speed
- During battle, one unit may become the active acting unit
- Some actions require choosing a target
- Passing a battle action is allowed

The UI should make these concepts readable without overwhelming the player.

## Non-Negotiable Layout Rules
- The match should remain a **single-screen experience** on desktop
- The battlefield should be the visual focal point
- The hand should remain docked at the bottom
- The player should never lose track of phase, HP, turn, or available actions
- The design must work on both desktop and mobile
- Mobile should rely heavily on bottom sheets, drawers, and stacked panels rather than tiny sidebars
- Keep the board mirrored and symmetrical
- Keep the battlefield readable even before card art is fully finished

## Visual Direction
Create a visual system that feels like:
- Competitive strategy card game
- Elemental arena combat
- Premium but readable
- Slightly mystical, slightly tactical, slightly sci-fi

Avoid:
- Flat enterprise dashboard styling
- Generic fantasy parchment UI
- Overly cartoonish mobile game tropes
- Neon overload
- Tiny unreadable detail

Desired look:
- Dark navy / charcoal base
- Gold or warm yellow as the phase / highlight accent
- Strong elemental accent colors
- Atmospheric gradients and subtle energy glows across the board
- Clean, sharp card frames
- Clear hierarchy between board cards, hand cards, and modal cards
- Strong contrast and accessible readability

Suggested palette:
- Background: `#1a1c2c`
- Surface: `#16213e`
- Surface alt: `#27406d`
- Accent gold: `#ffd700`
- Fire: `#ff501e`
- Water: `#3296ff`
- Earth: `#b48c50`
- Wind: `#96ffb4`
- Ice: `#76e6ff`
- Shadow: `#7832b4`
- Electric: `#ffe63c`

## Typography Direction
- Use a bold, modern display face for headings and phase labels
- Use a clean, readable sans serif for game information
- Avoid default system-app blandness
- Keep numbers, stats, and phase indicators extremely legible

## Card Design Direction
Cards should have three main display levels:

### Hand Card
- Compact
- Readable name
- Element and type signal
- Small but meaningful stat treatment
- Enough visual identity to distinguish Siegling vs Spell vs Trap

### Board Card
- Larger stat readability
- Visible active / exhausted / acting / targeted states
- Notch indicators should be easy to parse
- Health and speed should be readable quickly

### Inspector / Modal Card
- Full lore-free gameplay detail
- Ability text
- Trigger text for traps
- Elemental requirements
- Battle ability costs

## Interaction Style
- Responsive, tactile, and slightly dramatic
- Hover states should lift, glow, or focus cards
- Selected states should feel locked in and intentional
- Current acting unit during battle should be unmistakable
- Targetable objects should be highlighted clearly
- Drawers should slide smoothly from the bottom on mobile and optionally become anchored panels on larger screens

## Component Inventory
Design a reusable UI kit that covers:
- Top status bar
- Phase badge
- HP pill
- Energy token cluster
- Deck tile
- SiegeKnight tile
- Board slot
- Socket node
- Card frame
- Card stat pill
- Action bar button
- Icon button
- Drawer
- Modal
- Tooltip
- Battle queue row
- Log row
- Filter chip
- Builder card list row
- Saved deck row

## Screen-by-Screen Priority
If Stitch needs to prioritize, focus in this order:
1. Main match screen
2. Loadout screen
3. Welcome screen
4. Card inspector and drawers
5. Mulligan and online room states

## Explicit Design Request
Please redesign this as a **cohesive responsive game UI system**, not as disconnected pages. The result should feel like one product with a strong visual identity.

Keep the following product truths:
- It is a web game, not a native app mockup
- It is tactical and board-centric
- It has collectible deck identity
- It needs to support both quick scanning and deeper card inspection

## Paste-Ready Prompt for Google Stitch
```text
Design a polished responsive web UI for a game called Sieglings, a tactical elemental card battler. This is a board-first card game where players place creature cards called Sieglings onto a mirrored battlefield, connect directional notches to grow an elemental network, generate elemental energy from those links and edge sockets, spend energy during setup on spells, traps, and SiegeKnight abilities, and then enter battle where units act in speed order.

I need a cohesive UI system, not a generic app layout. The design should feel premium, competitive, readable, and game-first. The visual tone should blend dark tactical strategy, arcane elemental energy, and subtle sci-fi polish. Avoid childish fantasy, flat enterprise dashboard styling, and generic mobile game UI tropes.

Design these screens and states:
1. Welcome / onboarding screen with a bold hero, short game explanation, tutorial carousel, sign-in / guest entry, and player history area.
2. Loadout screen with player name entry, Solo Vs AI and Online Match tabs, host/join room state for online play, preset deck selection, deck builder tab, SiegeKnight selection, saved decks area, current selection summary, and a strong Start Match call to action.
3. Mulligan overlay showing the opening hand with Keep Hand and Redraw Selected actions.
4. Main match screen with a slim top status bar, enemy board on top, player board on bottom, mirrored 3x3 grids for both sides, perimeter socket markers around the battlefield, row labels for Front, Middle, and Back, a compact action bar between battlefield and hand, and a bottom hand tray with fanned overlapping cards.
5. Overlay and panel states for selected card, battle queue, game log, element key, full card inspector, SiegeKnight ability modal, and game over.
6. Online room states for hosting, joining by room code, waiting, and invite badges.

Main match layout rules:
- Keep the match as a single-screen experience on desktop.
- Keep the battlefield as the focal point.
- Keep the hand docked at the bottom.
- Keep enemy and player status visible at all times.
- Use mobile-friendly bottom sheets and drawers instead of tiny sidebars.
- Preserve a mirrored symmetrical battlefield.

Top bar should include:
- Enemy name, HP, hand size, deck size, energy
- Current phase badge
- Turn number
- Player energy, deck count, HP, player name

Action bar should include:
- Draw
- Battle or Act Now
- SiegeKnight
- End Turn
- Small circular utility buttons for selected card, battle queue, game log, element key, and new game

Cards need three visual modes:
- Compact hand card
- Board card with strong stat readability and clear active / targeted / acting states
- Full inspector card with ability, trigger, and cost detail

The interface must clearly support:
- Board placement
- Notch connections
- Elemental energy generation
- Edge sockets
- Spells
- Traps
- Battle abilities
- Target selection
- Passing a battle action

Suggested palette:
- Background #1a1c2c
- Surface #16213e
- Surface alt #27406d
- Accent gold #ffd700
- Fire #ff501e
- Water #3296ff
- Earth #b48c50
- Wind #96ffb4
- Ice #76e6ff
- Shadow #7832b4
- Electric #ffe63c

Typography should feel sharp, premium, and readable. Use a bold modern display style for headings and phase labels, and a clean sans serif for gameplay text.

Please produce a cohesive desktop and mobile design direction that feels like a real shippable strategy card game UI.
```

## Notes for Implementation
- The current game already uses a top bar, battlefield, action bar, hand tray, drawers, and overlays. Preserve that information architecture while improving clarity and visual polish.
- The current game also includes preset decks, a deck builder, SiegeKnight selection, guest play, sign-in, online room flow, and saved decks. The redesign should account for all of them.
- Card art may be incomplete, so the design should still look strong when using placeholder art or iconography.
