import json
from uuid import uuid4
import logging


logger = logging.getLogger(__name__)


class GameUserError(Exception):
    pass


class Game:
    def __init__(self, map_description):
        self.players = {}
        self.nodes = {}
        self.map_description = map_description

    @property
    def map_data(self):
        return self.map_description

    def create_player(self, connection):
        pid = uuid4()
        assert pid not in self.players
        p = Player(connection, 'red')
        self.players[pid] = p
        logger.info('created new player with id %s', pid)
        return pid

    def feed(self, player_id, type, data):
        self.players[player_id].feed(self, type, data)


class Player:
    def __init__(self, connection, color):
        self.connection = connection
        self.color = color

    def feed(self, game, type, data):
        if type == 'map':
            self.send('map', game.map_data)
            return
        raise GameUserError('unknown message `type`')

    def send(self, type, data):
        self.connection.send(type, data)
