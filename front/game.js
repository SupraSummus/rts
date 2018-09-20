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

		this.prependicularUnit = ang2v(Math.atan2(to.x - from.x, to.y - from.y) + Math.PI / 2);

		this.line = new Konva.Line({
			points: xyobjs2array([
				this._linePoint(0, 0, this.width),
				this._linePoint(this.travelTime, 0, this.width),
			]),
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
				lineCap: 'butt',
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
				let lineWidth = line.strokeWidth();
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
				let lineWidth = line.strokeWidth();
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
		let offset = CONNECTION_SPACING / 2 + widthOffset + width / 2;
		return sum_v([
			mul_v_s(this.from, ratio),
			mul_v_s(this.to, 1 - ratio),
			mul_v_s(this.prependicularUnit, offset),
		]);
	}

}


class NodeUnits {
	constructor(x, y) {
		this.x = x;
		this.y = y;
		this.drawEnvironment = null;

		this.units = [];
	}

	update(units) {
		this.units.forEach(u => u.destroy());
		this.units = [];

		let totalUnits = units.reduce((a, u) => (a + u.amount), 0);
		let outerRadius = Math.sqrt(totalUnits / Math.PI) * UNIT_SCALE;

		let ang = 0; // in degrees
		for (let u of units) {
			let thisAng = (u.amount / totalUnits) * 360;
			let arc = new Konva.Arc({
				x: this.x,
				y: this.y,
				innerRadius: 0,
				outerRadius: outerRadius,
				rotation: ang,
				angle: thisAng,
				fill: u.color,
			});
			ang += thisAng;
			this.drawEnvironment.unitsLayer.add(arc);
			this.units.push(arc);
		}
	}

	drawOn(drawEnvironment) {
		this.drawEnvironment = drawEnvironment;
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

		// units
		this.units = new NodeUnits(this.x, this.y);
	}

	updateUnits(units) {
		return this.units.update(units);
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
		this.units.drawOn({
			unitsLayer: unitsLayer,
		});
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
		let connection = new Connection(
			nodeA, nodeB,
			width, length,
		);
		this.connections.set(connectionId, connection);
		connection.drawOn(this.terrainLayer, this.unitsLayer, this.controlsLayer, this.debugLayer, this);
	}

	updateMovements(connectionId, time, movements) {
		this.connections.get(connectionId).updateMovements(time, movements);
	}

	updateUnits(nodeId, units) {
		return this.nodes.get(nodeId).updateUnits(units);
	}

	registerAnimation(f) {
		this.animations.push(f);
	}

}
