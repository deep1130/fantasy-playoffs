# Fantasy Playoffs

A high-performance fantasy football analytics and playoff intelligence platform for Sleeper leagues. Modelled after clean, data-dense interfaces like **Fantasy Expected Wins** and **TheFFHub**, **Fantasy Playoffs** calculates how close each franchise is to clinching a postseason spot, exact Magic Numbers, Elimination Numbers, and Schedule Luck — with first-class support for **League Median Scoring** (2 wins per week).

Enter any public Sleeper League ID in the search field, load the built-in **Demo League**, or append `?league=<id>` to the URL.

---

## Key Features

### 1. Playoff Clinch Radar & Closeness Engine
- **Mathematical Clinch Status**: Automatically detects whether each franchise has clinched a first-round bye (`CLINCHED BYE`), clinched a playoff seed (`CLINCHED PLAYOFF`), is contending (`IN THE HUNT`), fighting on the bubble (`ON THE BUBBLE`), or mathematically eliminated (`ELIMINATED`).
- **Magic Number to Clinch ($M$)**: The combination of team wins + bubble chaser losses required to mathematically guarantee a postseason berth. When $M = 0$, the team is officially locked in.
- **Elimination Number ($E$)**: The combination of team losses + cutoff team wins that triggers mathematical elimination.
- **Clinch Meter (%)**: Visual progress indicator showing each franchise's distance to guaranteed clinching.
- **Clinch Paths This Week**: Expandable breakdown for every team detailing what exact results (e.g., *Win vs. Opponent + Win vs. Median + Team 7 Loss*) officially lock a playoff spot this week.

### 2. Full League Median Support (2 Wins Per Week)
- Automatically detects Sleeper leagues with `league_average_match: 1`.
- In leagues using median scoring, each week awards up to 2 wins (1 Head-to-Head + 1 for finishing in the top 50% of league scoring).
- Calculates exact historical weekly medians, separate H2H vs. Median records, and adjusts remaining regular-season games ($R = 2 \times \text{Remaining Weeks}$) to accurately scale all Magic Numbers, max possible wins, and clinching scenarios.

### 3. All-Play Expected Wins & Schedule Luck (Fantasy Expected Wins Format)
- **All-Play Expected Wins ($\text{xW}$)**: Evaluates what each franchise's record would be if they had played against every other team in the league every single week:
  $$\text{xW} = \sum_{\text{weeks}} \frac{\text{Teams Outscored That Week}}{N - 1}$$
- **Schedule Luck ($\Delta \text{Luck}$)**: Subtracts Expected Wins from Actual Wins ($\text{Actual} - \text{Expected}$) to reveal who is benefiting from an easy schedule vs. who is facing a weekly points buzzsaw.
- **Median Record**: Tracks how often each franchise beats the weekly league median score.

### 4. Interactive "What-If" Playoff Machine
- Test remaining matchups in real time.
- Click winners for upcoming head-to-head games and toggle median wins to see live standings, seed changes, and clinching locks recalculate instantly.

### 5. Built-in Demo League
- Instant one-click **DEMO** button loads a realistic 12-team Sleeper dynasty league with active median scoring, 10 completed weeks, live playoff bubble drama, and full game logs.

---

## Run Locally

```sh
npm install
npm run dev
```

Build for production:

```sh
npm run build
npm run preview
```

---

## Mathematical Specifications

### Magic Number Formula ($M$)
For any team $i$ currently in a playoff position ($i \le K$ where $K$ is total playoff spots) relative to the primary chaser $c = K + 1$:
$$M_i = \max\left(0, (W_c + R_c + 1) - W_i\right)$$
where $R_c = w_{\text{rem}} \cdot g_{\text{wk}}$ ($g_{\text{wk}} = 2$ if league median is enabled, $1$ otherwise).

### Elimination Number Formula ($E$)
For any team $j > K$ chasing cutoff seed $k = K$:
$$E_j = \max\left(0, (W_j + R_j + 1) - W_k\right)$$
If $E_j \le 0$, the team is mathematically eliminated.

---

## Deployment

The Vite base path is configured for the `fantasy-playoffs` repository:
```ts
base: process.env.GITHUB_ACTIONS === 'true' ? '/fantasy-playoffs/' : '/'
```
Pushing to `main` deploys automatically to GitHub Pages.
