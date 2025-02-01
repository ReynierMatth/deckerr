/*
  # Initial Schema Setup

  1. New Tables
    - `profiles`
      - `id` (uuid, references auth.users)
      - `username` (text, unique)
      - `theme_color` (text, enum)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `collections`
      - `id` (uuid)
      - `user_id` (uuid, references profiles)
      - `card_id` (text)
      - `quantity` (integer)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `decks`
      - `id` (uuid)
      - `user_id` (uuid, references profiles)
      - `name` (text)
      - `format` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `deck_cards`
      - `id` (uuid)
      - `deck_id` (uuid, references decks)
      - `card_id` (text)
      - `quantity` (integer)
      - `is_commander` (boolean)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users,
  username text UNIQUE,
  theme_color text CHECK (theme_color IN ('red', 'green', 'blue', 'yellow', 'grey', 'purple')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create collections table
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  card_id text NOT NULL,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create decks table
CREATE TABLE public.decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  name text NOT NULL,
  format text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create deck_cards table
CREATE TABLE public.deck_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid REFERENCES public.decks(id) NOT NULL,
  card_id text NOT NULL,
  quantity integer DEFAULT 1,
  is_commander boolean DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Collections policies
CREATE POLICY "Users can view their own collection"
  ON public.collections
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own collection"
  ON public.collections
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Decks policies
CREATE POLICY "Users can view their own decks"
  ON public.decks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own decks"
  ON public.decks
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Deck cards policies
CREATE POLICY "Users can view cards in their decks"
  ON public.deck_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
      AND decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage cards in their decks"
  ON public.deck_cards
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_cards.deck_id
      AND decks.user_id = auth.uid()
    )
  );
