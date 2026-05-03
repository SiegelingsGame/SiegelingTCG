/**
 * HTTP headers used by the game API.
 */
export const GameHeaders = {
  roomId: "X-Room-Id",
  playerToken: "X-Player-Token",
  authorization: "Authorization",
} as const;

export function bearerHeader(token: string): string {
  return `Bearer ${token}`;
}
