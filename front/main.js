// ### running the game ###

var game = new Game(document.getElementById('container'), {
	'node0': {
		x: 0, y: 0, production: 1,
		connections: {
			'node1': {throughput: 0.3, travelTime: 10000},
		},
	},
	'node1': {
		x: 10, y: 20, production: 10,
		connections: {
			'node0': {throughput: 0.5, travelTime: 10000},
			'node2': {throughput: 1, travelTime: 10000},
		},
	},
	'node2': {
		x: 0, y: 12, production: 4,
		connections: {},
	},
});

setInterval(
	() => {
		game.updateMovements('node1', 'node0', Date.now(), [
			{width: Math.random() / 5, color: rgb2str(HSVtoRGB(Math.random(), 1, 1))},
			{width: Math.random() / 5, color: rgb2str(HSVtoRGB(Math.random(), 1, 1))},
		]);
		game.updateUnits('node1', [
			{amount: Math.random() * 2, color: rgb2str(HSVtoRGB(Math.random(), 1, 1))},
			{amount: Math.random() * 2, color: rgb2str(HSVtoRGB(Math.random(), 1, 1))},
			{amount: Math.random() * 2, color: rgb2str(HSVtoRGB(Math.random(), 1, 1))},
			{amount: Math.random() * 2, color: rgb2str(HSVtoRGB(Math.random(), 1, 1))},
			{amount: Math.random() * 2, color: rgb2str(HSVtoRGB(Math.random(), 1, 1))},
		]);
	},
	4000,
);
