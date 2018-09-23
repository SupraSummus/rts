from SimpleWebSocketServer import SimpleWebSocketServer, WebSocket
import logging
import json
import os

from game import Game
from commands import GameUserError
from map_generators import SquareMapGenerator


logger = logging.getLogger(__name__)


class GameConnectionHandler(WebSocket):
    def handleConnected(self):
        logger.debug('new client connected')
        self.player_id = game.create_player(self)

    def handleClose(self):
        print(self.address, 'closed')

    def handleMessage(self):
        try:
            try:
                data = json.loads(self.data)
            except json.JSONDecodeError:
                self.send('error', 'I only do JSONs, bro.')
                return
            try:
                self.server.game.handle_command(self.player_id, data)
            except GameUserError as e:
                self.send('error', str(e))
                return

        except:
            logger.exception('error during handling user data')
            self.close(status=1011, reason='Internal server error')

    def send(self, type, data):
        self.sendMessage(json.dumps({
            'type': type,
            'data': data,
        }))


class GameServer(SimpleWebSocketServer):
    def __init__(self, *args, game, **kwargs):
        self.game = game
        super().__init__(
            *args,
            websocketclass=GameConnectionHandler,
            **kwargs,
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    
    addr = {'host': '', 'port': 8080}
    logger.info('starting the server at {}'.format(addr))
    game = Game(
        nodes=SquareMapGenerator(
            x=5, y=5, distance=25,
            production=20, throughput=1,
        ).generate(),
        decay_rate=0.1,
    )
    server = GameServer(
        **addr,
        game=game,
    )
    server.serveforever()
    logger.info('server shutdown')
