# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jekpotnihye/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jekpotnihye/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in a frozen DefiLlama snapshot by implied value — a transparent four-factor model (traded precedent multiple, growth, chain breadth, maturity) priced only from the snapshot's own figures — and shows the board, a detail view for each protocol with its model breakdown, and the steps to farm it. "No token" means the snapshot records no token; a launch is never guaranteed, and an implied value is a model, never a price.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program reads the sealed snapshot, writes the ranked board to `out/board.json`, the dashboard data to `out/data.js`, and copies `dashboard/` and `screenshots/` to `out/` with a `dossier.json` the judge reads. Run it twice and the bytes are identical.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3hrx8dz4&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
