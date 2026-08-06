import { describe, expect, it } from 'vitest';
import { shouldProcessKeyInTerminal } from './terminalKeyboard';

function keydown(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...modifiers });
}

describe('shouldProcessKeyInTerminal', () => {
  it.each([
    ['Ctrl+V', keydown('v', { ctrlKey: true })],
    ['Ctrl+Shift+V', keydown('V', { ctrlKey: true, shiftKey: true })],
    ['Cmd+V', keydown('v', { metaKey: true })],
    ['Shift+Insert', keydown('Insert', { shiftKey: true })],
  ])('leaves %s to the browser clipboard handler', (_shortcut, event) => {
    expect(shouldProcessKeyInTerminal(event)).toBe(false);
  });

  it.each([
    ['ordinary input', keydown('v')],
    ['terminal interrupt', keydown('c', { ctrlKey: true })],
    ['Alt-modified input', keydown('v', { ctrlKey: true, altKey: true })],
    ['paste shortcut keyup', new KeyboardEvent('keyup', { key: 'v', ctrlKey: true })],
  ])('keeps processing %s in xterm', (_case, event) => {
    expect(shouldProcessKeyInTerminal(event)).toBe(true);
  });
});
