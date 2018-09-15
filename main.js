const UNIT_SCALE = 1;
const THROUGHPUT_SCALE = 1;
const NODE_COLOR = 'rgba(0, 0, 0, 0.3)';
const CONNECTION_COLOR = '#bbb';
const DISPOSITIONS_SUM = 30;


const ZOOM_INIT = 10;
const ZOOM_MAX = 100;
const ZOOM_MIN = 0.5;
const ZOOM_SPEED = 1/800;


let getDistance = (p1, p2) => {
	return Math.sqrt(Math.pow((p2.x - p1.x), 2) + Math.pow((p2.y - p1.y), 2));
}

let rad2deg = (rad => rad * 180 / Math.PI);

let prepareCanvas = (stage) => {
	// resizing to full width
	let resizeCanvas = () => {
		stage.height(window.innerHeight);
		stage.width(window.innerWidth);
		stage.draw();
	};
	window.addEventListener('resize', resizeCanvas, false);
	resizeCanvas(); // resize on init

	// zoom
	stage.scale({ x: ZOOM_INIT, y: ZOOM_INIT});
	window.addEventListener('wheel', e => {
		let zoom = stage.scale().x;
		zoom = Math.exp(Math.log(zoom) - e.deltaY * ZOOM_SPEED);
		if (zoom > ZOOM_MAX) zoom = ZOOM_MAX;
		if (zoom < ZOOM_MIN) zoom = ZOOM_MIN;
		stage.scale({x: zoom, y: zoom});
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
				y: touch1.clientY,
			}, {
				x: touch2.clientX,
				y: touch2.clientY,
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
let getScaledPointerPosition = (stage) => {
	var pointerPosition = stage.getPointerPosition();
	var stageAttrs = stage.attrs;
	var x = (pointerPosition.x - stageAttrs.x) / stageAttrs.scaleX;
	var y = (pointerPosition.y - stageAttrs.y) / stageAttrs.scaleY;
	return {x: x, y: y};
};


class Disposition {
	constructor(x, y, direction, value, cb) {
		let disposition = this;

		this.x = x;
		this.y = y;
		this.direction = direction;

		this.head = new Konva.RegularPolygon({
			x: x,
			y: y,
			sides: 3,
			radius: 1,
			rotation: rad2deg(this.direction) - 30,
			fill: 'red',
			stroke: 'black',
			strokeWidth: 0.1,
			draggable: true,
			dragBoundFunc: function (pos) {return this.getAbsolutePosition();},
		});
		this.head.on('dragmove', function(e) {
			let pos = getScaledPointerPosition(this.getStage());
			let radius = getDistance(pos, disposition);
			disposition.setValue(radius);
			cb(radius);
			this.getLayer().draw();
		});
		this.setValue(value);
	}

	setValue(value) {
		this.value = value;
		this.head.position({
			x: this.x + Math.cos(this.direction) * value,
			y: this.y + Math.sin(this.direction) * value,
		});
	}

	drawOn(stage) {
		stage.add(this.head);
	};
}


class Node {
	/**
	 * `connections` is map id => direction
	 */
	constructor(x, y, connections, production) {
		let node = this;

		this.x = x;
		this.y = y;
		this.production = production;
		this.connections = connections;

		this.radius = Math.pow(this.production / Math.PI, 0.5) * UNIT_SCALE;
		this.radiusWidth = this.radius * 0.3;

		this.productionCircle = new Konva.Circle({
			radius: this.radius,
			x: this.x,
			y: this.y,
			fill: NODE_COLOR,
			listening: false,
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

		// create dispositions
		this.dispositions = new Map();
		for (let [connection_id, connection] of connections.entries()) {
			this.dispositions.set(
				connection_id,
				new Disposition(
					this.x, this.y, connection, DISPOSITIONS_SUM / this.connections.size,
					(value) => this.dispositionUpdate(connection_id, value),
				),
			);
		}
	}

	dispositionUpdate(connection_id, value) {
		console.assert(value >= 0);
		if (value > DISPOSITIONS_SUM) {
			value = DISPOSITIONS_SUM;
			this.dispositions.get(connection_id).setValue(value);
		}
		let sum = 0;
		for (let [cid, disposition] of this.dispositions.entries()) {
			if (cid == connection_id) continue;
			sum += disposition.value;
			console.log(cid, disposition.value);
		}
		if (sum == 0) {
			// other dispositions was set to 0, so we need to add constantComponent to them
			var ratio = 0;
			if (this.dispositions.size == 1) return;
			var constantComponent = (DISPOSITIONS_SUM - value) / (this.dispositions.size - 1);
		} else {
			var ratio = (DISPOSITIONS_SUM - value) / sum;
			var constantComponent = 0;
		}
		console.log(value, sum, ratio);
		for (let [cid, disposition] of this.dispositions.entries()) {
			if (cid == connection_id) continue;
			disposition.setValue(disposition.value * ratio + constantComponent);
		}
	};

	drawOn(stage) {
		stage.add(this.productionCircle);
		stage.add(this.targetCircle);
		this.dispositions.forEach(disposition => disposition.drawOn(stage));
	};
}


class Game {
	constructor(containerId) {
		this.canvas = new Konva.Stage({
			container: containerId,
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

	addNode(nodeId, node) {
		console.assert(!this.nodes.has(nodeId));
		this.nodes.set(nodeId, node);
		node.drawOn(this.layer);
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

}

var game = new Game('container');
game.addNode(0, new Node(0, 0, new Map(), 1));
game.addNode(2, new Node(5, 0, new Map(), 2));
game.addNode(1, new Node(10, 20, new Map([
	['a', 0],
	['b', Math.PI/6],
	['c', 1],
]), 10));
game.setConnection(0, 0, 1, 10, 3);
game.setConnection(1, 1, 2, 10, 10);
game.canvas.draw();
