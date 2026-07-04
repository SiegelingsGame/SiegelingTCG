/**
 * Visual tokens aligned with {@code com.sieglings.model.enums.Element#color()}.
 */
export const ELEMENTS = {
  FIRE: { color: "#ff501e", icon: "🔥", name: "Fire" },
  EARTH: { color: "#b48c50", icon: "🪨", name: "Earth" },
  WIND: { color: "#96ffb4", icon: "🌪", name: "Wind" },
  ICE: { color: "#76e6ff", icon: "❄️", name: "Ice" },
  WATER: { color: "#3296ff", icon: "💧", name: "Water" },
  SHADOW: { color: "#7832b4", icon: "🌑", name: "Shadow" },
  ELECTRIC: { color: "#ffe63c", icon: "⚡", name: "Electric" },
  METAL: { color: "#a0aab4", icon: "⚙️", name: "Metal" },
  UNDEAD: { color: "#8c78a0", icon: "💀", name: "Undead" },
  PSYCHIC: { color: "#c896ff", icon: "🔮", name: "Psychic" },
  POISON: { color: "#78dc50", icon: "☠️", name: "Poison" },
  LIGHT: { color: "#fffac8", icon: "✨", name: "Light" },
  NEUTRAL: { color: "#95a5a6", icon: "◇", name: "Neutral" },
};

export function elKey(element) {
  if (!element) return "NEUTRAL";
  const u = String(element).toUpperCase();
  return ELEMENTS[u] ? u : "NEUTRAL";
}

export function elStyle(element) {
  return ELEMENTS[elKey(element)] || ELEMENTS.NEUTRAL;
}
