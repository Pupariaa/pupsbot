# PP Range Algorithms

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
