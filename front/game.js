// ### game itself ###

class Disposition {
	constructor(drawingThing, pos, direction, value, cb) {
		let disposition = this;

		this.drawingThing = drawingThing;
		this.pos = pos;
		this.direction = direction;
		this.value = value;

		this.unitVector = ang2v(this.direction);

		this.head = new Konva.RegularPolygon({
			x: this.pos.x,
			y: this.pos.y,
			sides: 3,
			radius: CONTROLS_SIZE,
			rotation: rad2deg(this.direction) - 30,
			fill: CONTROLS_COLOR,
			draggable: true,
			dragBoundFunc: function (pos) {return this.getAbsolutePosition();},
		});
		this.drawingThing.controlsLayer.add(this.head);
		this.head.on('dragmove', function(e) {
			let pos = getScaledPointerPosition(this.getStage());
			let radius = getDistance(pos, disposition.pos);
			disposition.setValue(radius);
			cb(radius);
			this.getLayer().draw();
		});
		this.setValue(value);
	}

	setValue(value) {
		this.value = value;
		this.head.position(sum_v([
			this.pos,
			mul_v_s(this.unitVector, this.value),
		]));
	}
}


class Connection {
	/**
	 * points is an array of objects: [{x, y, timeToNext}, {x2, y2, ...}, ..., {xn, yn, ...}]
	 */
	constructor(drawingThing, from, to, throughput, travelTime, dispositionCallback, dispositionInitialValue) {
		this.drawingThing = drawingThing;
		this.from = from;
		this.to = to;
		this.throughput = throughput;
		this.travelTime = travelTime;

		this.direction = Math.atan2(to.y - from.y, to.x - from.x);
		this.prependicularUnit = ang2v(this.direction + Math.PI / 2);

		this.disposition = new Disposition(
			this.drawingThing,
			this._linePoint(0, 0, this.throughput),
			this.direction,
			dispositionInitialValue,
			dispositionCallback,
		);

		this.line = new Konva.Line({
			points: xyobjs2array([
				this._linePoint(0, 0, this.throughput),
				this._linePoint(this.travelTime, 0, this.throughput),
			]),
			stroke: TERRAIN_COLOR,
			strokeWidth: this.throughput,
			lineCap: 'round',
			lineJoin: 'round',
		});
		this.drawingThing.terrainLayer.add(this.line);

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
			this.drawingThing.unitsLayer.add(line);
			newLines.push(line);
		}

		// animate movement
		let conn = this;
		let previousLines = this.previousLines;
		this.drawingThing.registerAnimation(t => {
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

	_linePoint(timeTraveled, widthOffset, width) {
		let ratio = timeTraveled / this.travelTime;
		let offset = CONNECTION_SPACING / 2 + widthOffset + width / 2;
		return sum_v([
			mul_v_s(this.from, 1 - ratio),
			mul_v_s(this.to, ratio),
			mul_v_s(this.prependicularUnit, offset),
		]);
	}

}


class NodeUnits {
	constructor(drawingThing, x, y) {
		this.drawingThing = drawingThing;
		this.x = x;
		this.y = y;

		this.units = [];
	}

	update(units) {
		this.units.forEach(u => u.destroy());
		this.units = [];

		let totalUnits = Array.from(units.values()).reduce((a, b) => (a + b), 0);
		let outerRadius = Math.sqrt(totalUnits / Math.PI) * UNIT_SCALE;

		let ang = 0; // in degrees
		for (let [playerId, u] of units.entries()) {
			let thisAng = (u / totalUnits) * 360;
			let arc = new Konva.Arc({
				x: this.x,
				y: this.y,
				innerRadius: 0,
				outerRadius: outerRadius,
				rotation: ang,
				angle: thisAng,
				fill: this.drawingThing.playerColor(playerId),
			});
			ang += thisAng;
			this.drawingThing.unitsLayer.add(arc);
			this.units.push(arc);
		}
	}
}


class Node {
	/**
	 * `connections` is map id => direction
	 */
	constructor(drawingThing, x, y, production, connections) {
		let node = this;

		this.drawingThing = drawingThing;
		this.x = x;
		this.y = y;
		this.production = production;

		this.connections = mapMap(connections, (v, connId) => {
			return new Connection(
				node.drawingThing,
				node, v,
				v.throughput, v.travelTime,
				(value) => node._dispositionUpdate(connId, value),
				DISPOSITIONS_SUM / connections.size,
			);
		});
		this.dispositions = mapMap(this.connections, c => c.disposition);

		this.radius = Math.sqrt(this.production / Math.PI) * UNIT_SCALE;

		// production
		this.productionCircle = new Konva.Circle({
			radius: this.radius,
			x: this.x,
			y: this.y,
			fill: TERRAIN_COLOR,
			listening: false,
		});
		this.drawingThing.terrainLayer.add(this.productionCircle);

		// target
		this.targetCircle = new Konva.Ring({
			innerRadius: this.radius,
			outerRadius: this.radius + CONTROLS_SIZE,
			x: this.x,
			y: this.y,
			fill: CONTROLS_COLOR,
			draggable: true,
			dragBoundFunc: function (pos) {return this.getAbsolutePosition();},
		});
		this.drawingThing.controlsLayer.add(this.targetCircle);
		this.targetCircle.on('dragmove', function(e) {
			let pos = getScaledPointerPosition(this.getStage());
			let radius = getDistance(pos, node);
			this.outerRadius(radius + CONTROLS_SIZE);
			this.innerRadius(radius);
			this.getLayer().draw();
		});

		// units
		this.units = new NodeUnits(this.drawingThing, this.x, this.y);
	}

	updateUnits(units) {
		return this.units.update(units);
	}

	updateMovements(targetId, startTime, movements) {
		return this.connections.get(targetId).updateMovements(startTime, movements);
	}

	_dispositionUpdate(connection_id, value) {
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
}


class Game {
	constructor(container, wsAddr) {
		let game = this;

		this.canvas = new Konva.Stage({
			container: container,
			draggable: true,
			x: 0, y: 0,
		});
		container.style['background-color'] = BACKGROUND_COLOR;
		this.stage = this.canvas;

		this.terrainLayer = new Konva.Layer();
		this.stage.add(this.terrainLayer);
		this.unitsLayer = new Konva.Layer();
		this.stage.add(this.unitsLayer);
		this.controlsLayer = new Konva.Layer();
		this.stage.add(this.controlsLayer);

		this.nodes = new Map();
		this.players = new Map();

		// zoom, drag, ...
		prepareCanvas(this.canvas);

		// animation
		this.animations = [];
		(new Konva.Animation(function(frame) {
			let time = Date.now();
			game.animations = game.animations.filter(a => a(time));
		}, this.unitsLayer)).start();

		// connect to ws
		this.sock = new WebSocket(wsAddr);
		this.sock.onopen = (event) => {
			console.log('connected to the server');
			this.sock.send(JSON.stringify({type: 'map', data: {}})); // ask for a map
		};
		this.sock.onmessage = function (event) {
			let parsed = JSON.parse(event.data);
			console.log('got message', parsed.type);
			({
				map: map => game._loadMap(map),
				player: data => {
					for (let playerId in data) {
						game.players.set(playerId, data[playerId]);
					}
				},
				units: data => ({
					node: (id, units) => game.updateUnits(id, obj2map(units)),
				})[data.type](data.id, data.units),
			})[parsed.type](parsed.data);
		};
	}

	_loadMap(map) {
		for (let nodeId in map) {
			let nodeDesc = map[nodeId];
			this.addNode(
				nodeId,
				nodeDesc.x, nodeDesc.y, nodeDesc.production,
				mapMap(obj2map(nodeDesc.connections), (conn, targetId) => ({
					x: map[targetId].x,
					y: map[targetId].y,
					throughput: conn.throughput,
					travelTime: conn.travel_time,
				})),
			);
		}
		// initial draw
		this.canvas.draw();
	}

	addNode(nodeId, x, y, production, connections) {
		console.assert(!this.nodes.has(nodeId));
		let node = new Node(this, x, y, production, connections);
		this.nodes.set(nodeId, node);
		return node;
	}

	updateMovements(fromId, toId, startTime, movements) {
		return this.nodes.get(fromId).updateMovements(toId, startTime, movements);
	}

	updateUnits(nodeId, units) {
		return this.nodes.get(nodeId).updateUnits(units);
	}

	registerAnimation(f) {
		this.animations.push(f);
	}

	playerColor(playerId) {
		if (this.players.has(playerId)) {
			return this.players.get(playerId).color;
		} else {
			this.sock.send(JSON.stringify({
				type: 'player',
				data: {player_ids: [playerId]},
			}));
			return 'gray';
		}
	}

}
