# Saudi Konkan Score Calculator (حاسبة لعبة الكونكان السعودية)

## Overview
Mobile-first Expo (React Native) app for tracking scores in the Saudi Konkan card game. Fully Arabic RTL, supports 4–8 players, persistent local storage, and light/dark themes.

## Core Features
- **Setup Screen**: Dynamic 4–8 players, threshold selector (700 or 1000), Start Game.
- **Scoreboard**: Player cards with totals, leader (gold + trophy) and loser (red + warning) highlights.
- **Score Entry Modal**: Quick chips [-30, -60, 25, 100, 125, 200] plus custom numeric input (supports negatives). Draft pill preview per player before submitting.
- **Round History**: Reverse-chronological log with horizontally scrollable per-player scores.
- **Undo Last Round** and **Reset Game** (with confirmation).
- **Theme toggle**: Light/Dark, persisted.
- **Local Persistence**: Full game state persisted via `@/src/utils/storage` (AsyncStorage / localStorage on web).
- **Game Over**: When any player ≥ threshold, submit is locked and a winner badge is shown.

## Tech Stack
- Expo Router 6 (SDK 54), React Native 0.81, TypeScript
- `expo-haptics` for tactile feedback
- `@expo/vector-icons` (Ionicons)
- Local storage via bundled `@/src/utils/storage`
- No backend / no 3rd-party integrations

## Architecture
- Single-file screen at `/app/frontend/app/index.tsx` (state machine: setup ↔ scoreboard).
- All state kept as: `{ players[], rounds[], threshold, started }`. Round = `{ id, scores: { playerId: number } }`.
- Totals & leader/loser derived via `useMemo`.
- Palettes (Deep Emerald / Gold for dark, Swiss high-contrast for light) inline for zero-config theming.

## Testing
- Verified end-to-end by testing agent (14/14 features pass), including persistence across reload and Game Over detection.

## Business Enhancement Idea
Add a **shareable end-of-game recap card** (PNG snapshot of the scoreboard + winner) via `react-native-view-shot` + native share sheet to drive organic invites from card-night groups on WhatsApp.
