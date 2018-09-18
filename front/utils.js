// ### some math ###

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
let sum_v = ((vs) => ({
	x: vs.reduce(((x, v) => v.x + x), 0),
	y: vs.reduce(((y, v) => v.y + y), 0),
}));
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

/* accepts parameters
 * h  Object = {h:x, s:y, v:z}
 * OR 
 * h, s, v
*/
function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function rgb2str(o) {
	return 'rgb(' + o.r +', ' + o.g + ', ' + o.b +')';
}
