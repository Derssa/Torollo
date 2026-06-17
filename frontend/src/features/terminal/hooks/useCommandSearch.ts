import { useState, useMemo } from 'react';
import commandsData from '../data/linuxCommands.json';

export interface LinuxCommand {
  name: string;
  category: string;
  description: string;
  example: string;
  keywords: string[];
}

export function useCommandSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const allCategories = commandsData.map(c => c.category);
    return Array.from(new Set(allCategories));
  }, []);

  const filteredCommands = useMemo(() => {
    let list = commandsData as LinuxCommand[];

    if (selectedCategory) {
      list = list.filter(c => c.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);

      list = list.filter(cmd => {
        const name = cmd.name.toLowerCase();
        const description = cmd.description.toLowerCase();
        const keywords = cmd.keywords.map(k => k.toLowerCase());

        // Check if every search term matches at least one field (name, desc, or keywords)
        return terms.every(term => 
          name.includes(term) ||
          description.includes(term) ||
          keywords.some(k => k.includes(term))
        );
      });
    }

    return list;
  }, [searchQuery, selectedCategory]);

  return {
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    categories,
    filteredCommands,
  };
}
