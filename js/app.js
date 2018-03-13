(function () {
    //游戏设置
    var CONFIG = {
        status: 'start', // 游戏开始默认为开始中
        level: 2, // 游戏默认等级
        totalLevel: 6, // 总共6关
        numPerLine: 6, // 游戏默认每行多少个怪兽
        canvasPadding: 30, // 默认画布的间隔
        bulletSize: 10, // 默认子弹长度
        bulletSpeed: 10, // 默认子弹的移动速度
        enemySpeed: 2, // 默认敌人移动距离
        enemySize: 50, // 默认敌人的尺寸
        enemyGap: 10,  // 默认敌人之间的间距
        enemyIcon: './img/enemy.png', // 怪兽的图像
        enemyBoomIcon: './img/boom.png', // 怪兽死亡的图像
        enemyDirection: 'right', // 默认敌人一开始往右移动
        enemyScore: 10, //默认敌人分数
        planeSpeed: 10, // 默认飞机每一步移动的距离
        planeSize: {
            width: 60,
            height: 100
        }, // 默认飞机的尺寸,
        planeIcon: './img/plane.png',
        stageSize: {
            stageWidth: 700,
            stageHeight: 600
        }
    };

    //游戏代码所用到的全局变量
    var canvasElem = null,
        context = null,
        bulletId = 0,
        scoreLabels = null,
        levelLabels = null,
        gameTable = null,
        level = CONFIG.level;

    //观察者模式，其实和ios的notification有一点点相似。a抛通知x，订阅了x通知的b接受处理x通知的事件。当然还是存在不同的。ios的notification的订阅者是自身写处理函数。
    //这个还是不要写类，new一个类开销还是挺大的
    var pubsub = (function () {
        var events = {};
        return {
            subscribe: function (eventName, callback) {
                if (!events[eventName]) {
                    events[eventName] = [];
                }
                events[eventName].push({
                    func: callback
                });
            },
            publish: function (eventName, args) {
                if (!events[eventName]) {
                    return false;
                }
                var subscribers = events[eventName];
                for (var i = 0; i < subscribers.length; i++) {
                    subscribers[i].func(args);
                }
            },
            removeSubscribers: function (eventName) {

            }
        };
    })();

    // model
    var gameModel = (function () {
        var score = 0;
        return {
            getScore: function () {
                return score;
            },
            setScore: function (scoreNew) {
                score = scoreNew;
                var len = scoreLabels.length;
                while (len--) {
                    scoreLabels[len].innerText = score;
                }
            },
            reset: function () {
                score = 0;
            }
        };
    })();

    // view
    var gameView = (function (model) {
        //return的对象
        var view = null,
            plane = null;//飞机✈️

        // 基本类
        var BaseObj = function (config, context) {
            this.x = config.x;
            this.y = config.y;
            this.width = config.width;
            this.height = config.height;
            this.context = context;
            this.image = new Image();
            this.speedX = 0;
        }

        function inheritPrototype(superType, subtype) {
            var proto = Object.create(superType.prototype);
            subtype.prototype = proto;
        }

        // 飞机类(由玩家进行操作)
        var Plane = function (config, context) {
            BaseObj.call(this, config, context);
            this.image.src = CONFIG.planeIcon;
        };
        inheritPrototype(BaseObj, Plane);
        Plane.prototype = {
            constructor: Plane,
            draw: function () {
                this.context.drawImage(this.image, this.x, this.y, this.width, this.height);
                this.move();
            },
            move: function () {
                this.x += this.speedX;
                if (this.x <= CONFIG.canvasPadding) {
                    this.x = CONFIG.canvasPadding;
                } else if (this.x >= CONFIG.stageSize.stageWidth - CONFIG.canvasPadding - this.width) {
                    this.x = CONFIG.stageSize.stageWidth - CONFIG.canvasPadding - this.width;
                }
            },
            shoot: function () {//飞机射击
                //产生子弹
                var bulletX = this.x + this.width / 2,
                    bulletY = this.y;
                var bullet = new Bullet({ x: bulletX, y: bulletY, width: 1, height: CONFIG.bulletSize }, context);
                //让子弹添加到stage中
                stage.addChild('bullet' + bullet.bulletId, bullet);
            }
        };

        var Bullet = function (config, context) {
            BaseObj.call(this, config, context);
            this.speedY = CONFIG.bulletSpeed;
            this.bulletId = bulletId++;
            if (bulletId == 100) {
                bulletId = 0;//重置子弹id
            }
            this.isAlive = true;
        };
        inheritPrototype(BaseObj, Bullet);
        Bullet.prototype = {
            constructor: Bullet,
            draw: function () {
                if (this.isAlive) {
                    this.context.fillStyle = "#FFFFFF";
                    this.context.fillRect(this.x, this.y, this.width, this.height);
                    this.move();
                }
            },
            checkCollision: function () {
                var monsters = stage.childs['monsters'];
                if (monsters && monsters.length > 0) {
                    for (var i = 0; i < monsters.length; i++) {
                        for (var j = 0; j < monsters[i].length; j++) {
                            var monster = monsters[i][j];
                            if (!(this.x + this.width < monster.x) &&
                                !(this.x > monster.x + monster.width) &&
                                !(this.y > monster.y + monster.height) &&
                                !(this.y + this.height < monster.y)
                            ) {
                                //碰撞了
                                //通知从画布中去除怪兽
                                pubsub.publish('bulletShootMonster', { row: i, column: j });
                                //消灭自身子弹
                                this.destroy();
                                break;
                            }
                        }
                    }
                }

            },
            move: function () {
                this.y -= CONFIG.bulletSpeed;
                if (this.y < -this.height) {
                    this.destroy();
                }
                this.checkCollision();
            },
            destroy: function () {
                //把自身从stage中移除，并且释放内存
                stage.removeChild('bullet' + this.bulletId);
                this.isAlive = false;
            }
        }

        // 怪兽类
        var Monster = function (config, context) {
            BaseObj.call(this, config, context);
            //怪兽是否存活
            this.isAlive = true;
            this.originRowIndex = config.originRowIndex;
            this.originColumnIndex = config.originColumnIndex;
            this.image.src = CONFIG.enemyIcon;
            this.overImage = new Image();
            //怪兽挂掉的图片
            this.overImage.src = CONFIG.enemyBoomIcon;
            //初始化怪兽的移动速度
            if (CONFIG.enemyDirection === 'right') {
                this.speedX = CONFIG.enemySpeed;
            } else if (CONFIG.enemyDirection === 'left') {
                this.speedX = -(CONFIG.enemySpeed);
            }

        };
        inheritPrototype(BaseObj, Monster);
        Monster.prototype = {
            constructor: Monster,
            draw: function () {
                if (this.isAlive) {
                    this.move();
                    this.context.drawImage(this.image, this.x, this.y, this.width, this.height);
                }
            },
            move: function () {
                this.x += this.speedX;
            },
            changeDirection: function () {//转换怪兽位置
                this.speedX *= -1;
                this.y = this.y += CONFIG.enemyGap + this.height;
            },
            die: function () {//怪兽死亡
                this.isAlive = false;
                this.context.clearRect(this.x, this.y, this.width, this.height);
                this.context.drawImage(this.overImage, this.x, this.y, this.width, this.height);
                pubsub.publish('resizeMonsterArea');
            }
        };

        //怪兽区域
        var MonstersArea = function (config, context) {
            BaseObj.call(this, config, context);
            this.minRowIndex = config.minRowIndex;
            this.maxRowIndex = config.maxRowIndex;
            this.minColumnIndex = config.minColumnIndex;
            this.maxColumnIndex = config.maxColumnIndex;
            //初始化怪兽区域的移动速度
            if (CONFIG.enemyDirection === 'right') {
                this.speedX = CONFIG.enemySpeed;
            } else if (CONFIG.enemyDirection === 'left') {
                this.speedX = -(CONFIG.enemySpeed);
            }
            this.context.strokeStyle = '#ffffff';
        };
        inheritPrototype(BaseObj, MonstersArea);
        MonstersArea.prototype = {
            constructor: MonstersArea,
            move: function () {
                this.checkCollisionWithPlane();
                this.x += this.speedX;
                if (this.x >= CONFIG.stageSize.stageWidth - CONFIG.canvasPadding - this.width) {
                    this.x = CONFIG.stageSize.stageWidth - CONFIG.canvasPadding - this.width;
                    this.y += CONFIG.enemyGap + CONFIG.enemySize;
                    this.speedX *= -1;
                    // 通知怪兽改变方向
                    pubsub.publish('monstersAreaChangeDirection');
                }

                if (this.x <= CONFIG.canvasPadding) {
                    this.x = CONFIG.canvasPadding;
                    this.y += CONFIG.enemyGap + CONFIG.enemySize;
                    this.speedX *= -1;
                    // 通知怪兽改变方向
                    pubsub.publish('monstersAreaChangeDirection');
                }
            },
            draw: function () {
                //只调用move方法，不在画布上显示
                this.move();
            },
            checkCollisionWithPlane: function () {//检查怪兽区域是否与飞机相撞
                //简单判断矩形是否到达飞机移动区域即可
                if (this.y + this.height >= plane.y) {
                    console.log('game over');
                    pubsub.publish('gameOver');
                }
            },
            resize: function () {//重新调整怪兽移动区域大小，这个判断可能不太好❌
                //获取怪兽2维数组
                var monsters = stage.childs['monsters'];
                if (monsters && monsters.length > 0) {
                    var minColumnIndex = -1,
                        maxColumnIndex = -1,
                        //取其中一个样本的originRowIndex
                        maxRowIndex = monsters[monsters.length - 1][0].originRowIndex;
                    for (var i = 0; i < monsters.length; i++) {
                        var monstersRow = monsters[i];
                        var monsterRowColumnMin = monstersRow[0].originColumnIndex;
                        var monsterRowColumnMax = monstersRow[monstersRow.length - 1].originColumnIndex;

                        //初始化min column
                        if (minColumnIndex == -1) {
                            minColumnIndex = monsterRowColumnMin;
                        }

                        //初始化max column
                        if (maxColumnIndex == -1) {
                            maxColumnIndex = monsterRowColumnMax;
                        }

                        //初始化max row
                        if (maxRowIndex == -1) {
                            maxRowIndex = i;
                        }

                        if (monsterRowColumnMin < minColumnIndex) {
                            minColumnIndex = monsterRowColumnMin;
                        }

                        if (monsterRowColumnMax > maxColumnIndex) {
                            maxColumnIndex = monsterRowColumnMax;
                        }
                    }

                    if (this.minColumnIndex != minColumnIndex) {
                        this.x += (CONFIG.enemyGap + CONFIG.enemySize) * (minColumnIndex - this.minColumnIndex);
                        this.width -= (CONFIG.enemyGap + CONFIG.enemySize) * (minColumnIndex - this.minColumnIndex);
                        this.minColumnIndex = minColumnIndex;
                    }

                    if (this.maxColumnIndex != maxColumnIndex) {
                        this.width -= (CONFIG.enemyGap + CONFIG.enemySize) * (this.maxColumnIndex - maxColumnIndex);
                        this.maxColumnIndex = maxColumnIndex;
                    }

                    if (this.maxRowIndex != maxRowIndex) {
                        this.height -= (CONFIG.enemyGap + CONFIG.enemySize) * (this.maxRowIndex - maxRowIndex);
                        this.maxRowIndex = maxRowIndex;
                    }
                }
            }
        };

        //舞台，用于保存显示中的所有元素
        var stage = {
            stageWidth: CONFIG.stageSize.stageWidth,
            stageHeight: CONFIG.stageSize.stageHeight,
            childs: {},
            playFlag: false,

            addChild: function (key, value) {
                this.childs[key] = value;
            },
            removeChild: function (key) {
                delete this.childs[key];
            },
            removeAllChild: function () {
                for (var i in this.childs) {
                    this.removeChild(i);
                }
            },
            play: function () {
                if (!this.playFlag) {
                    this.playFlag = true;
                    this.render();
                }
            },
            stop: function () {
                if (this.playFlag) {
                    this.playFlag = false;
                }
            },
            clear: function () {
                this.removeAllChild();
                this.stop();
            },
            render: function () {
                context.clearRect(0, 0, this.stageWidth, this.stageHeight);
                var childs = this.childs;
                //支持二维数组解析，怪兽排列使用二维数组
                for (var childIndex in childs) {
                    var child = childs[childIndex];
                    if (Object.prototype.toString.call(child) == "[object Array]") {
                        for (var i = 0; i < child.length; i++) {
                            var subChild = child[i];
                            if (Object.prototype.toString.call(subChild) == "[object Array]") {
                                for (var j = 0; j < subChild.length; j++) {
                                    subChild[j].draw();
                                }
                            } else {
                                subChild.draw();
                            }
                        }
                    } else {
                        child.draw();
                    }
                }
                if (this.playFlag) {
                    requestAnimationFrame(this.render.bind(this));
                } else {
                    context.clearRect(0, 0, this.stageWidth, this.stageHeight);
                }
            }
        };

        //游戏关卡
        var gameLevel = (function () {
            var currentLevel = 1;
            return {
                newLevel: function () {
                    //初始化怪兽
                    var monsters = [];
                    for (var i = 0; i < currentLevel; i++) {
                        var monstersRow = [];
                        for (var j = 0; j < CONFIG.numPerLine; j++) {
                            var monsterConfig = {
                                x: CONFIG.canvasPadding + j * (CONFIG.enemyGap + CONFIG.enemySize),
                                y: CONFIG.canvasPadding + i * (CONFIG.enemyGap + CONFIG.enemySize),
                                width: CONFIG.enemySize,
                                height: CONFIG.enemySize,
                                originRowIndex: i,
                                originColumnIndex: j
                            };
                            var monster = new Monster(monsterConfig, context);
                            monstersRow.push(monster);
                        }
                        monsters.push(monstersRow);
                    }
                    var monstersAreaConfig = {
                        x: CONFIG.canvasPadding,
                        y: CONFIG.canvasPadding,
                        width: (CONFIG.enemyGap + CONFIG.enemySize) * (CONFIG.numPerLine - 1) + CONFIG.enemySize,
                        height: (CONFIG.enemyGap + CONFIG.enemySize) * currentLevel,
                        minRowIndex: 0,
                        maxRowIndex: currentLevel - 1,
                        minColumnIndex: 0,
                        maxColumnIndex: CONFIG.numPerLine - 1
                    }
                    var monstersArea = new MonstersArea(monstersAreaConfig, context);
                    stage.addChild('monsters', monsters);
                    stage.addChild('monstersArea', monstersArea);
                },
                getLevel: function () {
                    return currentLevel;
                },
                setLevel: function (newLevel) {
                    currentLevel = newLevel;
                    var len = levelLabels.length;
                    while (len--) {
                        levelLabels[len].innerText = currentLevel;
                    }
                },
                currentLevelClear: function () {
                    // 擦除canvas
                    stage.clear();
                    if (currentLevel == CONFIG.level) {
                        gameTable.setAttribute('data-status', 'all-success');
                    } else {
                        gameTable.setAttribute('data-status', 'success');
                        this.setLevel(++currentLevel);
                    }
                }
            }
        })();

        //键盘事件处理、绑定
        var eventManager = (function () {
            var isOnListen = false;
            var keyState = { left: false, right: false };

            var keyDownManager = function (event) {
                switch (event.keyCode) {
                    case 37:
                        pubsub.publish('planeMove', 'left');
                        keyState.left = true;
                        keyState.right = false;
                        break;
                    case 39:
                        pubsub.publish('planeMove', 'right');
                        keyState.right = true;
                        keyState.left = false;
                        break;
                    case 32:
                        pubsub.publish('planeShoot');
                        break;
                }
            }

            var keyUpManager = function (event) {
                switch (event.keyCode) {
                    case 37:
                        keyState.left = false;
                        if (!(keyState.left || keyState.right)) {
                            pubsub.publish('planeMove', 'stop')
                        }
                        break;
                    case 39:
                        keyState.right = false;
                        if (!(keyState.left || keyState.right)) {
                            pubsub.publish('planeMove', 'stop')
                        }
                        break;
                }
            }

            return {
                isOnListen:isOnListen,
                on: function () {
                    document.addEventListener('keydown', keyDownManager, false);
                    document.addEventListener('keyup', keyUpManager, false);
                    var buttonPlay = document.querySelector('.js-play');
                    buttonPlay.addEventListener('click', function (evt) {
                        //开始游戏
                        view.gameStart();
                    }, false);

                    var buttonReplay = document.querySelectorAll('.js-replay');
                    buttonReplay.forEach(function (buttonR) {
                        buttonR.addEventListener('click', function (evt) {
                            //重新开始游戏
                            view.gameReset();
                        }, false);
                    });

                    var buttonNext = document.getElementById('nextLevelButton');
                    buttonNext.addEventListener('click', function (evt) {
                        view.gameStart();
                    }, false);
                    this.isOnListen = true;
                },
                off: function () {
                    document.removeEventListener('keydown', keyDownManager, false);
                    document.removeEventListener('keyup', keyUpManager, false);
                    this.isOnListen = false;
                }
            };
        })();

        view = {
            plane: plane,
            stage: stage,
            level: gameLevel,
            init: function () {
                //开始监听
                eventManager.on();
            },
            resetStage: function () {
                var planeConfig = {
                    x: (CONFIG.stageSize.stageWidth - CONFIG.planeSize.width) / 2,
                    y: CONFIG.stageSize.stageHeight - CONFIG.planeSize.height - CONFIG.canvasPadding,
                    width: CONFIG.planeSize.width,
                    height: CONFIG.planeSize.height
                }
                plane = new Plane(planeConfig, context)
                this.plane = plane;
                stage.addChild('plane', plane);
                gameLevel.newLevel();
            },
            gameStart: function () {
                if(!eventManager.isOnListen){
                    eventManager.on();
                }
                gameTable.setAttribute('data-status', 'playing');
                this.resetStage();
                stage.play();
            },
            gameOver: function () {
                stage.clear();
                gameTable.setAttribute('data-status', 'failed');
            },
            gameClear: function () {
                stage.clear();
                eventManager.off();
                gameTable.setAttribute('data-status', 'all-success');
            },
            gameLevelClear: function () {
                stage.clear();
                eventManager.off();
                gameLevel.currentLevelClear();
            },
            gameReset: function () {
                gameLevel.setLevel(1);
                model.setScore(0);
                this.gameStart();
            }
        };
        return view;
    })(gameModel);

    // controller
    var gameController = (function (model, view) {
        var planeMoveHandler = function (direction) {
            switch (direction) {
                case 'left':
                    view.plane.speedX = -CONFIG.planeSpeed;
                    break;
                case 'right':
                    view.plane.speedX = CONFIG.planeSpeed;
                    break;
                case 'stop':
                    view.plane.speedX = 0;
                    break;
            }
        };

        var planeShootHandler = function () {
            view.plane.shoot();
        };

        var monstersAreaChangeDirectionHandler = function () {
            var monsters = view.stage.childs['monsters'];
            if (monsters) {
                for (var i = 0; i < monsters.length; i++) {
                    for (var j = 0; j < monsters[i].length; j++) {
                        monsters[i][j].changeDirection();
                    }
                }
            }
        };

        var bulletShootMonster = function (monsterLocation) {
            var monsters = view.stage.childs['monsters'];
            var monstersRow = monsters[monsterLocation.row];
            var monster = monsters[monsterLocation.row][monsterLocation.column];
            //把子弹击中的怪兽从数组中删除
            monstersRow.splice(monsterLocation.column, 1);
            //如果怪兽行size为0，则删除怪兽所在的行
            if (monstersRow.length == 0) {
                monsters.splice(monsterLocation.row, 1);
            }
            //删除怪兽
            monster.die();
            //改变model分数
            var newScore = model.getScore() + 10;
            model.setScore(newScore);
            //如果发现没有怪兽则，删除stage中的怪兽元素
            if (monsters.length == 0) {
                delete view.stage.childs.monsters;
                //当前level通关
                view.gameLevelClear();
            }
        };

        var resizeMonsterArea = function (monsterDieLocation) {
            var monstersArea = view.stage.childs['monstersArea'];
            if (monstersArea) {
                monstersArea.resize(monsterDieLocation);
            }
        };

        var gameOver = function () {//游戏结束（失败）
            view.gameOver();
        };

        pubsub.subscribe('planeMove', planeMoveHandler);//飞机移动
        pubsub.subscribe('planeShoot', planeShootHandler);//飞机射击
        pubsub.subscribe('monstersAreaChangeDirection', monstersAreaChangeDirectionHandler);//怪兽画布改变方向
        pubsub.subscribe('bulletShootMonster', bulletShootMonster);//子弹射击消灭怪兽
        pubsub.subscribe('resizeMonsterArea', resizeMonsterArea);//重新更新怪兽区域大小
        pubsub.subscribe('gameOver', gameOver);//游戏结束（失败）
    })(gameModel, gameView);

    var init = function () {
        canvasElem = document.getElementById('canvas');
        context = canvas.getContext('2d');
        scoreLabels = document.querySelectorAll('.score');
        levelLabels = document.querySelectorAll('.level');
        gameTable = document.querySelector('#game');
        gameView.init();
    };

    init();
})()