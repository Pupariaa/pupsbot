# Pupsbot

Pupsbot is an osu! recommendation bot designed to help players find fresh, high-quality beatmaps that match their current skill level. It uses a hybrid approach: analyzing your own profile while drawing from the top performances of similar players. The bot operates entirely over osu!'s private messaging system (PM), not through Discord or other instantaned messageries.

---
You can join the Discord server to stay informed about future updates, give feedback, or report bugs.

<p align="center">
  <a href="https://discord.gg/bJQVPzy2u6">
    <img src="https://techalchemy.fr/bannerdiscord.png" alt="Join our Discord">
  </a>
</p>

---
<p align="center">
  <img src="https://techalchemy.fr/pupsbot/pngStats/status.php" alt="Pupsbot Live Stats">
</p>
<p align="center">
<a href="https://techalchemy.fr/pupsbot/pngStats/stats.html">Go to Live statistics</a>
</p>

## Overview

Unlike other bots that simply suggest popular or high-pp maps, Pupsbot uses real player data to make targeted suggestions. The goal is to help you **farm pp efficiently** by finding beatmaps:

- Played recently by players close to your skill level
- Not in your own top 200
- That you haven’t played recently

This approach helps avoid repetitive suggestions and gives you fresh maps that are **likely to be within your reach**, but still provide meaningful pp.

The bot uses **multiple algorithms** to calculate optimal PP ranges, with an intelligent fallback system that ensures you always get a suggestion. It analyzes your playstyle preferences (mods, map duration, AR) to prioritize maps that match your gaming habits.

---

## Latest Updates (v2.3.2)

### What's New
- **Better Suggestions**: Improved algorithm for finding beatmaps you haven't played yet
- **Faster Performance**: Optimized system for quicker response times
- **More Reliable**: Enhanced error handling and connection stability
- **Smarter Selection**: Better variety in beatmap recommendations

---

## How It Works

1. **You send a private message on osu! to the bot account `Pupsbot`.**
2. Pupsbot uses the osu! API v2 to fetch your profile and top scores.
3. It identifies a pool of other users with similar total pp and recent trends.
4. From their top scores, it builds a pool of candidate beatmaps.
5. The bot applies multiple PP range calculation algorithms:
   - **Conservative**: Safe, achievable targets
   - **Balanced**: Moderate difficulty increase
   - **Aggressive**: Challenging but attainable goals
   - **Base**: Original algorithm
   - **Dynamic**: Adapts based on user progression
6. It filters out:
   - Maps that are in your own top 200
   - Maps you've played recently (based on stored play history)
   - Maps that don't match your requested filters (if any)
7. The system uses a **3-tier fallback mechanism**:
   - **Tier 1**: Strict criteria for optimal matches
   - **Tier 2**: Relaxed criteria if no perfect matches found
   - **Tier 3**: Accept any valid suggestion to ensure you get a map
8. Results are **prioritized based on your preferences** (mods, duration, AR) and returned as optimized suggestions.

---

## How to Use

To interact with Pupsbot, send a private message on osu! to the account **Pupsbot** (formerly known as Puparia). The bot has migrated to its own dedicated account, though services remain active on Puparia for now.

### Core Command

This will return a recommended map based on your current skill level and recent top plays of players similar to you. The map will not be in your own top 100 and not something you’ve played recently.

---

### Mod Filters

Pupsbot supports 4 syntaxes for controlling which mods are used in the recommendation:

<div align="center">

| Syntax            | Description                                                                 |
|-------------------|-----------------------------------------------------------------------------|
| `!o`             | Returns any map, with any mod combination                                    |
| `!o NM`          | Forces the recommendation to be a **No Mod** map                            |
| `!o <mods>`      | Forces the recommendation to match **only** those mods (e.g. `!o HDHR`)    |
| `!o + <mods>`    | Recommends a map that **includes** the mods you wrote, but allows more mods |

</div>

---

### Advanced Filters

Pupsbot supports additional filtering parameters to fine-tune your recommendations:

<div align="center">

| Parameter | Description | Example |
|-----------|-------------|---------|
| `pp:XXX` | Filter maps that give approximately XXX pp (progressive tolerance: starts exact, expands up to ±25 pp if needed) | `!o HD pp:200` |
| `bpm:XXX` | Filter maps with approximately XXX BPM (±10 BPM tolerance) | `!o DT bpm:180` |

</div>

**Examples:**
- `!o HD pp:150` - Hidden maps that give around 150pp
- `!o DT bpm:160` - DoubleTime maps with around 160 BPM
- `!o HR pp:200 bpm:180` - HardRock maps giving ~200pp with ~180 BPM

**Note:** The `pp:` parameter overrides the automatic target PP calculation, allowing you to search for specific PP ranges.

---

## Other Commands

### `!release`

Displays information about the latest Pupsbot updates and changes.

### `!info`

Gives general information about how the bot works and how suggestions are built.

### `!mods`  

Requires a `/np` in the previous message. It analyzes the current map and shows how much pp you would gain with different mod combinations.

### `!help`

Shows a short guide of all available commands and how to use them.

### `!support`

Returns the link to support the project and help cover server and maintenance costs.

### `!fb`

Send your feedback !

### `!teams`

Join the official **Pupsbot** team.

### `!version`

Get the current version of **Pupsbot**

---

## Pupsbot Website

Pupsbot offers a modern web interface that allows you to manage your preferences and customize your bot experience beyond the basic commands.

### Access the Website

Visit **[https://pb.pupsweb.cc/](https://pb.pupsweb.cc/)** to access the Pupsbot web interface.

### What You Can Do

#### **User Preferences Management**
- **Mod Preferences**: Set your preferred mods (HD, HR, DT, NC, EZ) that will be automatically applied to suggestions
- **Algorithm Selection**: Choose between Conservative, Balanced, Aggressive, Base, or Dynamic algorithms for PP calculation
- **PP Range**: Set a specific PP target that will override automatic calculations
- **BPM Preferences**: Configure preferred BPM ranges for beatmap suggestions
- **Auto Mode Toggle**: Enable/disable automatic application of your stored preferences vs command parameters

#### **Advanced Filtering**
- **Mapper Ban List**: Block specific mappers from appearing in your suggestions
- **Title Ban List**: Exclude beatmaps with certain keywords in their titles
- **Mod Combination Control**: Choose whether to allow additional mods beyond your specified preferences

#### **Dashboard Features**
- **Suggestion History**: View your recent beatmap recommendations with detailed information
- **Statistics Tracking**: Monitor your bot usage and suggestion patterns
- **Real-time Status**: Check bot availability and connection status
- **Profile Integration**: Secure OAuth2 login with your osu! account

### Benefits of Using the Website

1. **Persistent Settings**: Your preferences are saved permanently, so you don't need to specify them in every command
2. **Advanced Control**: Access features not available through PM commands, like mapper/title bans
3. **Visual Interface**: Easy-to-use forms and toggles instead of remembering command syntax
4. **History Tracking**: Review your suggestion patterns and bot usage over time
5. **Algorithm Fine-tuning**: Choose the exact PP calculation method that works best for your playstyle

### How It Works

When you use the website to set preferences, they are stored in the bot's database and automatically applied to your `!o` commands. You can still override these preferences by specifying parameters in your commands (e.g., `!o HD pp:200` will temporarily override your stored preferences).

The website uses the same secure OAuth2 authentication as osu!, ensuring your account information remains protected while providing seamless integration with your osu! profile.

---

## Pupsweb Tech Stack

### Frontend
- **Next.js 15.6.0** - React framework with App Router
- **React 19.1.0** - UI library with latest features
- **Tailwind CSS 4** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives
- **Lucide React** - Modern icon library

### Backend
- **Node.js** - JavaScript runtime
- **Next.js API Routes** - Serverless API endpoints
- **Custom Server** - Express-like server for advanced functionality

### Database & Caching
- **MySQL 2** - Primary database for user data and suggestions
- **Redis** - Caching layer for performance optimization
- **Connection Pooling** - Efficient database connection management

### Authentication
- **OAuth2** - osu! API integration for user authentication
- **Session Management** - Secure client-side session handling
- **Cookie-based Auth** - Server-side session verification

## Pupsbot Technical Stack

- **API:** Uses osu! API v2 with Redis caching and rate limiting
- **IRC:** Powered by `irc-framework` to listen and respond to private messages
- **Database:** Uses Sequelize with MySQL/MariaDB
- **Cache:** Redis is used to reduce latency and speed up match-making
- **Queue:** A controlled queue handles up to 8 simultaneous user requests
- **Rate Limiting:** User-specific rate limiting (2 req/s) and API rate limiting
- **Algorithms:** Multiple PP range calculation algorithms with fallback system
- **User Preferences:** Analyzes user's mod preferences and map characteristics
- **Logging:** Enhanced logging with rotation, colored output, and error tracking

---

# Algorithms

This folder contains different algorithms to compute PP (Performance Points) ranges for osu! players. Each algorithm uses a different mathematical approach based on available top scores and progression data.

## Available Algorithms

### Base (Default)
**Mathematical Approach:** Logarithmic scaling with recent performance analysis
- **Base Range:** `max(60, min(600, log10(userPP + 1) * 45))`
- **Recent Analysis:** 30-day window
- **Expected Performance:** `userPP * 0.06`
- **Adjustment Logic:**
  - If recent/expected > 1.05: +55% of base range
  - If recent/expected < 0.95: -35% of base range
- **Progression Factor:** ±30% of base range based on global_score
- **Best for:** Players with consistent recent activity

### Conservative
**Mathematical Approach:** Quartile-based statistical analysis
- **Base Range:** `max(40, min(300, userPP * 0.2 + IQR * 0.5))`
- **Statistical Method:** Uses Q1, Q3, and IQR (Interquartile Range)
- **Adjustment:** ±20% of base range based on progression
- **Range Size:** 25% of user PP (smallest ranges)
- **Best for:** Stable predictions, risk-averse calculations

### Aggressive
**Mathematical Approach:** Top performance momentum analysis
- **Base Range:** `max(80, min(600, userPP * 0.4))`
- **Focus:** Top 3 scores and 30-day momentum
- **Momentum Logic:**
  - If recent/top3 > 1.2: +60% of base range
  - If recent/top3 < 0.8: -50% of base range
- **Range Size:** 40% of user PP (largest ranges)
- **Best for:** Detecting high potential gains, active players

### Balanced
**Mathematical Approach:** Top 10 analysis with improvement tracking
- **Base Range:** `max(60, min(450, userPP * 0.3))`
- **Analysis Window:** Top 10 scores, 45-day recent window
- **Improvement Rate:** `(recent_avg - top10_avg) / top10_avg`
- **Adjustment Logic:**
  - If improvement > 10%: +30% of base range
  - If improvement < -10%: -25% of base range
- **Range Size:** 30% of user PP
- **Best for:** General use, balanced risk/reward

### Dynamic
**Mathematical Approach:** Volatility-adaptive statistical model
- **Base Range:** `max(70, min(500, userPP * (0.25 + volatility * 0.3)))`
- **Volatility Factor:** `min(1.0, recent_std_dev / median)`
- **Trend Analysis:** 60-day window with median comparison
- **Adaptive Scaling:** Range adjusts based on player consistency
- **Adjustment:** ±60% of base range based on trend factor
- **Best for:** Highly variable players, adaptive predictions

## Mathematical Formulas

### Common Variables
- `userPP`: Current player PP
- `topScores`: Array of player's top scores
- `progressionData`: Cross-mode progression analysis data
- `global_score`: Overall progression score (0-100)

## Algorithm Selection Guide

- **Conservative**: Small, stable ranges for consistent players
- **Aggressive**: Large ranges for high-potential scenarios  
- **Balanced**: General-purpose balanced approach
- **Dynamic**: Adaptive ranges based on player volatility
- **Base**: Original algorithm with logarithmic scaling

### System informations
- Based on Dockerised services on Unraid OS
- CPUs 1x E5 2699 V4
- 64GB DDR4 ECC 2400Mhz
- FULL NVMe Storage SSD

## Local Setup (for Developers)

### Requirements

- Node.js v20+
- Redis
- MySQL or MariaDB
- osu! API v1 key (get yours at https://osu.ppy.sh/p/api)
- osu! API v2 client ID and private key (on your osu!parameters)

### Steps

```bash
git clone https://github.com/Pupariaa/pupsbot.git
cd pupsbot
npm install
cp .env.example .env
# Edit .env to set your credentials and keys
node index.js
```

## Projet Structure

```bash
pupsbot/
├── commands/           # Command handling logic
├── compute/           # Match engine, filters, algorithms
│   └── osu/
│       ├── algorithms/    # PP range calculation algorithms
│       │   ├── Base.js
│       │   ├── Conservative.js
│       │   ├── Balanced.js
│       │   ├── Aggressive.js
│       │   └── Dynamic.js
│       ├── RefinedGlobalPPRange.js
│       ├── findScoreByPPRange.js
│       └── CrossModeProgressionPotential.js
├── services/          # Core services and APIs
│   ├── OsuApis/       # Osu API management
│   │   ├── V1.js
│   │   ├── V2.js
│   │   ├── Manager.js
│   │   ├── InternalServer.js
│   │   ├── Client.js
│   │   └── RateLimiter.js
│   ├── IRC.js         # IRC connection handler
│   ├── Queue.js       # Request queue manager
│   ├── Commands.js    # Command dispatcher
│   ├── RedisStore.js  # Redis cache management
│   ├── SQL.js         # Database operations
│   ├── UserRateLimiter.js  # User-specific rate limiting
│   └── DistributionManager.js  # Beatmap distribution tracking
├── models/            # Sequelize DB models
├── workers/           # Background processors
│   └── osu.js         # Main recommendation worker
├── utils/             # Utilities and helpers
│   ├── osu/           # Osu-specific utilities
│   │   ├── analyzeUserMods.js
│   │   ├── analyzeUserPreferences.js
│   │   ├── modsToBitwise.js
│   │   ├── PPCalculator.js
│   │   ├── PreferencesScorer.js
│   │   └── ScoreFilters.js
│   ├── Logger.js      # Logging system with rotation
│   ├── generateId.js
│   └── functions.js
├── scripts/           # Utility scripts
│   └── lua/           # Redis Lua scripts
│       └── findScoresByPPRange.lua
└── index.js           # Main bot entry point
```

## Limitations

- Only supports ranked maps
- No replay parsing
- Requires enough historical data from your profile and from others to be accurate

## Maintainer

Made by Pupariaa with ♥

osu! user: Puparia (bot account: Pupsbot)

## Special thanks

- Vanille ♥
- lakazatong ♥

## About the Author

My journey with osu! started back in **2013**, quite randomly. I used to play **osu!mania** occasionally on my brother’s computer, without realizing how much the game would end up shaping my life.

In **November 2014**, I created my own account. For years, I played almost exclusively osu!mania, eventually reaching a **global top 3,000** ranking. But over time, I started to drift away from mania. Despite that achievement, I found myself drawn more and more to the **main game mode**, which offered more variety, more creativity, and more freedom to explore what I wanted to build around osu!.

osu! became more than a game — it became a space where I learned, grew, and created. I participated in tournaments, made long-term friends, and started designing tools and bots for the community. Most of those projects never made it past the prototype stage. Only one actually went live: **Farbot**, my first bot, built about four years ago. It worked, but it was **technically fragile and never gained much visibility**. It wasn't sustainable.

In **January 2025**, I decided to start from scratch — same technology base, but with a cleaner vision. Even then, I hit a lot of limitations and issues. So I reworked everything from the ground up, alone, guided by what I had learned over the years. I also received essential technical advice from **[lakazatong](https://github.com/lakazatong)**, who helped me push the architecture further.

But more than anything, **[Vanille](https://osu.ppy.sh/users/31114903)** played a key role in helping me bring heart to the project. She reminded me that a bot isn’t just about precision or numbers — it’s about **people**. Her support and perspective gave the project a much-needed human side, and helped me stay focused through setbacks.

From all of that emerged **Pupsbot** — a stable, fast, and modern osu! bot that is now used by thousands of players. I’m proud of what it’s become — not only as a piece of code, but as a reflection of everything I’ve learned over **more than a decade in the osu! community**.

osu!, much like Minecraft, has been a constant part of my life. It shaped how I think, how I build, and how I connect with people. This project is my way of giving something back — a contribution to a game and a community that has given me so much in return.


