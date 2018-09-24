import json
from uuid import uuid4
import logging
from collections import defaultdict
import threading
import time
import random

from commands import Command, Disposition


logger = logging.getLogger(__name__)


class SimulationRunner(threading.Thread):
    def __init__(self, game, dt, **kwagrs):
        self.game = game
        self.dt = dt
        super().__init__(**kwagrs)

    def run(self):
        previous_frame_time = time.monotonic()
        while True:
            with self.game.lock:
                this_frame_start_time = time.monotonic()
                self.game.do_frame(this_frame_start_time - previous_frame_time)
                this_frame_end_time = time.monotonic()
            previous_frame_time = this_frame_start_time
            to_sleep = self.dt - (this_frame_end_time - this_frame_start_time)
            if to_sleep <= 0:
                logger.warning('lagging %d', to_sleep)
            else:
                time.sleep(to_sleep)


class Game:
    def __init__(self, nodes, decay_rate, starting_units):
        self.lock = threading.Lock()
        self.players = {}  # map player_id -> player
        self.nodes = nodes  # map node_id -> node
        self.decay_rate = decay_rate
        self.starting_units = starting_units

        self.needs_do_frame = set()

    @property
    def terrain_data(self):
        return {k: v.terrain_data for k, v in self.nodes.items()}

    def create_player(self, connection):
        pid = str(uuid4())
        assert pid not in self.players
        p = Player(connection, 'red')
        self.players[pid] = p
        logger.info('created new player with id %s', pid)

        starting_node = random.choice(list(self.nodes.values()))
        starting_node.units[pid] = self.starting_units
        self.needs_do_frame.add(starting_node)

        return pid

    def handle_command(self, player_id, data):
        Command.from_user_data(data).execute(self, player_id)

    def send(self, player_id, type, data):
        self.players[player_id].send(type, data)

    def do_frame(self, dt):
        # do frame - nodes first, then connections
        changed = set()
        connections = []
        for o in self.needs_do_frame:
            if isinstance(o, Connection):
                connections.append(o)
            else:
                changed.update(o.do_frame(self, dt))
        for o in connections:
            changed.update(o.do_frame(self, dt))
        self.needs_do_frame = changed

        # send out new state
        for o in changed:
            for player_id in self.players.keys():
                self.send(player_id, **o.units_data)

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

    @property
    def units_data(self):
        return {
            'type': 'node',
            'data': self.units,
        }

    def set_incoming(self, source, movements):
        if self.incoming.get(source, {}) == movements:
            return set()
        self.incoming[source] = movements
        return {self}

    def do_frame(self, game, dt):
        """Do simulation frame. Return objects with states changed during this frame."""
        total_units = sum(self.units.values())
        new_units = defaultdict(lambda: 0)
        changed_objects = set()

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
        for player_id, units in new_units.items():
            disposition = self.dispositions.get(player_id)
            if disposition is None:
                continue
            if units > disposition.target:
                new_units[player_id] = disposition.target
                over_target = units - disposition.target
                for target_node_id, ratio in disposition.ratios.items():
                    sending[target_node_id][player_id] = over_target * ratio / dt
        for target_node_id, movements in sending.items():
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

    @property
    def units_data(self):
        return {
            'type': 'connection',
            'data': [{
                'remaining_time': self.travel_time,
                'movements': self.movements,
            }] + self.__changes,
        }

    def set_movements(self, movements):
        if self.movements == movements:
            return set()
        self.__changes.insert(0, {
            'remaining_time': self.travel_time,
            'movements': self.movements,
        })
        self.movements = movements
        return {self}

    def do_frame(self, game, dt):
        target_node = game.nodes[self.target_node_id]

        if len(self.__changes) == 0:
            # whole connection is filled with single flow
            return target_node.set_incoming(self, self.movements)

        changed_objects = {self}

        units = defaultdict(lambda: 0)
        previous_consumed_dt = 0

        def add_units(consumed_dt, dunits):
            current_dt = min(dt, consumed_dt) - min(dt, previous_consumed_dt)
            for player_id, u in dunits.items():
                units[player_id] += u * current_dt

        for ch in reversed(self.__changes):
            consumed_dt = ch['remaining_time']
            ch['remaining_time'] -= dt
            if ch['remaining_time'] <= 0:
                self.__changes.pop()
            add_units(consumed_dt, ch['movements'])
            previous_consumed_dt = consumed_dt

        add_units(max(self.travel_time, dt), self.movements)

        changed_objects.update(target_node.set_incoming(self, {
            k: v / dt
            for k, v in units.items()
            if v > 0
        }))

        return changed_objects


class Player:
    def __init__(self, connection, color):
        self.connection = connection
        self.color = color

    def send(self, type, data):
        self.connection.send(type, data)
