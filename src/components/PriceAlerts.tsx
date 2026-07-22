import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Loader2, Trash2 } from 'lucide-react';
import { getPriceAlerts, removePriceAlert, PriceAlert } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const formatLastTriggered = (value: string | null): string => {
  if (!value) return 'Not triggered yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not triggered yet';
  return `Last triggered ${date.toLocaleDateString()}`;
};

export default function PriceAlerts() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery<PriceAlert[]>({
    queryKey: ['priceAlerts', user?.id],
    enabled: !!user,
    queryFn: () => getPriceAlerts(user!.id),
  });

  const handleRemove = async (id: string) => {
    try {
      await removePriceAlert(id);
      await queryClient.invalidateQueries({ queryKey: ['priceAlerts'] });
      toast.success('Alert removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove alert');
    }
  };

  return (
    <div className="relative bg-gray-900 text-white p-3 sm:p-6 md:min-h-screen">
      <div className="max-w-3xl mx-auto">
        <h1 className="flex items-center gap-2 text-2xl md:text-3xl font-bold mb-4 md:mb-6">
          <Bell size={26} />
          Price Alerts ({alerts.length})
        </h1>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Bell size={40} className="mx-auto mb-3 text-gray-600" />
            <p className="text-lg mb-2">No price alerts yet</p>
            <p className="text-sm">
              Open a card&apos;s details and set an alert to get notified when its price moves.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between gap-3 bg-gray-800 rounded-lg p-4 shadow"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">
                    {alert.card_name ?? 'Unknown card'}
                  </p>
                  <p className="text-sm text-gray-300">
                    when price is {alert.direction} ${alert.target_price.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatLastTriggered(alert.last_triggered_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(alert.id)}
                  aria-label="Delete alert"
                  className="shrink-0 text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
