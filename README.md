# Riftbound Live Coach (free beta)

A free coach that sits beside your game on [RiftAtlas](https://play.riftatlas.com) and tells you what matters right now: what to play, where to move, who wins each fight, and which triggers you're about to miss.

- Works with **any legend and any deck**
- **Read-only**: it never clicks, moves cards or plays for you
- **No account, no AI key, nothing to pay**

---

## Install (about 2 minutes)

### Step 1: Install Tampermonkey
Tampermonkey is a well-known browser extension that runs small scripts like this one. Get it from your browser's store:
- **Chrome / Brave:** https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo
- **Edge:** https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd
- **Firefox:** https://addons.mozilla.org/firefox/addon/tampermonkey/

Click **Add to browser** / **Get**.

### Step 2 (Chrome, Edge and Brave only): allow user scripts
Chrome now asks you to turn this on once. Without it, the coach won't appear.
1. Type `chrome://extensions` in the address bar (Edge: `edge://extensions`) and press Enter.
2. Find **Tampermonkey** and click **Details**.
3. Turn on **Allow User Scripts**. (On older Chrome versions, instead turn on **Developer mode** in the top-right corner of the extensions page.)

Firefox users can skip this step.

### Step 3: Install the coach
Open this link:

**https://raw.githubusercontent.com/ins0dus/riftbound-coach/main/rb-coach.user.js**

Tampermonkey opens an install page. Click **Install**.

### Step 4: Play
1. Go to **https://play.riftatlas.com** and refresh the page if it was already open.
2. **Open your deck in the lobby once**, so the coach can read your list.
3. Start a game. The coach panel appears on the right. A short welcome card explains the buttons.

That's it. Updates install by themselves.

---

## How to read the coach
| Symbol | Meaning |
|---|---|
| ▶ | Something to do now (play a card, move a unit, use a trigger) |
| ⚠ | Be careful: a fight you'd lose, a threat, a spell you can't counter |
| ⚔ | Who wins the fight at a battlefield, using the real rules (Shield, gear, battlefields, legend bonuses) |
| ⏸ | Keep runes up for something in your hand |

**Tap any line** to see the steps and the reason behind it.

**Tabs:**
- **Glance:** the short list of what matters right now
- **Board:** every card in play, with its text and real Might
- **Judge:** ask a rules question about the board in front of you
- **Sideboard:** swaps based on what your opponent has shown
- **Stats / Tests (deck optimization):** a profile of your deck's strengths and gaps (early board, removal, ways to break holds), plus your win rate by deck version, opponent and play/draw. Every game is recorded automatically. Change your list in the lobby and the coach counts it as a new version, so you can see whether the change helped.

---

## Helping with the beta
When a line is wrong or confusing, **tap 👎 on it**, pick a reason and add a short note ("I had 2 runes, not 3", "Akali has Shield"). That's the most useful thing you can do. Every report gets checked, and fixes reach you automatically.

**Privacy:** reports are anonymous. They include only the coach's version and a snapshot of the game board (cards, Might, score). They are posted publicly to this project's [issue list](https://github.com/ins0dus/riftbound-coach/issues), so **don't type personal information in the note**.

---

## Troubleshooting
- **No panel on RiftAtlas:**
  - Make sure Tampermonkey is enabled (click its icon; the switch should be on and "Riftbound Live Coach" should be listed).
  - On Chrome, Edge or Brave, re-check Step 2.
  - Refresh the RiftAtlas page.
- **Panel is in the way:** use **–** to minimize it, or drag it by its title bar.
- **It doesn't know my deck:** open the deck in the RiftAtlas lobby once, then start a game.
- **Get the newest version now:** Tampermonkey icon → Utilities / Dashboard → **Check for userscript updates**.
- **Uninstall:** Tampermonkey icon → Dashboard → trash-can icon next to Riftbound Live Coach.

## FAQ
- **Is this allowed?** It only reads what's already on your screen and never acts for you. It's a reference aid, like having the rules open in another tab. Don't use it in tournaments that ban outside help.
- **Does it send my data anywhere?** No, except the 👎 reports you choose to send. Your games and stats stay in your browser.
- **What's the 🤖 button?** An optional AI mode that needs your own Anthropic API key. It's off by default, and the coach works fully without it.

Unofficial fan project. Riftbound card names and text belong to Riot Games. Not endorsed by Riot Games or RiftAtlas.
