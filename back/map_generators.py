import itertools

from game import Node, Connection


class MapGenerator:
    def __init__(self, production, throughput):
        self.production = production
        self.throughput = throughput

    def generate(self):
        return {
            self.stringify_node_id(node_id): Node(
                id=self.stringify_node_id(node_id),
                **self.node_position(node_id),
                production=self.node_production(node_id),
                connections={
                    self.stringify_node_id(to_id): Connection(
                        **self.connection_properties(node_id, to_id),
                    )
                    for to_id in self.node_connections(node_id)
                    if to_id in self.node_ids
                }
            )
            for node_id in self.node_ids
        }

    @property
    def node_ids(self):
        raise NotImplementedError()

    def stringify_node_id(self, node_id):
        return str(node_id)

    def node_position(self, node_id):
        raise NotImplementedError()

    def node_production(self, node_id):
        return self.production

    def node_connections(self, node_id):
        raise NotImplementedError()

    def connection_properties(self, from_id, to_id):
        f = self.node_position(from_id)
        t = self.node_position(to_id)
        return {
            'source_node_id': from_id,
            'target_node_id': to_id,
            'throughput': self.throughput,
            'travel_time': ((f['x'] - t['x']) ** 2 + (f['y'] - t['y']) ** 2) ** 0.5,
        }


class SquareMapGenerator(MapGenerator):
    def __init__(self, x, y, distance, **kwargs):
        super().__init__(**kwargs)
        self.x = x
        self.y = y
        self.distance = distance

    @property
    def node_ids(self):
        return itertools.product(range(self.x), range(self.y))

    def node_position(self, node_id):
        return {
            'x': node_id[0] * self.distance,
            'y': node_id[1] * self.distance,
        }

    def node_connections(self, node_id):
        x = node_id[0]
        y = node_id[1]
        return [
            (x + 1, y),
            (x, y + 1),
            (x - 1, y),
            (x, y - 1),
        ]
