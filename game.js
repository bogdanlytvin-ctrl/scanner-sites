const gameArea = document.getElementById("gameArea");
const runner = document.getElementById("runner");

const gameStateEl = document.getElementById("gameState");
const multiplierEl = document.getElementById("multiplierValue");
const progressEl = document.getElementById("progressValue");
const finalResultEl = document.getElementById("finalResult");

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const restartButton = document.getElementById("restartButton");

let rafId = null;
let isRunning = false;
let startTime = 0;
let elapsedMs = 0;
let stopAnimTimer = null;

function setState(stateText, stateClass) {
  gameStateEl.textContent = stateText;
  gameStateEl.className = `value ${stateClass}`;
}

function setButtonsForRunning(running) {
  startButton.disabled = running;
  stopButton.disabled = !running;
}

function updateHud() {
  const seconds = elapsedMs / 1000;
  const multiplier = 1 + seconds * 0.35;

  progressEl.textContent = `${seconds.toFixed(2)}s`;
  multiplierEl.textContent = `x${multiplier.toFixed(2)}`;
}

function positionRunner() {
  const areaWidth = gameArea.clientWidth;
  const areaHeight = gameArea.clientHeight;
  const runnerSize = runner.offsetWidth;

  const seconds = elapsedMs / 1000;
  const speedPx = 90 + seconds * 18;
  const travel = (elapsedMs / 1000) * speedPx;
  const maxX = Math.max(0, areaWidth - runnerSize);
  const x = maxX > 0 ? travel % maxX : 0;

  const wave = Math.sin(elapsedMs / 240) * Math.min(16, areaHeight * 0.09);
  const centerY = areaHeight * 0.5 - runnerSize * 0.5;
  const y = Math.max(0, Math.min(areaHeight - runnerSize, centerY + wave));

  runner.style.transform = `translate(${x}px, ${y}px)`;
}

function animate(timestamp) {
  if (!isRunning) return;
  elapsedMs = timestamp - startTime;
  updateHud();
  positionRunner();
  rafId = requestAnimationFrame(animate);
}

function startGame() {
  if (isRunning) return;

  if (stopAnimTimer) {
    clearTimeout(stopAnimTimer);
    stopAnimTimer = null;
  }

  isRunning = true;
  startTime = performance.now() - elapsedMs;

  runner.classList.remove("runner-stopped");
  setState("Running", "state-running");
  finalResultEl.textContent = "Final result: -";
  setButtonsForRunning(true);

  rafId = requestAnimationFrame(animate);
}

function stopGame() {
  if (!isRunning) return;

  isRunning = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  runner.classList.add("runner-stopped");
  setState("Stopped", "state-stopped");
  setButtonsForRunning(false);

  const seconds = elapsedMs / 1000;
  const multiplier = 1 + seconds * 0.35;
  finalResultEl.textContent = `Final result: ${seconds.toFixed(2)}s | x${multiplier.toFixed(2)}`;

  stopAnimTimer = setTimeout(() => {
    runner.classList.remove("runner-stopped");
    stopAnimTimer = null;
  }, 420);
}

function resetGame() {
  if (isRunning) {
    stopGame();
  }

  elapsedMs = 0;
  updateHud();
  runner.classList.remove("runner-stopped");
  runner.style.transform = "translate(0px, 0px)";
  setState("Idle", "state-idle");
  finalResultEl.textContent = "Final result: -";
  setButtonsForRunning(false);
}

startButton.addEventListener("click", startGame);
stopButton.addEventListener("click", stopGame);
restartButton.addEventListener("click", resetGame);

window.addEventListener("resize", () => {
  positionRunner();
});

updateHud();
positionRunner();
