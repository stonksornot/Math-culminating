const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));
io.on('connection', (socket) => {
  console.log('user connected');
  socket.on('submit', (data) => {
    console.log('Received answer:', data);
    io.emit('check', data);
  });

  socket.on('disconnect', () => {
    console.log('user diconnected', socket.id);
  });
});

http.listen(3000, () => {
  console.log('Server running');
})