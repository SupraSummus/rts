import json
from uuid import uuid4
import logging


logger = logging.getLogger(__name__)


class GameUserError(Exception):
    pass


class Game:
    def __init__(self, nodes):
        self.players = {}  # map player_id -> player
        self.nodes = nodes  # map node_id -> node

    @property
    def terrain_data(self):
        return {k: v.terrain_data for k, v in self.nodes.items()}

    def create_player(self, connection):
        pid = uuid4()
        assert pid not in self.players
        p = Player(connection, 'red')
        self.players[pid] = p
        logger.info('created new player with id %s', pid)
        return pid

    def feed(self, player_id, type, data):
        self.players[player_id].feed(self, type, data)


class Node:
    def __init__(self, x, y, production, connections):
        self.x = x
        self.y = y
        self.production = production
        self.connections = connections  # target_node_id -> connection

        # runtime
        self.units = {}  # player_id -> unit count
        self.incoming = {}  # source_id -> movements
        self.dispositions = {}  # plyer_id -> disposition

    @property
    def terrain_data(self):
        return {
            'x': self.x,
            'y': self.y,
            'production': self.production,
            'connections': {k: c.terrain_data for k, c in self.connections.items()},
        }

    def set_incoming(self, source, movements):
        if self.incoming.get(source) == movements:
            return set()
        self.incoming[source] = movements
        return {self}

    def do_frame(self, game, dt):
        """Do simulation frame. Return objects with states changed during this frame."""
        total_units = sum(self.units.values())
        new_units = defaultdict(lambda: 0)
        changed_objects = []

        for player_id, units in self.units.items():
            # already there
            new_units[player_id] += units
            # production
            new_units[player_id] += self.production * dt * (units / total_units)
            # decay
            new_units[player_id] -= units * dt * game.decay_rate

        # incoming
        for movement in self.incoming.values():
            for player_id, throughput in movement.items():
                new_units[player_id] += throughput * dt

        # battle
        for attacker_id, attacker_units in self.units.items():
            other_units = total_units - attacker_units
            for defender_id, defender_units in self.units.items():
                if attacker_id != defender_id:
                    new_units[defender_id] -= attacker_units * (defender_units / other_units) * dt * game.offensive_force

        # clean irrelevant units
        for player_id, units in self.units.items():
            if new_units[player_id] <= 0:
                del new_units[player_id]

        # outgoing
        sending = {}  # target id -> (player -> throughput)
        for target_node_id in self.connections.keys():
            sending[target_node_id] = {}
        for player_id, units in new_units:
            disposition = self.dispositions[player_id]
            if units > disposition.target:
                new_units[player_id] = disposition.target
                over_target = units - disposition.target
                for target_node_id, ratio in disposition.ratios.items():
                    sending[target_node_id][player_id] = over_target * ratio / dt
        for target_node_id, movements in sending:
            ch = self.connections[target_node_id].set_movements(movements)
            changed_objects.update(ch)
            if len(ch) != 0:
                changed_objects.add(self)

        if new_units != self.units:
            changed_objects.add(self)
        self.units = new_units
        return changed_objects


class Connection:
    def __init__(self, target_node_id, throughput, travel_time):
        assert throughput > 0
        assert travel_time > 0

        self.target_node_id = target_node_id
        self.throughput = throughput
        self.travel_time = travel_time

        # runtime
        self.movements = {}  # player id -> unit throughput
        self.__changes = []  # collection of dicts {remaining_time, movements}

    @property
    def terrain_data(self):
        return {
            'throughput': self.throughput,
            'travel_time': self.travel_time,
        }

    def set_movements(self, movements):
        if self.movements == movements:
            return set()
        self.movements = movements
        self.__changes.insert(0, {
            'remaining_time': self.travel_time,
            'movements': movements,
        })
        return {self}

    def do_frame(self, game, dt):
        target_node = game.nodes[self.target_node_id]

        if len(self.__changes) == 0:
            # whole connection is filled with single flow
            return target_node.set_incoming(self, self.movements)

        changed_objects = {self}

        units = defaultdict(lambda: 0)
        previous_consumed_dt = 0

        def add_units(consumed_dt, units):
            current_dt = min(dt, consumed_dt) - min(dt, previous_consumed_dt)
            for player_id, u in units.items():
                units[player_id] += u * current_dt

        for ch in reversed(self.__changes):
            consumed_dt = ch['remaining_time']
            ch['remaining_time'] -= dt
            if ch['remaining_time'] <= 0:
                self.__changes.pop()
            add_units(consumed_dt, ch['movements'])
            previous_consumed_dt = consumed_dt

        add_units(self.travel_time, self.movements)

        changed_object.update(target_node.set_incoming(self, {
            k: v / dt for k, v in units.items()
        }))

        return changed_objects


class Player:
    def __init__(self, connection, color):
        self.connection = connection
        self.color = color

    def feed(self, game, type, data):
        if type == 'map':
            self.send('map', game.terrain_data)
            return
        raise GameUserError('unknown message `type`')

    def send(self, type, data):
        self.connection.send(type, data)
