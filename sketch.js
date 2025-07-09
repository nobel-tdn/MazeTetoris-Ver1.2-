// Extended p5.js Maze Game – v7
// Feature: Added dynamic pathfinder enemies and block outlines.
// Removed: Static triangle enemies.
//---------------------------------------------------------------
let cols = 20;
let rows = 20;
let cellSize = 20;
let grid = [];
let stack = [];
let player;
let goal;
let lastMoveDir = { dx: 0, dy: 1 };
let lastKeyDir = { dx: 0, dy: 1 }; // 最後に押したキーの方向
let lastMoveTime = 0;
const moveCooldown = 100;
let stage = 1;
let visitedTrail = new Set();

// --- Sound Effects ---
let moveSound;
let shootSound;
let hitSound;
let coinSound;
let bgMusic;
let soundMuted = false;
let soundVolume = 0.8;
let soundStarted = false;

// --- Instructions UI ---
let instructionsClosed = false;

function startSoundIfNeeded() {
  if (!soundStarted) {
    if (bgMusic && bgMusic.isLoaded() && !soundMuted) {
      if (!bgMusic.isPlaying()) {
        bgMusic.loop();
      }
    }
    soundStarted = true;
  }
}

// --- Block Definitions & Settings ---
const tetrominoes = [
    { shape: [[1, 1, 1, 1]], color: '#00FFFF' }, // I (Cyan)
    { shape: [[1, 1], [1, 1]], color: '#FFFF00' }, // O (Yellow)
    { shape: [[0, 1, 0], [1, 1, 1]], color: '#800080' }, // T (Purple)
    { shape: [[1, 1, 0], [0, 1, 1]], color: '#00FF00' }, // S (Green)
    { shape: [[0, 1, 1], [1, 1, 0]], color: '#FF0000' }, // Z (Red)
    { shape: [[1, 0, 0], [1, 1, 1]], color: '#FFA500' }, // L (Orange)
    { shape: [[0, 0, 1], [1, 1, 1]], color: '#0000FF' }  // J (Blue)
];

let blocks = [];
let blockSpawnInterval = 1500;
let lastBlockTime = 0;
const BLOCK_FALL_SPEED = 2;

// Entities
let coins = [];
const MAX_COINS = 10;
let bullets = [];
let shooters = [];
let pathfinderEnemies = []; // 💥 New dynamic enemy array

let canvas;
let isMobileMode = false;
// 可動式バーチャルスティック用
let stickActive = false;
let stickRadius = 60;
let knobRadius = 32;
let stickCenter, knobPos;
let stickDragging = false;
let stickPointerId = null;
let stickDx = 0, stickDy = 0;
let stickLastMove = 0;

// 迷路の中央描画用
let mazeOffsetX = 0, mazeOffsetY = 0;

// =============================================================
function getMaxCellSize() {
  // 画面の80%以内に収める
  const maxW = windowWidth * 0.9;
  const maxH = windowHeight * 0.7;
  return Math.floor(Math.min(maxW / cols, maxH / rows));
}

function isMobile() {
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function setup() {
  cellSize = getMaxCellSize();
  createCanvas(windowWidth, windowHeight);
  frameRate(60);
  loadSounds(); // Load sounds on setup
  calcMazeOffset();
  initStage();
  isMobileMode = isMobile();
  if (isMobileMode) setupMobileUI();
  // ユーザー操作でサウンド開始
  window.addEventListener('touchstart', startSoundIfNeeded, {once:true});
  window.addEventListener('keydown', startSoundIfNeeded, {once:true});
  updateInstructions();
  setupInstructionsUI();
}

function calcMazeOffset() {
  mazeOffsetX = (width - cols * cellSize) / 2;
  mazeOffsetY = (height - rows * cellSize) / 2 + 40;
}

let stageStartTime = 0;
let lastStageScore = 0;

function initStage() {
  generateMaze();
  player = { i: 0, j: 0, lives: 3 };
  goal   = { i: cols - 1, j: rows - 1 };
  visitedTrail.clear();
  markVisited(player.i, player.j);
  blocks  = [];
  bullets = [];
  coins   = [];
  shooters = [];
  pathfinderEnemies = [];
  generateCoins();
  generateShooters();
  generatePathfinderEnemies();
  lastBlockTime = millis();
  stageStartTime = millis();
}

function draw() {
  background(255);
  // 迷路・プレイヤーなどは中央に描画
  push();
  translate(mazeOffsetX, mazeOffsetY);
  drawTrail();
  updateBlocks();
  drawBlocks();
  drawCoins();
  updateShooters();
  updatePathfinderEnemies();
  updateBullets();
  for (let cell of grid) cell.show();
  drawPlayer();
  drawGoal();
  pop();
  // スティックはtranslateの外で描画（画面全体どこでも表示）
  if (isMobileMode) drawVirtualStick();
  handleMovement();
  checkGoalReached();
  drawHUD();
}

// =============================================================
//  PLAYER (No changes)
// =============================================================
function drawPlayer(){
  fill(0,0,255);noStroke();
  ellipse(player.i*cellSize+cellSize/2,player.j*cellSize+cellSize/2,cellSize*.5);
}
function handleMovement(){
  if (isMobileMode) {
    // スティックの方向・強さで移動
    const t = millis();
    if (stickActive && stickDragging && (Math.abs(stickDx) > 0.3 || Math.abs(stickDy) > 0.3)) {
      if (t - stickLastMove > 120) {
        let dx = Math.abs(stickDx) > Math.abs(stickDy) ? Math.sign(stickDx) : 0;
        let dy = Math.abs(stickDy) > Math.abs(stickDx) ? Math.sign(stickDy) : 0;
        if (dx !== 0 || dy !== 0) {
          movePlayer(dx, dy);
          stickLastMove = t;
        }
      }
    }
    return;
  }
  const t=millis();
  if(t-lastMoveTime<moveCooldown)return;
  const idx=indexFrom(player.i,player.j);
  if(!grid[idx])return;
  const cell=grid[idx];
  let moved=false;
  let targetI=player.i;
  let targetJ=player.j;
  
  // キー入力の方向を記録（移動できなくても）
  if(keyIsDown(UP_ARROW)||keyIsDown(87)){
    lastKeyDir={dx:0,dy:-1};
    if(!cell.walls[0]){
      targetJ--;moved=true;lastMoveDir={dx:0,dy:-1};
    }
  }else if(keyIsDown(DOWN_ARROW)||keyIsDown(83)){
    lastKeyDir={dx:0,dy:1};
    if(!cell.walls[2]){
      targetJ++;moved=true;lastMoveDir={dx:0,dy:1};
    }
  }else if(keyIsDown(LEFT_ARROW)||keyIsDown(65)){
    lastKeyDir={dx:-1,dy:0};
    if(!cell.walls[3]){
      targetI--;moved=true;lastMoveDir={dx:-1,dy:0};
    }
  }else if(keyIsDown(RIGHT_ARROW)||keyIsDown(68)){
    lastKeyDir={dx:1,dy:0};
    if(!cell.walls[1]){
      targetI++;moved=true;lastMoveDir={dx:1,dy:0};
    }
  }
  
  if(moved){
    player.i=constrain(targetI,0,cols-1);
    player.j=constrain(targetJ,0,rows-1);
    markVisited(player.i,player.j);
    collectCoinAt(player.i,player.j);
    lastMoveTime=t;
    playMoveSound();
  }
}
function keyPressed(){
  if(key===' '||key==='O'||key==='o'){
    shootBullet(player.i,player.j,lastKeyDir.dx,lastKeyDir.dy,'player');
    playShootSound();
  }
  if(key==='M'||key==='m'){
    toggleMute();
  }
}
function playerHit(){
  player.lives--;
  if(player.lives<0)player.lives=0;
  player.i=0;
  player.j=0;
  visitedTrail.clear();
  markVisited(player.i,player.j);
  bullets=[];
  blocks=[];
  // 敵は復活しない（元の仕様）
}

// =============================================================
//  COINS & BULLETS (Bullet logic updated)
// =============================================================
function generateCoins(){const desired=Math.min(MAX_COINS,floor(cols*rows*.05));let attempts=0;while(coins.length<desired&&attempts<desired*20){const i=floor(random(cols));const j=floor(random(rows));if((i===0&&j===0)||(i===goal.i&&j===goal.j)){attempts++;continue}if(!coins.some(c=>c.i===i&&c.j===j))coins.push({i,j});attempts++}}
function drawCoins(){fill(255,200,0);noStroke();for(const c of coins){ellipse(c.i*cellSize+cellSize/2,c.j*cellSize+cellSize/2,cellSize*.4)}}
function collectCoinAt(i,j){const idx=coins.findIndex(c=>c.i===i&&c.j===j);if(idx!==-1){coins.splice(idx,1);playCoinSound()}}
function shootBullet(i,j,dx,dy,owner){if(dx===0&&dy===0)return;bullets.push({x:i*cellSize+cellSize/2,y:j*cellSize+cellSize/2,dx,dy,speed:5,owner})}
function updateBullets(){for(const b of bullets){b.x+=b.dx*b.speed;b.y+=b.dy*b.speed}
bullets=bullets.filter(b=>{if(b.x<0||b.y<0||b.x>width||b.y>height)return false;const bulletGridI=floor(b.x/cellSize);const bulletGridJ=floor(b.y/cellSize);if(b.owner==='enemy'){if(bulletGridI===player.i&&bulletGridJ===player.j){playerHit();return false}}
if(b.owner==='player'){for(let i=shooters.length-1;i>=0;i--){const s=shooters[i];if(s.alive&&hitEnemy(b,s)){shooters.splice(i,1);playHitSound();return false}}
// 💥 Check for hits against new pathfinder enemies
for(let i=pathfinderEnemies.length-1;i>=0;i--){const e=pathfinderEnemies[i];if(e.alive&&hitEnemy(b,e)){pathfinderEnemies.splice(i,1);playHitSound();return false}}}
return true});noStroke();for(const b of bullets){fill(b.owner==='player'?'blue':'red');ellipse(b.x,b.y,cellSize*.2)}}
function hitEnemy(b,e){const ex=e.i*cellSize+cellSize/2;const ey=e.j*cellSize+cellSize/2;return dist(b.x,b.y,ex,ey)<cellSize*.5}

// =============================================================
//  STATIC SHOOTER ENEMIES (No changes)
// =============================================================
class Shooter{constructor(i,j){this.i=i;this.j=j;this.alive=true;this.interval=1200;this.lastShot=millis()}
update(){if(!this.alive)return;if(millis()-this.lastShot>this.interval){let dx=0;let dy=0;if(abs(player.i-this.i)>abs(player.j-this.j)){dx=Math.sign(player.i-this.i)}else if(abs(player.j-this.j)>abs(player.i-this.i)){dy=Math.sign(player.j-this.j)}else{dx=Math.sign(player.i-this.i);dy=Math.sign(player.j-this.j);if(dx===0&&dy===0){dx=lastMoveDir.dx;dy=lastMoveDir.dy}}
if(dx===0&&dy===0&&(player.i!==this.i||player.j!==this.j)){const randomDir=floor(random(4));if(randomDir===0)dy=-1;else if(randomDir===1)dx=1;else if(randomDir===2)dy=1;else dx=-1}
if(dx!==0||dy!==0){shootBullet(this.i,this.j,dx,dy,'enemy')}
this.lastShot=millis()}}
draw(){if(!this.alive)return;fill(255,0,255);noStroke();rect(this.i*cellSize+cellSize*.2,this.j*cellSize+cellSize*.2,cellSize*.6,cellSize*.6)}}
function generateShooters(){
  shooters = [];
  let tries=0;
  const numShooters = Math.max(5, 5 + stage - 1); // ステージ1は5体、以降増加
  while(shooters.length<numShooters&&tries<numShooters*50){
    const i=floor(random(cols)),j=floor(random(rows));
    if((i===0&&j===0)||(i===goal.i&&j===goal.j)||distance(i,j,player.i,player.j)<5){tries++;continue}
    shooters.push(new Shooter(i,j));tries++;
  }
}
function updateShooters(){for(const s of shooters){s.update();s.draw()}}

// =============================================================
//  💥 NEW DYNAMIC PATHFINDER ENEMY 
// =============================================================
class PathfinderEnemy {
  constructor(i, j) {
    this.i = i;
    this.j = j;
    this.alive = true;
    this.moveCooldown = 400; // milliseconds between moves
    this.lastMoveTime = 0;
    this.color = '#228B22'; // Forest Green
  }

  update() {
    if (!this.alive) return;
    
    // Move the enemy based on cooldown
    if (millis() - this.lastMoveTime > this.moveCooldown) {
      this.move();
      this.lastMoveTime = millis();
    }

    // Check for collision with the player
    if (this.i === player.i && this.j === player.j) {
      playerHit();
    }
  }

  move() {
    const currentCell = grid[indexFrom(this.i, this.j)];
    if (!currentCell) return;

    const validMoves = [];
    // Check UP
    if (!currentCell.walls[0]) validMoves.push({ i: this.i, j: this.j - 1 });
    // Check RIGHT
    if (!currentCell.walls[1]) validMoves.push({ i: this.i + 1, j: this.j });
    // Check DOWN
    if (!currentCell.walls[2]) validMoves.push({ i: this.i, j: this.j + 1 });
    // Check LEFT
    if (!currentCell.walls[3]) validMoves.push({ i: this.i - 1, j: this.j });
    
    if (validMoves.length > 0) {
      const nextMove = random(validMoves);
      this.i = nextMove.i;
      this.j = nextMove.j;
    }
  }

  draw() {
    if (!this.alive) return;
    fill(this.color);
    stroke(50); // Dark gray border
    strokeWeight(1.5);
    // Draw as a circle
    ellipse(
      this.i * cellSize + cellSize / 2,
      this.j * cellSize + cellSize / 2,
      cellSize * 0.7
    );
    noStroke();
  }
}

function generatePathfinderEnemies() {
  pathfinderEnemies = [];
  const count = Math.max(5, 5 + stage - 1); // ステージ1は5体、以降増加
  let attempts = 0;
  while (pathfinderEnemies.length < count && attempts < count * 50) {
    const i = floor(random(cols));
    const j = floor(random(rows));
    if (distance(i, j, 0, 0) < 5 || distance(i, j, goal.i, goal.j) < 5) {
      attempts++;
      continue;
    }
    pathfinderEnemies.push(new PathfinderEnemy(i, j));
    attempts++;
  }
}

function updatePathfinderEnemies() {
  for (const e of pathfinderEnemies) {
    e.update();
    e.draw();
  }
}


// =============================================================
//  GOAL & STAGE (No changes)
// =============================================================
function drawGoal(){fill(coins.length===0?'red':'gray');rect(goal.i*cellSize+cellSize*.25,goal.j*cellSize+cellSize*.25,cellSize*.5,cellSize*.5)}
function checkGoalReached(){
  if(player.i===goal.i&&player.j===goal.j&&coins.length===0){
    // スコア計算（経過秒数、整数のみ）
    lastStageScore = Math.floor((millis() - stageStartTime) / 1000);
    stage++;
    cols=min(80,cols+5);
    rows=min(80,rows+5);
    cellSize=getMaxCellSize();
    resizeCanvas(windowWidth, windowHeight);
    calcMazeOffset();
    initStage();
  }
}

function windowResized() {
  cellSize = getMaxCellSize();
  resizeCanvas(windowWidth, windowHeight);
  calcMazeOffset();
  updateInstructions();
}

function drawHUD(){
  const hud = document.getElementById('hud');
  if (!hud) return;
  let scoreText = lastStageScore > 0 ? `Score: ${lastStageScore}s` : '';
  hud.innerHTML = `Stage: ${stage}　Coins left: ${coins.length}　Lives: ${player.lives}　${scoreText ? '｜　'+scoreText : ''}　｜　Sound: <b>${soundMuted ? 'OFF' : 'ON'}</b> (M)`;
}

function updateInstructions() {
  if (instructionsClosed) return; // 閉じられている場合は更新しない
  
  const el = document.getElementById('instructions');
  if (!el) return;
  el.innerHTML =
    '操作: <b>矢印キー/WASD</b>またはスティックで移動、<b>ショットボタン/スペース</b>で弾を発射。<br>コインを全て集めて<b>赤いゴール</b>へ！'
    + '<br><br>' +
    'Controls: Move with <b>arrows/WASD</b> or stick, shoot with <b>button/space</b>.<br>Collect all coins and reach the <b>red goal</b>!';
}

function setupInstructionsUI() {
  // ローカルストレージから閉じた状態を確認
  const closed = localStorage.getItem('instructionsClosed');
  if (closed === 'true') {
    instructionsClosed = true;
    hideInstructions();
  }
  
  // ×ボタンのイベントリスナーを設定
  const closeBtn = document.getElementById('close-instructions');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      instructionsClosed = true;
      localStorage.setItem('instructionsClosed', 'true');
      hideInstructions();
    });
  }
}

function hideInstructions() {
  const container = document.getElementById('instructions-container');
  if (container) {
    container.style.display = 'none';
  }
}

function showInstructions() {
  const container = document.getElementById('instructions-container');
  if (container) {
    container.style.display = 'block';
  }
}

// =============================================================
//  MAZE GENERATION & UTILS (No changes)
// =============================================================
function generateMaze(){grid=[];for(let j=0;j<rows;j++){for(let i=0;i<cols;i++)grid.push(new Cell(i,j))}
let current=grid[0];stack=[];while(true){current.visited=true;const next=current.checkNeighbors();if(next){next.visited=true;stack.push(current);removeWalls(current,next);current=next}else if(stack.length)current=stack.pop();else break}}
class Cell{constructor(i,j){this.i=i;this.j=j;this.walls=[true,true,true,true];this.visited=false}
checkNeighbors(){const ns=[];const neighborsCoords=[[this.i,this.j-1],[this.i+1,this.j],[this.i,this.j+1],[this.i-1,this.j]];for(const[ni,nj]of neighborsCoords){if(ni>=0&&ni<cols&&nj>=0&&nj<rows){const neighbor=grid[indexFrom(ni,nj)];if(neighbor&&!neighbor.visited){ns.push(neighbor)}}}
return ns.length?random(ns):undefined}
show(){const x=this.i*cellSize,y=this.j*cellSize;stroke(0);if(this.walls[0])line(x,y,x+cellSize,y);if(this.walls[1])line(x+cellSize,y,x+cellSize,y+cellSize);if(this.walls[2])line(x+cellSize,y+cellSize,x,y+cellSize);if(this.walls[3])line(x,y+cellSize,x,y)}}
function indexFrom(i,j){if(i<0||j<0||i>cols-1||j>rows-1)return-1;return i+j*cols}
function removeWalls(a,b){const x=a.i-b.i;if(x===1){a.walls[3]=false;b.walls[1]=false}else if(x===-1){a.walls[1]=false;b.walls[3]=false}
const y=a.j-b.j;if(y===1){a.walls[0]=false;b.walls[2]=false}else if(y===-1){a.walls[2]=false;b.walls[0]=false}}
function distance(i1,j1,i2,j2){return abs(i1-i2)+abs(j1-j2)}
function markVisited(i,j){visitedTrail.add(`${i},${j}`)}
function drawTrail(){fill(100,100,200,50);noStroke();for(let s of visitedTrail){let parts=s.split(',');let i=int(parts[0]);let j=int(parts[1]);rect(i*cellSize,j*cellSize,cellSize,cellSize)}}


// =============================================================
//  FALLING BLOCKS (Outline added to drawBlocks)
// =============================================================
function spawnFallingBlock(){if(millis()-lastBlockTime>blockSpawnInterval){const tetromino=random(tetrominoes);const shape=tetromino.shape;const shapeWidth=shape[0].length;const i=floor(random(cols-shapeWidth+1));const newBlock={i:i,x:i*cellSize,y:-shape.length*cellSize,shape:shape,color:tetromino.color,};blocks.push(newBlock);lastBlockTime=millis()}}
function updateBlocks(){spawnFallingBlock();for(let i=blocks.length-1;i>=0;i--){const b=blocks[i];b.y+=BLOCK_FALL_SPEED;if(b.y>height){blocks.splice(i,1);continue}
let hitPlayer=false;for(let r=0;r<b.shape.length;r++){for(let c=0;c<b.shape[r].length;c++){if(b.shape[r][c]){const blockCellX=b.x+c*cellSize;const blockCellY=b.y+r*cellSize;const playerX=player.i*cellSize;const playerY=player.j*cellSize;if(playerX<blockCellX+cellSize&&playerX+cellSize>blockCellX&&playerY<blockCellY+cellSize&&playerY+cellSize>blockCellY){hitPlayer=true;break}}}
if(hitPlayer)break}
if(hitPlayer){playerHit();break}}}

function drawBlocks() {
  for (const b of blocks) {
    // 💥 Added stroke for outline
    stroke(50); 
    strokeWeight(1.5);
    fill(b.color);

    for (let r = 0; r < b.shape.length; r++) {
      for (let c = 0; c < b.shape[r].length; c++) {
        if (b.shape[r][c]) {
          rect(b.x + c * cellSize, b.y + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }
  noStroke(); // Reset stroke so it doesn't affect other elements
}

// =============================================================
//  SOUND FUNCTIONS (New)
// =============================================================
function loadSounds() {
  // Load sounds with error handling
  try {
    moveSound = loadSound('assets/sounds/move.mp3', soundLoaded, soundError);
    shootSound = loadSound('assets/sounds/shoot.mp3', soundLoaded, soundError);
    hitSound = loadSound('assets/sounds/hit.mp3', soundLoaded, soundError);
    coinSound = loadSound('assets/sounds/coin.mp3', soundLoaded, soundError);
    bgMusic = loadSound('assets/sounds/bg_music.mp3', soundLoaded, soundError);
  } catch (e) {
    console.log('Sound files not found, continuing without audio');
  }
}

function soundLoaded() {
  console.log('Sound loaded successfully');
  // BGMはstartSoundIfNeededでのみ再生
  if (bgMusic && bgMusic.isLoaded()) {
    bgMusic.setVolume(soundVolume * 0.3); // BGM is quieter
  }
}

function soundError(err) {
  console.log('Sound loading error:', err);
}

let lastMoveSoundTime = 0;
const moveSoundInterval = 120; // ms

function playMoveSound() {
  if (moveSound && moveSound.isLoaded() && !soundMuted) {
    const now = millis();
    if (now - lastMoveSoundTime > moveSoundInterval) {
      moveSound.stop();
      moveSound.setVolume(soundVolume);
      moveSound.play();
      lastMoveSoundTime = now;
    }
  }
}

function playShootSound() {
  if (shootSound && shootSound.isLoaded() && !soundMuted) {
    shootSound.stop();
    shootSound.setVolume(soundVolume);
    shootSound.play();
  }
}

function playHitSound() {
  if (hitSound && hitSound.isLoaded() && !soundMuted) {
    hitSound.stop();
    hitSound.setVolume(soundVolume);
    hitSound.play();
  }
}

function playCoinSound() {
  if (coinSound && coinSound.isLoaded() && !soundMuted) {
    coinSound.stop();
    coinSound.setVolume(soundVolume);
    coinSound.play();
  }
}

function toggleMute() {
  soundMuted = !soundMuted;
  if (soundMuted) {
    if (bgMusic && bgMusic.isLoaded()) bgMusic.pause();
    console.log('Sound muted');
  } else {
    if (bgMusic && bgMusic.isLoaded()) bgMusic.loop();
    console.log('Sound unmuted');
  }
}

function setupMobileUI() {
  stickRadius = Math.max(60, windowHeight * 0.09);
  knobRadius = stickRadius * 0.55;
  stickActive = false;
  stickDx = 0; stickDy = 0;
  document.getElementById('mobile-shot').style.display = 'block';
  document.getElementById('img-shot').ontouchstart = function(e){ e.preventDefault(); mobileShot(); };
  window.addEventListener('touchstart', mobileStickTouchStart, {passive:false});
  window.addEventListener('touchmove', mobileStickTouchMove, {passive:false});
  window.addEventListener('touchend', mobileStickTouchEnd, {passive:false});
}

function mobileStickTouchStart(e) {
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const shotBtn = document.getElementById('img-shot');
    const shotRect = shotBtn.getBoundingClientRect();
    if (t.clientX >= shotRect.left && t.clientX <= shotRect.right && t.clientY >= shotRect.top && t.clientY <= shotRect.bottom) {
      return; // shotボタン優先
    }
    stickActive = true;
    stickDragging = true;
    stickPointerId = t.identifier;
    stickCenter = createVector(t.clientX, t.clientY);
    knobPos = stickCenter.copy();
    stickDx = 0; stickDy = 0;
  }
}
function mobileStickTouchMove(e) {
  if (!stickActive || !stickDragging) return;
  for (let t of e.touches) {
    if (t.identifier === stickPointerId) {
      updateKnobPos(t.clientX, t.clientY);
      break;
    }
  }
  e.preventDefault();
}
function mobileStickTouchEnd(e) {
  if (!stickActive) return;
  let stillTouching = false;
  for (let t of e.touches) {
    if (t.identifier === stickPointerId) stillTouching = true;
  }
  if (!stillTouching) {
    stickActive = false;
    stickDragging = false;
    stickDx = 0; stickDy = 0;
  }
}
function updateKnobPos(x, y) {
  let dir = createVector(x - stickCenter.x, y - stickCenter.y);
  if (dir.mag() > stickRadius) dir.setMag(stickRadius);
  knobPos = p5.Vector.add(stickCenter, dir);
  stickDx = dir.x / stickRadius;
  stickDy = dir.y / stickRadius;
}

function mobileShot() {
  let dx = Math.abs(stickDx) > 0.3 ? Math.sign(stickDx) : 0;
  let dy = Math.abs(stickDy) > 0.3 ? Math.sign(stickDy) : 0;
  if (dx === 0 && dy === 0) { dx = lastMoveDir.dx; dy = lastMoveDir.dy; }
  shootBullet(player.i, player.j, dx, dy, 'player');
  playShootSound();
}

function drawVirtualStick() {
  clearStickOverlay();
  if (!stickActive) return;
  noStroke();
  fill(200, 200, 220, 120);
  ellipse(stickCenter.x, stickCenter.y, stickRadius * 2);
  fill(100, 100, 200, 180);
  ellipse(knobPos.x, knobPos.y, knobRadius * 2);
}
function clearStickOverlay() {
  // p5.jsのclear()は全体を消すので、ここでは何もしない（draw()の最初でbackgroundで消しているため）
}

function movePlayer(dx, dy) {
  // 移動方向に壁がなければ移動
  const idx = indexFrom(player.i, player.j);
  if (!grid[idx]) return;
  const cell = grid[idx];
  let targetI = player.i + dx;
  let targetJ = player.j + dy;
  if (dx === 0 && dy === -1 && !cell.walls[0]) {
    player.i = constrain(targetI, 0, cols - 1);
    player.j = constrain(targetJ, 0, rows - 1);
    markVisited(player.i, player.j);
    collectCoinAt(player.i, player.j);
    playMoveSound();
    lastMoveDir = {dx, dy};
  } else if (dx === 0 && dy === 1 && !cell.walls[2]) {
    player.i = constrain(targetI, 0, cols - 1);
    player.j = constrain(targetJ, 0, rows - 1);
    markVisited(player.i, player.j);
    collectCoinAt(player.i, player.j);
    playMoveSound();
    lastMoveDir = {dx, dy};
  } else if (dx === -1 && dy === 0 && !cell.walls[3]) {
    player.i = constrain(targetI, 0, cols - 1);
    player.j = constrain(targetJ, 0, rows - 1);
    markVisited(player.i, player.j);
    collectCoinAt(player.i, player.j);
    playMoveSound();
    lastMoveDir = {dx, dy};
  } else if (dx === 1 && dy === 0 && !cell.walls[1]) {
    player.i = constrain(targetI, 0, cols - 1);
    player.j = constrain(targetJ, 0, rows - 1);
    markVisited(player.i, player.j);
    collectCoinAt(player.i, player.j);
    playMoveSound();
    lastMoveDir = {dx, dy};
  }
}

function shootPlayer() {
  shootBullet(player.i, player.j, lastMoveDir.dx, lastMoveDir.dy, 'player');
  playShootSound();
}
