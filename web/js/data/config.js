// Booth configuration built into the apps.

/**
 * Address of the game server (the admin dashboard, see server/). The apps download the game
 * settings from it and the Windows game sends the scores to it. Without a connection they play with
 * the last settings they received (or the defaults in game/settings.js). The operator can type
 * another address in the operator panel (hold the logo).
 */
export const DEFAULT_SERVER_URL = 'https://zgp.game.aliizz.ir';

/** Seconds the result stays on the Windows game before it returns to the sign-in screen. */
export const KIOSK_RESULT_SECONDS = 15;
