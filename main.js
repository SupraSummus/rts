const UNIT_SCALE = 1;
const THROUGHPUT_SCALE = 1;
const NODE_COLOR = 'rgba(0, 0, 0, 0.3)';
const CONNECTION_COLOR = '#bbb';

const ZOOM_INIT = 2000;
const ZOOM_MAX = 4000;
const ZOOM_MIN = -500;
const ZOOM_FUNC = zoom => Math.pow(Math.E, zoom/800);


function getDistance(p1, p2) {
        return Math.sqrt(Math.pow((p2.x - p1.x), 2) + Math.pow((p2.y - p1.y), 2));
    }


let prepareCanvas = (canvas) => {
	let stage = canvas;

	// resizing to full width
	let resizeCanvas = () => {
		canvas.height(window.innerHeight);
		canvas.width(window.innerWidth);
		canvas.draw();
	};
	window.addEventListener('resize', resizeCanvas, false);
	resizeCanvas(); // resize on init

	// zoom
	let zoom = ZOOM_INIT;
	stage.scale({ x: ZOOM_FUNC(zoom), y: ZOOM_FUNC(zoom) });
	window.addEventListener('wheel', e => {
		zoom = zoom - e.deltaY;
		if (zoom > ZOOM_MAX) zoom = ZOOM_MAX;
		if (zoom < ZOOM_MIN) zoom = ZOOM_MIN;
		stage.scale({ x: ZOOM_FUNC(zoom), y: ZOOM_FUNC(zoom) });
		e.preventDefault();
		e.stopPropagation();
		stage.batchDraw();
	});

	// pinch zoom
	let lastDist = 0;
	stage.getContent().addEventListener('touchmove', function(evt) {
        var touch1 = evt.touches[0];
        var touch2 = evt.touches[1];

        if(touch1 && touch2) {
            var dist = getDistance({
                x: touch1.clientX,
                y: touch1.clientY
            }, {
                x: touch2.clientX,
                y: touch2.clientY
            });

            if(!lastDist) {
                lastDist = dist;
            }

            var scale = stage.getScaleX() * dist / lastDist;

            stage.scaleX(scale);
            stage.scaleY(scale);
            stage.draw();
            lastDist = dist;
        }
    }, false);
    stage.getContent().addEventListener('touchend', function() {
        lastDist = 0;
    }, false);


};


/*
 * Returns the position pointer relative to the scaled and or dragged
 * stage. You must set the stage options x,y,scaleX, and scaleY.  If you
 * don't set them then you will need to adjust the stageAttrs to just stage
 * and change the calculation for x & y as they require those attributes.
 */
function getScaledPointerPosition(stage) {
    var pointerPosition = stage.getPointerPosition();
    var stageAttrs = stage.attrs;
    var x = (pointerPosition.x - stageAttrs.x) / stageAttrs.scaleX;
    var y = (pointerPosition.y - stageAttrs.y) / stageAttrs.scaleY;
    return {x: x, y: y};
}


class Node {
	constructor(x, y, production) {
		let node = this;

		this.x = x;
		this.y = y;
		this.production = production;
		this.radius = Math.pow(this.production / Math.PI, 0.5) * UNIT_SCALE;
		this.radiusWidth = this.radius * 0.3;

		this.productionCircle = new Konva.Circle({
			radius: this.radius,
			x: this.x,
			y: this.y,
			fill: NODE_COLOR,
		});

		this.targetCircle = new Konva.Ring({
			innerRadius: this.radius,
			outerRadius: this.radius + this.radiusWidth,
			x: this.x,
			y: this.y,
			fill: 'rgba(0, 0, 0, 0.5)',
			draggable: true,
			dragBoundFunc: function (pos) {return this.getAbsolutePosition();},
		});
		this.targetCircle.on('dragmove', function(e) {
			let pos = getScaledPointerPosition(this.getStage());
			let radius = getDistance(pos, node);
			this.outerRadius(radius + node.radiusWidth);
			this.innerRadius(radius);
			this.getLayer().draw();
		});
	}

	drawOn(canvas) {
		canvas.add(this.productionCircle);
		canvas.add(this.targetCircle);
	};
}


class Game {
	constructor(canvasId) {
		this.canvas = new Konva.Stage({
			container: 'container',
			draggable: true,
			x: 0, y: 0,
		});
		this.stage = this.canvas;
		this.layer = new Konva.Layer();
        this.stage.add(this.layer);

		this.nodes = new Map();
		this.connections = new Map();

		prepareCanvas(this.canvas);

		let game = this;
		this.canvas.on('mouse:over', (e) => {
			if (e.target != null) {
				if (e.target.gameNodeId != undefined) {
					game.showNodeControls(e.target.gameNodeId);
				}
			}
		});

		//canvas.setBackgroundColor('gray');
		this.layer.add(new Konva.Rect({
			x: 0, y:0,
			width: 1,
			height: 1,
			fill: 'red',
		}));
		this.layer.add(new Konva.Rect({
			x:10, y:10,
			width: 1,
			height: 1,
			fill: 'red',
		}));

	}

	setNodeStats(nodeId, x, y, production) {
		if (this.nodes.has(nodeId)) {
			console.assert(false);
		} else {
			let node = new Node(x, y, production);
			this.nodes.set(nodeId, node);
			node.drawOn(this.layer);
		}
	}

	setConnection(connectionId, nodeAId, nodeBId, length, throughput) {
		if (this.connections.has(connectionId)) {
			console.assert(false);
		}
		let connection = {
			nodeAId: nodeAId,
			nodeBId: nodeBId,
			length: length,
			throughput: throughput,
		};
		this.connections.set(connectionId, connection);
		connection.canvasObject = new Konva.Line([
			this.nodes.get(nodeAId).x, this.nodes.get(nodeAId).y,
			this.nodes.get(nodeBId).x, this.nodes.get(nodeBId).y,
		], {
			width: throughput * THROUGHPUT_SCALE,
			fill: CONNECTION_COLOR,
			stroke: CONNECTION_COLOR,
		});
		this.layer.add(connection.canvasObject);
	}

	setNodeUnits(nodeId, playerUnitsMap) {
		
	}

	showNodeControls(nodeId) {
		let node = this.nodes.get(nodeId);
		this.canvas.add(new fabric.Circle({
			radius: node.radius * 0.1,
			left: node.x - node.radius * 0.1,
			top: node.y - node.radius * 0.1,
			fill: 'red',
			...FABRIC_OBJECT_OPTIONS,
		}));
	}

	hideNodeContols(nodeId) {
		
	}
}

var game = new Game('c');
game.setNodeStats(0, 0, 0, 1);
game.setNodeStats(2, 5, 0, 2);
game.setNodeStats(1, 10, 20, 10);
game.setConnection(0, 0, 1, 10, 3);
game.setConnection(1, 1, 2, 10, 10);
game.canvas.draw();
