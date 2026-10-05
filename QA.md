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

---

## Batch 2 — 2026-10-04

### 2.2 The LH `cycle` looks wrong — wouldn't it give `[5,1,4,3,2,1,3,2,...]`?

Good catch to check, but no — the table is right, and the confusion is in how `first`
interacts with the cycle. **`first` is an override at position 0, not an extra entry
prepended to the cycle.** The array it builds is $7n+1$ long, not $7n+2$.

The giveaway is the `else if` structure of the formula: exactly one of the three branches
fires for each $j$, so position 0 takes `first` *instead of* `cycle[0]`, never as well as.

Expanding the LH table — `cycle: [1,4,3,2,1,3,2]`, `first: 5`, `last: 1` — for $n = 2$:

| $j$ | Rule that fires | Finger | Note |
|---|---|---|---|
| 0 | `first` (overrides `cycle[0]`) | **5** | C3 |
| 1 | `cycle[1]` | 4 | D3 |
| 2 | `cycle[2]` | 3 | E3 |
| 3 | `cycle[3]` | 2 | F3 |
| 4 | `cycle[4]` | 1 | G3 |
| 5 | `cycle[5]` | 3 | A3 |
| 6 | `cycle[6]` | 2 | B3 |
| 7 | `cycle[0]`, since $7 \bmod 7 = 0$ | **1** | C4 — octave join, thumb |
| 8 | `cycle[1]` | 4 | D4 |
| 9 | `cycle[2]` | 3 | E4 |
| 10 | `cycle[3]` | 2 | F4 |
| 11 | `cycle[4]` | 1 | G4 |
| 12 | `cycle[5]` | 3 | A4 |
| 13 | `cycle[6]` | 2 | B4 |
| 14 | `last` (overrides `cycle[0]`) | **1** | C5 — top note |

Reading the finger column top to bottom:

$$5,4,3,2,1,3,2,1,4,3,2,1,3,2,1$$

which is exactly the `543213214321321` you said was correct. This is asserted as a test,
so it can't drift: `fingering: LH 2 octaves ascending uses 5 only on the lowest note`.

**Why `cycle[0] = 1` rather than 5.** `cycle[0]` is the finger used on the root when
passing *through* it mid-run — and mid-run, the LH root gets the thumb. The 5 is a
one-off on the lowest note of the whole run, which is precisely what `first` encodes. If
`cycle[0]` were 5, every octave boundary would get the little finger, which is the
mirror image of the bug this model replaced.

---

### 2.2b Will it really scale to all scales?

Fair to keep pressing on this. The honest answer has two halves.

**For every 7-note scale — all major and minor keys — yes.** The model expresses any
fingering of the form "a 7-periodic pattern, with independent overrides on the first and
last note of the run," which is the structure conventional scale fingerings actually
have. Three worked cases:

| Scale | `cycle` | `first` | `last` | One octave |
|---|---|---|---|---|
| C major RH | `[1,2,3,1,2,3,4]` | 1 | 5 | `1,2,3,1,2,3,4,5` |
| F major RH | `[1,2,3,4,1,2,3]` | 1 | 4 | `1,2,3,4,1,2,3,4` |
| B♭ major RH | `[4,1,2,3,1,2,3]` | 2 | 4 | `2,1,2,3,1,2,3,4` |

B♭ is the interesting one: the root is a black key the thumb never plays, so `first` (2)
and `cycle[0]` (4) and `last` (4) are three different things — and the model takes it
without a code change. That's the general test of whether the abstraction is right, and
it passes.

**I have now also removed the hardcoded 7.** You asked for the fingering code to scale
properly, and while answering I found that `noteCount`, `peakIndex` and
`generateFingering` all assumed 7 degrees per octave even though pitch generation already
read the length of the interval array. For diatonic scales they agreed; for a pentatonic
or whole-tone scale they would have disagreed silently — a sequence of one length checked
against a fingering of another. All three now derive it:

$$d = |I| \qquad N = 2dn + 1 \qquad k = dn \qquad F_j = \texttt{cycle}\!\left[j \bmod d\right]$$

and `generateFingering` throws if a table's `cycle` length doesn't match its scale's
degree count, so a mismatched table fails loudly at the point of the mistake rather than
producing a misaligned analysis.

**What it still cannot express**, recorded in §14 rather than discovered later:

1. **A descending fingering that isn't the ascending one reversed.** True for C major and
   most standard scales; a scale needing otherwise would need a second cycle. A field
   addition, not a redesign.
2. **A fingering that changes between octaves** beyond the `first`/`last` overrides —
   which some players do adopt in 3- and 4-octave scales.

Neither blocks the planned major/minor keys. Both will need deciding before the scales
that need them ship.

---

### 6. Are the residuals measured against the fitted line or against the ideal $T$?

Against the fitted line — and your instinct that this looks backwards is a reasonable
reading of the formula, so it's worth spelling out why it's the right choice. (I've also
added the derivation below to `DOCUMENTATION.md` §7.1, since the document previously
asserted the three components were orthogonal without showing it.)

First, to answer the literal question: in $r_i = \mathrm{IOI}_i - (a + b\,i)$, the
$\mathrm{IOI}_i$ is the **actual played** interval. Every $\mathrm{IOI}$ in §7.1 is
actual; $T$ is the only ideal quantity in the section.

#### The fitted line is not an estimate of the data

That's the crux of it. $a + b\,i$ models the **systematic** part of the error — the part
with structure, which is to say the part attributable to a nameable fault. Subtracting it
leaves only the unsystematic part. "How far you fell from your own trend" *is* the
definition of unevenness.

Both quantities you're weighing up exist, and the decomposition uses both. Since
$a = \overline{\mathrm{IOI}} - b\,\bar{\imath}$, the fitted line is
$a + b\,i = \overline{\mathrm{IOI}} + b(i - \bar{\imath})$, and substituting gives

$$\underbrace{\mathrm{IOI}_i - T}_{\text{what you expected to use}} \;=\; \underbrace{\left(\overline{\mathrm{IOI}} - T\right)}_{\textsf{offset}} \;+\; \underbrace{b\,(i - \bar{\imath})}_{\textsf{drift}} \;+\; \underbrace{r_i}_{\textsf{jitter}}$$

So $\mathrm{IOI}_i - T$ — the actual-versus-ideal difference you had in mind — is not
discarded at all. It's the left-hand side. The three metrics are its three slices: the
part that's constant across the run, the part that grows through the run, and the
leftover. `offset` and `drift` are the actual-versus-ideal comparison; they're just the
*structured* portion of it.

#### Why jitter can't be the one doing that comparison

If jitter were the spread of $\mathrm{IOI}_i - T$, it would absorb the other two faults:

| The player | Target-relative jitter says | Truth |
|---|---|---|
| Perfectly even tempo, 10% too slow throughout | Huge jitter on every note | Nothing was uneven. The fault is `offset`. |
| Smooth steady acceleration, every note exactly on the accelerating trend | Large jitter at both ends | Nothing was ragged. The fault is `drift`. |

Both players would be told "your notes are uneven," which is false and, worse,
unactionable — the fix for playing too slow is not "slow down until your notes are even."
The three numbers would become three ways of saying "something is off."

#### Why "estimated from the same data" isn't circular

Two properties of least squares with an intercept make the split clean:

$$\sum_i r_i = 0 \qquad\text{and}\qquad \sum_i (i - \bar{\imath})\,r_i = 0$$

The residuals contain **no constant component and no linear trend** — not approximately,
exactly, as an algebraic consequence of how $a$ and $b$ are chosen. So nothing `offset`
or `drift` explains can leak into `jitter`. Fitting from the data is what *guarantees*
the separation rather than undermining it.

The cost is two degrees of freedom: the line is fitted from $N-1$ intervals, so the
residuals have $N-3$ degrees of freedom, and jitter is very slightly optimistic because
the line was fitted to the same points it's being measured against. At $N = 29$ this is a
few percent and comfortably below the measurement's real uncertainties. Worth knowing;
not worth correcting at v1.

---

### 7. What is jitter measuring, and why RMS?

#### What it measures

**Note-to-note unevenness: individual notes landing early or late relative to the
player's own tempo.** Explicitly not "wrong tempo" (that's `offset`) and not "tempo
changing over the run" (that's `drift`). It's the raggedness left after both of those are
accounted for — the thing you hear as a scale not being *clean* even though it's at the
right speed and holds that speed.

$$\text{jitter} = \frac{\sqrt{\dfrac{1}{N-1}\sum_i r_i^2}}{T}$$

Dividing by $T$ makes it dimensionless: $\text{jitter} = 0.05$ means typical note-to-note
error is 5% of a beat, which means the same thing at 40 BPM and at 200 BPM. 20 ms of
wobble is sloppy at 200 BPM and inaudible at 40.

#### Why RMS

Four reasons, roughly in order of how much they matter:

1. **It is the standard deviation of your note timing.** Because $\sum_i r_i = 0$, the
   RMS of the residuals is exactly their population standard deviation. So jitter has a
   plain-language reading — "the standard deviation of your note placement, as a fraction
   of a beat" — rather than being an arbitrary index.
2. **It's the quantity the fit already minimises.** The residuals come from a
   least-squares fit, which by definition minimises the sum of squares. Measuring the
   leftovers with the same norm the fit used is self-consistent; scoring them with a
   different norm would be measuring the model by a standard it wasn't built to.
3. **It penalises conspicuous errors more than diffuse ones.** Squaring means one note
   100 ms late counts for more than four notes 25 ms late. That matches how unevenness is
   actually heard: a single late note is an audible *event*, while a small uniform wobble
   just sounds human.
4. **Variances add.** If jitter is ever aggregated across runs (§14), RMS composes
   correctly under averaging; a mean-absolute measure doesn't.

#### The honest counter-argument

RMS is **sensitive to outliers**, so one fumbled note can dominate the figure for an
otherwise even run. Mean absolute deviation would be more robust. I think RMS is still
right — a stumble arguably *should* register as unevenness, and §7.2 already separates
wrong notes from timing — but it's a genuine judgement call, and if real runs show jitter
being driven by single events, a trimmed RMS (discard the worst one or two residuals) is
the fallback.

Worth noting a related inconsistency in the document: `jitter` and `sync_error` use RMS,
while `shape` and `lumpiness` (§7.3) use mean-absolute measures, chosen there for ease of
explanation. The reasoning differs per metric, but it does mean the report mixes two
notions of "average error." Not wrong, but worth settling deliberately if the metrics are
ever recalibrated.

---

### Implemented from 4.2: per-hand timing

Now built, per your go-ahead:

- `metrics.timingPerHand` carries `L`, `R` (each with `offset`, `drift`, `jitter`) and
  the signed `driftDifference` $= \text{drift}^L - \text{drift}^R$.
- Computed from each hand's own onsets, so — unlike the paired metrics — **it still works
  on a hand-count-mismatched run**, where timing was previously skipped entirely.
- A "Timing, hand by hand" panel in the report, deliberately a table rather than bars,
  carrying an on-screen note that these figures aren't comparable to the headline jitter
  (the $\sqrt{2}$ effect from §7.1).
- A finding: *"Your left hand is losing tempo relative to your right hand over the run"*,
  triggered at $|\text{driftDifference}| > 0.1$, which is the fault that previously had
  no way to be named.
- Four new tests, including one that synthesises a run where only the left hand
  decelerates and asserts the drift difference attributes it to that hand.

One incidental fix found while doing it: `metrics.timing` had been persisting its
`IOI`/`residuals` arrays into `localStorage`, contradicting §10's schema and §10's own
claim that intermediate arrays are stripped. Stored metrics now carry scalars only, with
the arrays confined to the in-memory `_detail` the report renders from — asserted by a
test.

---

## Batch 3 — 2026-10-05

### 9. What do $M$, $S$, $I$ and $D$ stand for?

**M**atch, **S**ubstitution, **I**nsertion, **D**eletion — the four standard
edit-distance operations, which is what note correctness is: an alignment problem between
the scale you were supposed to play and the notes that actually arrived.

The document never spelled this out; it now does, in §7.2.

| Symbol | Name | Musically | Usual cause |
|---|---|---|---|
| $M$ | Match | The expected note was played | — |
| $S$ | Substitution | A wrong note *instead of* the right one | Fingering slip, or not knowing the key signature (F for F♯) |
| $I$ | Insertion | An extra note that isn't in the scale | Stumble, brushed a neighbouring key, doubled strike |
| $D$ | Deletion | An expected note never sounded | Missed note — typically a weak 4th or 5th finger not pressing hard enough to trigger |

$$\text{accuracy} = \frac{M}{M + S + I + D}$$

All four are reported separately as well as the ratio, because the remedies differ:
substitutions mean you have the scale wrong in your head, insertions mean a physical
accuracy problem, deletions mean finger strength. "You played 93% correctly" hides which
of the three it was.

---

### 10. What is $u_i$ and how is it calculated?

$u_i$ is the **target loudness of note $i$, on a 0-to-1 scale**, where 0 means the
player's own softest note and 1 their own loudest. It is intentionally unitless: the app
never tells you *how* loud to play, only what shape the loudness should trace.

$$u_i = \begin{cases} \dfrac{i}{k} & i \le k \quad \text{(going up)} \\[10pt] \dfrac{N-1-i}{N-1-k} & i > k \quad \text{(coming down)} \end{cases}$$

Reading each branch in words:

- **Ascending**, $i/k$ is simply *what fraction of the way to the peak you are*. The
  first note gives $0/k = 0$; the peak gives $k/k = 1$.
- **Descending**, $(N-1-i)$ is *how many notes are left before the end* and $(N-1-k)$ is
  *how many notes the descent contains altogether*. The ratio therefore slides from just
  under 1 back down to exactly 0 on the final note.

Both branches are straight lines, so $u$ is a symmetric triangle with its apex at $k$.
For the default $N = 29$, $k = 14$:

| $i$ | Calculation | $u_i$ | |
|---|---|---|---|
| 0 | $0/14$ | 0.000 | start, softest |
| 7 | $7/14$ | 0.500 | halfway up |
| 13 | $13/14$ | 0.929 | just below the top |
| 14 | $14/14$ | **1.000** | the peak |
| 15 | $(28-15)/14 = 13/14$ | 0.929 | just past the top — mirrors $i=13$ |
| 21 | $(28-21)/14 = 7/14$ | 0.500 | halfway down — mirrors $i=7$ |
| 28 | $(28-28)/14$ | 0.000 | end, softest again |

The mirroring ($u_{13} = u_{15}$, $u_7 = u_{21}$) is the "return symmetrically"
instruction written as arithmetic.

**Where it gets used.** Twice:

1. In `shape`, compared directly against your min-max normalised actual velocities
   $\tilde{v}_i$ — both are on the same 0-to-1 scale, so the comparison is about shape
   only and ignores how loud you played.
2. In §7.5, rescaled back into real velocity units as
   $\hat{v}_i = \min v + u_i (\max v - \min v)$ — the ideal ramp stretched to fit your
   own range, which is what thumb-crossing residuals are measured against.

---

### 11. Isn't $s_i = -1$ at $i = k$ wrong?

The formula is correct, but the notation invites exactly this reading, and that's a
documentation fault rather than your misreading. The fix is in §7.3 now.

**The resolution: $i$ indexes a *step*, not a note.**

$$d_i = v_{i+1} - v_i$$

so $d_i$ is the *move from note $i$ to note $i+1$*. There are $N-1$ of these, numbered 0
to $N-2$, and $s_i$ is the sign that **move** ought to have. At the peak:

| Step | Is the move | $s_i$ | Correct? |
|---|---|---|---|
| $i = k-1$ | note $k-1 \longrightarrow$ note $k$ | $+1$ | ✓ the last *rising* move, climbing **into** the peak |
| $i = k$ | note $k \longrightarrow$ note $k+1$ | $-1$ | ✓ the first *falling* move, coming **out of** the peak |

So your musical instinct is right — the peak must be louder than the note before it — and
the formula agrees: that step is $d_{k-1}$, with expected sign $+1$. The $s_k = -1$ you
spotted governs the step *leaving* the peak, heading down into the diminuendo, which
should indeed fall.

The peak note itself never gets a sign at all. A note has no direction; only a move
between two notes does.

Concretely, with the clean-run velocities from the test suite ($v_{13} = 96$,
$v_{14} = 100$, $v_{15} = 96$):

$$d_{13} = 100 - 96 = +4 \;(\text{matches } s_{13} = +1\ ✓) \qquad d_{14} = 96 - 100 = -4 \;(\text{matches } s_{14} = -1\ ✓)$$

Neither is flagged. Two new tests pin this boundary from both sides: one asserts a
correct triangle produces **zero** reversals (so $i=k$ is not being falsely flagged), and
one builds a run whose velocity keeps climbing straight through the peak and asserts the
reversal lands at exactly $i = k$ and *not* at $i = k-1$.

---

### 12. Why divide lumpiness by $\mu_d$ when it's already divided by $N-1$?

Because the two divisions do completely unrelated jobs — one makes it an average, the
other makes it relative.

$$\text{lumpiness} = \frac{\overbrace{\dfrac{1}{N-1}\sum_i \big|\,|d_i| - \mu_d\,\big|}^{\text{(a) average deviation of step size}}}{\underbrace{\mu_d}_{\text{(b) typical step size}}}$$

**(a) $\div(N-1)$ turns a sum into a mean.** Without it the figure would grow simply
because there were more notes to sum over — a 4-octave run would score lumpier than a
1-octave run for no musical reason at all. This division carries no information about
evenness; it just removes the dependence on run length.

**(b) $\div\mu_d$ makes the number scale-free.** This is the one doing real work.
Without it lumpiness would be in velocity units and would scale with how *big* the
crescendo was:

| Player | Mean step | Typical wobble | (a) alone | lumpiness |
|---|---|---|---|---|
| Big crescendo, 60 units | ≈ 4 | ±2 | 2.0 | 0.50 |
| Small crescendo, 15 units | ≈ 1 | ±0.5 | 0.5 | 0.50 |

Both players are *equally uneven* — each wobbles by half a step — but measure (a) alone
calls the first one four times worse, purely for playing with a wider dynamic range.
Dividing by the mean step size makes them read identically, which is correct.

It's the same construction as a **coefficient of variation**: a dispersion measure over a
central-tendency measure, yielding a dimensionless ratio. $0$ means every step was exactly
the same size; $0.5$ means a typical step deviated from the average step by half the
average step.

**There's also a design reason.** The *size* of the crescendo is already scored, by
`range`. If lumpiness were absolute, a bigger crescendo would automatically look lumpier
and the two metrics would partly measure the same thing. Keeping lumpiness relative is
what makes it measure only *unevenness of growth*, independent of amount of growth — the
same orthogonality discipline as the timing decomposition in §7.1.

---

### 12.1 Do reversals and lumpiness cover the diminuendo too?

Yes, both run over the whole arch — and asking this turned up two genuine bugs in how
reversals were *reported*. Both now fixed.

**The maths was already symmetric.** $s_i = -1$ for all $i \ge k$, so during the descent
a step that goes *up* violates the expected sign and is flagged. Lumpiness sums $|d_i|$
over every step from 0 to $N-2$, so both halves contribute.

**Bug 1 — everything was called a "crescendo dip."** The findings text read
*"Your crescendo dipped at note …"* for every reversal, including ones in the descending
half. A swell during the diminuendo is the opposite fault and was being described as its
opposite. Reversals are now split at $k$ and worded separately:

| Where | Fault | Now reported as |
|---|---|---|
| step $i < k$ | fell when it should have risen | "your crescendo dipped at note …" |
| step $i \ge k$ | rose when it should have fallen | "your diminuendo got louder instead of softer at note …" |

**Bug 2 — an off-by-one in the note number.** `reversals` holds *step* indices, and the
report was displaying step index $+1$ as the note number. But step $i$ is the move from
note $i$ to note $i+1$, so the note actually out of line is note $i+1$ (0-based), which a
player counting from one calls note $i+2$. The displayed number was pointing one note too
early — at the note *before* the problem. Now corrected, and the convention is documented
in §7.3 and §10 so anything else reading the field converts the same way.

To support this, the stored run now carries `sequence: { N, k }`. It's derivable from
`config`, but without it nothing downstream can tell which half of the arch a reversal
index falls in.

**One limitation worth knowing**, now recorded in §7.3 rather than left to be discovered:
lumpiness pools both halves into a single $\mu_d$, so an **asymmetric** arch — brisk
crescendo, leisurely diminuendo — scores as lumpy even when each half is internally
flawless. That's arguably right, since the exercise does say "return symmetrically," but
it's conflated with within-half unevenness, so the metric can't distinguish "jerky all
through" from "smooth but lopsided." Splitting lumpiness per half and adding a symmetry
ratio $\mu_d^{\text{asc}} / \mu_d^{\text{desc}}$ would separate the two. Happy to add it
if you want the distinction.

---

## Batch 4 — 2026-10-05

### 13. Why a contrast for $\text{bump}_v$ instead of just reporting $\mathrm{vres}_i$ for each crossing?

Because a raw residual **cannot distinguish a thumb problem from a whole-run shape
problem**, and those need opposite advice.

The ideal ramp $\hat{v}_i = \min v + u_i(\max v - \min v)$ is pinned to the player's own
min and max, but only at the two endpoints. Everything between is free to deviate, and in
general

$$\sum_i \mathrm{vres}_i \neq 0$$

So a player whose crescendo bulges above the straight line has *every* mid-run note
sitting high — crossings and non-crossings alike. Three cases, with the same crossing
residual arising from different causes:

| Player | $\mathrm{vres}$ at crossings | $\mathrm{vres}$ elsewhere | Raw reading | $\text{bump}_v$ |
|---|---|---|---|---|
| Convex crescendo, thumb is fine | +6 | +6 | "crossings 6 units loud" ✗ | **0** ✓ |
| Straight crescendo, heavy thumb | +9 | 0 | "crossings 9 units loud" ✓ | **+9** ✓ |
| Convex crescendo **and** heavy thumb | +15 | +6 | "crossings 15 units loud" ✗ | **+9** ✓ |

In row 1 the thumb is blameless — the fault is the crescendo's shape, which `shape`
already scores. A raw residual would invent a thumb problem and send the player off
practising the wrong thing. In row 3 it would overstate a real one, because the bulge and
the thumb are added together.

Subtracting the non-crossing mean removes whatever is **common to every note**, leaving
only what is specific to crossings. Two ways to say the same thing:

- Statistically, it's a difference-in-means contrast: common-mode error cancels.
- By design, it's the same orthogonality discipline as §7.1 — the shape fault belongs to
  `shape`, so `bump` must not re-charge the player for it.

**The second reason is noise.** Velocity varies by several units note to note from motor
noise alone, so a single crossing's residual is one noisy sample. The claim the report
actually wants to make is explicitly about a group — "crossings are *systematically*
worse" — and a group claim needs aggregation to stand up. One loud thumb note is not
evidence of a thumb habit.

#### But you're right that something is lost

The aggregate discards information that would be genuinely useful, and it isn't currently
kept anywhere:

- **Which crossing was worst.** Players don't fix "crossings" in general; they fix the
  crossing at F.
- **Ascending vs descending.** Thumb passing *under* (ascending) and third finger
  crossing *over* (descending) are different physical motions and plausibly fail
  differently. Pooling them into one mean hides that completely.

This is a real gap, not just theory: §6's own example output — *"Most consistent at F
ascending"* — **cannot be produced by the current implementation**, because the
per-crossing values never survive the averaging. I'd listed the symptom in §13 before
without having traced it to this cause.

The fix is additive rather than a redesign: keep the per-crossing $(i, \mathrm{vres}_i,
\mathrm{tres}_i)$ triples alongside the contrast, and split the means by direction
($i < k$ vs $i \ge k$). The headline stays the contrast, for the reasons above; the
detail becomes available for the prose. Happy to implement if you want it.

---

### 14. Legato: the $T$ division, the sign, the magnitudes, and the variance

#### (a) Why divide by $T$

Same logic as §7.1: a gap is only meaningful relative to how much room a note has. 30 ms
of silence is a fifth of the note's space at a brisk tempo and three per cent of it at a
slow one — the identical millisecond value describes choppy playing in one case and
seamless playing in the other. Dividing by $T$ turns it into a fraction of the
note-to-note interval, so one number means one musical thing at any tempo, and runs at
different tempos remain comparable in the stored history.

#### (b) Your reading of the sign is right

Positive = **detached on balance**, negative = **overlapped on balance**. Mechanically:
$g_i = t_{i+1} - o_i$ is next-onset minus current-release, so a positive value means you
let go before striking the next note (silence between them) and a negative value means
the next note began while the previous was still held (overlap).

One refinement to "one or the other is dominant", though — see (d). Because it's a
**mean**, the two faults can cancel rather than one dominating. A run that overlaps
through the first octave and chops through the second can average to $\approx 0$ and look
like textbook legato. So the mean reports a *net tendency*, which is not the same as
saying one tendency prevailed.

#### (c) It is not a tiny number — the premise is the thing to check

The intuition that $g_i$ is "already very small" is where this goes astray. $g_i$ is
small in absolute terms (tens of milliseconds), but $T$ is also only a few hundred
milliseconds, so the ratio lands in a comfortable range. The reason is structural: in a
scale you hold each note roughly until the next one, so note duration is naturally on the
order of $T$, and $\tilde{g}$ ends up being *the fraction of a beat by which your release
was early or late*.

At 80 BPM in eighths ($T = 375$ ms):

| You hold each note for | $g_i$ | $\tilde{g}_i$ | Sounds like |
|---|---|---|---|
| $1.20\,T$ | −75 ms | **−0.20** | mushy, notes piling up |
| $1.05\,T$ | −19 ms | **−0.05** | smooth, just-connected — real pianistic legato |
| $1.00\,T$ | 0 ms | **0.00** | exact legato, the nominal target |
| $0.95\,T$ | +19 ms | **+0.05** | barely detached, still reads as legato |
| $0.90\,T$ | +38 ms | **+0.10** | audibly detached |
| $0.80\,T$ | +75 ms | **+0.20** | clearly choppy |

So the working range is roughly $\pm 0.3$ — which is exactly why §9's thresholds sit at
$+0.3$ and $-0.2$ and §8's bar divides by 0.5. (The synthetic clean run in the test suite
holds each note for $0.9\,T$ and the suite asserts `articulation` $= 0.100$, matching the
table.)

#### (d) How to read `articulation_var`

It's the standard deviation of $\tilde{g}_i$ — the **consistency** of your touch, in the
same "fraction of a beat" units as the mean, so you can compare the two directly.

The pair reads as a 2×2, and the second row is the one that matters:

| mean | var | Diagnosis |
|---|---|---|
| $\approx 0$ | low | True, consistent legato — the goal |
| $\approx 0$ | **high** | **Overlaps and gaps cancelling out.** Looks flawless by the mean alone — the case the mean structurally cannot see |
| $+0.2$ | low | Uniformly detached. Not the exercise's goal, but *controlled* — a deliberate touch |
| $+0.2$ | high | Detached **and** erratic |

Rule of thumb: **if `var` is bigger than $|\text{mean}|$, your inconsistency outweighs
your tendency.** The thing to practise is evenness of release, not whether to play more or
less connected.

Caveats: like `jitter` it's a standard deviation, so one note held oddly long dominates
it. And $g_i$ depends on note-**off** timestamps, which are less precise than note-on —
key-release sensing varies by instrument. Sustain pedal invalidates the metric outright,
which is why §7.8 flags pedalled runs instead of pretending their legato numbers mean
something.

#### The uncomfortable part of this answer

Asking "how do I read that number?" exposed that **right now, you can't — nothing shows
it.** `varL`/`varR` are computed, persisted in every saved run, and documented in §7.6,
but no bar, no strip row and no finding reads them. I checked: outside of `run.js`
assembling them into the metrics object, nothing in `src/` touches those fields.

Which means the single articulation fault the signed mean *provably cannot detect* —
cancelling overlaps and gaps, row 2 above — is the one fault the player is never told
about. That's the worst possible thing to have left unwired, and it's now recorded in
§13.

Fixing it is small: a legato consistency finding (fires when `var` exceeds, say, 0.15 or
exceeds $|\text{mean}|$), and either a second bar or a value shown alongside the existing
legato bar. Want me to wire it up?

---

## Batch 5 — 2026-10-05 (follow-up on 14)

### Yes — the cancelling mean was a real hole. Now fixed.

The mean can't be rescued on its own; it needs companions. Three changes:

**1. A per-note legato row in the strip.** This project's own principle is location over
magnitude — every metric is computed per note before averaging, and averaging is what
throws the location away. The per-note gaps $\tilde{g}_i$ already existed; they just were
never drawn. There are now `Legato R` / `Legato L` rows, so a run that alternates overlap
and gap shows as alternating colours instead of hiding inside a mean of ≈0. Hovering a
cell reads "note 7: 20% overlap" or "note 8: 20% gap".

**2. The legato bar is now scored on the unsigned mean**,
$\frac{1}{N-1}\sum_i |\tilde{g}_i|$, stored as `absL` / `absR`. This is the direct fix: a
run that overlaps exactly as much as it gaps is *not* legato, yet its signed mean is ≈0
and used to score a perfect bar. The signed mean is still reported — it answers a
different question, *which way do you tend?* — but it no longer drives the score.

**3. `articulation_var` is finally wired up** — a "Legato consistency" bar, plus a finding
that fires when the spread exceeds both 0.15 and $|\text{mean}|$:

> Your right-hand articulation is uneven — some notes run together while others are
> clipped short.

Together the three are complete, and no two of them suffice: `abs` says **how far** from
legato, the signed mean says **in which direction**, `var` says **how consistently**.

A test now constructs the pathological case directly — every odd note overlapping by
$0.2\,T$, every even note gapping by $0.2\,T$ — and asserts the signed mean cancels to
≈0 while `var`, `abs` and the finding all catch it.

### An incidental fix that test turned up

It first failed for an unrelated reason worth recording. The legato finding was being
crowded out of the top three by **fourteen** reversal findings, because a flat-velocity
run makes every single step a reversal. The *prioritisation* was right — a missing
crescendo really is more important than articulation — but the *output* was not:

> Your left-hand crescendo dipped at notes 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15.

which is unusable. Beyond four indices, findings now summarise instead: "dipped at 14
points through the run (first at note 2)". Past a handful of reversals the fault is the
shape of the whole crescendo, not particular notes.

---

## Batch 6 — 2026-10-05

### Documentation now matches the code

You were right — §7.6 still showed only the signed mean. Fixed. The section now boxes all
three numbers and says plainly which one drives the score:

$$\text{articulation} = \frac{1}{N-1}\sum_i \tilde{g}_i \qquad \text{signed: which way you lean}$$

$$\text{articulation\_abs} = \frac{1}{N-1}\sum_i \left| \tilde{g}_i \right| \qquad \text{unsigned: how far from legato}$$

$$\text{articulation\_var} = \sqrt{\frac{1}{N-1}\sum_i \left(\tilde{g}_i - \overline{\tilde{g}}\right)^2} \qquad \text{spread: how consistently}$$

The distinction that matters is between

$$\left|\frac{1}{N-1}\sum_i \tilde{g}_i\right| \qquad\text{and}\qquad \frac{1}{N-1}\sum_i \left|\tilde{g}_i\right|$$

— the size of the average, versus the average of the sizes. The first cancels; the second
cannot, because every deviation counts as a positive distance whichever direction it goes.
The score uses the second. Also updated: §8's bar table, §10's schema (`absR`/`absL`),
§13 and §16.

### `varL` / `varR` in plain words

**The suffix is just the hand.** `varL` is the number for your left hand, `varR` for your
right. Same calculation, done twice.

**What the number is.** A 29-note run has 28 gaps between consecutive notes. At each one
you either held too long (overlap), let go too early (gap), or released right on time.

- `articulation` averages those 28 values → **your tendency**
- `varL` / `varR` measure how much the 28 values **differ from each other** → **your
  consistency**

**The target analogy.** Think of shots at a target:

| | On a target | In your playing |
|---|---|---|
| mean | where your shots are **centred** | whether you tend to overlap, detach, or sit on legato |
| var | how **scattered** they are | how much your release varies from note to note |

Being centred on the bullseye says nothing about whether your shots are tight or sprayed
across the whole board. Those are separate facts, and `var` is the only one of the two
numbers that carries the second.

**Two players, same mean:**

| | 28 gaps look like | mean | var | Sounds like |
|---|---|---|---|---|
| A | 0, 0, 0, 0, … | 0 | **0** | genuinely smooth |
| B | −0.2, +0.2, −0.2, +0.2, … | 0 | **0.2** | alternately glued and chopped |

Identical means, opposite results. That gap is what `var` exists to fill.

**Reading the magnitude:**

| `var` | Means |
|---|---|
| ≈ 0.00 | every gap near-identical, machine-like |
| ≈ 0.05 | varies slightly; normal |
| ≈ 0.15 | noticeably erratic — the finding fires about here |
| ≈ 0.25 | all over the place |

### Per-note legato strip rows removed

Agreed, and reverted — the strip already carried four rows and two more cost more in
clutter than they returned. Articulation is now reported as numbers only for v1: the two
bars (distance from legato, and consistency) plus the finding. The per-note gaps are still
computed inside `computeLegato`, so if it ever earns its space, the row is a few lines to
restore. Recorded in §13 as a deliberate v1 call rather than an oversight.

---

## Batch 7 — 2026-10-06 (first real-hardware run)

Five UI issues from playing the app on an actual piano. All five were real; four are
fixed, and the fifth turned out to be correct behaviour badly explained.

### The chart overflowed its card

The canvas had a hardcoded `width="900"` while the card it sits in is around 680px, so it
simply ran off the right edge. It now sizes itself to its container at render time, with
the backing store scaled by `devicePixelRatio` so the lines stay sharp rather than being
stretched up from a smaller bitmap. A `max-width: 100%` on `canvas` acts as a backstop.

### Two ideal lines — you were right, it should be one

The ideal ramp is rescaled to each hand's own min and max
($\hat{v}_i = \min v + u_i(\max v - \min v)$), and the chart drew that per hand. Since the
two hands had different velocity ranges, the two dashed lines landed at different heights
— which reads, exactly as you said, as though the hands had different targets. They don't:
the prescribed shape is identical for both, and the hands are supposed to be balanced
anyway (§7.7).

Now a single dashed reference, drawn from the pooled min and max across both hands, and
labelled "Ideal shape" in the legend.

**One honest trade-off**, now in §8: `shape` is still computed **per hand** against that
hand's own ramp — deliberately, so that a quiet hand isn't penalised for being quiet. So a
uniformly softer hand will sit below the single reference line without necessarily having
a shape problem. That vertical offset is what `balance` measures. The line is a visual
reference; the per-hand `shape` percentages are the numbers to trust.

### "at notes 8 points through the run" — broken, my fault

The sentence was being assembled from two pieces that didn't fit together: the template
supplied `at note(s) …` and the location function returned either `5, 7` or
`8 points through the run (first at note 16)`. The second slotted into the first and
produced nonsense.

The location function now returns the **whole phrase**, preposition included:

| Count | Reads |
|---|---|
| one | "…dipped **at note 5**." |
| a few | "…dipped **at notes 5, 7 and 9**." |
| many | "…got louder instead of softer **at 8 points through the run, starting at note 16**." |

A test now asserts all three forms, including a regex that fails on the exact
`notes <number> points` construction that produced the original.

### "How does note 1 have an ideal?" — correct behaviour, badly explained

This one isn't a bug, and it's a good catch, because the reasoning isn't obvious.

Since $u_0 = 0$, the ideal for the first note is

$$\hat{v}_0 = \min_j v_j + 0 \cdot (\max_j v_j - \min_j v_j) = \min_j v_j$$

So note 1's target is **your quietest note of the entire run** — not whatever you happened
to play first. Your intuition was that note 1 should be its own reference; the model says
instead that note 1 *should have been* your quietest note, because that is what a correct
triangle looks like.

So "note 1: +4" is a real finding, and it means: *somewhere later in the run you played
something 4 units quieter than your opening note.* Your crescendo didn't start from the
bottom.

That said, min/max anchoring makes three positions one-sided, now documented in §7.5:

| Position | Ideal is | Residual can only be |
|---|---|---|
| first note | the run's minimum | $\ge 0$ |
| peak note $k$ | the run's maximum | $\le 0$ |
| last note | the run's minimum | $\ge 0$ |

A least-squares fit of the triangle — the treatment §7.1 already gives timing — would
remove that bias and make the residuals sum to zero, at the cost of an ideal that no
longer passes through your actual extremes. Noted for v2.

The tooltip was also just cryptic. It now shows the numbers rather than only the
difference: **"note 1: played 48, ideal 44 (+4)"**.

### The legato bars meant nothing as labelled

"0.12× beat off" and "±0.17" were unreadable, and the second had no units at all. Both
are fractions of a beat, so they're now stated as percentages with the unit spelled out,
and renamed away from the jargon:

| Was | Now | Means |
|---|---|---|
| Legato — "0.12× beat off" | **Note connection** — "12% of a beat off" | On average your notes missed joining up cleanly by 12% of a beat — either a gap or an overlap |
| Legato consistency — "±0.17" | **Connection consistency** — "varies ±17% of a beat" | How much that varies note to note. Small = every note joined alike; large = some run together, others clipped |

Every bar in "How you did" now also carries a plain-English explanation on hover, since
none of them had one.

### One more thing, found in your screenshots

Your run was flagged for mismatched hand note counts, and the per-hand timing panel still
reported drift of −109% and −144%. Those numbers are almost certainly not your playing:
when the hand counts don't match, notes have been assigned to the wrong hand, so each
hand's onset sequence is partly scrambled and its drift is meaningless. The panel now says
so directly when a run is flagged, rather than presenting a separation failure as a
tempo fault.

That mismatch is itself worth chasing — it means the onset clustering (§6) didn't
cleanly pair your hands on a real performance, which is exactly the open question §15
flagged as needing real-player validation. Worth looking at the raw event log next time.
