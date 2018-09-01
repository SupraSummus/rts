const UNIT_SCALE = 1;
const THROUGHPUT_SCALE = 1;
const NODE_COLOR = '#888';
const CONNECTION_COLOR = '#bbb';

const ZOOM_INIT = 2000;
const ZOOM_MAX = 4000;
const ZOOM_MIN = -500;
const ZOOM_FUNC = zoom => Math.pow(Math.E, zoom/800);

const FABRIC_OBJECT_OPTIONS = {
	hasControls: false,
	lockMovementX: true,
	lockMovementY: true,
	lockScalingX: true,
	lockScalingY: true,
	lockRotation: true,
	selectable: false,
	hasBorders: false,
};


let prepareCanvas = (canvas) => {
	// resizing to full width
	let resizeCanvas = () => {
		canvas.setHeight(window.innerHeight);
		canvas.setWidth(window.innerWidth);
		canvas.renderAll();
	};
	window.addEventListener('resize', resizeCanvas, false);
	resizeCanvas(); // resize on init

	// zoom
	let zoom = ZOOM_INIT;
	canvas.setZoom(ZOOM_FUNC(zoom));
	canvas.on('mouse:wheel', function(opt) {
		zoom = zoom - opt.e.deltaY;
		if (zoom > ZOOM_MAX) zoom = ZOOM_MAX;
		if (zoom < ZOOM_MIN) zoom = ZOOM_MIN;
		canvas.zoomToPoint(
			{ x: opt.e.offsetX, y: opt.e.offsetY },
			ZOOM_FUNC(zoom),
		);
		opt.e.preventDefault();
		opt.e.stopPropagation();
	});

	// drag
	canvas.on('mouse:down', function(opt) {
		var evt = opt.e;
		this.isDragging = true;
		this.selection = false;
		this.lastPosX = evt.clientX;
		this.lastPosY = evt.clientY;
	});
	canvas.on('mouse:move', function(opt) {
		if (this.isDragging) {
			var e = opt.e;
			this.relativePan(new fabric.Point(
				e.clientX - this.lastPosX,
				e.clientY - this.lastPosY,
			))
			this.lastPosX = e.clientX;
			this.lastPosY = e.clientY;
		}
	});
	canvas.on('mouse:up', function(opt) {
		this.isDragging = false;
		this.selection = true;
	});
};


class Node {
	constructor(x, y, production) {
		this.x = x;
		this.y = y;
		this.production = production;
		this.radius = Math.pow(this.production / Math.PI, 0.5) * UNIT_SCALE;

		this.productionCircle = new fabric.Circle({
			radius: this.radius,
			left: this.x - this.radius,
			top: this.y - this.radius,
			fill: NODE_COLOR,
			perPixelTargetFind: true,
			...FABRIC_OBJECT_OPTIONS,
		});

		this.targetCircle = new fabric.Circle({
			radius: this.radius,
			left: this.x,
			top: this.y,
			//stroke: 'black',
			originX: 'center',
			originY: 'center',
			//strokeWidth: this.radius * 0.1,
			fill: 'rgba(0, 255, 0, 0.5)',
			perPixelTargetFind: true,
			...FABRIC_OBJECT_OPTIONS,
		});
	}

	addToCanvas(canvas) {
		canvas.add(this.productionCircle);
		canvas.add(this.targetCircle);
	};
}


class Game {
	constructor(canvasId) {
		this.canvas = new fabric.Canvas(
			canvasId,
			{
				selection: false,
			},
		);
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
		this.canvas.add(new fabric.Rect({
			top: 0, left:0,
			width: 1,
			height: 1,
		}));
		this.canvas.add(new fabric.Rect({
			top:10, left:10,
			width: 1,
			height: 1,
		}));

	}

	setNodeStats(nodeId, x, y, production) {
		if (this.nodes.has(nodeId)) {
			console.assert(false);
		} else {
			let node = new Node(x, y, production);
			this.nodes.set(nodeId, node);
			node.addToCanvas(this.canvas);
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
		connection.canvasObject = new fabric.Line([
			this.nodes.get(nodeAId).x, this.nodes.get(nodeAId).y,
			this.nodes.get(nodeBId).x, this.nodes.get(nodeBId).y,
		], {
			width: throughput * THROUGHPUT_SCALE,
			fill: CONNECTION_COLOR,
			stroke: CONNECTION_COLOR,
			...FABRIC_OBJECT_OPTIONS,
		});
		this.canvas.add(connection.canvasObject);
		connection.canvasObject.sendToBack();
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
