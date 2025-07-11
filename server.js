// Простой сервер для мультиплеера на Node.js с WebSocket
const WebSocket = require('ws');
const http = require('http');

const PORT = 3000;
const TICK_RATE = 30; // 30 кадров в секунду

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let players = {};
let food = [];
let nextPlayerId = 1;
const FOOD_COUNT = 100;
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
let bots = [];

function randomFood() {
    return {
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        radius: 5,
        color: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'][Math.floor(Math.random() * 5)]
    };
}

function spawnFoodIfNeeded() {
    while (food.length < FOOD_COUNT) {
        food.push(randomFood());
    }
}

function addBotsIfNeeded() {
    // Собираем всех выбранных персонажей
    const chosen = new Set(Object.values(players).map(p => p.character));
    const allChars = [
        'TripOK', 'Вова', 'Назар', 'Егор', 'Денис',
        'Максім', 'Андрєй', 'Саша', 'Артем'
    ];
    bots = allChars.filter(char => !chosen.has(char)).map((character, i) => ({
        id: 'bot_' + character,
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        radius: 20 + Math.random() * 10,
        character,
        score: 0,
        isBot: true,
        target: null
    }));
}

wss.on('connection', (ws) => {
    const playerId = nextPlayerId++;
    let player = null;

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'join') {
                // data: { character }
                player = {
                    id: playerId,
                    x: Math.random() * CANVAS_WIDTH,
                    y: Math.random() * CANVAS_HEIGHT,
                    radius: 20,
                    character: data.character,
                    score: 0,
                    dx: 0,
                    dy: 0
                };
                players[playerId] = player;
                addBotsIfNeeded();
                ws.send(JSON.stringify({ type: 'init', id: playerId, food, players: Object.values(players).concat(bots) }));
            } else if (data.type === 'move') {
                // data: { dx, dy }
                if (player) {
                    player.dx = data.dx;
                    player.dy = data.dy;
                }
            } else if (data.type === 'restart') {
                // Сбросить всю игру
                players = {};
                bots = [];
                food = [];
                nextPlayerId = 1;
                spawnFoodIfNeeded();
                // Оповестить всех клиентов о рестарте
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'restart' }));
                    }
                });
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        delete players[playerId];
        addBotsIfNeeded();
    });
});

function updateBots() {
    bots.forEach(bot => {
        // Найти ближайшую еду
        let closestFood = null;
        let minDist = Infinity;
        for (const f of food) {
            const dx = f.x - bot.x;
            const dy = f.y - bot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                closestFood = f;
            }
        }
        // Найти ближайшего игрока
        let closestPlayer = null;
        let minPlayerDist = Infinity;
        for (const id in players) {
            const p = players[id];
            const dx = p.x - bot.x;
            const dy = p.y - bot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minPlayerDist) {
                minPlayerDist = dist;
                closestPlayer = p;
            }
        }
        // Если игрок ближе и больше — убегать
        if (closestPlayer && closestPlayer.radius > bot.radius && minPlayerDist < 200) {
            const dx = bot.x - closestPlayer.x;
            const dy = bot.y - closestPlayer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                bot.x += (dx / dist) * 3;
                bot.y += (dy / dist) * 3;
            }
        } else if (closestFood) {
            // Иначе двигаться к еде
            const dx = closestFood.x - bot.x;
            const dy = closestFood.y - bot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                bot.x += (dx / dist) * 2;
                bot.y += (dy / dist) * 2;
            }
        }
        // Ограничения по краям
        bot.x = Math.max(bot.radius, Math.min(CANVAS_WIDTH - bot.radius, bot.x));
        bot.y = Math.max(bot.radius, Math.min(CANVAS_HEIGHT - bot.radius, bot.y));
    });
}

function updateGame() {
    // Двигаем игроков по направлению dx, dy
    for (const id in players) {
        const p = players[id];
        let dx = p.dx || 0;
        let dy = p.dy || 0;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 5;
        if (dist > 0) {
            p.x += (dx / dist) * speed;
            p.y += (dy / dist) * speed;
        }
        // Ограничения по краям
        p.x = Math.max(p.radius, Math.min(CANVAS_WIDTH - p.radius, p.x));
        p.y = Math.max(p.radius, Math.min(CANVAS_HEIGHT - p.radius, p.y));
    }
    updateBots();
    // Проверяем поедание еды для всех (игроков и ботов)
    const all = Object.values(players).concat(bots);
    for (const p of all) {
        for (let i = food.length - 1; i >= 0; i--) {
            const f = food[i];
            const dx = p.x - f.x;
            const dy = p.y - f.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < p.radius) {
                food.splice(i, 1);
                p.radius += 1;
                p.score += 1;
            }
        }
    }
    // Механика поедания друг друга
    for (let i = all.length - 1; i >= 0; i--) {
        const a = all[i];
        for (let j = all.length - 1; j >= 0; j--) {
            if (i === j) continue;
            const b = all[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < a.radius + b.radius && a.radius > b.radius + 2) {
                // a съедает b
                a.radius += b.radius * 0.2;
                a.score += Math.floor(b.radius);
                // Если b — игрок, респавним его и сбрасываем счёт
                if (!b.isBot) {
                    b.x = Math.random() * CANVAS_WIDTH;
                    b.y = Math.random() * CANVAS_HEIGHT;
                    b.radius = 20;
                    b.score = 0;
                } else {
                    // Если b — бот, респавним в случайном месте и сбрасываем счёт
                    b.x = Math.random() * CANVAS_WIDTH;
                    b.y = Math.random() * CANVAS_HEIGHT;
                    b.radius = 20 + Math.random() * 10;
                    b.score = 0;
                }
            }
        }
    }
    spawnFoodIfNeeded();
}

function broadcastGameState() {
    const state = {
        type: 'state',
        players: Object.values(players).concat(bots),
        food
    };
    const msg = JSON.stringify(state);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

setInterval(() => {
    updateGame();
    broadcastGameState();
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
}); 