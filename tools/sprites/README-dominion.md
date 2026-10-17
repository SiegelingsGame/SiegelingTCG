# Dominion player knight sprite sheets

`slice-knight-sheets.py` extracts the owner's ten supplied JPEG sheets into transparent six-frame WebP strips for Dominion. It preserves the supplied character artwork, removes panel backgrounds, labels and borders, and aligns each knight's idle/walk frames to the same 256 x 384 cell and foot baseline. The standard picker order comes from the game's element filters; it is independent of attachment numbering.

Run with Python, Pillow and NumPy:

```text
python tools/sprites/slice-knight-sheets.py ATTACHMENT_DIR src/main/resources/static/img/dominion/knights/sprites QA_DIR
```

The input directory contains `1-Photo-1.jpg` through `10-Photo-10.jpg`. Their mapping is Fire, Metal, Ice, Psychic, Shadow, Light, Wind, Earth, Water, Electric. The generated manifest records this mapping and frame size.

Electric's idle weapon overlaps the neighboring column; constrained seams follow the gap around it. Its final idle cell has a weapon clipped by the source sheet's right edge, and Wind's first idle cell runs into its title. Those two slots repeat intact poses from the same supplied sheet rather than inventing missing artwork. `idleSourceFrames` records the zero-based source frame for each output slot. Optional element names after `QA_DIR` limit extraction during asset review; regenerate the full set to restore the complete manifest.

The client leaves painted choices visible until their strip decodes. Selected choices fade into idle pixel art, while journeys use walking strips. Reduced-motion preferences hold the first frame.
