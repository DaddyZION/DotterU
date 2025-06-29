// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const users = {}; // username: { x, y, color, ws }
const DOT_SIZE = 18;
const OVERLAY_WIDTH = 1920;
const OVERLAY_HEIGHT = 1080;

function broadcastState() {
  const state = Object.entries(users).map(([username, u]) => ({
    username,
    x: u.x,
    y: u.y,
    color: u.color
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
      if (users[data.username]) {
        ws.send(JSON.stringify({ type: 'error', message: 'Username already taken.' }));
        return;
      }
      users[data.username] = {
        x: Math.floor(Math.random() * 400) + 50,
        y: Math.floor(Math.random() * 300) + 50,
        color: data.color,
        ws
      };
      currentUser = data.username;
    }

    if (data.type === 'move' && currentUser && users[currentUser]) {
      const speed = 10 * (data.force || 1);
      let prevX = users[currentUser].x;
      let prevY = users[currentUser].y;

      if (data.direction === 'up') users[currentUser].y -= speed;
      if (data.direction === 'down') users[currentUser].y += speed;
      if (data.direction === 'left') users[currentUser].x -= speed;
      if (data.direction === 'right') users[currentUser].x += speed;

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
      delete users[currentUser];
    }
  });
});