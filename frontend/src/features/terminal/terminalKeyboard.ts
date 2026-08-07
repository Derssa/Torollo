/**
 * Returns whether xterm should process a key event itself.
 *
 * Browser-owned paste shortcuts must bypass xterm's key mapping so the browser
 * can dispatch a `paste` event with clipboard data to xterm's hidden textarea.
 * xterm already turns that event into terminal input, including newline and
 * bracketed-paste handling.
 */
export function shouldProcessKeyInTerminal(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown' || event.altKey) {
    return true;
  }

  const modifierPaste =
    (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v';
  const insertPaste = event.shiftKey && event.key === 'Insert';

  return !modifierPaste && !insertPaste;
}
