I'm building a personal lifestyle app (workouts, budget, habits, kitchen/recipes) — vanilla
HTML/CSS/JS, no framework. I want your help reviewing one part of it: the Accounts tab
(net-worth tracking across every asset and debt).

Attached is a functional spec I had written up first. It describes exactly what Accounts does
today — the data model, every screen and field, how it's edited, and every other place in the
app that reads its numbers (Home, Budget, Stats) — but it does NOT critique the design or tell
you what to build. Read it as ground truth about current behaviour. I haven't included
screenshots; work from the spec, and ask me if you need to see something.

This tab has already had a fair amount of work done on it recently (a hierarchy rework, a
credit-limit feature, account categories). I want two things from you, roughly equally:

1. **A feature review** — what's here now, what's actually useful, and what I should
   seriously consider adding. The spec lists the data that exists and what does and doesn't
   feed into other screens yet (categories don't roll up anywhere, for instance) — tell me
   what's worth building on top of that and what isn't.
2. **A design review** — how the tab looks and is laid out, independent of the feature
   question.

A few things that matter before you start:

- **Phone is the primary way this app is used.** Desktop exists and is real, but design for
  phone first.
- **The app's accent colour is not fixed** — it changes at runtime (weather, training day, or
  a static pick). Don't design around one specific colour or a pairing of two accent-dependent
  colours; assume it could be anywhere from grey to deep indigo to bright blue. Where the spec
  mentions semantic colour (the credit-utilisation bar), that's deliberate and separate from
  the accent — keep that separation in anything you propose.
- **Dark mode is the default and what I actually use.** Whatever you propose needs to work in
  both dark and light, designed dark-first.
- Read the "SETTLED — DON'T RE-PROPOSE" section near the end of the spec. Those are recent,
  deliberate decisions with reasons attached — don't suggest undoing them without a specific
  argument for why they're wrong.
- There's also a short "things I noticed" section flagging a few possible issues I found —
  those are flags, not asks, but feel free to weigh in on them.

What I want back:

1. **Ranked feature proposals** — what to add or extend, in order of how much it's actually
   worth building.
2. **Ranked design proposals** for the screen itself and/or how it's represented on Home and
   Budget.
3. **A direct opinion on whether account categories should roll up anywhere** (a total for
   everything tagged "Owed to me", for instance) — and if so, where.
4. **A direct opinion on the emoji-consistency flag** in the spec — worth fixing or not.
5. **Anything you spot that's a function problem, not a design one.**

Format the response as: ranked proposals (features first, then design), explicit answers to
the numbered questions above, and a short "don't bother" list for anything you considered but
don't think is worth doing. Be direct — if something is genuinely weak, say so plainly rather
than softening it.
