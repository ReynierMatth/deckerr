/*
  # Friends, Trades, and Collection Visibility

  1. Changes to profiles
    - Add `collection_visibility` column (public, friends, private)

  2. New Tables
    - `friendships` - Friend relationships between users
    - `trades` - Trade offers between users
    - `trade_items` - Cards included in trades

  3. Security
    - RLS policies for all new tables
    - Updated collection policies for visibility
*/

-- Add collection visibility to profiles
ALTER TABLE public.profiles
ADD COLUMN collection_visibility text DEFAULT 'private'
CHECK (collection_visibility IN ('public', 'friends', 'private'));

-- =============================================
-- FRIENDSHIPS TABLE
-- =============================================
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  addressee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can see friendships they're involved in
CREATE POLICY "Users can view their friendships"
  ON public.friendships
  FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Users can create friend requests
CREATE POLICY "Users can send friend requests"
  ON public.friendships
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Users can update friendships they received (accept/decline)
CREATE POLICY "Users can respond to friend requests"
  ON public.friendships
  FOR UPDATE
  TO authenticated
  USING (addressee_id = auth.uid());

-- Users can delete their own friendships
CREATE POLICY "Users can delete their friendships"
  ON public.friendships
  FOR DELETE
  TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- =============================================
-- TRADES TABLE
-- =============================================
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (sender_id != receiver_id)
);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Users can see trades they're involved in
CREATE POLICY "Users can view their trades"
  ON public.trades
  FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Users can create trades
CREATE POLICY "Users can create trades"
  ON public.trades
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- Sender can cancel, receiver can accept/decline
CREATE POLICY "Users can update their trades"
  ON public.trades
  FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- =============================================
-- TRADE ITEMS TABLE
-- =============================================
CREATE TABLE public.trade_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid REFERENCES public.trades(id) ON DELETE CASCADE NOT NULL,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  card_id text NOT NULL,
  quantity integer DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.trade_items ENABLE ROW LEVEL SECURITY;

-- Users can see items in their trades
CREATE POLICY "Users can view trade items"
  ON public.trade_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trades
      WHERE trades.id = trade_items.trade_id
      AND (trades.sender_id = auth.uid() OR trades.receiver_id = auth.uid())
    )
  );

-- Users can add items to trades they created
CREATE POLICY "Users can add trade items"
  ON public.trade_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trades
      WHERE trades.id = trade_items.trade_id
      AND trades.sender_id = auth.uid()
      AND trades.status = 'pending'
    )
  );

-- =============================================
-- UPDATE COLLECTION POLICIES FOR VISIBILITY
-- =============================================

-- Drop old restrictive policy
DROP POLICY IF EXISTS "Users can view their own collection" ON public.collections;

-- New policy: view own collection OR public collections OR friend's collections (if friends visibility)
CREATE POLICY "Users can view collections based on visibility"
  ON public.collections
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = collections.user_id
      AND profiles.collection_visibility = 'public'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.friendships f ON (
        (f.requester_id = p.id AND f.addressee_id = auth.uid())
        OR (f.addressee_id = p.id AND f.requester_id = auth.uid())
      )
      WHERE p.id = collections.user_id
      AND p.collection_visibility = 'friends'
      AND f.status = 'accepted'
    )
  );

-- =============================================
-- UPDATE PROFILES POLICY FOR PUBLIC VIEWING
-- =============================================

-- Drop old restrictive policy
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- New policy: users can view all profiles (needed for friend search and public collections)
CREATE POLICY "Users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================
-- FUNCTION: Execute trade (transfer cards)
-- =============================================
CREATE OR REPLACE FUNCTION public.execute_trade(trade_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trade RECORD;
  v_item RECORD;
BEGIN
  -- Get the trade
  SELECT * INTO v_trade FROM public.trades WHERE id = trade_id;

  -- Check trade exists and is pending
  IF v_trade IS NULL OR v_trade.status != 'pending' THEN
    RETURN false;
  END IF;

  -- Check caller is the receiver
  IF v_trade.receiver_id != auth.uid() THEN
    RETURN false;
  END IF;

  -- Process each trade item
  FOR v_item IN SELECT * FROM public.trade_items WHERE trade_items.trade_id = execute_trade.trade_id
  LOOP
    -- Determine new owner
    DECLARE
      v_new_owner uuid;
    BEGIN
      IF v_item.owner_id = v_trade.sender_id THEN
        v_new_owner := v_trade.receiver_id;
      ELSE
        v_new_owner := v_trade.sender_id;
      END IF;

      -- Remove from old owner's collection
      UPDATE public.collections
      SET quantity = quantity - v_item.quantity,
          updated_at = now()
      WHERE user_id = v_item.owner_id
      AND card_id = v_item.card_id;

      -- Delete if quantity is 0 or less
      DELETE FROM public.collections
      WHERE user_id = v_item.owner_id
      AND card_id = v_item.card_id
      AND quantity <= 0;

      -- Add to new owner's collection
      INSERT INTO public.collections (user_id, card_id, quantity)
      VALUES (v_new_owner, v_item.card_id, v_item.quantity)
      ON CONFLICT (user_id, card_id)
      DO UPDATE SET
        quantity = collections.quantity + v_item.quantity,
        updated_at = now();
    END;
  END LOOP;

  -- Mark trade as accepted
  UPDATE public.trades
  SET status = 'accepted', updated_at = now()
  WHERE id = trade_id;

  RETURN true;
END;
$$;

-- Add unique constraint on collections for upsert
ALTER TABLE public.collections
ADD CONSTRAINT collections_user_card_unique UNIQUE (user_id, card_id);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON public.friendships(addressee_id);
CREATE INDEX idx_friendships_status ON public.friendships(status);
CREATE INDEX idx_trades_sender ON public.trades(sender_id);
CREATE INDEX idx_trades_receiver ON public.trades(receiver_id);
CREATE INDEX idx_trades_status ON public.trades(status);
CREATE INDEX idx_trade_items_trade ON public.trade_items(trade_id);
CREATE INDEX idx_profiles_visibility ON public.profiles(collection_visibility);
