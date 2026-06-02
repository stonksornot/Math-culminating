const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// Master Question Bank
const questions = [
    { question: "Question 1: Solve for x. <br> 2x^2 - 8 = 0", answer: "2" },
    { question: "Question 2: What is the vertex of <br> y = (x-3)^2 + 4?", answer: "(3,4)" },
    { question: "Question 3: Evaluate <br> f(2) if f(x) = 3^x", answer: "9" }
];

const activeTeams = {};

// Upgraded with live leaderboard sorting algorithms
function updateLeaderboard() {
    const list = Object.values(activeTeams).map(t => ({
        team: t.team,
        currentIndex: t.currentIndex,
        timeLeft: t.timeLeft,
        status: t.status
    }));

    // Sort logic engine
    list.sort((a, b) => {
        // Rule 1: 'defused' teams go to the very top
        if (a.status === 'defused' && b.status !== 'defused') return -1;
        if (b.status === 'defused' && a.status !== 'defused') return 1;

        // Rule 4: 'boom' teams sink to the very bottom
        if (a.status === 'boom' && b.status !== 'boom') return 1;
        if (b.status === 'boom' && a.status !== 'boom') return -1;

        // Rule 2: Rank by question index descending (higher question number wins)
        if (b.currentIndex !== a.currentIndex) {
            return b.currentIndex - a.currentIndex;
        }

        // Rule 3: Tie-breaker - rank by time remaining descending
        return b.timeLeft - a.timeLeft;
    });

    io.emit('leaderboardUpdate', list);
}

io.on('connection', (socket) => {
    console.log('Agent terminal connected:', socket.id);
    updateLeaderboard();

    socket.on('registerTeam', (data) => {
        const teamName = data.team.trim() || 'Anonymous Squad';

        activeTeams[socket.id] = {
            team: teamName,
            currentIndex: 0,
            timeLeft: 150,
            status: 'active',
            interval: null
        };

        io.emit('agentJoined', { team: teamName });
        socket.emit('newQuestion', questions[0].question);
        updateLeaderboard();

        activeTeams[socket.id].interval = setInterval(() => {
            const currentSession = activeTeams[socket.id];
            if (!currentSession) return;

            if (currentSession.timeLeft <= 0) {
                clearInterval(currentSession.interval);
                currentSession.status = 'boom';
                socket.emit('gameOver', { status: 'boom' });
                io.emit('check', { status: 'boom', team: currentSession.team });
                updateLeaderboard();
                return;
            }

            currentSession.timeLeft--;
            socket.emit('timerUpdate', currentSession.timeLeft);
            updateLeaderboard(); 
        }, 1000);
    });

    socket.on('submit', (data) => {
      const session = activeTeams[socket.id];
      if (!session || session.status !== 'active') return;

      // 1. SECURE COOLDOWN CHECK: Reject if team is currently locked out
      if (session.cooldownUntil && Date.now() < session.cooldownUntil) {
          const secondsLeft = Math.ceil((session.cooldownUntil - Date.now()) / 1000);
          socket.emit('feedback', { status: 'cooldown', message: `TERMINAL LOCKED. SEVER CLEAR IN ${secondsLeft}s.` });
          return;
      }

      const currentAnswer = questions[session.currentIndex].answer;

      if (data.answer === currentAnswer) {
          socket.emit('feedback', { status: 'correct', message: 'Answer correct' });
          io.emit('check', { status: 'correct', team: session.team, answer: data.answer, stage: session.currentIndex + 1 });

          session.currentIndex++;

          if (session.currentIndex < questions.length) {
              session.timeLeft += 60; 
              socket.emit('newQuestion', questions[session.currentIndex].question);
          } else {
              session.status = 'defused';
              clearInterval(session.interval);
              socket.emit('gameOver', { status: 'defused' });
              io.emit('check', { status: 'defused', team: session.team });
          }
      } else {
          // 2. INCORRECT ANSWER: Apply time penalty AND activate the 10s cooldown timestamp
          session.cooldownUntil = Date.now() + 10000; // Locks them out for 10,000 milliseconds (10s)

          socket.emit('feedback', { status: 'incorrect', message: 'Answer wrong, cooldown for 10s' });
          socket.emit('timerUpdate', session.timeLeft);
          io.emit('check', { status: 'incorrect', team: session.team, answer: data.answer });
      }
      updateLeaderboard();
  });

    socket.on('disconnect', () => {
        if (activeTeams[socket.id]) {
            clearInterval(activeTeams[socket.id].interval);
            delete activeTeams[socket.id];
            updateLeaderboard();
        }
        console.log('Agent terminal dropped:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`\nMULTIPLAYER SERVER ONLINE AT PORT ${PORT}\n`);
});