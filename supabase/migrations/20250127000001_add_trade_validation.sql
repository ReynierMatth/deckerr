-- Add is_valid column to trades table
ALTER TABLE public.trades
ADD COLUMN IF NOT EXISTS is_valid BOOLEAN DEFAULT true;

-- Create index for filtering by validity
CREATE INDEX IF NOT EXISTS idx_trades_is_valid ON public.trades(is_valid);

-- Function to validate if a trade can still be executed based on current collections
CREATE OR REPLACE FUNCTION public.validate_trade(p_trade_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_collection_quantity integer;
BEGIN
  -- Check each item in the trade
  FOR v_item IN
    SELECT owner_id, card_id, quantity
    FROM public.trade_items
    WHERE trade_id = p_trade_id
  LOOP
    -- Get the quantity of this card in the owner's collection
    SELECT COALESCE(quantity, 0) INTO v_collection_quantity
    FROM public.collections
    WHERE user_id = v_item.owner_id
    AND card_id = v_item.card_id;

    -- If owner doesn't have enough of this card, trade is invalid
    IF v_collection_quantity < v_item.quantity THEN
      RETURN false;
    END IF;
  END LOOP;

  -- All items are available, trade is valid
  RETURN true;
END;
$$;

-- Function to check and update validity of affected trades when collections change
CREATE OR REPLACE FUNCTION public.update_affected_trades_validity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_card_id text;
  v_trade RECORD;
  v_is_valid boolean;
BEGIN
  -- Get the user_id and card_id from the changed row
  IF (TG_OP = 'DELETE') THEN
    v_user_id := OLD.user_id;
    v_card_id := OLD.card_id;
  ELSE
    v_user_id := NEW.user_id;
    v_card_id := NEW.card_id;
  END IF;

  -- Find all pending trades that involve this card from this user
  FOR v_trade IN
    SELECT DISTINCT t.id
    FROM public.trades t
    JOIN public.trade_items ti ON ti.trade_id = t.id
    WHERE t.status = 'pending'
    AND ti.owner_id = v_user_id
    AND ti.card_id = v_card_id
  LOOP
    -- Validate the trade
    v_is_valid := public.validate_trade(v_trade.id);

    -- Update the trade's validity
    UPDATE public.trades
    SET is_valid = v_is_valid,
        updated_at = now()
    WHERE id = v_trade.id;
  END LOOP;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger to auto-update trade validity when collections change
CREATE TRIGGER update_trades_on_collection_change
AFTER UPDATE OR DELETE ON public.collections
FOR EACH ROW
EXECUTE FUNCTION public.update_affected_trades_validity();

-- Add comment
COMMENT ON COLUMN public.trades.is_valid IS 'Indicates if the trade can still be executed based on current collections. Auto-updated when collections change.';

-- Initial validation: set is_valid for all existing pending trades
UPDATE public.trades
SET is_valid = public.validate_trade(id)
WHERE status = 'pending';
