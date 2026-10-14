// Empty game loop: clears the canvas every frame and shows FPS.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let fps = 0;

function update(dt) {
  // game logic goes here
}

function render() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Fate Battle Royale', canvas.width / 2, canvas.height / 2);

  ctx.textAlign = 'left';
  ctx.font = '12px monospace';
  ctx.fillText(`FPS: ${fps.toFixed(0)}`, 8, 16);
}

function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  fps = fps * 0.9 + (1 / Math.max(dt, 1e-6)) * 0.1;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
