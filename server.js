// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const users = {}; // username: { x, y, color, ws, ip, sprite }
const DOT_SIZE = 48;
const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;
const ipUserCounts = {}; // { ip: count }
const MAX_USERS_PER_IP = 2;

// List of sprite filenames
const SPRITES = [
  'sprites/sprite1.png',
  'sprites/sprite2.png',
  'sprites/sprite3.png',
  'sprites/sprite4.png',
  'sprites/sprite5.png',
  'sprites/sprite6.png',
  'sprites/sprite7.png',
  'sprites/sprite8.png'
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
        if (angleDeg === 'up') users[currentUser].y -= speed;
        else if (angleDeg === 'down') users[currentUser].y += speed;
        else if (angleDeg === 'left') users[currentUser].x -= speed;
        else if (angleDeg === 'right') users[currentUser].x += speed;
      } else if (typeof angleDeg === 'number') {
        const angleRad = angleDeg * Math.PI / 180;
        users[currentUser].x += Math.cos(angleRad) * speed;
        users[currentUser].y -= Math.sin(angleRad) * speed;
      }

      // Clamp to edges
      users[currentUser].x = Math.max(0, Math.min(users[currentUser].x, OVERLAY_WIDTH - DOT_SIZE));
      users[currentUser].y = Math.max(0, Math.min(users[currentUser].y, OVERLAY_HEIGHT - DOT_SIZE));
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
