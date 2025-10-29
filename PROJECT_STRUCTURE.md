# Deckerr

A modern Magic: The Gathering deck builder and collection manager built with React, TypeScript, and Supabase.

## Overview

Deckerr is a web application that allows Magic: The Gathering players to build and manage their decks, track their card collections, search for cards, and use a life counter during games. The application provides a clean, animated interface with user authentication and persistent storage.

## Features

- **Deck Management**: Create, edit, and organize your Magic: The Gathering decks
- **Collection Tracking**: Keep track of your card collection with quantity management
- **Card Search**: Search and browse Magic cards to add to your decks or collection
- **Life Counter**: Track player life totals during games
- **User Profiles**: Personalized user profiles with theme customization
- **Authentication**: Secure user authentication powered by Supabase
- **Format Support**: Support for different Magic formats (Commander, Standard, etc.)

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom animations
- **Backend/Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Icons**: Lucide React
- **Linting**: ESLint with TypeScript support

## Project Structure

```
deckerr/
├── src/
│   ├── components/          # React components
│   │   ├── CardCarousel.tsx    # Card carousel display
│   │   ├── CardSearch.tsx      # Card search interface
│   │   ├── Collection.tsx      # Collection management
│   │   ├── DeckBuilder.tsx     # Deck building interface
│   │   ├── DeckCard.tsx        # Deck card component
│   │   ├── DeckEditor.tsx      # Deck editing interface
│   │   ├── DeckList.tsx        # List of user decks
│   │   ├── DeckManager.tsx     # Deck management
│   │   ├── LifeCounter.tsx     # Game life counter
│   │   ├── LoginForm.tsx       # User authentication form
│   │   ├── MagicCard.tsx       # Magic card display component
│   │   ├── ManaIcons.tsx       # Mana symbol icons
│   │   ├── Navigation.tsx      # App navigation
│   │   └── Profile.tsx         # User profile page
│   │
│   ├── contexts/            # React contexts
│   │   └── AuthContext.tsx     # Authentication context
│   │
│   ├── lib/                 # Library code
│   │   ├── Entities.ts         # Supabase database types
│   │   └── supabase.ts         # Supabase client configuration
│   │
│   ├── services/            # API and service layers
│   │   └── api.ts              # API service functions
│   │
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts            # Shared types
│   │
│   ├── utils/               # Utility functions
│   │   ├── deckValidation.ts   # Deck validation logic
│   │   └── theme.ts            # Theme utilities
│   │
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   ├── main.js              # JavaScript entry
│   ├── index.css            # Global styles
│   └── vite-env.d.ts        # Vite type definitions
│
├── public/                  # Static assets (if any)
│
├── index.html               # HTML entry point
├── package.json             # Project dependencies
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
├── tsconfig.app.json        # App-specific TS config
├── tsconfig.node.json       # Node-specific TS config
├── tailwind.config.js       # Tailwind CSS configuration
├── postcss.config.js        # PostCSS configuration
├── eslint.config.js         # ESLint configuration
├── LICENSE                  # Project license
└── README.md                # This file
```

## Database Schema

The application uses Supabase with the following main tables:

- **profiles**: User profiles with username and theme preferences
- **decks**: User decks with name, format, and timestamps
- **deck_cards**: Cards in decks with quantity and commander status
- **collections**: User card collections with quantities

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or pnpm
- Supabase account and project

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd deckerr
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Set up environment variables:
   Create a `.env` file with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open your browser to `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Features in Detail

### Deck Builder
Build and customize your Magic decks with support for different formats. The deck editor validates your deck composition according to format rules.

### Collection Manager
Track which cards you own and their quantities, making it easy to see what cards you have available when building decks.

### Card Search
Search through Magic cards using various filters and criteria to find exactly what you need for your deck.

### Life Counter
A built-in life counter for tracking player life totals during games, with an animated interface.

## License

See the LICENSE file for details.
