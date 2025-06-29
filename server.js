// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const users = {}; // username: { x, y, color, ws, ip }
const DOT_SIZE = 112;
const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;
const ipUserCounts = {}; // { ip: count }
const MAX_USERS_PER_IP = 5;

// List of sprite filenames
const SPRITES = [
  'sprites/sprite1.png',
  'sprites/sprite2.png',
  'sprites/sprite3.png'
];

const assignedSprites = {}; // username -> sprite
let availableSprites = [...SPRITES];

function getIP(ws) {
  return ws._socket.remoteAddress;
}

function broadcastState() {
  const state = Object.entries(users).map(([username, u]) => ({
    username,
    x: u.x,
    y: u.y,
    color: u.color,
    sprite: u.sprite // Make sure this line is present
  }));
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'state', users: state }));
    }
  });
}

// Broadcast state every 30ms (about 33fps)
setInterval(broadcastState, 30);

wss.on('connection', ws => {
  let currentUser = null;

  ws.on('message', message => {
    let data;
    try { data = JSON.parse(message); } catch { return; }

    if (data.type === 'join') {
      const ip = getIP(ws);
      ipUserCounts[ip] = ipUserCounts[ip] || 0;

      if (ipUserCounts[ip] >= MAX_USERS_PER_IP) {
        ws.send(JSON.stringify({ type: 'error', message: `Only ${MAX_USERS_PER_IP} users allowed per IP.` }));
        return;
      }

      if (users[data.username]) {
        ws.send(JSON.stringify({ type: 'error', message: 'Username already taken.' }));
        return;
      }

      // Assign a unique sprite
      if (availableSprites.length === 0) {
        // Recycle: all sprites are used, reset the pool
        availableSprites = [...SPRITES];
      }
      const sprite = availableSprites.splice(Math.floor(Math.random() * availableSprites.length), 1)[0];
      assignedSprites[data.username] = sprite;

      users[data.username] = {
        x: Math.floor(Math.random() * 400) + 50,
        y: Math.floor(Math.random() * 300) + 50,
        color: data.color,
        ws,
        ip,
        sprite: assignedSprites[data.username] // store sprite with user
      };
      ipUserCounts[ip]++;
      currentUser = data.username;
    }

    if (data.type === 'move' && currentUser && users[currentUser]) {
      const speed = 10 * (data.force || 1);
      let prevX = users[currentUser].x;
      let prevY = users[currentUser].y;

      // Use angle for smooth movement
      let angleDeg = data.direction;
      if (typeof angleDeg === 'string') {
        // If it's a string like "up", "down", fallback to old logic
        if (angleDeg === 'up') users[currentUser].y -= speed;
        else if (angleDeg === 'down') users[currentUser].y += speed;
        else if (angleDeg === 'left') users[currentUser].x -= speed;
        else if (angleDeg === 'right') users[currentUser].x += speed;
      } else if (typeof angleDeg === 'number') {
        // 0deg is right, 90deg is down, 180deg is left, 270deg is up (nipplejs)
        const angleRad = angleDeg * Math.PI / 180;
        users[currentUser].x += Math.cos(angleRad) * speed;
        users[currentUser].y -= Math.sin(angleRad) * speed; // Invert Y for screen coordinates
      }

      // Clamp to edges
      users[currentUser].x = Math.max(0, Math.min(users[currentUser].x, OVERLAY_WIDTH - DOT_SIZE));
      users[currentUser].y = Math.max(0, Math.min(users[currentUser].y, OVERLAY_HEIGHT - DOT_SIZE));

      // Prevent overlap with other users (simple collision resolution)
      for (const [otherName, other] of Object.entries(users)) {
        if (otherName === currentUser) continue;
        const dx = users[currentUser].x - other.x;
        const dy = users[currentUser].y - other.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < DOT_SIZE) {
          // Push back to previous position (simple resolution)
          users[currentUser].x = prevX;
          users[currentUser].y = prevY;
          break;
        }
      }
    }
  });

  ws.on('close', () => {
    if (currentUser && users[currentUser]) {
      const ip = users[currentUser].ip;
      // Release sprite
      if (assignedSprites[currentUser]) {
        availableSprites.push(assignedSprites[currentUser]);
        delete assignedSprites[currentUser];
      }
      delete users[currentUser];
      if (ip && ipUserCounts[ip]) {
        ipUserCounts[ip]--;
        if (ipUserCounts[ip] <= 0)
          delete ipUserCounts[ip];
      }
    }
  });
});

socket.onmessage = function(event) {
  const msg = JSON.parse(event.data);
  if (msg.type === 'state') {
    Object.values(characters).forEach(c => c.updated = false);

    msg.users.forEach(user => {
      let c = characters[user.username];
      if (!c) {
        // Pick a random sprite for each new user
        const sprite = SPRITES[Math.floor(Math.random() * SPRITES.length)];
        const div = document.createElement('div');
        div.className = 'character';
        div.dataset.sprite = sprite;
        div.style.backgroundImage = `url('${sprite}')`;
        overlay.appendChild(div);
        c = characters[user.username] = {
          div,
          x: user.x, y: user.y,
          tx: user.x, ty: user.y,
          color: user.color,
          sprite: sprite,
          lastX: user.x // for mirroring
        };
      }
      c.tx = user.x;
      c.ty = user.y;
      c.color = user.color;
      c.updated = true;
    });

    // Remove characters not in update
    for (const [username, c] of Object.entries(characters)) {
      if (!c.updated) {
        overlay.removeChild(c.div);
        delete characters[username];
      }
    }
  }
};

// Animation loop for interpolation and mirroring
function animate() {
  for (const c of Object.values(characters)) {
    c.x = lerp(c.x, c.tx, 0.25);
    c.y = lerp(c.y, c.ty, 0.25);
    c.div.style.left = c.x + 'px';
    c.div.style.top = c.y + 'px';

    // Mirror sprite if moving left
    if (c.x < (c.lastX || c.x)) {
      c.div.style.transform = 'scaleX(-1)';
    } else if (c.x > (c.lastX || c.x)) {
      c.div.style.transform = 'scaleX(1)';
    }
    c.lastX = c.x;
  }
  requestAnimationFrame(animate);
}
animate();