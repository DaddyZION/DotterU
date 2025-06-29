// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const users = {}; // username: { x, y, color, ws }

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
      // Move user (no rate limit here)
      const speed = 10 * (data.force || 1);
      if (data.direction === 'up') users[currentUser].y -= speed;
      if (data.direction === 'down') users[currentUser].y += speed;
      if (data.direction === 'left') users[currentUser].x -= speed;
      if (data.direction === 'right') users[currentUser].x += speed;
    }
  });

  ws.on('close', () => {
    if (currentUser && users[currentUser]) {
      delete users[currentUser];
    }
  });
});