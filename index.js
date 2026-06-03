const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
let globalRoundActive = false;

app.use(express.static('public'));

// Master Question Bank (Expanded to demonstrate waves)
const questions = [
    { question: "Question 1: Solve for x. <br> 2x^2 - 8 = 0", answer: "2" },
    { question: "Question 2: What is the vertex of <br> y = (x-3)^2 + 4?", answer: "(3,4)" },
    { question: "Question 3: Evaluate <br> f(2) if f(x) = 3^x", answer: "9" },
    { question: "Question 4: Solve for x. <br> 5x = 25", answer: "5" },
    { question: "Question 5: Simplify <br> sqrt(16)", answer: "4" },
    // -- WAVE 2 STARTS HERE --
    { question: "Question 6: Solve for x. <br> 10 - 2x = 4", answer: "3" }, 
    { question: "Question 7: What is 3^3?", answer: "27" }
];

const WAVE_SIZE = 5; 
const activeTeams = {}; 
const sharedTeamMaps = {}; 

function checkWallCollision(cx, cy, radius, obstacles) {
    for (let wall of obstacles) {
        let testX = cx; let testY = cy;
        if (cx < wall.x) testX = wall.x; else if (cx > wall.x + wall.width) testX = wall.x + wall.width;
        if (cy < wall.y) testY = wall.y; else if (cy > wall.y + wall.height) testY = wall.y + wall.height;
        let dist = Math.hypot(cx - testX, cy - testY);
        if (dist <= radius) return true;
    }
    return false;
}

function getWaveNodes(waveIndex, obstacles) {
    const start = waveIndex * WAVE_SIZE;
    const end = start + WAVE_SIZE;
    const waveQs = questions.slice(start, end);

    return waveQs.map((q, i) => {
        const globalId = start + i; 
        let nx, ny, isSafe;
        do {
            nx = Math.random() * (1280 - 100) + 50;
            ny = Math.random() * (720 - 100) + 50;
            isSafe = !checkWallCollision(nx, ny, 30, obstacles); 
        } while(!isSafe);
        return { id: globalId, text: q.question, x: nx, y: ny, radius: 15, color: '#ff3333' };
    });
}

// UPDATED: Now includes safe-spawn zone logic
function generateTeamMap() {
    const obstacles = [];
    const spawnX = 640;  // <-- Adjust to match your client-side starting X
    const spawnY = 360;  // <-- Adjust to match your client-side starting Y
    const safeZone = 80; // Clearance radius in pixels

    for(let i=0; i<7; i++) {
        let obsX, obsY, obsWidth, obsHeight;
        let isSafe = false;

        while (!isSafe) {
            obsX = Math.random() * (1280 - 200) + 50;
            obsY = Math.random() * (720 - 200) + 50;
            obsWidth = Math.random() * 150 + 40;
            obsHeight = Math.random() * 150 + 40;

            const overlapsX = spawnX > (obsX - safeZone) && spawnX < (obsX + obsWidth + safeZone);
            const overlapsY = spawnY > (obsY - safeZone) && spawnY < (obsY + obsHeight + safeZone);

            if (!overlapsX || !overlapsY) {
                isSafe = true; 
            }
        }

        obstacles.push({
            x: obsX, y: obsY, width: obsWidth, height: obsHeight, color: '#1a1a1a'
        });
    }

    const initialNodes = getWaveNodes(0, obstacles);
    return { obstacles, nodes: initialNodes, totalSolved: 0, currentWave: 0 };
}

function updateLeaderboard() {
    const list = Object.values(activeTeams).map(t => ({
        username: t.username, team: t.team, solvedCount: t.solvedCount, timeLeft: t.timeLeft, status: t.status
    }));

    list.sort((a, b) => {
        if (a.status === 'defused' && b.status !== 'defused') return -1;
        if (b.status === 'defused' && a.status !== 'defused') return 1;
        if (a.status === 'boom' && b.status !== 'boom') return 1;
        if (b.status === 'boom' && a.status !== 'boom') return -1;
        if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
        return b.timeLeft - a.timeLeft;
    });

    io.emit('leaderboardUpdate', list);
}

function startTeamTimer(teamName) {
    if (!sharedTeamMaps[teamName].intervalStarted) {
        sharedTeamMaps[teamName].intervalStarted = true;

        sharedTeamMaps[teamName].interval = setInterval(() => {
            let teamTimeLeft = 0;
            let hasActiveMembers = false;
            let allDefused = true;

            Object.values(activeTeams).forEach(p => {
                if (p.team === teamName) {
                    if (p.status !== 'defused') {
                        allDefused = false; 
                    }
                    if (p.status === 'active') {
                        hasActiveMembers = true;
                        p.timeLeft--;
                        teamTimeLeft = p.timeLeft;
                    }
                }
            });

            if (allDefused) {
                clearInterval(sharedTeamMaps[teamName].interval);
                return; 
            }

            if (hasActiveMembers && teamTimeLeft <= 0) {
                clearInterval(sharedTeamMaps[teamName].interval);
                io.to(teamName).emit('gameOver', { status: 'boom' });
                Object.values(activeTeams).forEach(p => { if (p.team === teamName) p.status = 'boom'; });
                updateLeaderboard();
            } else if (hasActiveMembers) {
                io.to(teamName).emit('timerUpdate', teamTimeLeft);
                updateLeaderboard();
            }
        }, 1000);
    }
}

io.on('connection', (socket) => {
    socket.on('registerTeam', (data) => {
        const teamName = (data.team || '').trim() || 'Anonymous Squad';
        const userName = (data.username || '').trim() || 'Agent';

        socket.join(teamName);

        activeTeams[socket.id] = {
            username: userName, team: teamName, solvedCount: 0, timeLeft: 150, status: 'active', interval: null, cooldownUntil: null
        };

        if (!sharedTeamMaps[teamName]) {
            sharedTeamMaps[teamName] = generateTeamMap();
        }

        io.emit('agentJoined', { team: teamName, username: userName });

        socket.emit('initMap', {
            obstacles: sharedTeamMaps[teamName].obstacles,
            nodes: sharedTeamMaps[teamName].nodes,
            totalSolved: sharedTeamMaps[teamName].totalSolved,
            currentWave: sharedTeamMaps[teamName].currentWave
        });

        updateLeaderboard();

        if (globalRoundActive) {
            startTeamTimer(teamName);
            socket.emit('roundStarted'); 
        }
    });

    socket.on('adminStart', () => {
        globalRoundActive = true;
        io.emit('roundStarted'); 

        for (const t in sharedTeamMaps) {
            startTeamTimer(t);
        }
    });

    socket.on('playerMovement', (posData) => {
        const session = activeTeams[socket.id];
        if (session) {
            socket.to(session.team).emit('teammateMoved', {
                id: socket.id, x: posData.x, y: posData.y, username: session.username
            });
        }
    });

    socket.on('submit', (data) => {
        const session = activeTeams[socket.id];
        if (!session || session.status !== 'active') return;

        if (session.cooldownUntil && Date.now() < session.cooldownUntil) {
            const secondsLeft = Math.ceil((session.cooldownUntil - Date.now()) / 1000);
            socket.emit('feedback', { status: 'cooldown', message: `TERMINAL LOCKED. CLEAR IN ${secondsLeft}s.` });
            return;
        }

        const qId = data.questionId;
        const currentAnswer = questions[qId].answer;

        if (data.answer === currentAnswer) {
            session.solvedCount++;

            const teamMap = sharedTeamMaps[session.team];
            teamMap.nodes = teamMap.nodes.filter(n => n.id !== qId);
            teamMap.totalSolved++;

            socket.emit('feedback', { status: 'correct', message: 'Answer correct', questionId: qId });
            socket.to(session.team).emit('nodeSolvedByTeammate', { questionId: qId, solvedBy: session.username });

            if (teamMap.nodes.length > 0) {
                Object.values(activeTeams).forEach(p => { if (p.team === session.team) p.timeLeft += 20; });
            } else {
                teamMap.currentWave++;
                const nextNodes = getWaveNodes(teamMap.currentWave, teamMap.obstacles);

                if (nextNodes.length > 0) {
                    teamMap.nodes = nextNodes;
                    Object.values(activeTeams).forEach(p => { if (p.team === session.team) p.timeLeft += 60; });
                    io.to(session.team).emit('nextWave', nextNodes);
                } else {
                    Object.values(activeTeams).forEach(p => { if (p.team === session.team) p.status = 'defused'; });
                    io.to(session.team).emit('gameOver', { status: 'defused' });
                }
            }
        } else {
            session.cooldownUntil = Date.now() + 10000; 
            socket.emit('feedback', { status: 'incorrect', message: 'Answer wrong, cooldown for 10s' });
        }
        updateLeaderboard();
    });

    socket.on('disconnect', () => {
        const session = activeTeams[socket.id];
        if (session) {
            socket.to(session.team).emit('teammateLeft', socket.id);
            delete activeTeams[socket.id];
            updateLeaderboard();
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`\nCO-OP SERVER ONLINE AT PORT ${PORT}\n`);
});