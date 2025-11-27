-- Create trade_history table to track all versions of a trade
CREATE TABLE IF NOT EXISTS public.trade_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid REFERENCES public.trades(id) ON DELETE CASCADE NOT NULL,
  version integer NOT NULL,
  editor_id uuid REFERENCES public.profiles(id) NOT NULL,
  message text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(trade_id, version)
);

-- Create trade_history_items table to store cards for each version
CREATE TABLE IF NOT EXISTS public.trade_history_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  history_id uuid REFERENCES public.trade_history(id) ON DELETE CASCADE NOT NULL,
  owner_id uuid REFERENCES public.profiles(id) NOT NULL,
  card_id text NOT NULL,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Add version column to trades table to track current version
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- Add editor_id to track who last edited the trade
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS editor_id uuid REFERENCES public.profiles(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trade_history_trade_id ON public.trade_history(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_items_history_id ON public.trade_history_items(history_id);

-- Enable RLS
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_history_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for trade_history
CREATE POLICY "Users can view history of their trades"
  ON public.trade_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trades
      WHERE trades.id = trade_history.trade_id
      AND (trades.sender_id = auth.uid() OR trades.receiver_id = auth.uid())
    )
  );

CREATE POLICY "Users can create history for their trades"
  ON public.trade_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trades
      WHERE trades.id = trade_history.trade_id
      AND (trades.sender_id = auth.uid() OR trades.receiver_id = auth.uid())
    )
  );

-- RLS policies for trade_history_items
CREATE POLICY "Users can view history items of their trades"
  ON public.trade_history_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trade_history th
      JOIN public.trades t ON t.id = th.trade_id
      WHERE th.id = trade_history_items.history_id
      AND (t.sender_id = auth.uid() OR t.receiver_id = auth.uid())
    )
  );

CREATE POLICY "Users can create history items for their trades"
  ON public.trade_history_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trade_history th
      JOIN public.trades t ON t.id = th.trade_id
      WHERE th.id = trade_history_items.history_id
      AND (t.sender_id = auth.uid() OR t.receiver_id = auth.uid())
    )
  );
