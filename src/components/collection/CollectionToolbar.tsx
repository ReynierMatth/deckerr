import { Search } from 'lucide-react';

interface CollectionToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

/** Search input filtering the collection (server-side, debounced by the parent). */
export default function CollectionToolbar({ searchQuery, onSearchChange }: CollectionToolbarProps) {
  return (
    <div className="mb-8">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Search your collection by name, type, or text..."
        />
      </div>
    </div>
  );
}
