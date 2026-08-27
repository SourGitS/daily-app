I'm building a personal lifestyle app (workouts, budget, habits, kitchen/recipes) — vanilla
HTML/CSS/JS, no framework. I want your help reviewing one part of it: the **Log tab** — the
workout-logging screen — and the exercise system underneath it.

Attached is a functional spec I had written up first. It describes exactly how Log works today:
the training split, the exercise library, mid-session swaps, how a session is logged and saved,
and how that saved session feeds Home, Stats and the progressive-overload suggestions. It does
NOT critique the design or tell you what to build. Read it as ground truth about current
behaviour. I haven't included screenshots; work from the spec, and ask me if you need to see
something.

**What I care about most here is how well the pieces connect** — split, library, swaps,
session, history, PRs — not just how the Log screen looks. Judge it as a workout tracker, not
as a set of screens. Specifically:

- Does the exercise/split/library/swap model actually hold together, or are there places where
  doing something reasonable in one part quietly damages your data in another?
- Does logging a session flow well in the moment — mid-set, phone in one hand, at the gym?
- Is anything missing that a workout tracker genuinely needs?

Read the **"THINGS I NOTICED"** section carefully — I've flagged a swap-related data issue
there that I'd particularly like your opinion on, plus a couple of smaller ones. Those are
flags, not asks, but the swap one is the reason I wanted this review.

A few things that matter before you start:

- **Phone is the primary way this app is used**, and Log especially — it's used standing in a
  gym, between sets, often one-handed and sweaty. Design for that first; desktop is real but
  secondary.
- **The training split is user-built**, not a fixed program — arbitrary day types in an
  arbitrary repeating schedule. Don't propose anything that assumes a fixed 3-day or 4-day
  rotation.
- **The app's accent colour is not fixed** — it changes at runtime (weather, training day, or
  a static pick). Don't design around one specific colour or a pairing of two accent-dependent
  colours. Note that per-training-day colours are a separate existing system — the spec
  explains the distinction.
- **Dark mode is the default and what I actually use.** Both themes need to work, designed
  dark-first.
- Read the **"SETTLED — DON'T RE-PROPOSE"** section near the end. Those are deliberate
  architectural decisions with reasons attached — don't suggest undoing them without a specific
  argument for why they're wrong.

What I want back:

1. **A direct opinion on the swap-fragmentation issue** flagged in the spec — is the
   inconsistency worth fixing, and if so how? This is the main question.
2. **Ranked proposals for the exercise system's interconnectedness** — swaps, library,
   session-only adds, progressive-overload suggestions — most impactful first.
3. **Ranked design proposals for the Log screen itself**, phone-first, gym-context-first.
4. **Anything that's a function problem, not a design one** — a flow that takes two taps and
   should take one, a missing state, something confusing regardless of how it looks.
5. **A "don't bother" list** for anything you considered but don't think is worth doing.

Format as: the answer to Q1 first (it's the important one), then ranked proposals, then the
"don't bother" list. Be direct — if something is genuinely bad, say so plainly rather than
softening it.
