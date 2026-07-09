import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommandSearch } from './useCommandSearch';
import commandsData from '../data/linuxCommands.json';

describe('useCommandSearch', () => {
  it('returns the full command list when no query or category is set', () => {
    const { result } = renderHook(() => useCommandSearch());
    expect(result.current.filteredCommands).toHaveLength(commandsData.length);
  });

  it('exposes deduplicated categories derived from the raw command data', () => {
    const { result } = renderHook(() => useCommandSearch());
    const expected = Array.from(new Set(commandsData.map(c => c.category)));
    expect(result.current.categories.sort()).toEqual(expected.sort());
  });

  it('filters to only the selected category', () => {
    const { result } = renderHook(() => useCommandSearch());
    const [category] = result.current.categories;

    act(() => {
      result.current.setSelectedCategory(category);
    });

    expect(result.current.filteredCommands.length).toBeGreaterThan(0);
    expect(result.current.filteredCommands.every(c => c.category === category)).toBe(true);
  });

  it('matches a query against the command name', () => {
    const { result } = renderHook(() => useCommandSearch());

    act(() => {
      result.current.setSearchQuery('ls');
    });

    expect(result.current.filteredCommands.some(c => c.name === 'ls')).toBe(true);
  });

  it('matches a query against keywords even when name/description do not contain it', () => {
    const { result } = renderHook(() => useCommandSearch());
    // Find a keyword-only match: present in the command's keywords but absent from its name/description.
    let keywordOnlyMatch: { name: string; keyword: string } | undefined;
    for (const cmd of commandsData) {
      const nameLower = cmd.name.toLowerCase();
      const descLower = cmd.description.toLowerCase();
      const keyword = cmd.keywords.find(k => {
        const kLower = k.toLowerCase();
        return !nameLower.includes(kLower) && !descLower.includes(kLower);
      });
      if (keyword) {
        keywordOnlyMatch = { name: cmd.name, keyword };
        break;
      }
    }
    expect(keywordOnlyMatch).toBeDefined();

    act(() => {
      result.current.setSearchQuery(keywordOnlyMatch!.keyword);
    });

    expect(result.current.filteredCommands.some(c => c.name === keywordOnlyMatch!.name)).toBe(true);
  });

  it('requires every space-separated term to match (AND semantics)', () => {
    const { result } = renderHook(() => useCommandSearch());

    act(() => {
      result.current.setSearchQuery('zzznomatch anothernomatch');
    });

    expect(result.current.filteredCommands).toHaveLength(0);
  });

  it('combines category and query filters', () => {
    const { result } = renderHook(() => useCommandSearch());
    const [category] = result.current.categories;
    const commandInCategory = commandsData.find(c => c.category === category)!;

    act(() => {
      result.current.setSelectedCategory(category);
      result.current.setSearchQuery(commandInCategory.name);
    });

    expect(result.current.filteredCommands).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: commandInCategory.name })])
    );
    expect(result.current.filteredCommands.every(c => c.category === category)).toBe(true);
  });
});
