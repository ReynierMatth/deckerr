-- Add price_usd column to collections table
ALTER TABLE collections
ADD COLUMN IF NOT EXISTS price_usd DECIMAL(10, 2) DEFAULT 0;

-- Create index for faster price calculations
CREATE INDEX IF NOT EXISTS idx_collections_price ON collections(price_usd);

-- Add comment
COMMENT ON COLUMN collections.price_usd IS 'USD price of the card at time of addition/update';
