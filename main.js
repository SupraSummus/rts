// ### settings ###

const UNIT_SCALE = 1;
const THROUGHPUT_SCALE = 1;
const TERRAIN_COLOR = '#aaa';
const CONTROLS_COLOR = 'rgba(0, 0, 0, 0.7)';
const DISPOSITIONS_SUM = 30;
const CONNECTION_SPACING = 0.1;
const CONTROLS_SIZE = 1;


const ZOOM_INIT = 10;
const ZOOM_MAX = 100;
const ZOOM_MIN = 0.5;
const ZOOM_SPEED = 1/800;

// ### functions for manipulating points ###

let getDistance = (p1, p2) => {
	return Math.sqrt(Math.pow((p2.x - p1.x), 2) + Math.pow((p2.y - p1.y), 2));
}

let rad2deg = (rad => rad * 180 / Math.PI);

let xyobjs2array = (objs => {
	let pts = [];
	for (let o of objs) {
		pts.push(o.x);
		pts.push(o.y);
	}
	return pts;
});

let mul_v_s = ((v, s) => ({x: v.x * s, y: v.y * s}));
let add_v_v = ((v, w) => ({x: v.x + w.x, y: v.y + w.y}));
let ang2v = (ang => ({x: Math.sin(ang), y: Math.cos(ang)}));

// ### canvas utils ###

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


// ### game itself ###

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
			radius: CONTROLS_SIZE,
			rotation: rad2deg(this.direction) - 30,
			fill: CONTROLS_COLOR,
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

	drawOn(terrainLayer, unitsLayer, controlsLayer, debugLayer) {
		controlsLayer.add(this.head);
	};
}


class Connection {
	/**
	 * points is an array of objects: [{x, y, timeToNext}, {x2, y2, ...}, ..., {xn, yn, ...}]
	 */
	constructor(from, to, width, travelTime) {
		this.from = from;
		this.to = to;
		this.width = width;
		this.travelTime = travelTime;

		this.line = new Konva.Line({
			points: xyobjs2array([this.from, this.to]),
			stroke: TERRAIN_COLOR,
			strokeWidth: this.width,
			lineCap: 'round',
			lineJoin: 'round',
		});
		this.previousLines = [];
	}

	updateMovements(time, movements) {
		// create new lines
		let newLines = [];
		let widthOffset = 0;
		for (let movement of movements) {
			let line = new Konva.Line({
				points: xyobjs2array([
					this._linePoint(0, widthOffset, movement.width),
					this._linePoint(0, widthOffset, movement.width),
				]),
				stroke: movement.color,
				strokeWidth: movement.width,
				lineCap: 'round',
				lineJoin: 'round',
			});
			widthOffset += movement.width;
			this.unitsLayer.add(line);
			newLines.push(line);
		}

		// animate movement
		let conn = this;
		let previousLines = this.previousLines;
		this.animationManager.registerAnimation(t => {
			// the end has reached - terminte the animation
			if (t >= time + conn.travelTime) {
				previousLines.forEach(l => l.destroy());
				return false;
			}
			// update previous ends
			let widthOffset = 0;
			for (let line of previousLines) {
				let lineWidth = line.strokeWidth;
				let pts = line.points();
				line.points(xyobjs2array([
					conn._linePoint(t - time, widthOffset, lineWidth),
					{x: pts[2], y: pts[3]},
				]));
				widthOffset += lineWidth;
			}
			// animate front lines
			widthOffset = 0;
			for (let line of newLines) {
				let lineWidth = line.strokeWidth;
				let pts = line.points();
				line.points(xyobjs2array([
					{x: pts[0], y: pts[1]},
					conn._linePoint(t - time, widthOffset, lineWidth),
				]));
				widthOffset += lineWidth;
			}
			return true;
		});

		this.previousLines = newLines;
	}

	drawOn(terrainLayer, unitsLayer, controlsLayer, debugLayer, animationManager) {
		terrainLayer.add(this.line);
		this.unitsLayer = unitsLayer;
		this.animationManager = animationManager;
	}

	_linePoint(timeTraveled, widthOffset, width) {
		let ratio = timeTraveled / this.travelTime;
		return add_v_v(
			mul_v_s(this.from, ratio),
			mul_v_s(this.to, 1 - ratio),
		);
	}

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

		this.productionCircle = new Konva.Circle({
			radius: this.radius,
			x: this.x,
			y: this.y,
			fill: TERRAIN_COLOR,
			listening: false,
		});

		this.targetCircle = new Konva.Ring({
			innerRadius: this.radius,
			outerRadius: this.radius + CONTROLS_SIZE,
			x: this.x,
			y: this.y,
			fill: CONTROLS_COLOR,
			draggable: true,
			dragBoundFunc: function (pos) {return this.getAbsolutePosition();},
		});
		this.targetCircle.on('dragmove', function(e) {
			let pos = getScaledPointerPosition(this.getStage());
			let radius = getDistance(pos, node);
			this.outerRadius(radius + CONTROLS_SIZE);
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
		for (let [cid, disposition] of this.dispositions.entries()) {
			if (cid == connection_id) continue;
			disposition.setValue(disposition.value * ratio + constantComponent);
		}
	};

	drawOn(terrainLayer, unitsLayer, controlsLayer, debugLayer) {
		terrainLayer.add(this.productionCircle);
		controlsLayer.add(this.targetCircle);
		this.dispositions.forEach(disposition => disposition.drawOn(terrainLayer, unitsLayer, controlsLayer, debugLayer));
	};
}


class Game {
	constructor(containerId) {
		let game = this;

		this.canvas = new Konva.Stage({
			container: containerId,
			draggable: true,
			x: 0, y: 0,
		});
		this.stage = this.canvas;

		this.terrainLayer = new Konva.Layer();
		this.stage.add(this.terrainLayer);
		this.unitsLayer = new Konva.Layer();
		this.stage.add(this.unitsLayer);
		this.controlsLayer = new Konva.Layer();
		this.stage.add(this.controlsLayer);
		this.debugLayer = new Konva.Layer();
		this.stage.add(this.debugLayer);

		this.nodes = new Map();
		this.connections = new Map();

		prepareCanvas(this.canvas);

		this.canvas.on('mouse:over', (e) => {
			if (e.target != null) {
				if (e.target.gameNodeId != undefined) {
					game.showNodeControls(e.target.gameNodeId);
				}
			}
		});

		//canvas.setBackgroundColor('gray');
		this.debugLayer.add(new Konva.Rect({
			x: 0, y:0,
			width: 1,
			height: 1,
			fill: 'red',
		}));
		this.debugLayer.add(new Konva.Rect({
			x:10, y:10,
			width: 1,
			height: 1,
			fill: 'red',
		}));

		// animation
		this.animations = [];
		(new Konva.Animation(function(frame) {
			let time = Date.now();
			game.animations = game.animations.filter(a => a(time));
		}, this.unitsLayer)).start();
	}

	addNode(nodeId, node) {
		console.assert(!this.nodes.has(nodeId));
		this.nodes.set(nodeId, node);
		node.drawOn(this.terrainLayer, this.unitsLayer, this.controlsLayer, this.debugLayer);
	}

	addConnection(connectionId, nodeAId, nodeBId, length, throughput) {
		console.assert(!this.connections.has(connectionId));
		console.assert(nodeAId != nodeBId);
		let width = throughput / THROUGHPUT_SCALE;
		let nodeA = this.nodes.get(nodeAId);
		let nodeB = this.nodes.get(nodeBId);
		let x1 = nodeA.x;
		let x2 = nodeB.x;
		let y1 = nodeA.y;
		let y2 = nodeB.y;
		let direction = Math.atan2(x2 - x1, y2 - y1);
		let offx = Math.sin(direction + Math.PI / 2) * (width / 2 + CONNECTION_SPACING / 2);
		let offy = Math.cos(direction + Math.PI / 2) * (width / 2 + CONNECTION_SPACING / 2);
		let connection = new Connection(
			{x: x1 + offx, y: y1 + offy}, {x: x2 + offx, y: y2 + offy},
			width, length,
		);
		this.connections.set(connectionId, connection);
		connection.drawOn(this.terrainLayer, this.unitsLayer, this.controlsLayer, this.debugLayer, this);
	}

	updateMovements(connectionId, time, movements) {
		this.connections.get(connectionId).updateMovements(time, movements);
	}

	setNodeUnits(nodeId, playerUnitsMap) {
		
	}

	registerAnimation(f) {
		this.animations.push(f);
	}

}

// ### running the game ###

var game = new Game('container');
game.addNode('node0', new Node(0, 0, new Map(), 1));
game.addNode('node2', new Node(5, 0, new Map(), 2));
game.addNode('node1', new Node(10, 20, new Map([
	['a', 0],
	['b', Math.PI/6],
	['c', 1],
]), 10));
game.addConnection(0, 'node0', 'node1', 10000, 0.3);
game.addConnection(2, 'node1', 'node0', 10000, 0.3);
game.addConnection(1, 'node1', 'node2', 10000, 1);
game.canvas.draw();

game.updateMovements(0, Date.now(), [
	{width: 0.1, color: 'pink'},
]);
setTimeout(
	() => {
		game.updateMovements(0, Date.now(), []);
	},
	10000,
);
