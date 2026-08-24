I'm building a personal lifestyle app (workouts, budget, habits, kitchen/recipes) — vanilla
HTML/CSS/JS, no framework. I want your help redesigning one part of it: the Kitchen tab.

Attached is a functional spec I had written up first. It describes exactly what Kitchen does
today — every screen, every button, what data drives it, how the sub-areas connect to each
other and to the rest of the app — but it does NOT critique the design or tell you what to
build. Read it as ground truth about current behaviour, not as a design brief. I haven't
included screenshots; work from the spec, and ask me if you need to see something.

A few things that matter before you start:

- **Phone is the primary way this app is used.** Desktop exists and is real, but any proposal
  needs to work on a phone screen first — don't design something that only makes sense on a
  wide monitor.
- **The app's accent colour is not fixed** — it changes at runtime (it can follow live
  weather, the training day, or a static pick). Don't design around one specific colour or a
  pairing of two accent-dependent colours; assume it could be anywhere from grey to deep
  indigo to bright blue.
- **Dark mode is the default and what I actually use.** Whatever you propose needs to work in
  both dark and light.
- Read the "SETTLED — DON'T RE-PROPOSE" section near the end of the spec. Those are things
  already tried and reverted elsewhere in this app for specific reasons — don't suggest them
  again.
- There's also a short "things I noticed" section flagging a couple of possible issues I
  found — those are just flags, not asks. Feel free to comment on them if relevant, but they're
  not the focus.

What I want back:

1. **Redesign proposals** for each of the three sub-areas (Recipe Book, Shopping List, Pantry)
   and for Cooking Mode specifically. Cooking Mode is its own design problem — it's used with
   wet or messy hands, at arm's length, while something's on the stove — so treat it
   separately from the others rather than just applying the same visual language.
2. **A direct opinion on whether the three sub-areas should be more connected** than they are
   now. Right now they're three screens behind a sub-tab switcher that barely acknowledge each
   other, even though they share real data (see the "cross-feature links" section).
3. **A direct opinion on the desktop layout** — right now Recipe Book uses a 40/60 split list
   with a sticky detail panel. Tell me if that's right or if something else would serve a
   recipe book better.
4. **Anything you spot that's a function problem, not just a design one** — a flow that takes
   two taps and should take one, a missing state, something that's just confusing regardless of
   how it looks.

Format the response as: ranked redesign proposals (most impactful first), explicit answers to
the three numbered questions above, and a short "don't bother" list for anything you considered
but don't think is worth doing. Be direct — if something is genuinely bad, say so plainly
rather than softening it.
