# State machines

Anything that can only be in one of a few conditions has its states and allowed moves written down in one file.
The panel shows the current state on its host element, so CSS, tests and AI agents can read it:
`#wasi-india-root[data-wasi-state]`, `[data-wasi-tab]`, `[data-wasi-rec]`.

## Sticker job: `extension/state/stickerJob.js`

```
empty --pick--> loading --loaded--> editing --build--> building --built--> ready --send--> sending --sent--> sent
                  |                   ^                  |                   |               |
                  +--failed--> error  +---- edit --------+-------------------+               +--failed--> error
```

- Any change while building or ready (cut, speed, caption, volume) goes back to `editing` and drops the built
  file, so a sticker that no longer matches the screen is never sent.
- Each load and build takes a run number. A late answer from an older run (for example after Cancel) is dropped
  as stale **before** the move table is checked.
- A failed send keeps the built sticker, so `error` allows `send` again; a failed load or build does not.
- `reset` uses the same starting values as first load.
- Edit values are clamped in one place (`clampEdit`): max 15 seconds of source, known speeds only, caption 40
  characters.

## Recorder: `extension/state/recorder.js`

```
idle --ask--> asking --granted--> recording --stop | limit--> done
                |                     |
                +--denied--> denied   +--failed--> idle
```

The 15 second limit is a `tick` that moves to `done` by itself.

## Not a state on purpose

- The send cooldown (3 seconds) is worked out from the time of the last send, never stored as a state, so it
  cannot get stuck.
- Language, emoji, frame and caption position are plain settings (`prefs`), not states.

## Tests

`npm test` covers every allowed move, every refused move, stale answers, clamping and that every state has an
English and Hindi label.

## Adding a state

1. Add it to `STATES`, `MOVES` and `LABELS` (English and Hindi).
2. Handle the event in `transition()`.
3. Run `npm test`; the "every allowed move" and "every refused move" tests pick it up by themselves.
