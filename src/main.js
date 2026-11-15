import { Game } from './engine.js';
import { botDecide } from './bot.js';
import { UI } from './ui.js';

const ui = new UI();

async function start(name) {
  const game = new Game({
    humanName: name,
    decide: (g, pl, kind, ctx) => (pl.isHuman && !pl.autopilot ? ui.decide(g, pl, kind, ctx) : botDecide(g, pl, kind, ctx)),
    onEvent: (e) => ui.onEvent(e),
  });
  ui.attach(game);
  await game.run();
  const again = await ui.showGameOver();
  if (again) start(name);
}

ui.showTitle().then(start);
