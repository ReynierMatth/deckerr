import { Globe, Users, ArrowLeftRight, Sparkles } from 'lucide-react';

export type CommunityTab = 'browse' | 'friends' | 'trades' | 'suggestions';

interface CommunityTabBarProps {
  activeTab: CommunityTab;
  onTabChange: (tab: CommunityTab) => void;
  friendsCount: number;
  pendingTradesCount: number;
}

/** Horizontal tab bar with live count badges for Friends and Trades. */
export default function CommunityTabBar({
  activeTab,
  onTabChange,
  friendsCount,
  pendingTradesCount,
}: CommunityTabBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-4 md:mb-6">
      {[
        { id: 'browse' as CommunityTab, label: 'Browse', icon: Globe },
        { id: 'friends' as CommunityTab, label: `Friends`, count: friendsCount, icon: Users },
        { id: 'trades' as CommunityTab, label: `Trades`, count: pendingTradesCount, icon: ArrowLeftRight },
        { id: 'suggestions' as CommunityTab, label: 'Suggestions', icon: Sparkles },
      ].map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition flex-shrink-0 ${
            activeTab === tab.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-300 active:bg-gray-700'
          }`}
        >
          <tab.icon size={16} />
          <span>{tab.label}</span>
          {tab.count !== undefined && tab.count > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? 'bg-blue-500' : 'bg-gray-700'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
