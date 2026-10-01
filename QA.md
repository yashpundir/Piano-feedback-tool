# Q&A — notes on the documentation

A running companion to `DOCUMENTATION.md`, recording questions asked about the design and
the answers, including the reasoning that didn't fit in the main document. Newest batch at
the bottom.

---

## Batch 1 — 2026-10-01

### 1. Notation: does $P^{RH}_i$ mean "pitch of the right hand at index $i$"?

Yes, exactly that. To be precise about each piece:

$$P^{RH}_i \quad\longrightarrow\quad \underbrace{P}_{\text{pitch sequence}}\ \underbrace{^{RH}}_{\text{which hand}}\ \underbrace{_i}_{\text{position in the run}}$$

- **The superscript is a label, not an exponent.** $P^{RH}$ is not $P$ raised to any power —
  it just names which hand's sequence we mean. Same for $P^{LH}_i$, the left hand.
- **The subscript $i$ is the position** in the run, 0-based, so $0 \le i < N$. For the default
  2-octave exercise, $i$ runs 0 to 28.

So $P^{RH}_{13} = 83$ means "the 13th note the right hand is expected to play is MIDI pitch 83
(B5)."

#### Two notational wrinkles worth knowing

**(a) Upper case is expected, lower case is played.** §3 uses capital $P$ for the sequence the
app *generates before you play* (the target). §7.0 uses lower case $p_i^h$ for the pitch you
*actually played*. Note correctness (§7.2) is precisely the comparison of the two:

$$\underbrace{P^{RH}}_{\text{expected}} \quad\text{vs.}\quad \underbrace{p^{R}}_{\text{played}}$$

**(b) The hand labels switch spelling between sections.** §3 writes $RH$ / $LH$; §7 writes
$h \in \{L, R\}$. They mean the same two hands. The split is inherited from the code, where the
fingering tables are keyed `RH`/`LH` but each recorded note event carries `hand: "L"` or
`hand: "R"`. It's harmless but inconsistent — worth unifying if either the docs or the code get
a tidy-up pass.

---

### 2. The fingering was wrong — you were right

**Confirmed as a real bug, now fixed** (`src/scale.js`, commit following this file).

Your corrected fingerings are right, and they're what the code now produces:

| Hand | 2 octaves, C major, ascending |
|---|---|
| RH | `1 2 3 1 2 3 4 1 2 3 1 2 3 4 5` |
| LH | `5 4 3 2 1 3 2 1 4 3 2 1 3 2 1` |

#### One clarification on what the bug actually was

The old code didn't quite produce `1231234512312345` (16 notes). It dropped the duplicated
joining note, so it produced 15 — the right *length*, with the wrong *finger* on one note:

```
index:      0  1  2  3  4  5  6  7  8  9 10 11 12 13 14
old (bad):  1  2  3  1  2  3  4  5  2  3  1  2  3  4  5
correct:    1  2  3  1  2  3  4  1  2  3  1  2  3  4  5
                                 ↑
                          C5, the octave join
```

Only index 7 differed. But that single note is the worst possible one to get wrong, because
**C5 is itself a thumb crossing.** Writing 5 there instead of 1 made the finger sequence read
$\ldots 4, 5 \ldots$ — a step of 1 — so the crossing detector saw no crossing. The bug didn't
just mislabel a finger; it *deleted a real thumb crossing from the analysis* and invented a
spurious one at index 8.

Interestingly the LH tiling was already correct, by luck: the LH thumb genuinely does land on
the octave join, and the thumb happened to be the last entry of the one-octave array, so
"drop the first element of each repeat" preserved it. The asymmetry between the hands is
exactly what exposed the flawed assumption.

#### Why tiling a one-octave array can't work in general

The finger on the root note depends on **where in the run that root falls**:

| Note | RH finger |
|---|---|
| Lowest note of the run | 1 |
| Root at an octave boundary, mid-run | **1** (thumb passes under) |
| Highest note of the run | **5** |

A one-octave array has to pick one value for its last entry, and whichever it picks is wrong
in the other context. The root is the only degree with this problem, but it occurs at every
octave boundary, so it scales with $n$.

#### The new model

Store a 7-note repeating **cycle** (the finger used when passing *through* each scale degree)
plus the two notes that break the cycle:

```js
export const FINGERINGS = {
  C: { major: {
    RH: { cycle: [1, 2, 3, 1, 2, 3, 4], first: 1, last: 5 },
    LH: { cycle: [1, 4, 3, 2, 1, 3, 2], first: 5, last: 1 },
  }},
};
```

$$F_j = \begin{cases}
\texttt{first} & j = 0 \\[4pt]
\texttt{cycle}\!\left[\,j \bmod 7\,\right] & 0 < j < 7n \\[4pt]
\texttt{last} & j = 7n
\end{cases}$$

The $j \bmod 7$ is what makes it scale to any $n$: index 7 wraps to `cycle[0]`, index 14 to
`cycle[0]` again, and so on, so every octave boundary automatically gets the mid-run finger
rather than a terminal one.

#### Does it generalise to other scales? Yes

You flagged this as the real requirement, and the model holds up. Two examples:

- **F major RH** — thumb comes after the B♭, so the cycle shifts: `cycle: [1,2,3,4,1,2,3]`,
  `first: 1`, `last: 4`. One octave: `1,2,3,4,1,2,3,4` ✓
- **B major LH** — starts on the 4th finger: `cycle: [1,3,2,1,4,3,2]`, `first: 4`, `last: 1`.
  Two octaves: `4,3,2,1,4,3,2,1,3,2,1,4,3,2,1` ✓

Both are data-only additions; no code changes.

#### Two limits of the model, documented rather than hidden

1. **Descending reuses the ascending fingering reversed.** True for C major and most standard
   scales, but not universal. A scale needing a different descending fingering would need a
   second cycle — a field addition, not a redesign.
2. **One cycle per hand per scale.** Beyond the `first`/`last` overrides, it can't express a
   fingering that changes between the first and later octaves.

Both are now recorded in `DOCUMENTATION.md` §14 so whoever adds the next scale meets them
before being surprised by them.

#### What changed downstream

The corrected RH crossing set now includes the octave joins:

$$C_{RH}: \{3, 8, 10, 19, 21, 26\} \;\longrightarrow\; \{3, 7, 10, 19, 22, 26\}$$

$C_{LH} = \{5, 8, 12, 17, 21, 24\}$ is unchanged. Musically, RH ascending crossings are now at
F4 ($j=3$), C5 ($j=7$) and F5 ($j=10$) — thumb under at every F and every octave C, which is
correct. Three new tests pin all of this down so it can't silently regress.

---

### 3. How is the clustering window $w$ decided?

Your summary of the algorithm is right. Precisely:

1. Sort all note events by onset time.
2. Walk the list. An event joins the current cluster if

   $$t_{\text{event}} - t_{\text{cluster's first event}} \le w$$

   otherwise it starts a new cluster.
3. In a cluster of two, the lower pitch is the left hand, the higher is the right.

Note that the comparison is against the cluster's **first** event, not the previous one. If it
were the previous event, a chain of each-slightly-later notes could grow a cluster without
bound; anchoring to the first event caps a cluster's total span at $w$.

#### The window

$$w = \operatorname{clamp}\!\left(\frac{T}{2},\; 40\text{ ms},\; 200\text{ ms}\right)$$

There are two separate ideas here: the **scaling** ($T/2$) and the **clamping** (40–200 ms).

#### Why scale with $T$, and why $T/2$ specifically

$T$ is the target gap between consecutive notes (see Q5). That makes it exactly the quantity
the window needs to respect, because the window has two jobs pulling in opposite directions:

- Be **wide enough** to catch both hands' notes for the *same* beat, even when the player's
  hands are sloppy.
- Be **narrow enough** to never reach into the *next* beat.

Consecutive beats are about $T$ apart. Two notes meant to be struck together should be far
closer than that. So $T/2$ is the natural dividing line — the largest window that still cannot
span from one beat to the next, as long as playing is roughly even:

$$\underbrace{\text{same beat: } |t^L - t^R| \ll T/2}_{\text{cluster together}} \qquad\qquad \underbrace{\text{next beat: } \approx T > T/2}_{\text{separate cluster}}$$

Scaling matters because any fixed constant is wrong at one end of the tempo range. At 40 BPM
in quarters ($T = 1500$ ms) a 50 ms window would be absurdly strict; at 200 BPM in sixteenths
($T = 75$ ms) a 300 ms window would swallow four beats at once.

#### Why clamp, then

Because $T/2$ is the right *shape* but goes out of bounds at the extremes — and the bounds are
set by human hands, which don't scale with tempo.

**The 40 ms floor.** As $T$ shrinks, $T/2$ eventually drops below genuine human hand
asynchrony. A player whose hands are 45 ms apart is not playing two separate beats; they are
playing *one beat badly* — which is precisely the fault this tool exists to measure. Without a
floor, a fast tempo would split that pair into two singleton clusters, fall back to the pitch
threshold, and resurrect the §6 problem.

**The 200 ms ceiling.** As $T$ grows, $T/2$ becomes recklessly permissive. At 40 BPM in
quarters it's 750 ms — close to a full second, during which a hesitant player might genuinely
play a *separate* note, fumble, or re-strike. 200 ms is already past the point where listeners
stop hearing two onsets as a single event, so widening further adds risk with no benefit.

So the formula reads: **proportional to the music, but never outside the limits of human
hands.**

#### Does the clamp ever fight the scaling?

Worth checking honestly, since a floor above $T/2$ could in principle let the window reach the
next beat. The floor binds when

$$\frac{T}{2} < 40 \;\Longleftrightarrow\; T < 80\text{ ms} \;\Longleftrightarrow\; \text{BPM} \times \text{notesPerBeat} > 750$$

— e.g. sixteenths above 187 BPM, which is fast but playable. Even there, $w = 40$ ms is still
comfortably below $T \approx 75$ ms, so it cannot reach the next onset. The window would only
*equal* $T$ at around 375 BPM in sixteenths, which is not physically playable. So the clamp is
safe in practice, but the margin does narrow at high tempo — one more reason the open question
in §15 about validating the window against a real player matters.

---

### 4.1 Why average the two hands into a paired onset $\tau_i$?

Because the timing metrics are asking about the **pulse** — when the beat landed — and the
pulse is a property of the two hands together, not of either one.

The cleanest way to see why the mean is the right choice: write the two onsets in terms of a
shared pulse $\tau_i$ and an asynchrony $e_i$ between the hands.

$$t^L_i = \tau_i + \frac{e_i}{2} \qquad\qquad t^R_i = \tau_i - \frac{e_i}{2}$$

Now take the sum and the difference:

$$\frac{t^L_i + t^R_i}{2} = \tau_i \qquad\qquad t^L_i - t^R_i = e_i$$

Both are **exact**. The average isolates the pulse and the asynchrony cancels completely; the
difference isolates the asynchrony and the pulse cancels completely. This is why §7.0 defines
$\tau_i$ as a mean and §7.4 defines $e_i$ as a difference — they are the two halves of one
change of basis, from (left, right) to (pulse, asynchrony):

$$\left(t^L,\, t^R\right) \;\longleftrightarrow\; \left(\tau,\, e\right)$$

Each metric then reads exactly one component:

| Metric family | Reads | Therefore unaffected by |
|---|---|---|
| Timing — offset, drift, jitter (§7.1) | $\tau$ | hand asynchrony |
| Hand sync — bias, error (§7.4) | $e$ | tempo |

That separation is the whole point. If timing were measured from the right hand alone, the
right hand's own asynchrony would leak into jitter, and "your tempo is uneven" would be
indistinguishable from "your hands are ragged" — two different faults with two different
fixes.

There's also a perceptual argument: when two notes sound within a few tens of milliseconds, a
listener hears one event, and its perceived time is close to the mean of the two onsets. So
$\tau_i$ is a reasonable estimate of *when the chord was heard*, which is what "was this run
even?" is really asking about.

---

### 4.2 Doesn't averaging dilute the individual hands? Should there be a per-hand IOI?

Two parts to this: whether information is lost (no), and whether the current scheme attributes
faults well (mostly, with one real weak spot — and I think you're right that per-hand IOI is
worth adding).

#### Nothing is lost

The map $(t^L, t^R) \leftrightarrow (\tau, e)$ is invertible:

$$t^L_i = \tau_i + \frac{e_i}{2} \qquad\qquad t^R_i = \tau_i - \frac{e_i}{2}$$

Given $\tau_i$ and $e_i$ you can reconstruct both original onsets exactly. So the pair
$(\tau, e)$ carries precisely as much information as the pair $(t^L, t^R)$ — it's a
re-encoding, not a reduction. The per-hand detail isn't diluted; it's *relocated* into the
sync metric. And the raw onsets are stored in every run record anyway (§10), so nothing is
irrecoverable even in principle.

#### Averaging actually *improves* the pulse estimate

Worth quantifying, because it's the opposite of dilution. Model each hand's onset as the true
pulse plus independent per-hand noise of variance $\sigma_a^2$:

$$t^L_i = \tau^{\text{true}}_i + a^L_i, \qquad t^R_i = \tau^{\text{true}}_i + a^R_i, \qquad \operatorname{Var}(a^L) = \operatorname{Var}(a^R) = \sigma_a^2$$

Then the measured pulse carries noise

$$\operatorname{Var}\!\left(\frac{a^L + a^R}{2}\right) = \frac{\sigma_a^2 + \sigma_a^2}{4} = \frac{\sigma_a^2}{2}$$

Half the variance of either hand alone — a $\sqrt{2} \approx 1.41\times$ reduction in standard
deviation. So $\tau$ is a *less noisy* estimate of the pulse than either hand, which is a
second, independent reason to use it for the timing metrics.

A direct consequence, which matters if per-hand numbers are ever displayed: **per-hand jitter
will systematically read higher than paired jitter** (by roughly $\sqrt{2}$ when hand noise is
independent), purely as an artifact of this. The two numbers must not be presented as
comparable, or the UI will imply each hand is worse than "the player," which is meaningless.

#### Where the current scheme genuinely is weak

The failure mode is a fault where the two hands have *different tempo behaviour*. Concretely:
the left hand gradually slows while the right holds steady.

- $\tau$ averages the two, so `drift` reads roughly **half** the left hand's true drift.
- Meanwhile $e_i$ grows steadily, so `sync_bias` and `sync_error` both go large.

The fault *is* detected — it can't hide — but it's **split across two metrics and attributed
oddly**: the player is told "you drift a bit" and "your hands are out of sync," when the single
true finding is "your left hand is slowing down relative to your right." The hand responsible is
only recoverable from the sign of $e$, which no part of the current report explains.

#### My recommendation: yes, add it, as a drill-down

It's nearly free — `computeTiming` already accepts an arbitrary array of onsets, so

```js
const timingL = computeTiming(L.map((e) => e.onset), T);
const timingR = computeTiming(R.map((e) => e.onset), T);
```

gives per-hand offset/drift/jitter with no new mathematics at all.

I'd suggest keeping the $\tau$-based numbers as the headline (they answer "was the music
even?", which is the musical question) and showing per-hand timing as a secondary panel,
mainly to answer "and if it wasn't, which hand?" Two conditions on doing it properly:

1. Label clearly that per-hand jitter isn't comparable to paired jitter, for the $\sqrt{2}$
   reason above.
2. The most useful derived number is probably the *difference* in drift between the hands,
   $\text{drift}^L - \text{drift}^R$, since that is exactly the "one hand is slowing relative
   to the other" fault stated as one quantity.

Not implemented yet — say the word and I'll add it.

---

### 5. What is the target inter-onset interval $T$, and where does 60000 come from?

$T$ is **how many milliseconds should pass between one note and the next** if you play the
exercise exactly at your chosen tempo. It's the yardstick everything in §7.1 is measured
against.

$$T = \frac{60000}{\text{BPM} \times \text{notesPerBeat}} \quad [\text{ms}]$$

#### Where 60000 comes from

It's just **one minute, expressed in milliseconds**:

$$1\ \text{minute} = 60\ \text{seconds} = 60 \times 1000 = 60000\ \text{ms}$$

Milliseconds because that's the unit MIDI gives us — `msg.timeStamp` is in ms — so working in
ms avoids converting on every event.

#### Building the formula one step at a time

$$\underbrace{\frac{60000}{\text{BPM}}}_{\text{ms per beat}} \;\div\; \underbrace{\text{notesPerBeat}}_{\text{notes in each beat}} \;=\; \underbrace{\frac{60000}{\text{BPM} \times \text{notesPerBeat}}}_{\text{ms per note } = \,T}$$

1. **BPM is beats per minute**, so dividing a minute by BPM gives the length of one beat.
   At 80 BPM: $60000 / 80 = 750$ ms per beat.
2. **You play more than one note per beat.** With eighth notes there are 2 notes in each beat,
   so each note gets half a beat: $750 / 2 = 375$ ms.

Hence at 80 BPM in eighths, $T = 375$ ms — a note every 375 ms.

| BPM | notesPerBeat | ms per beat | $T$ (ms per note) |
|---|---|---|---|
| 60 | 1 (quarters) | 1000 | 1000 |
| 80 | 2 (eighths) | 750 | **375** ← default |
| 80 | 4 (sixteenths) | 750 | 187.5 |
| 120 | 2 (eighths) | 500 | 250 |

#### Why `notesPerBeat` is a separate setting

Because it matches how players actually think. You set your metronome to 80 and play two notes
per click; the app asks for those two facts separately rather than asking you to work out that
you're playing 160 notes per minute.

#### What $T$ is used for

It appears in three distinct roles, which is why the setting is mandatory:

1. **The target** for `offset` — $\text{offset} = (\overline{\mathrm{IOI}} - T)/T$ asks "were
   your actual gaps the length they should have been?"
2. **The normaliser** for `drift`, `jitter` and the legato gaps. Dividing by $T$ turns
   milliseconds into fractions of a beat, making the numbers dimensionless and comparable
   across tempos — 20 ms of jitter is sloppy at 200 BPM and immaterial at 40 BPM, but
   $\text{jitter} = 0.05$ means the same thing at both.
3. **The clustering window** for hand separation, $w = \operatorname{clamp}(T/2, 40, 200)$ —
   see Q3.
