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

## How It Works

1. **You send a private message on osu! to the bot account `Puparia`.**
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

To interact with Pupsbot, send a private message on osu! to the account **Puparia**.

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
| `pp:XXX` | Filter maps that give approximately XXX pp (±15 pp tolerance) | `!o HD pp:200` |
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

## Deprecated Commands

### `!bm`

Old command for the "osu" mode replaced by `!o` (osu) for more consistency

---

## Technical Overview

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
│   └── UserRateLimiter.js  # User-specific rate limiting
├── models/            # Sequelize DB models
├── workers/           # Background processors
│   └── osu.js         # Main recommendation worker
├── utils/             # Utilities and helpers
│   ├── osu/           # Osu-specific utilities
│   │   ├── analyzeUserMods.js
│   │   ├── analyzeUserPreferences.js
│   │   ├── modsToBitwise.js
│   │   └── PPCalculator.js
│   ├── Logger.js      # Logging system with rotation
│   ├── generateId.js
│   └── functions.js
└── index.js           # Main bot entry point
```

## Limitations

- Only supports ranked maps
- No replay parsing or v2 features
- Requires enough historical data from your profile and from others to be accurate

## Maintainer

Made by Pupariaa with ♥

osu! user: Puparia

## Special thanks

- Vanilleu ♥
- lakazatong ♥

## About the Author

My journey with osu! started back in **2013**, quite randomly. I used to play **osu!mania** occasionally on my brother’s computer, without realizing how much the game would end up shaping my life.

In **November 2014**, I created my own account. For years, I played almost exclusively osu!mania, eventually reaching a **global top 3,000** ranking. But over time, I started to drift away from mania. Despite that achievement, I found myself drawn more and more to the **main game mode**, which offered more variety, more creativity, and more freedom to explore what I wanted to build around osu!.

osu! became more than a game — it became a space where I learned, grew, and created. I participated in tournaments, made long-term friends, and started designing tools and bots for the community. Most of those projects never made it past the prototype stage. Only one actually went live: **Farbot**, my first bot, built about four years ago. It worked, but it was **technically fragile and never gained much visibility**. It wasn't sustainable.

In **January 2025**, I decided to start from scratch — same technology base, but with a cleaner vision. Even then, I hit a lot of limitations and issues. So I reworked everything from the ground up, alone, guided by what I had learned over the years. I also received essential technical advice from **[lakazatong](https://github.com/lakazatong)**, who helped me push the architecture further.

But more than anything, **[Vanille](https://osu.ppy.sh/users/31114903)** played a key role in helping me bring heart to the project. She reminded me that a bot isn’t just about precision or numbers — it’s about **people**. Her support and perspective gave the project a much-needed human side, and helped me stay focused through setbacks.

From all of that emerged **Pupsbot** — a stable, fast, and modern osu! bot that is now used by thousands of players. I’m proud of what it’s become — not only as a piece of code, but as a reflection of everything I’ve learned over **more than a decade in the osu! community**.

osu!, much like Minecraft, has been a constant part of my life. It shaped how I think, how I build, and how I connect with people. This project is my way of giving something back — a contribution to a game and a community that has given me so much in return.


