# VAU 1: the unit standard

Version 1, November 2026. This document says what a Vector Abliteration Unit is and what a host must do to run one. The package in `src/vau/` implements the host's side; `src/vau/units/` holds the built-in units.

## 1. Units and hosts

A **unit** is one Python file that changes, or reads, what a model does from inside while it runs. A **host** is the application that loads the model, finds units, checks them, and runs the ones a user puts in a chain. The two meet only through a small interface:
- the unit declares itself in a manifest and supplies a few functions;
- the host supplies a `UnitContext`, through which the unit reads its parameters and asks for places in the model to act on.

A unit never registers a hook on the model itself. It asks the host, and the host registers the hook, may wrap it (to measure how much it changes what it touches, for instance), and removes it after the run.

## 2. The manifest

A unit file defines a module-level dict `UNIT`:

| Key | Required | Meaning |
|---|---|---|
| `vau` | yes | The version of this standard the unit is written for: `1`. |
| `id` | yes | The word that begins the unit's line in a chain. Lower case, unique in the host. |
| `title` | yes | The unit's full name. |
| `short` | if the title is longer than 14 characters | The unit's short name, at most 14 characters, for a host's tight spaces: `Clamp` for Component Clamp, `Average` for Running Average. Without it the short name is the title. |
| `what` | yes | One line on what the unit does. |
| `category` | yes | `intervention`, `effect`, `fitted`, `meter` or `sampler`. |
| `level` | yes | Where it acts: `model` (while the model runs), `weights` (on parameters, restored after), `order` (the order of the layers), `sampler` (on the choice of output), `probe` (reads, changes nothing). |
| `site` | yes | The kind of place it acts on, independent of any one model: `stream`, `output`, `weights` or `logits` (section 4). |
| `axis` | no | `any` (the default) or `ordered`, if the unit needs positions in order (a delay draws on earlier positions). |
| `space` | no | What the unit transforms: `stream`, `hidden` (an MLP's neurons), `component` (what attention or an MLP writes), `weights`, `logits` or `conditioning` (a prompt's or a style's embedding). Defaults from `site` (section 4). |
| `targets` | yes | The target kinds its line takes, such as `layer`, `head`, `attn`, `mlp`, `block`; `[]` if none. |
| `requires` | no | Capabilities it needs beyond its site (section 4). |
| `params` | yes | Its parameters (section 3). |
| `example` | no | A chain line that uses it, for a host's "add". |
| `help` | no | A paragraph of HTML for a host's help page. |
| `inspired_by` | no | What inspired it (an audio device, a published method). |
| `summary` | no | What a host's summary of the unit's strip reads, for a unit that changes the model (section 5e). |
| `display` | for a meter | How its readings are drawn (section 5b). |
| `references` | no | A list of works it draws on. |
| `version`, `author`, `licence` | no | The unit's own version, its author, and its licence. |

Every unit has two names, a full one and a short one, and the catalogue gives both (`title`, `short`). A host chooses which to show where: the short one in a strip's top bar, say, and the full one in its help and its lists. Either is shown with the unit's collection's prefix (vComponent Clamp, vClamp; section 5d).

## 3. Parameters

Each entry in `params` has a `key` (lower case, and not one of the target names `head`, `attn`, `mlp`, `block`, `layer`, which a line uses for its target), a `label`, a `tip`, and a `kind`. The **tip** is what a host shows when the pointer rests on the control: one short line (at most 100 characters), written as a formula or as code where the transformation can be shown that way, for example `h' = (1 − mix)·h + mix · L·tanh(h / L)` for the vTanh Squash's mix. The host features have tips too.

| Kind | Takes |
|---|---|
| `knob`, `fader` | A number, with `min`, `max`, `default` and optionally `step`. A unit has at most one fader, its main control. |
| `int` | A whole number, with `min`, `max`, `default`. |
| `choice` | One of `choices`. |
| `toggle` | 0 or 1. |
| `direction` | The name of a direction the host keeps. |
| `text` | Free text, with an optional `hint`. |

`required: true` marks a parameter the line must give. `neutral` is the value at which the unit changes nothing, where it has one. A unit set to all its neutral values must leave the model's output exactly as it is without the unit, and hosts and the conformance checks test that.

In a chain a line is written `id target=value key=value ...`, as in `delay layer=6 time=4 feedback=0.3 mix=0.5`. Values reach the unit as strings; `UnitContext` turns them into numbers with the manifest's defaults.

## 4. Sites, capabilities and adapters

Units name a **site**, a kind of place in a model, not a particular model:

| Capability | What the host offers |
|---|---|
| `stream` | A sequence of vectors that runs through the stack, one per position: a language model's residual stream, or the hidden states of a diffusion transformer. |
| `output` | What one component (attention, MLP) writes. |
| `weights` | A component's parameters, changed for a run and restored after. |
| `logits` | The output distribution at each step. |
| `ordered` | Positions in order, so that a position can draw on earlier ones. |
| `stats` | Each layer's mean, per-dimension spread and mean size over a reference set, measured on the unchanged model. |
| `pca` | Each layer's principal directions over a reference set. |
| `directions` | Named directions, one vector per layer. |
| `texts` | The unchanged model run on given inputs, to measure or fit before a run, and the host's reference set of ordinary inputs. |
| `contrasts` | The two sets of texts a direction was made from (an empty second set means the first was set against the reference set). |

A unit needs its site, `ordered` if its axis is ordered, `directions` if it has a direction parameter, and whatever it lists in `requires`. A host says what it offers in `Host.capabilities()`. A unit whose needs the host cannot meet is listed as unavailable, with what it lacks, and is not run.

A host reaches a model through an **adapter**, which maps the sites onto one architecture. The package's adapter covers GPT-2, Pythia and Llama-style language models. A unit that keeps to its site and its `UnitContext` runs unchanged under a later adapter (for a diffusion model, or an audio model) that offers the same capabilities.

### Site and space

`site` says where a host attaches a unit's hook, and is what capabilities are matched against; `space` says what the unit transforms. Mostly they agree: a `stream` unit transforms the stream, an `output` unit what a component writes (`component`), a `logits` unit the next-token distribution. Where they differ the manifest says so: vNeuron hooks the MLP's output but changes single neurons, so its space is `hidden`. A host may use the space to group its units, or to offer only those whose space its model has (a music model's `conditioning`, say). Heads, attention patterns and further spaces are added when a host exposes them.

Some units act on each coordinate of the stream separately (the Core Collection's vTanh Squash, vQuantise, vSparsify and vComponent Clamp). The stream's coordinates have a weaker claim to meaning than an MLP's neurons, which its nonlinearity singles out, and how much weaker depends on the model's norms. Such a unit says so in its help; the standard has no field for it.

## 5. Functions

All take a `UnitContext`, called `u` by convention.

| Function | When | Does |
|---|---|---|
| `validate(u)` | optional, when a line is read, before any model is loaded | Raises `u.error("...")` for a line that cannot work. The host has already checked required parameters, choices, numbers and targets. |
| `prepare(u)` | optional, before any hook goes on | Measures or fits on the unchanged model (`u.stats()`, `u.pca(layer)`, the host's `capture`), so that what it measures is of the model as it was. |
| `edit(u, layer)` | for a `stream` unit | Returns an edit `fn(h, pos) -> h` for one place in the stream. `h` is (batch, positions, width); `pos` gives each position's index along the axis. It must return a tensor of the same shape and dtype. |
| `attach(u)` | for any other unit, or a stream unit that needs more | Asks the host for hooks: `u.hook_stream(make)`, `u.hook_output(module, fn)`, `u.hook_input(module, fn)`, `u.on_restore(fn)`. |
| `read(u, data)` | for a meter | Returns one reading per step (section 5b). |
| `code(u)` | optional | `{"expr": ..., "note": ..., "uses": [functions]}` for a host's view of the code that runs: an expression for the edit, a note, and the functions whose source to print. |

`UnitContext` gives:
- **parameters**: `u.num(key)`, `u.int(key)`, `u.str(key)`, `u.flag(key)`, `u.clamped(key)`, `u.params`;
- **the strip**: `u.lineno` and `u.error(msg)`;
- **the host**: `u.device`, `u.stats()`, `u.pca(layer)`, `u.pca_scales(layer)` (the spread along each principal direction), `u.direction(key)`, `u.layers()` (places in the stream), `u.blocks()` (blocks, from 0), `u.depth()` (how many blocks the model has), `u.component(kind, block)` (a block's `attn` or `mlp` output projection), `u.memory(layer)` (a store that lasts one run), `u.direction_texts(key)`, `u.reference_texts()`, `u.capture(texts, modules)` (each module's inputs and outputs on the unchanged model), `u.cache(kind, key)` (a file the host keeps for the loaded model), and the hook requests above.

## 5a. Host features

Every strip also takes the host features, which the host applies around the unit's own edit, so that no unit implements them (`vau.hostfx`). Their keys are reserved: a unit may not take a parameter of the same name.

| Key | Kind | Does |
|---|---|---|
| `wet` | knob, 0 to 1, default 1 | How much of the strip's change is applied. 0 is neutral. |
| `env` | none, linear, bell, flat | An envelope over the depth: the change is scaled at each layer (a stream unit) or block (a unit that names the block it hooks). |
| `epeak`, `ewidth`, `eedge` | knobs, shares of the depth | Where the envelope peaks, how far it reaches either side, and its value at that reach as a share of the peak. |
| `keepnorm` | toggle | After the change, each position is scaled back to the size it had before it. A unit that only changes sizes (the vNorm Shrink) is undone by it. |
| `wfrom`, `wto` | ints, default 0 | A window: the strip acts only from step `wfrom` to step `wto` (step 1 is the pass that writes the first new token; earlier positions are the prompt's; `wto` 0 is to the end). Both 0 is everywhere. The host supplies `positions(n, device)` and `prompt_length()`. |
| `control` | none, random | Every direction the strip uses is replaced, at each layer, by a random direction of the same size, drawn from `cseed`, the direction's name and the layer. A unit fitted to a direction's texts (vMorph) refuses it. |
| `cseed` | int | The control's seed. |

A unit that hooks a component's output passes the block to `u.hook_output(module, fn, block=...)` so that the envelope can apply; without it only `wet` and `keepnorm` do.

## 5b. Meters

A meter reads the model and changes nothing: `category: meter`, `level: probe`, `site: stream` (it reads the stream at one place) or `site: logits` (it reads the model's next-token distribution). It declares how its readings are drawn:

```python
"display": {"kind": "series", "label": "uncertainty about the next token", "unit": "bits"}
```

| Display | Each reading | Drawn as |
|---|---|---|
| `series` | `{"value": number}` | the value at the shown step, for each text, and a line over every step |
| `words` | `{"top": [[text, number], ...]}` | a ranked list at the shown step, like a logit lens |

The meter supplies `read(u, data)`. The host fills a meter after the run, in a teacher-forced pass over each text (the original text with the meters alone, the diverged text with the whole chain), and hands it, one row per step (step j is the pass that wrote token j):

| Key | Holds |
|---|---|
| `stream` | (steps, width): the stream at the meter's place, for a stream meter |
| `logprobs` | (steps, vocabulary): the next-token log probabilities as the chain leaves the model, for a logits meter |
| `tokens` | the ids written |
| `decode` | a function from a list of ids to text |

`read` returns one reading per step; `vau.read` checks the count and the keys. A meter registers no hook while the texts are written.

## 5c. Explainers (optional)

A unit may come with an explainer: an animated figure of what its code computes, which a host shows as the unit's help and the site shows on the units page. It is a script beside the unit's file, named like it with `.explain.js` in place of `.py` (`compressor.py`, `compressor.explain.js`). It registers itself with the explainer runtime that the `vau` package ships (`vau/explain/explain.js`):

```js
(function (X) {
  if (!X) return;
  var H = X.h;                                  // drawing helpers: H.T (text), H.R (rect), H.L (line), H.stage, ...
  X.register("gain", {
    caption: "What the figure shows, in a sentence or two.",
    examples: "k 0.5 and 2",                   // the settings examples.json has texts for, if any
    still: 1500,                                // the moment drawn once under reduced motion (ms)
    draw: function (t, ex) {                    // t: the figure's clock, ms; ex: the example texts or null
      return { svg: H.T(20, 30, "k = 2"), read: "h' = k · h", setting: 0 };
    },
  });
})(window.VAUExplain);
```

`draw` returns the inside of a 400 × 210 SVG, the readout line under it, and which of the unit's example settings it is showing (`setting`, an index into the unit's rows in `examples.json`; a meter also gives the `token` it has reached). Its marks take the runtime's classes (`f-acc`, `s-line`, `t-s` and so on), so that they follow the host's colours. The runtime adds the pause button, stops a figure while it is off screen, and draws it once, at `still`, when the reader prefers reduced motion.

A host serves the files `vau.explain_files(registry)` names and no others: the runtime (`explain.js`, `explain.css`), the example texts (`examples.json`) and each unit's explainer as `<id>.explain.js`. It loads the runtime, then the explainers it needs, and calls `VAUExplain.mount(element, id, {examples: url})`. The catalogue marks each unit that has an explainer (`explain: true`). A host without one shows the manifest alone; the manifest checks do not ask for an explainer.

## 5d. Collections and their look (host presentation)

A collection is a set of units published together, with a name and, if it has one, a look: the stylesheet a host draws its units' strips with, so that they read as that collection's on any desk, apart from the host's own strips. The units the `vau` package ships are the **Core Collection** (id `core`). A unit's catalogue entry names its collection (`collection: "core"`), or `null` for a unit outside any collection, such as one in a user's folder. `vau.COLLECTIONS` lists the collections with their titles, looks and prefixes. A collection may give a prefix for its units' names, which a host shows before the name wherever it names a unit in that collection: on its strip's top line, in menus and lists, in help. The Core Collection's prefix is a small lowercase `v` (vNorm Shrink, vSparsify), which marks its units as vector effects rather than audio effects. The catalogue gives it as `prefix` (`""` for a unit outside any collection). The manifest's `title` and the unit's `id` do not change, so chains and saved recipes keep working. More collections can come later, each with a look of its own.

A unit's strip is shared between the host and VAU:
- **The host** draws the strip's frame and its top line: the power light, the strip's number, the unit's name, the help button and the output summary (for example an activity light). These keep the host's look on every strip.
- **VAU** supplies what goes in them: the help text and graphics (the manifest's `help` and tips, and the explainer, section 5c), and the suggested output for the summary (a meter's `display`, section 5b, or an effect's `summary`, section 5e). It also supplies the card: the unit's controls (target, knobs, menus, toggles, fader) or a meter's screen, drawn in the unit's collection's look.

A host that draws units as strips SHOULD let VAU draw each unit's card:
- it gives VAU an element for the card, which fills the strip below the top line, to the strip's left, right and bottom edges, and calls `VAUCard.mount(element, options)` from the card runtime (section 5f). VAU gives the host that whole space and draws everything on it: the unit's controls, its target, the host features, a meter's screen where the host supplies one, and the footer;
- it loads the runtime and each collection's interface, which `vau.look_files()` names (`card.js`, `card.css`, `core.css`, `core.json`), and serves those files and no others for it;
- the strip's frame and top line stay outside the card, in the host's own look.

A host may draw a card itself, from the same manifest and interface, but the standard discourages it: a unit should look and handle the same on every host. A host may also give a unit a display title of its own, where the canonical one would mislead in its setting (an audio host calling vPosition Repeat "Frame Repeat", since its positions are 40 ms frames of sound). The unit's `id`, its parameter keys and its canonical title do not change; the host shows the canonical title, with its collection's prefix, in the unit's help; and the prefix belongs to the canonical name, not to the host's. Units outside any collection get a plain card from the same runtime.

A collection's look is an interface language of its own, kept apart from its units: a unit's manifest says what it does, its parameters and the readings it suggests, and nothing about how it looks. The interface is two files in `vau/look/`, a stylesheet (`core.css`) and the rest (`core.json`): which component draws each control (section 5f), and the units' `tint` (`#rrggbb`), one for the whole collection (`tint`) or, where a collection wants it, one per unit (`tints`, by id). The Core Collection's units share one, the faceplate's blue. The catalogue entry carries it as `tint` (`null` outside a collection). A host may let it into its own frame or top line (a glass top bar, say); the card keeps its collection's look. Another collection can bring a different interface for the same kinds of unit.

A collection's stylesheet sets only `--vu-*` properties on its class and styles the mark; the components' shapes are the runtime's (`card.css`). The top line and the frame stay the host's.

### The Core Collection's look

A piece of studio hardware, photographed rather than drawn: inspired by blue-panelled valve-era outboard equalisers and compressors in a rack.

| Part | The look |
|---|---|
| Faceplate (the card) | Deep blue enamel, `#24448c` at the top to `#1a356f` at the foot, with a fine grain (fractal noise, white at 9 per cent), a bevel (a light top edge, a dark inner shadow below), a near-black border `#0b1b42`, and two domed chrome screws at the foot, either side of the mark, a faint VAU footer. |
| Legends | White (`#ffffff`; labels `#f1f4fa`; quieter text `#b9c8e6`) in a grotesque (Helvetica Neue, Helvetica, Arial), engraved-style: labels in capitals of medium weight (500), letter-spaced 0.07em. Values in the same face. A faint bloom (a 0.5px white text-shadow) keeps them from looking printed by a screen. |
| Knobs | Black, fluted (a rim of 24 flutes, 2.4 units wide), lit from the upper left: a dome shading from `#2a2b30` to black, with a soft highlight. A white pointer from the centre almost to the rim. No coloured arc: the scale is a ring of eleven printed white dots around the knob (the track, `pathLength` 100, dashed `0 10` with round caps); the pointer reads the value. A shadow falls below the knob. |
| Menus and switches | Black, like the knobs, with a slight vertical sheen; small white text (9.5px) in the legends' face. |
| Main knob and selectors | No fader: the main parameter is a large black fluted knob (`knob-big-1`) with the numbers 0 to 10 printed around it in white, or its range printed at its ends (`knob-big-3`). A choice of up to five is a rotary selector: a black lever on a black body, its choices printed around it, the current one in white and the rest dimmed. |
| Lights | A switch's lamp on the card (`light-1`): a faceted red jewel in a chrome bezel (`#c7cbd2`, 2px): on, a radial gradient from a white-hot centre through `#ff4f2b` to `#600803`, with an orange-red glow; off, a dark ruby. |
| Meter | A backlit amber face, `#fdf0c4` at the centre to `#bf8642` at the edges, behind glass (a diagonal glare across the top), in a 3px black bezel with an inner shadow. Black ink (`#1b140b`), a red zone and the diverged text's needle in `#c9221a`, the original text's needle in black. |
| Focus | No coloured box on the panel: a focused knob has a soft white halo. |
| Softness | A very slight blur (0.2px) on the knobs, the lights and the meter face, so the strip looks photographed rather than rendered. |

| Property | Part |
|---|---|
| `--vu-bg`, `--vu-border`, `--vu-bevel`, `--vu-card-pad` | the card (the background may have several layers; the border is the line under the top line), its box-shadow and padding; its corners follow the host's frame |
| `--vu-ink`, `--vu-dim`, `--vu-faint`, `--vu-soft` | values; labels; notes; a text-shadow |
| `--vu-font`, `--vu-value-font`, `--vu-label-case`, `--vu-label-spacing`, `--vu-label-weight` | type |
| `--vu-field`, `--vu-field-edge`, `--vu-field-size`, `--vu-field-font` | menus, text fields, toggles and small buttons: background, edge, type size and face |
| `--vu-knob-hi`, `--vu-knob-mid`, `--vu-knob-lo`, `--vu-knob-rim`, `--vu-knob-body`, `--vu-knob-edge`, `--vu-knob-edge-width`, `--vu-knob-flutes`, `--vu-knob-track`, `--vu-knob-track-width`, `--vu-knob-dots`, `--vu-knob-arc`, `--vu-knob-pointer`, `--vu-knob-filter` | a knob: its body is a dome shaded from `hi` to `rim` (or plain `body`); flutes and dots are dash patterns on a `pathLength` of 100 |
| `--vu-fader-value`, `--vu-fader-rule`, `--vu-fader-slot`, `--vu-fader-slot-edge`, `--vu-fader-cap`, `--vu-fader-cap-shade`, `--vu-fader-cap-light` | the fader |
| `--vu-led`, `--vu-led-edge`, `--vu-led-edge-width`, `--vu-led-shadow`, `--vu-led-on`, `--vu-led-on-edge`, `--vu-led-on-shadow`, `--vu-led-filter` | a light on the card, off and on |
| `--vu-screen`, `--vu-screen-edge`, `--vu-screen-edge-width`, `--vu-screen-radius`, `--vu-screen-shadow`, `--vu-screen-filter` | a meter's screen |
| `--vu-screen-ink`, `--vu-screen-dim`, `--vu-screen-rule`, `--vu-screen-track`, `--vu-screen-bar`, `--vu-screen-hot` | on the screen: text; quieter text; rules and the step marker; a bar's track; a bar, the original text's line and needle; the diverged text's heading, bar, line and needle, and the scale's red zone |
| `--vu-focus`, `--vu-focus-glow` | keyboard focus on the card: the outline (`none` for no box) and a knob's glow while it has focus |
| `--vu-shadow` | the opacity of the shadow under a knob or a selector (the runtime draws it, with a very slight blur, on the body only) |
| `--vu-scale`, `--vu-switch-edge` | the numbers printed around a large knob and a selector's choices; a selector's edge |
| `--vu-meter-needle` | `block` where the look draws a meter as needles |
| `--vu-mark` | the mark, a footer across the card's foot, at 45 per cent opacity |

## 5e. The summary a unit suggests

A host shows a summary of each strip after a run: for example, how much the strip changed what it touched at each step. A unit that changes the model may suggest what that summary reads, with an optional `summary` in its manifest:

```python
"summary": {"reads": "gain", "label": "gain reduction"}
```

`reads` is one of four measures, which a host computes from what each of the unit's hooks received and returned, at each position, and averages over the unit's hooks:

| `reads` | The measure | Shown in |
|---|---|---|
| `change` | the size of the change over the size of what it touched, ‖h′ − h‖ / ‖h‖ | per cent |
| `gain` | the change in size, 20 log₁₀(‖h′‖ / ‖h‖) | dB |
| `turn` | the angle between what it touched and what it left, arccos of their cosine | degrees |
| `touched` | the share of components it changed | per cent |

`label` says what the reading is for this unit (`gain reduction`, `rotation`, `zeroed`). A host shows the label and the reading at the shown step, and may draw the reading over the steps. A meter suggests its own readings through its `display` (section 5b) and has no `summary`. A host that cannot compute a measure shows its own summary.

## 5f. The interface language: components

A collection's interface draws a unit's card from a fixed vocabulary of **components**, which the card runtime (`vau/look/card.js`) implements once for every collection. A collection chooses which component draws each control and styles them all; a unit names none of them, so a later collection can draw the same units with other components or another look.

| Component | What it is | For |
|---|---|---|
| `knob-small-1` | a small knob (30 px): a ring of printed dots, an arc, a pointer | a target's layer, the host features |
| `knob-1` | a knob (42 px), two to a row | a `knob` or `int` parameter |
| `knob-big-1` | a large knob, the numbers 0 to 10 printed around it | a unit's main parameter |
| `knob-big-3` | a large knob, its range printed at its two ends | a main parameter whose ends mean something |
| `selector-small` | a rotary selector: a lever on a body, two or three choices printed in an arc | a short `choice` |
| `selector-med` | the same, for four or five choices | a `choice` |
| `menu-1` | a menu | a longer `choice`, a `direction`, the target's kind |
| `light-1` | a switch with a lamp, lit when on | a `toggle` |
| `field-1` | a line of text | a `text` parameter, a target given as a range |
| `fader-1` | a vertical fader | a `fader`, for a collection that keeps faders |
| `meter-1` | a needle meter: the reading at the shown step for each text, over a scale that turns red at the top | a meter that reads one number per step |
| `meter-3` | bars: the reading at the shown step for each text | (reserved) |

A collection's interface file (`look/<collection>.json`) maps controls onto components:

```json
"components": {
  "defaults": {"knob": "knob-1", "fader": "knob-big-1", "choice": "selector", "toggle": "light-1",
               "target": "knob-small-1", "target-menu": "menu-1", "host-knob": "knob-small-1"},
  "units": {"gate": {"keep": "knob-big-3"}}
}
```

`defaults` maps a parameter's kind, or a control's role (`target`, `target-menu`, `host-knob`, `host-choice`, `host-toggle`), to a component; `units` maps a unit's own keys. `selector` picks `selector-small` or `selector-med` by the number of choices, and a menu past five, or where the settings' names would not fit around the lever (one longer than 8 characters, or more than 15 in all). A `direction` is always its own kind, a menu by default, since its choices are the host's directions. The Core Collection draws its main parameter as a large knob, so its cards have no faders.

`VAUCard.mount(element, options)` takes the unit's catalogue entry, its collection's interface, `get(key)` and `set(key, value)` for the line, the host's directions, and the controls only the host can describe: the target (the model's layers and heads) and the host features, each as `{key, label, kind, role, min, max, choices, reset, get(), put(value)}`. A meter's screen is the host's, since it holds the run's readings; the host draws a one-number reading on it with `VAUCard.needle(original, diverged, unit)` (`meter-1`) where the look shows needles (`--vu-meter-needle`), and passes it as `screen`, which the card puts in its main place.

## 6. Where units come from

A host loads the built-in units from the package (`vau.BUILTIN`), then any folders it adds, such as a user folder. A unit is ordinary Python, so loading one runs it:
- a host loads units only from local folders;
- it never downloads one;
- it marks every unit that is not built in, so the user can see which code is whose.

A file that fails to load, fails the checks, or takes an id already in use is left out and listed with its reason. The other units are unaffected.

## 7. Conformance

`vau.testing.conformance(unit)` checks a unit without a model, on a stand-in host with random statistics and directions:
- its manifest;
- its example line;
- that its edit keeps the stream's shape and dtype;
- that its neutral values change nothing.

A host should also test neutrality on a real model, where the output must be identical.

## 8. Versions

This is VAU 1. A host refuses a unit written for a version it does not run. Within VAU 1, additions keep existing units working; anything that would break them waits for VAU 2.
