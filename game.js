// === МУЛЬТИПЛЕЕРНЫЙ КЛИЕНТ ===
let socket;
let myId = null;
let allPlayers = [];
let allFood = [];
let myCharacter = null;

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.menu = document.getElementById('menu');
        this.characterButtons = document.querySelectorAll('.character-btn');
        this.characterImages = {};
        this.selectedCharacter = null;
        this.availableCharacters = [
            'TripOK', 'Вова', 'Назар', 'Егор', 'Денис',
            'Максім', 'Андрєй', 'Саша', 'Артем'
        ];
        this.loadCharacterImages();
        this.setupCharacterSelection();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    loadCharacterImages() {
        this.availableCharacters.forEach(character => {
            const img = new Image();
            img.src = `images/${character}.png`;
            this.characterImages[character] = img;
        });
    }
    setupCharacterSelection() {
        this.characterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const character = button.dataset.character;
                this.startGame(character);
            });
        });
    }
    startGame(selectedCharacter) {
        this.selectedCharacter = selectedCharacter;
        myCharacter = selectedCharacter;
        this.menu.classList.add('hidden');
        this.connectToServer();
    }
    connectToServer() {
        const addressInput = document.getElementById('server-address');
        let address = 'localhost:3000';
        if (addressInput && addressInput.value) {
            address = addressInput.value.trim();
        }
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        socket = new WebSocket(protocol + address);
        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'join', character: this.selectedCharacter }));
        };
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'init') {
                myId = data.id;
                allFood = data.food;
                allPlayers = data.players;
                this.gameLoop();
            } else if (data.type === 'state') {
                allPlayers = data.players;
                allFood = data.food;
            } else if (data.type === 'restart') {
                // Показываем меню выбора персонажа
                this.menu.classList.remove('hidden');
            }
        };
    }
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    gameLoop() {
        this.sendMove();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }
    sendMove() {
        if (socket && socket.readyState === 1 && myId !== null) {
            // Вычисляем направление относительно центра экрана
            const dx = window.mouseX - (this.canvas.width / 2);
            const dy = window.mouseY - (this.canvas.height / 2);
            socket.send(JSON.stringify({
                type: 'move',
                dx,
                dy
            }));
        }
    }
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Центрируем камеру на себе
        let me = allPlayers.find(p => p.id === myId);
        let offsetX = 0, offsetY = 0;
        if (me) {
            offsetX = this.canvas.width / 2 - me.x;
            offsetY = this.canvas.height / 2 - me.y;
        }
        // Рисуем еду
        allFood.forEach(food => {
            this.ctx.beginPath();
            this.ctx.arc(food.x + offsetX, food.y + offsetY, food.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = food.color;
            this.ctx.fill();
            this.ctx.closePath();
        });
        // Рисуем всех игроков
        allPlayers.forEach(player => {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(player.x + offsetX, player.y + offsetY, player.radius, 0, Math.PI * 2);
            this.ctx.clip();
            let img = this.characterImages[player.character];
            if (img) {
                this.ctx.drawImage(
                    img,
                    player.x + offsetX - player.radius,
                    player.y + offsetY - player.radius,
                    player.radius * 2,
                    player.radius * 2
                );
            }
            this.ctx.restore();
            // Имя и счет
            this.ctx.fillStyle = 'black';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.character + (player.id === myId ? ' (Вы)' : '') + `: ${player.score}`, player.x + offsetX, player.y + offsetY - player.radius - 10);
        });
    }
}

class Player {
    constructor(x, y, image) {
        this.x = x;
        this.y = y;
        this.radius = 20;
        this.image = image;
        this.speed = 5;
    }
    
    update(canvasWidth, canvasHeight) {
        // Получаем позицию мыши
        const mouseX = window.mouseX || this.x;
        const mouseY = window.mouseY || this.y;
        
        // Вычисляем направление движения
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Нормализуем вектор направления
        if (distance > 0) {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
        }
        
        // Ограничиваем движение в пределах canvas
        this.x = Math.max(this.radius, Math.min(canvasWidth - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvasHeight - this.radius, this.y));
    }
    
    draw(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
            this.image,
            this.x - this.radius,
            this.y - this.radius,
            this.radius * 2,
            this.radius * 2
        );
        ctx.restore();
    }
    
    eat(food) {
        const dx = this.x - food.x;
        const dy = this.y - food.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.radius;
    }
    
    collide(enemy) {
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.radius + enemy.radius;
    }
    
    reset(canvasWidth, canvasHeight) {
        this.x = canvasWidth / 2;
        this.y = canvasHeight / 2;
        this.radius = 20;
    }
}

class Food {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 5;
        this.color = this.getRandomColor();
    }
    
    getRandomColor() {
        const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
}

class Enemy {
    constructor(x, y, radius, image) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.image = image;
        this.speed = 2;
        this.target = null;
    }
    
    update(canvasWidth, canvasHeight, player, food, enemies) {
        // Находим ближайшую цель
        this.findTarget(player, food, enemies);
        
        if (this.target) {
            // Вычисляем направление к цели
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                // Если цель - игрок и он больше, убегаем
                if (this.target === player && player.radius > this.radius) {
                    this.x -= (dx / distance) * this.speed;
                    this.y -= (dy / distance) * this.speed;
                } else {
                    // Иначе двигаемся к цели
                    this.x += (dx / distance) * this.speed;
                    this.y += (dy / distance) * this.speed;
                }
            }
        }
        
        // Ограничиваем движение в пределах canvas
        this.x = Math.max(this.radius, Math.min(canvasWidth - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(canvasHeight - this.radius, this.y));
    }
    
    findTarget(player, food, enemies) {
        let closestDistance = Infinity;
        this.target = null;
        
        // Проверяем игрока
        if (player.radius < this.radius) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < closestDistance) {
                closestDistance = distance;
                this.target = player;
            }
        }
        
        // Проверяем других врагов
        enemies.forEach(enemy => {
            if (enemy !== this && enemy.radius < this.radius) {
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    this.target = enemy;
                }
            }
        });
        
        // Проверяем еду только если нет других целей
        if (!this.target) {
            food.forEach(f => {
                const dx = f.x - this.x;
                const dy = f.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    this.target = f;
                }
            });
        }
    }
    
    draw(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
            this.image,
            this.x - this.radius,
            this.y - this.radius,
            this.radius * 2,
            this.radius * 2
        );
        ctx.restore();
    }
    
    reset(canvasWidth, canvasHeight) {
        this.x = Math.random() * canvasWidth;
        this.y = Math.random() * canvasHeight;
        this.radius = Math.random() * 20 + 10;
    }
    
    eat(food) {
        const dx = this.x - food.x;
        const dy = this.y - food.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.radius;
    }
    
    collide(enemy) {
        const dx = this.x - enemy.x;
        const dy = this.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.radius + enemy.radius;
    }
}

// Инициализация отслеживания мыши
window.mouseX = 0;
window.mouseY = 0;
document.addEventListener('mousemove', (e) => {
    window.mouseX = e.clientX;
    window.mouseY = e.clientY;
});

// === ТАЧ-УПРАВЛЕНИЕ ДЛЯ МОБИЛЬНЫХ ===
function updateMouseByTouch(e, canvas) {
    if (e.touches && e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        window.mouseX = e.touches[0].clientX - rect.left;
        window.mouseY = e.touches[0].clientY - rect.top;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        canvas.addEventListener('touchstart', e => {
            updateMouseByTouch(e, canvas);
        }, { passive: false });
        canvas.addEventListener('touchmove', e => {
            updateMouseByTouch(e, canvas);
            e.preventDefault();
        }, { passive: false });
        canvas.addEventListener('touchend', e => {
            // После отпускания пальца — мышь в центр экрана
            window.mouseX = canvas.width / 2;
            window.mouseY = canvas.height / 2;
        }, { passive: false });
    }
    // === КНОПКА РЕСТАРТА ===
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            if (socket && socket.readyState === 1) {
                socket.send(JSON.stringify({ type: 'restart' }));
            }
        });
    }
    // Восстанавливаем последний адрес сервера из localStorage
    const addressInput = document.getElementById('server-address');
    if (addressInput) {
        const lastAddress = localStorage.getItem('lastServerAddress');
        if (lastAddress) {
            addressInput.value = lastAddress;
        }
        addressInput.addEventListener('input', () => {
            localStorage.setItem('lastServerAddress', addressInput.value.trim());
        });
    }
});

window.onload = () => {
    new Game();
}; 