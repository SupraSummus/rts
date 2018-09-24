from unittest import TestCase

from game import Game, Node, Connection, Disposition


class NodeTestCase(TestCase):
    def setUp(self):
        self.node = Node(x=0, y=0, production=3, connections={
            'node2': Connection('node2', throughput=1, travel_time=10),
            'node3': Connection('node3', throughput=1, travel_time=10),
            'node4': Connection('node4', throughput=1, travel_time=10),
        })
        self.game = Game(
            {'node1': self.node},
            decay_rate=0.1,
            starting_units=1,
        )

    def test_set_incoming_change(self):
        changed = self.node.set_incoming('some_id', {'player1': 5})
        self.assertEqual(changed, {self.node})

    def test_set_incoming_no_change(self):
        changed = self.node.set_incoming('some_id', {})
        self.assertEqual(changed, set())

    def test_do_frame_nobodys_land(self):
        changed = self.node.do_frame(self.game, 1)
        self.assertEqual(changed, set())

    def test_do_frame_single_owner(self):
        self.node.units = {'player1': 6}
        changed = self.node.do_frame(self.game, 0.5)
        self.assertEqual(changed, {self.node})
        self.assertEqual(self.node.units, {'player1': 6 + 3 * 0.5 - 6 * 0.5 * 0.1})

    def test_do_frame_sending_split(self):
        self.node.units = {'player1': 6}
        self.node.dispositions = {'player1': Disposition(6.1, {'node2': 0.2, 'node3': 0.8})}
        self.node.do_frame(self.game, 1)
        self.assertEqual(self.node.units, {'player1': 6.1})
        to_distribute = (6 + 3 - 6 * 0.1) - 6.1
        self.assertTrue(to_distribute > 0)
        self.assertEqual(self.node.connections['node2'].movements, {'player1': to_distribute * 0.2})
        self.assertEqual(self.node.connections['node3'].movements, {'player1': to_distribute * 0.8})

    def test_do_frame_sending_changed_throughput(self):
        self.node.units = {'player1': 6}
        self.node.dispositions = {'player1': Disposition(6, {'node2': 1})}
        changed = self.node.do_frame(self.game, 1)
        self.assertEqual(changed, {self.node, self.node.connections['node2']})
        self.assertEqual(self.node.units, {'player1': 6})

    def test_do_frame_sending_unchanged(self):
        self.node.units = {'player1': 6}
        self.node.dispositions = {'player1': Disposition(6, {'node2': 1})}
        self.node.connections['node2'].set_movements({'player1': 6 + 3 - 6 * 0.1 - 6})
        changed = self.node.do_frame(self.game, 1)
        self.assertEqual(changed, set())
        self.assertEqual(self.node.units, {'player1': 6})


class ConnectionTestCase(TestCase):
    def setUp(self):
        self.connection = Connection('node0', throughput=1, travel_time=10)
        self.game = Game(
            nodes={
                'node0': Node(x=0, y=0, production=3, connections={}),
            },
            decay_rate=0.1,
            starting_units=1,
        )

    def test_set_movements_no_change(self):
        changed = self.connection.set_movements({})
        self.assertEqual(changed, set())

    def test_set_movements_change(self):
        changed = self.connection.set_movements({'player1': 5})
        self.assertEqual(changed, {self.connection})

    def test_do_frame_empty(self):
        changed = self.connection.do_frame(self.game, 1)
        self.assertEqual(changed, set())

    def test_do_frame_movement(self):
        self.connection.set_movements({'player1': 5})
        changed = self.connection.do_frame(self.game, 1)
        self.assertEqual(changed, {self.connection})

    def test_do_frame_movement_reached(self):
        self.connection.set_movements({'player1': 5})
        changed = self.connection.do_frame(self.game, 11)
        self.assertEqual(changed, {self.connection, self.game.nodes['node0']})
        self.assertEqual(self.game.nodes['node0'].incoming[self.connection], {'player1': 5 / 11})

    def test_do_frame_movement_no_change(self):
        self.connection.set_movements({'player1': 5})
        self.connection.do_frame(self.game, 11)
        changed = self.connection.do_frame(self.game, 11)
        self.assertEqual(changed, {self.game.nodes['node0']})
        self.assertEqual(self.game.nodes['node0'].incoming[self.connection], {'player1': 5})
