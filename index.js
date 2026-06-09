const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
let globalRoundActive = false;

app.use(express.static('public'));

const questions = [
    // WAVE 1 EASY
    { question: "Question 1: Solve for the largest x value satisfying <br> \\( x^2 - 6x + 8 = 0 \\)", answer: "4" },
    { question: "Question 2: Find the product of a and b if <br> \\( (a + b)^2 = 1 \\) <br> \\( a^2 + b^2 = 5 \\)", answer: "-2" },
    { question: "Question 3: Evaluate <br> \\(\\frac{\\sqrt{12} \\cdot \\sqrt{3}}{2}\\)", answer: "3" },
    { question: "Question 4: Evaluate, in lowest fractions <br> \\( 16^{-\\frac{1}{2}}\\)", answer: "1/4"},
    { question: "Question 5: Simplify <br> \\( \\sqrt{48} \\) <br> Use the following format a*sqrt(b)", answer: "4*sqrt(3)" },
    // WAVE 2 MEDIUM EASY
    { question: "Question 6: Solve for x <br> \\( 10 - 2x = 4 \\)", answer: "3" }, 
    { question: "Question 7: What is the negative solution of x if <br> \\( \\frac{1}{x^2} = \\frac{3}{4x + 7} \\)?", answer: "-1" },
    { question: "Question 8: Simplify (prime factorize), then find the sum of exponents \\( \\sqrt[3]{4^{100} \\cdot 2^{16} \\cdot 35^{33}} \\)", answer: "94"},
    { question: "Question 9: Simplify <br> \\( (x^3y^2)\\cdot(x^{-1}y^4) \\) <br> Use spaces to seperate terms and ^ for powers", answer: "x^2 y^6"},
    { question: "Question 10: Solve for a+b <br> \\( 1/a + 1/b = \\sqrt{24} \\) <br> \\( ab = \\sqrt{6} \\)", answer: "12" },
    // WAVE 3 MEDIUM HARD
    { question: "Question 11: Subtract the following. Express in a*sqrt(b) <br> \\( 4\\sqrt(12) - 2\\sqrt(27) \\)", answer: "2*sqrt(3)"},
    { question: "Question 12: What is the GCD of these three expressions? <br> \\( x^3y^8z^5 \\) <br> \\( x^2y^4z^7 \\) <br> \\( x^2y^5z^6 \\) <br> Use spaces to seperate terms and ^ for powers", answer: "x^2 y^4 z^5"},
    { question: "Question 13: Expressed as a fraction, what is the difference between the two roots of <br> \\( 16x^2 - 49 = 0 \\)", answer: "7/2"},
    { question: "Question 14: Factor completely to solve. If <br> \\( x^2 - y^2 = 45 \\) and \\( x - y = 5 \\), what is the value of \\( x + y \\)?", answer: "9" },
    { question: "Question 15: What is the product of the values of x that are not in the domain of the following expression? <br> \\( \\frac{3x}{x^2 - 8x + 15} \\)?", answer: "15" },
    // WAVE 4 HARD
    { question: "Question 16: Solve for all real x <br> \\( x = \\sqrt{20 - x} \\)", answer: "4" },
    { question: "Question 17: When \\( \\frac{4}{x+3} - \\frac{2}{x-2} \\) is written as a single fraction <br> \\( \\frac{ax+b}{(x+3)(x-2)} \\) <br> Find the value of \\( a+b \\).", answer: "-12" },
    { question: "Question 18: Bob is designing his rectangular backyard. The total area is \\( \\frac{x^2 - 4}{x+3} \\) and the width is \\( \\frac{x - 2}{x^2 + 3x}\\). <br> The length of the backyard can be expressed as \\( x(x + a) \\). Find a", answer: "2"},
    { question: "Question 19: \\( 2^a = \\frac{4^{2t} \\cdot 8^{t/3}}{16^{t/2}} \\) <br> Find a in terms of t", answer: "3t"},
    { question: "Question 20: Mr. Bean needs to travel from one corner of a rectangular prism to the diagonally opposite one. The sides are of length <br> \\( x + 2, x - 2, 2\\sqrt{2x} \\) <br> Find the shortest distance if he is allowed to travel through the interior of the prism in terms of x, divided by \\( \\sqrt{2} \\). Do not use spaces", answer: "x+2"},
    // WAVE 5 HARD2
    { question: "Question 21: Solve for x <br> \\( \\sqrt{x\\sqrt{x}} = 8 \\)", answer: "16" },
    { question: "Question 22: \\( y = \\sqrt{1 + \\frac{2x + 1}{x^2}} <br> In which quadrants does the equation lie in? <br> Use space as seperators, and sort your answers from least to greatest \\)", answer: "1 2 3"},
    { question: "Question 23: If \\( x + \\frac{1}{x} = 5 \\), what is the exact value of \\( x^2 + \\frac{1}{x^2} \\)?", answer: "23" },
    { question: "Question 24: Solve for x (Beware of extraneous roots): <br> \\( \\sqrt{x+3} + \\sqrt{x-2} = 5 \\)", answer: "6" },
    { question: "Question 25: Find the number of integer solutions of (x, y) given <br> \\( x^2 - y^2 = 120 \\)", answer: "16"}
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

function generateTeamMap() {
    const obstacles = [];
    const spawnX = 640;  
    const spawnY = 360;  
    const safeZone = 80; 

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

    // GLOBAL TRACKING: Map now holds the team-wide time property and interval states
    return { 
        obstacles, 
        nodes: initialNodes, 
        totalSolved: 0, 
        currentWave: 0,
        timeLeft: 150, 
        intervalStarted: false,
        interval: null
    };
}

// Change the function signature to accept a default null parameter
function updateLeaderboard(targetSocket = null) {
    const teamAggregator = {};

    // Group individual players into their respective squads
    Object.values(activeTeams).forEach(player => {
        if (!teamAggregator[player.team]) {
            const mapRef = sharedTeamMaps[player.team];
            teamAggregator[player.team] = {
                team: player.team,
                timeLeft: mapRef ? mapRef.timeLeft : 0,
                solvedCount: 0,
                status: player.status,
                members: []
            };
        }

        // Add player stats to the team totals
        teamAggregator[player.team].solvedCount += player.solvedCount;
        teamAggregator[player.team].members.push({
            username: player.username,
            solvedCount: player.solvedCount,
            status: player.status
        });

        // Ensure global team status reflects if the bomb went off or was defused
        if (player.status === 'boom' || player.status === 'defused') {
            teamAggregator[player.team].status = player.status;
        }
    });

    const list = Object.values(teamAggregator);

    // Sort squads by Status -> Score -> Time Remaining
    list.sort((a, b) => {
        if (a.status === 'defused' && b.status !== 'defused') return -1;
        if (b.status === 'defused' && a.status !== 'defused') return 1;
        if (a.status === 'boom' && b.status !== 'boom') return 1;
        if (b.status === 'boom' && a.status !== 'boom') return -1;
        if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
        return b.timeLeft - a.timeLeft;
    });

    // FIX HERE: If a specific socket requested this, only reply to them.
    // Otherwise, broadcast it globally to everyone like normal.
    if (targetSocket) {
        targetSocket.emit('leaderboardUpdate', list);
    } else {
        io.emit('leaderboardUpdate', list);
    }
}

function startTeamTimer(teamName) {
    const teamMap = sharedTeamMaps[teamName];
    if (!teamMap || teamMap.intervalStarted) return;

    teamMap.intervalStarted = true;

    teamMap.interval = setInterval(() => {
        let hasActiveMembers = false;
        let allDefused = true;

        Object.values(activeTeams).forEach(p => {
            if (p.team === teamName) {
                if (p.status !== 'defused') {
                    allDefused = false; 
                }
                if (p.status === 'active') {
                    hasActiveMembers = true;
                }
            }
        });

        if (allDefused) {
            clearInterval(teamMap.interval);
            return; 
        }

        if (hasActiveMembers) {
            teamMap.timeLeft--; // Tick down the single team-wide clock

            if (teamMap.timeLeft <= 0) {
                teamMap.timeLeft = 0;
                clearInterval(teamMap.interval);
                io.to(teamName).emit('gameOver', { status: 'boom' });
                Object.values(activeTeams).forEach(p => { if (p.team === teamName) p.status = 'boom'; });
            } else {
                io.to(teamName).emit('timerUpdate', teamMap.timeLeft);
            }
            updateLeaderboard();
        }
    }, 1000);
}

io.on('connection', (socket) => {
    socket.on('registerTeam', (data) => {
        const teamName = (data.team || '').trim() || 'Anonymous Squad';
        const userName = (data.username || '').trim() || 'Agent';

        socket.join(teamName);

        // Individual player records metrics, but does NOT carry individual timeLeft anymore
        activeTeams[socket.id] = {
            username: userName, 
            team: teamName, 
            solvedCount: 0, 
            status: 'active', 
            cooldownUntil: null
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

    socket.on('requestLeaderboardSync', () => {
        // Pass the requesting socket directly into the handler
        updateLeaderboard(socket);
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

            // FIX: Broadcast success to the Control Center
            io.emit('check', { status: 'correct', team: session.team, username: session.username, stage: teamMap.currentWave + 1 });

            if (teamMap.nodes.length > 0) {
                teamMap.timeLeft += 20; 
            } else {
                teamMap.currentWave++;
                const nextNodes = getWaveNodes(teamMap.currentWave, teamMap.obstacles);

                if (nextNodes.length > 0) {
                    teamMap.nodes = nextNodes;
                    teamMap.timeLeft += 60; 
                    io.to(session.team).emit('nextWave', nextNodes);
                } else {
                    Object.values(activeTeams).forEach(p => { if (p.team === session.team) p.status = 'defused'; });
                    io.to(session.team).emit('gameOver', { status: 'defused' });
                    // FIX: Broadcast defusal to the Control Center
                    io.emit('check', { status: 'defused', team: session.team });
                }
            }
        } else {
            session.cooldownUntil = Date.now() + 10000; 
            socket.emit('feedback', { status: 'incorrect', message: 'Answer wrong, cooldown for 10s' });
            // FIX: Broadcast failure to the Control Center
            io.emit('check', { status: 'incorrect', team: session.team, username: session.username, answer: data.answer });
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